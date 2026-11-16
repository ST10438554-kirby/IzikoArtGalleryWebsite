#!/usr/bin/env python3
"""Iziko Museum API: REST endpoints backed by a SQLite database.

Uses only the Python standard library (3.8+), so there is nothing to install.

    python3 app.py                 # serves on http://0.0.0.0:8000
    python3 app.py --port 9000
    python3 app.py --reset         # delete and re-create the database from seed.json

Endpoints (all JSON):
    GET  /api/health
    GET  /api/categories
    GET  /api/artworks?q=<text>&category=<name>&featured=1
    GET  /api/artworks/<id>
    GET  /api/artists
    GET  /api/artists/<id>            (includes the artist's artworks)
    GET  /api/exhibitions
    POST /api/auth/register           {"fullName","email","password"}
    POST /api/auth/login              {"email","password"}  -> {"token","user"}
    POST /api/auth/logout             Authorization: Bearer <token>
    GET  /api/me                      Authorization: Bearer <token>
"""
import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse, unquote
import mimetypes
import urllib.request
import string

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("IZIKO_DB", os.path.join(HERE, "iziko.db"))
SEED_PATH = os.path.join(HERE, "seed.json")
WEB_DIR = os.path.join(HERE, "web")

PBKDF2_ROUNDS = 120_000
SESSION_SECONDS = 30 * 24 * 3600
MAX_BODY = 16 * 1024
FIREBASE_API_KEY = os.environ.get("FIREBASE_API_KEY", "")  # Firebase project's Web API key (Google sign-in)
SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]
VISIT_TYPES = ["General entry", "Guided tour", "Exhibition visit"]
SLOT_CAPACITY = 50  # visitors per time slot
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS artists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    lifespan TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT '',
    biography TEXT NOT NULL DEFAULT '',
    image TEXT
);
CREATE TABLE IF NOT EXISTS artworks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    artist_id INTEGER NOT NULL REFERENCES artists(id),
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    medium TEXT,
    dimensions TEXT,
    acquisition TEXT,
    description TEXT NOT NULL DEFAULT '',
    image TEXT,
    featured INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exhibitions (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    dates TEXT NOT NULL,
    status TEXT NOT NULL,
    curator TEXT,
    summary TEXT NOT NULL DEFAULT '',
    image TEXT
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_salt BLOB NOT NULL,
    password_hash BLOB NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exhibition_id INTEGER,
    visit_type TEXT NOT NULL,
    visit_date TEXT NOT NULL,
    slot TEXT NOT NULL,
    visitors INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist_id);
