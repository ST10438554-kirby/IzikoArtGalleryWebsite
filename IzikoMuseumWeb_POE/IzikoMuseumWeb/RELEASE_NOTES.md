# Release notes

## v3.0 (final submission): changes since the prototype (v1.0)

### Innovative features added in this version
| Feature | What it adds for visitors |
|---|---|
| **Google single sign-on** | One Google account works on both the website and the Android app through the shared `/api/auth/firebase` endpoint, with server-side sessions |
| **Art Quiz** | Three difficulty levels (Beginner, Explorer, Curator), instant feedback, best score kept, share-your-score button |
| **Art Challenge** | Daily question, day streak, points, 5 explorer levels and 6 earnable badges |
| **My Collection** | Save favourite artworks with a heart and review them in one place |
| **Virtual Tour** | Room-by-room walkthrough of the gallery with artworks from the collection |
| **Chat assistant** | Instant answers about hours, tickets, location, quizzes and artists |
| **Four languages** | English, Afrikaans, isiZulu and isiXhosa for menus and key headings |

### Improvements
- New website design with top navigation, full-width hero, history, opening hours and "Gallery Facts"
- Visit page: ticket prices, hours, Google Map, floor map and nearby attractions
- Dark mode, mobile menu, keyboard focus and reduced-motion support
- Login and register pages with validation and clear error messages
- Offline fallback: bundled data is shown if the API cannot be reached
- Console logging for page changes, data source, sign-in, quizzes, points and saved artworks
- Code comments with Harvard references

### Fixes
- Server now commits database writes before replying, so logging in straight after registering works reliably
- Daily challenge awarded no points when answered; fixed
- "Prototype — educational use only" label removed from the footer

### Testing
- 6 automated tests (API, authentication, bookings, website files and offline data) run on every push through GitHub Actions

## v1.0: prototype
Welcome, register/login, Home, Explore, Artists, Exhibitions, Settings, shared REST API, SQLite, offline fallback.
