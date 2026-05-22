
Action: file_editor create /app/memory/PRD.md --file-text "# PRD — The Garden Cafe (food delivery website)

## Original problem statement
> \"this is a website of a food delivery app. connect database to store the login details of customer in the login section\"

User provided static HTML/CSS/JS for a food-delivery landing page (The Garden Cafe).
Request: add a real database-backed authentication system for customers.

## User choices (captured via ask_human)
- Auth: JWT-based custom auth (email + password)
- Stack: keep HTML/JS frontend, add FastAPI + MongoDB backend for login only
- Allow new customer sign-up
- Signup captures name, email, phone, address, password

## Architecture
- Frontend: static HTML/CSS/JS served from `/app/frontend/public/` via the CRA dev
  server (`index.html`, `food-app.css`, `food-script.js`). React is a no-op (`App.js`
  returns `null`) and its mount point `#root` is hidden.
- Backend: FastAPI on port 8001, routes prefixed with `/api`.
- Database: MongoDB (`MONGO_URL`, `DB_NAME` from `backend/.env`).
- Auth: bcrypt for hashing, PyJWT HS256 tokens (24h), bearer-token flow.
- Security: unique email index, brute-force lockout per ip+email.

## Implemented (2026-05-05)
- `/api/auth/register` — create customer account, returns user + access_token
- `/api/auth/login` — verify credentials, brute-force guarded, returns user + token
- `/api/auth/me` — protected, returns current user from bearer token
- `/api/auth/logout` — no-op endpoint (client discards token)
- Admin seeded on startup (`admin@gardencafe.com` / `Admin@1234`)
- Login panel: tabbed Login / Sign-up / Account forms; inline error & success banners
- Logged-in indicator (green dot) on header user icon
- Cart checkout now requires login; existing cart/localStorage behaviour preserved

## What's live in UI
- Header, hero, banner, categories, 6 popular dishes, about, order form, footer
- Shopping cart drawer (localStorage) + toast
- Login / Sign-up / My Account drawer wired to backend

## Backlog (P1/P2)
- Persist orders to MongoDB and tie them to the logged-in user
- Forgot-password / password-reset flow
- Email verification
- Order history view on \"My Account\"
- Admin dashboard to list users / orders

## Next enhancements (ideas)
- Persist cart server-side per user so customers see their cart on any device.
- Hook the `order` form to POST `/api/orders` and email a receipt.

## Files touched
- `/app/backend/server.py` — auth + MongoDB
- `/app/backend/.env` — JWT_SECRET, ADMIN_*
- `/app/frontend/public/index.html` — full food-app markup + auth forms
- `/app/frontend/public/food-app.css` — styles incl. signup/account states
- `/app/frontend/public/food-script.js` — cart + auth wiring
- `/app/frontend/src/App.js` — React no-op
- `/app/memory/test_credentials.md` — admin + test customer
"
Observation: Create successful: /app/memory/PRD.md