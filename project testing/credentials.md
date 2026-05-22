
Action: file_editor create /app/memory/test_credentials.md --file-text "# Test Credentials — The Garden Cafe

## Admin (seeded automatically on backend startup)
- Email: `admin@gardencafe.com`
- Password: `Admin@1234`
- Role: `admin`

## Sample Test Customer (created via /api/auth/register during smoke test)
- Name: `Jane Doe`
- Email: `jane@test.com`
- Password: `Jane@1234`
- Phone: `+91-9999999999`
- Address: `12 MG Road, Bangalore`

## Auth endpoints (all prefixed with `/api`)
- `POST /api/auth/register` — body: `{ name, email, phone, address, password }`
- `POST /api/auth/login` — body: `{ email, password }`
- `GET  /api/auth/me` — requires `Authorization: Bearer <access_token>`
- `POST /api/auth/logout`

## Auth strategy
- JWT bearer tokens (HS256, 24h expiry) returned in response JSON as `access_token`.
- Frontend stores token in `localStorage` under `garden_cafe_token_v1` and sends it
  in `Authorization: Bearer ...` on protected calls.
- Passwords hashed with bcrypt.
- Brute-force protection: 5 failed logins per `{ip}:{email}` → 15 min lockout
  (HTTP 429). Cleared on successful login.
- MongoDB collections: `users` (unique index on `email`), `login_attempts` (unique
  index on `identifier`).
"
Observation: Failed to create file: File already exists at: /app/memory/test_credentials.md. Use overwrite=True to replace