"""


# ---------------------------------------------------------------- database

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(reset=False):
    if reset and os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM artists").fetchone()[0] == 0:
            seed(conn)
        conn.commit()
    finally:
        conn.close()


def seed(conn):
    with open(SEED_PATH, encoding="utf-8") as f:
        data = json.load(f)
    conn.executemany(
        "INSERT INTO artists (id, name, lifespan, origin, biography, image) VALUES (?,?,?,?,?,?)",
        [(a["id"], a["name"], a["lifespan"], a["origin"], a["biography"], a.get("image"))
         for a in data["artists"]])
    conn.executemany(
        "INSERT INTO artworks (id, title, artist_id, category, date, medium, dimensions, "
        "acquisition, description, image, featured) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [(w["id"], w["title"], w["artistId"], w["category"], w["date"], w.get("medium"),
          w.get("dimensions"), w.get("acquisition"), w["description"], w.get("image"),
          1 if w.get("featured") else 0) for w in data["artworks"]])
    conn.executemany(
        "INSERT INTO exhibitions (id, title, dates, status, curator, summary, image) "
        "VALUES (?,?,?,?,?,?,?)",
        [(e["id"], e["title"], e["dates"], e["status"], e.get("curator"), e["summary"],
          e.get("image")) for e in data["exhibitions"]])


# ---------------------------------------------------------------- serializers

ARTWORK_SELECT = (
    "SELECT w.*, a.name AS artist_name FROM artworks w JOIN artists a ON a.id = w.artist_id"
)


def artwork_json(r):
    return {
        "id": r["id"], "title": r["title"], "artistId": r["artist_id"],
        "artistName": r["artist_name"], "category": r["category"], "date": r["date"],
        "medium": r["medium"], "dimensions": r["dimensions"], "acquisition": r["acquisition"],
        "description": r["description"], "image": r["image"], "featured": bool(r["featured"]),
    }


def artist_json(r):
    return {
        "id": r["id"], "name": r["name"], "lifespan": r["lifespan"], "origin": r["origin"],
        "biography": r["biography"], "image": r["image"],
    }


def exhibition_json(r):
    return {
        "id": r["id"], "title": r["title"], "dates": r["dates"], "status": r["status"],
        "curator": r["curator"], "summary": r["summary"], "image": r["image"],
    }


# ---------------------------------------------------------------- auth helpers

def hash_password(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS, 32)


def token_digest(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def user_json(r):
    return {"fullName": r["full_name"], "email": r["email"]}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------------------------------------------------------------- request handler

class Handler(BaseHTTPRequestHandler):
    server_version = "IzikoAPI/1.0"

    # -- plumbing
    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def send_json(self, status, payload):
        # Commit BEFORE replying so the next request always sees this write (fixes a race where login followed register too quickly).
        conn = getattr(self, "_conn", None)
        if conn is not None and status < 400:
            conn.commit()
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError(400, "Invalid Content-Length.")
        if length <= 0 or length > MAX_BODY:
            raise ApiError(400, "Request body is missing or too large.")
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "Request body must be valid JSON.")
        if not isinstance(data, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        return data

    def bearer_token(self):
        header = self.headers.get("Authorization", "")
        if header.startswith("Bearer ") and len(header) > 7:
            return header[7:].strip()
        return None

    def current_user(self, conn):
        token = self.bearer_token()
        if not token:
            raise ApiError(401, "Please sign in.")
        row = conn.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token_hash = ? AND s.expires_at > ?",
            (token_digest(token), int(time.time()))).fetchone()
        if row is None:
            raise ApiError(401, "Your session has expired. Please sign in again.")
        return row

    def dispatch(self, method):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        conn = connect()
        self._conn = conn  # lets send_json commit before replying
        try:
            self.route(conn, method, path, query)
            conn.commit()
        except ApiError as e:
            self.send_json(e.status, {"error": e.message})
        except Exception as e:  # never leak internals to the client
            print("Unhandled error:", repr(e))
            self.send_json(500, {"error": "Something went wrong on the server."})
        finally:
            conn.close()

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            return self.dispatch("GET")
        self.serve_static(path)

    def serve_static(self, path):
        """Serves the website (server/web). Unknown paths fall back to index.html (single-page app)."""
        rel = unquote(path).lstrip("/") or "index.html"
        full = os.path.realpath(os.path.join(WEB_DIR, rel))
        root = os.path.realpath(WEB_DIR)
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            if "." in os.path.basename(rel):
                return self.send_json(404, {"error": "Not found."})
            full = os.path.join(root, "index.html")
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.endswith(".webp"):
            ctype = "image/webp"
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") or ctype.endswith("javascript") else ""))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache" if full.endswith((".html", ".js", ".css")) else "public, max-age=86400")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.dispatch("POST")

    # -- routing
    def route(self, conn, method, path, query):
        parts = [p for p in path.split("/") if p]
        if len(parts) < 2 or parts[0] != "api":
            raise ApiError(404, "Not found.")
        resource = parts[1]
        rest = parts[2:]

        if method == "GET":
            if resource == "health" and not rest:
                return self.send_json(200, {"status": "ok"})
            if resource == "categories" and not rest:
                rows = conn.execute("SELECT DISTINCT category FROM artworks ORDER BY category")
                return self.send_json(200, [r[0] for r in rows])
            if resource == "artworks":
                return self.artworks(conn, rest, query)
            if resource == "artists":
                return self.artists(conn, rest)
            if resource == "exhibitions" and not rest:
                rows = conn.execute("SELECT * FROM exhibitions ORDER BY id").fetchall()
                return self.send_json(200, [exhibition_json(r) for r in rows])
            if resource == "me" and not rest:
                return self.send_json(200, user_json(self.current_user(conn)))
            if resource == "bookings" and not rest:
                return self.send_json(200, self.my_bookings(conn))
        elif method == "POST" and resource == "bookings":
            return self.bookings_post(conn, rest)
        elif method == "POST" and resource == "auth" and len(rest) == 1:
            if rest[0] == "firebase":
                return self.firebase_login(conn)
            if rest[0] == "register":
                return self.register(conn)
            if rest[0] == "login":
                return self.login(conn)
            if rest[0] == "logout":
                return self.logout(conn)
        raise ApiError(404, "Not found.")

    def item_id(self, rest):
        try:
            return int(rest[0])
        except ValueError:
            raise ApiError(404, "Not found.")

    # -- museum data
    def artworks(self, conn, rest, query):
        if rest:
            if len(rest) > 1:
                raise ApiError(404, "Not found.")
            row = conn.execute(ARTWORK_SELECT + " WHERE w.id = ?", (self.item_id(rest),)).fetchone()
            if row is None:
                raise ApiError(404, "Artwork not found.")
            return self.send_json(200, artwork_json(row))
        sql, args, where = ARTWORK_SELECT, [], []
        q = query.get("q", "").strip().lower()
        if q:
            where.append("(LOWER(w.title) LIKE ? OR LOWER(a.name) LIKE ?)")
            args += ["%" + q + "%"] * 2
        if query.get("category"):
            where.append("LOWER(w.category) = ?")
            args.append(query["category"].strip().lower())
        if query.get("featured") in ("1", "true"):
            where.append("w.featured = 1")
        if where:
            sql += " WHERE " + " AND ".join(where)
        rows = conn.execute(sql + " ORDER BY w.id", args).fetchall()
        self.send_json(200, [artwork_json(r) for r in rows])

    def artists(self, conn, rest):
        if not rest:
            rows = conn.execute("SELECT * FROM artists ORDER BY id").fetchall()
            return self.send_json(200, [artist_json(r) for r in rows])
        if len(rest) > 1:
            raise ApiError(404, "Not found.")
        artist = conn.execute("SELECT * FROM artists WHERE id = ?", (self.item_id(rest),)).fetchone()
        if artist is None:
            raise ApiError(404, "Artist not found.")
        works = conn.execute(ARTWORK_SELECT + " WHERE w.artist_id = ? ORDER BY w.id",
                             (artist["id"],)).fetchall()
        payload = artist_json(artist)
        payload["artworks"] = [artwork_json(w) for w in works]
        self.send_json(200, payload)

    # -- accounts
    def register(self, conn):
        body = self.read_json()
        name = str(body.get("fullName", "")).strip()
        email = str(body.get("email", "")).strip().lower()
        password = str(body.get("password", ""))
        if not name:
            raise ApiError(400, "Please enter your full name.")
        if len(name) > 100 or len(email) > 200:
            raise ApiError(400, "That name or email is too long.")
        if not EMAIL_RE.match(email):
            raise ApiError(400, "Please enter a valid email address.")
        if len(password) < 8:
            raise ApiError(400, "Use a password with at least 8 characters.")
        salt = secrets.token_bytes(16)
        try:
            conn.execute(
                "INSERT INTO users (full_name, email, password_salt, password_hash, created_at) "
                "VALUES (?,?,?,?,?)",
                (name, email, salt, hash_password(password, salt), int(time.time())))
        except sqlite3.IntegrityError:
            raise ApiError(409, "An account with this email already exists.")
        self.send_json(201, {"user": {"fullName": name, "email": email}})

    def login(self, conn):
        body = self.read_json()
        email = str(body.get("email", "")).strip().lower()
        password = str(body.get("password", ""))
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user is None:
            # Burn the same time as a real check so response time does not reveal which emails exist.
            hash_password(password, b"\x00" * 16)
            raise ApiError(401, "Incorrect email or password.")
        if not hmac.compare_digest(hash_password(password, user["password_salt"]),
                                   user["password_hash"]):
            raise ApiError(401, "Incorrect email or password.")
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        conn.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)",
                     (token_digest(token), user["id"], now + SESSION_SECONDS))
        self.send_json(200, {"token": token, "user": user_json(user)})

    def logout(self, conn):
        token = self.bearer_token()
        if token:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_digest(token),))
        self.send_json(200, {"ok": True})


    # -- bookings (one table, shared by the website and the Android app)
    def my_bookings(self, conn):
        user = self.current_user(conn)
        rows = conn.execute(
            "SELECT b.*, e.title AS exhibition FROM bookings b LEFT JOIN exhibitions e "
            "ON e.id = b.exhibition_id WHERE b.user_id = ? ORDER BY b.visit_date DESC, b.slot",
            (user["id"],)).fetchall()
        return [{"id": r["id"], "ref": r["ref"], "exhibitionId": r["exhibition_id"],
                 "exhibition": r["exhibition"], "visitType": r["visit_type"], "date": r["visit_date"],
                 "slot": r["slot"], "visitors": r["visitors"], "status": r["status"]} for r in rows]

    def bookings_post(self, conn, rest):
        user = self.current_user(conn)
        if rest:  # POST /api/bookings/<id>/cancel
            if len(rest) != 2 or rest[1] != "cancel":
                raise ApiError(404, "Not found.")
            cur = conn.execute("UPDATE bookings SET status='cancelled' WHERE id=? AND user_id=?",
                               (self.item_id(rest), user["id"]))
            if cur.rowcount == 0:
                raise ApiError(404, "Booking not found.")
            return self.send_json(200, {"ok": True})
        b = self.read_json()
        vtype, date, slot = str(b.get("visitType", "")), str(b.get("date", "")), str(b.get("slot", ""))
        try:
            visitors = int(b.get("visitors", 0))
            when = time.strptime(date, "%Y-%m-%d")
        except (ValueError, TypeError):
            raise ApiError(400, "Please choose a valid date and number of visitors.")
        if vtype not in VISIT_TYPES or slot not in SLOTS:
            raise ApiError(400, "Please choose a visit type and a time.")
        if not 1 <= visitors <= 10:
            raise ApiError(400, "You can book for 1 to 10 visitors at a time.")
        if date < time.strftime("%Y-%m-%d"):
            raise ApiError(400, "Please choose today or a future date.")
        taken = conn.execute("SELECT COALESCE(SUM(visitors),0) FROM bookings WHERE visit_date=? "
                             "AND slot=? AND status='confirmed'", (date, slot)).fetchone()[0]
        if taken + visitors > SLOT_CAPACITY:
            raise ApiError(409, "That time is full. Please pick another time.")
        ex_id = b.get("exhibitionId")
        if ex_id is not None and conn.execute("SELECT 1 FROM exhibitions WHERE id=?", (ex_id,)).fetchone() is None:
            raise ApiError(400, "That exhibition does not exist.")
        ref = "IZK-" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
        conn.execute("INSERT INTO bookings (ref,user_id,exhibition_id,visit_type,visit_date,slot,visitors,created_at) "
                     "VALUES (?,?,?,?,?,?,?,?)", (ref, user["id"], ex_id, vtype, date, slot, visitors, int(time.time())))
        self.send_json(201, {"ref": ref, "date": date, "slot": slot, "visitors": visitors})

    # -- Google single sign-on through Firebase Auth (same endpoint works for the Android app)
    def firebase_login(self, conn):
        if not FIREBASE_API_KEY:
            raise ApiError(503, "Google sign-in is not configured on the server (set FIREBASE_API_KEY).")
        id_token = str(self.read_json().get("idToken", ""))
        req = urllib.request.Request(
            "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY,
            data=json.dumps({"idToken": id_token}).encode(), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                info = json.load(r)["users"][0]
        except Exception:
            raise ApiError(401, "Google sign-in could not be verified. Please try again.")
        email = str(info.get("email", "")).lower()
        if not email or not info.get("emailVerified"):
            raise ApiError(401, "Your Google email address is not verified.")
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user is None:
            salt = secrets.token_bytes(16)
            conn.execute("INSERT INTO users (full_name,email,password_salt,password_hash,created_at) VALUES (?,?,?,?,?)",
                         (info.get("displayName") or email.split("@")[0], email, salt,
                          hash_password(secrets.token_urlsafe(24), salt), int(time.time())))
            user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        token = secrets.token_urlsafe(32)
        conn.execute("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
                     (token_digest(token), user["id"], int(time.time()) + SESSION_SECONDS))
        self.send_json(200, {"token": token, "user": user_json(user)})


def main():
    parser = argparse.ArgumentParser(description="Iziko Museum API server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reset", action="store_true",
                        help="delete the database and re-create it from seed.json")
    args = parser.parse_args()
    init_db(reset=args.reset)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print("Iziko API running on http://%s:%d  (database: %s)" % (args.host, args.port, DB_PATH))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
