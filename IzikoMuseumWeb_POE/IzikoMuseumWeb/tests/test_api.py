"""Automated API tests (run: python3 -m unittest discover tests). Uses a temporary database."""
import json, os, sys, tempfile, threading, time, unittest, urllib.request, urllib.error
os.environ["IZIKO_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
import app  # noqa: E402


def call(base, path, method="GET", body=None, token=None):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.init_db(reset=True)
        cls.srv = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.srv.server_port

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def login(self, email="t@example.com"):
        call(self.base, "/api/auth/register", "POST", {"fullName": "Test User", "email": email, "password": "password123"})
        return call(self.base, "/api/auth/login", "POST", {"email": email, "password": "password123"})[1]["token"]

    def test_health_and_data(self):
        self.assertEqual(call(self.base, "/api/health")[1], {"status": "ok"})
        self.assertEqual(len(call(self.base, "/api/artworks")[1]), 11)

    def test_auth(self):
        self.assertEqual(call(self.base, "/api/me")[0], 401)
        token = self.login("auth@example.com")
        self.assertEqual(call(self.base, "/api/me", token=token)[1]["email"], "auth@example.com")
        self.assertEqual(call(self.base, "/api/auth/login", "POST", {"email": "auth@example.com", "password": "wrong"})[0], 401)

    def test_booking_flow(self):
        token = self.login("book@example.com")
        day = time.strftime("%Y-%m-%d", time.localtime(time.time() + 86400))
        body = {"visitType": "Guided tour", "date": day, "slot": "10:00", "visitors": 2}
        self.assertEqual(call(self.base, "/api/bookings", "POST", body)[0], 401)
        status, made = call(self.base, "/api/bookings", "POST", body, token)
        self.assertEqual(status, 201)
        mine = call(self.base, "/api/bookings", token=token)[1]
        self.assertEqual(mine[0]["ref"], made["ref"])
        self.assertEqual(call(self.base, "/api/bookings", "POST", {**body, "date": "2000-01-01"}, token)[0], 400)
        self.assertEqual(call(self.base, "/api/bookings", "POST", {**body, "visitors": 99}, token)[0], 400)
        self.assertEqual(call(self.base, "/api/bookings/%d/cancel" % mine[0]["id"], "POST", {}, token)[0], 200)
        self.assertEqual(call(self.base, "/api/bookings", token=token)[1][0]["status"], "cancelled")

class WebsiteTests(unittest.TestCase):
    """The single-page site and its seed data are served by the same server."""
    @classmethod
    def setUpClass(cls):
        app.init_db(reset=True)
        cls.srv = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.srv.server_port

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def get(self, path):
        with urllib.request.urlopen(self.base + path) as r:
            return r.status, r.read().decode("utf-8")

    def test_site_files_are_served(self):
        for path in ("/", "/site.js", "/style.css", "/museum_seed.json"):
            status, body = self.get(path)
            self.assertEqual(status, 200, path)
            self.assertTrue(body.strip(), path)

    def test_seed_has_content_for_offline_mode(self):
        data = json.loads(self.get("/museum_seed.json")[1])
        self.assertGreaterEqual(len(data["artworks"]), 10)
        self.assertGreaterEqual(len(data["artists"]), 5)

    def test_no_prototype_label(self):
        self.assertNotIn("Prototype", self.get("/site.js")[1].split("References")[-1])


if __name__ == "__main__":
    unittest.main()
