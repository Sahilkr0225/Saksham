# Saksham Platform — Developer Handbook

> **Living Document** — Updated as the platform evolves.
> Last Updated: 2026-07-25

---

## 📖 1. Project Origin & Goals

**Saksham** (meaning *capable* in Hindi) is a production-grade **School Management Platform** built from the ground up. The goal is to replace fragmented, paper-based school administration with a unified digital platform covering admissions, attendance, academics, fees, communication, and AI-powered insights.

### Design Principles
| Principle | Meaning |
|-----------|---------|
| **Modular** | Each feature is a self-contained module (Auth, RBAC, Attendance, etc.) |
| **API-First** | All data flows through a versioned REST API (`/api/v1/`) |
| **Security by Default** | JWT auth, bcrypt hashing, HTTPOnly cookies, RBAC on every protected route |
| **Invite-Only** | No self-registration; school admin controls all accounts |
| **One Role Per User (v1)** | Simplicity first; multi-role support deferred to v2 |

---

## 🗺️ 2. Roadmap

```
Phase 0  ✅ Planning & Research
Phase 1  ✅ SRS — Foundation Module (Auth, RBAC, Audit Logs)
Phase 2  ✅ System Design (DB Schema + API Contracts)
Phase 3  ⬜ UI/UX Design
Phase 4  🔄 Backend Implementation  ← We are here
Phase 5  ⬜ Frontend Implementation
Phase 6  ⬜ Testing
Phase 7  ⬜ Deployment (Docker + Production)
Phase 8  🔮 AI Layer (Future Scope)
```

### Module Build Order (Foundation First)
```
1. Auth & User Management   🔄 In Progress
2. RBAC                     🔄 In Progress
3. Audit Logs               🔄 In Progress
4. Academic Structure       ⬜ Pending
5. Admissions               ⬜ Pending
... (20 modules total)
```

---

## 🛠️ 3. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Node.js + TypeScript | Type safety, large ecosystem |
| **Framework** | Express.js | Minimal, flexible, well-understood |
| **Database** | PostgreSQL (Neon.tech Cloud) | Relational, ACID, great for school data |
| **ORM/Query** | Raw SQL via `pg` pool | Full control, no ORM magic hiding bugs |
| **Auth** | JWT (Access + Refresh tokens) | Stateless access, revocable refresh |
| **Hashing** | bcryptjs (12 salt rounds) | Industry standard for passwords |
| **Validation** | Zod | Schema-first, TypeScript-native |
| **Dev Server** | ts-node-dev | Hot reload without a build step |
| **Future DB** | Local Docker PostgreSQL | Production parity, offline dev |

---

## 📁 4. Folder Structure

```
backend/
├── src/
│   ├── index.ts              # App entry: middleware, route mounting, server start
│   ├── config/
│   │   ├── db.ts             # PostgreSQL connection pool (Neon)
│   │   └── initDb.ts         # Schema creation + role seeding on startup
│   ├── routes/
│   │   └── authRoutes.ts     # Route definitions for /api/v1/auth/*
│   ├── controllers/
│   │   └── authController.ts # Business logic for each auth endpoint
│   ├── middlewares/
│   │   ├── auth.ts           # JWT authentication guard (authenticate)
│   │   └── validate.ts       # Zod request body validation wrapper
│   ├── validators/
│   │   └── authValidator.ts  # Zod schemas for auth request bodies
│   └── utils/
│       └── auth.ts           # bcrypt + JWT helper functions
├── .env                      # Environment variables (gitignored)
├── package.json
└── tsconfig.json

docs/
├── PROJECT_STATUS.md         # Overall progress tracker (update each session)
├── DEVELOPER_HANDBOOK.md     # This file
├── phase0_phase1/
│   └── foundation_srs.md     # Software Requirements Specification
└── phase2_system_design/
    ├── foundation_schema.md  # DB schema design
    ├── foundation_api.md     # API contract specification
    └── architecture.md       # System architecture overview

postman/
└── globals/
    └── workspace.globals.yaml  # Postman environment variables
```

---

## 🔑 5. Key Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-07-25 | Mount auth routes + add cookie-parser | `refresh` endpoint reads HTTPOnly cookies |
| 2026-07-23 | Neon.tech Cloud PostgreSQL for dev | Zero local setup; easy to share |
| 2026-07-23 | Switch to Docker in production | Environment parity, offline migrations |
| 2026-07-18 | AI Layer deferred to Phase 8 | Stable platform before AI features |
| 2026-07-18 | One role per user in v1 | Simplicity; multi-role in v2 |
| 2026-07-18 | Invite-only signup | School controls all accounts |
| 2026-07-18 | PostgreSQL as primary DB | Relational + ACID needed for school data |
| 2026-07-18 | REST API `/api/v1/` | Simpler, easier to test with Postman |

---

## 🧱 6. Module Breakdown & Code Logic

### 6.1 App Entry — `src/index.ts`

**What it does:** Bootstraps the Express app.

**Boot sequence:**
1. Load `.env` via `dotenv`
2. Register middleware: CORS → JSON body parser → cookie-parser → morgan logger
3. Define `/api/v1/health` route (unauthenticated)
4. Mount all route groups under `/api/v1/`
5. Register 404 handler (catches unknown routes)
6. Register global error handler (catches all `next(error)` calls)
7. Call `initDb()` → when DB is ready, `.listen()` on PORT 5000

---

### 6.2 Database Config — `src/config/db.ts`

**What it does:** Creates and exports a PostgreSQL connection pool.

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for Neon SSL
});
```

- Uses `pg.Pool` for connection pooling (efficient multi-request handling)
- Reads `DATABASE_URL` from `.env` (Neon connection string)
- SSL enabled because Neon requires encrypted connections
- Logs connection and crash events to console

---

### 6.3 DB Initialization — `src/config/initDb.ts`

**What it does:** Runs on every server startup to ensure schema and seed data exists.

**Tables created (idempotent — uses `IF NOT EXISTS`):**

| Table | Purpose |
|-------|---------|
| `users` | Core user accounts |
| `roles` | Role definitions (super_admin, principal, etc.) |
| `permissions` | Granular resource-action pairs |
| `role_permissions` | Many-to-many: which role has which permissions |
| `user_roles` | Many-to-many: which user has which role |
| `refresh_tokens` | Persisted hashed refresh token sessions |
| `audit_logs` | Immutable log of all CRUD actions in the system |

**Seeded Roles on startup:**
```
super_admin → Full system access
principal   → School-wide read + approvals
office_staff → Admissions, fees, documents
teacher      → Own classes: attendance, homework, marks
parent       → Their child data only
student      → Own profile, results, notices
```

**Pattern:** Everything runs inside a transaction (`BEGIN`/`COMMIT`/`ROLLBACK`) — if schema setup fails, no partial state is written.

---

### 6.4 Auth Utilities — `src/utils/auth.ts`

**What it does:** Low-level crypto helpers.

| Function | What it does |
|----------|-------------|
| `hashPassword(password)` | bcrypt hash with 12 salt rounds |
| `comparePassword(plain, hash)` | bcrypt comparison |
| `generateAccessToken(payload)` | Signs JWT with `JWT_SECRET`, expires in `15m` |
| `generateRefreshToken(payload)` | Signs JWT with `JWT_REFRESH_SECRET`, expires in `7d` |
| `verifyAccessToken(token)` | Verifies + decodes access JWT, returns `null` on failure |
| `verifyRefreshToken(token)` | Verifies + decodes refresh JWT, returns `null` on failure |

**Why two separate secrets?** Access and refresh tokens have different lifetimes and scopes. Using separate secrets means a compromised refresh secret doesn't let attackers forge access tokens and vice versa.

---

### 6.5 Validators — `src/validators/authValidator.ts`

**What it does:** Defines Zod schemas for request body validation.

| Schema | Used by | Rules |
|--------|---------|-------|
| `loginSchema` | `POST /login` | email (valid format), password (non-empty) |
| `changePasswordSchema` | `PATCH /change-password` | current_password, new_password (8+ chars, upper + lower + digit + special) |
| `forgotPasswordSchema` | `POST /forgot-password` | email (valid format) |
| `resetPasswordSchema` | `POST /reset-password` | email, otp (exactly 6 chars), new_password (same strength rules) |

**Password strength rules (enforced everywhere):**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 digit
- At least 1 special character

---

### 6.6 Middlewares

#### `src/middlewares/validate.ts` — Request Validator
Wraps a Zod schema into Express middleware. Parses `req.body` through the schema:
- ✅ If valid: overwrites `req.body` with the sanitized/trimmed data and calls `next()`
- ❌ If invalid: returns `400` with a structured array of `{ field, message }` errors

**Usage pattern:**
```typescript
router.post('/login', validateRequest(loginSchema), login);
```

#### `src/middlewares/auth.ts` — JWT Guard
Reads the `Authorization: Bearer <token>` header and verifies the access JWT.
- ✅ If valid: attaches `req.user = { userId, role }` and calls `next()`
- ❌ If missing or invalid: returns `401 Unauthorized`

**Usage pattern:**
```typescript
router.get('/me', authenticate, me); // authenticate runs first
```

---

### 6.7 Auth Controller — `src/controllers/authController.ts`

The core business logic. Each function corresponds to one route.

#### `POST /api/v1/auth/login`
1. Fetch user + active role from DB (joined query across `users`, `user_roles`, `roles`)
2. Check `is_active` flag
3. `bcrypt.compare()` the submitted password against stored hash
4. Generate **access token** (15m) + **refresh token** (7d)
5. Hash the refresh token with `SHA-256` and store in `refresh_tokens` table (never store raw tokens)
6. Update `users.last_login_at`
7. Set refresh token as **HTTPOnly cookie** (XSS protection)
8. Return access token in JSON response body

#### `POST /api/v1/auth/refresh` — Token Rotation
1. Read refresh token from cookie (or `req.body` as fallback)
2. Verify JWT signature
3. Lookup hashed token in `refresh_tokens` table
4. Check `is_revoked` and `expires_at`
5. Fetch current user + role (in case role changed since last login)
6. **In a DB transaction:** revoke old token + insert new token
7. Set new refresh token cookie + return new access token

> **Why rotation?** If a refresh token is stolen, rotating on every use means the attacker's stolen copy gets revoked on the next legitimate use, limiting the attack window.

#### `POST /api/v1/auth/logout`
1. Read refresh token from cookie or body
2. Set `is_revoked = TRUE` in DB (server-side session invalidation)
3. Clear the cookie on the client

#### `PATCH /api/v1/auth/change-password` *(Protected)*
1. Get `userId` from `req.user` (set by `authenticate` middleware)
2. Verify current password with bcrypt
3. Hash new password + update in DB
4. Set `must_change_password = FALSE`
5. Revoke **all** refresh sessions for the user (forces logout everywhere)

#### `GET /api/v1/auth/me` *(Protected)*
Returns the authenticated user's profile: id, name, email, phone, avatar_url, role.

#### `POST /api/v1/auth/forgot-password`
- Always returns the same success message regardless of whether email exists (prevents **user enumeration attacks**)
- In development: logs OTP `123456` to console
- Production: will send real OTP via email (not yet implemented)

#### `POST /api/v1/auth/reset-password`
1. Dev bypass: accepts `otp === '123456'`
2. Fetch user by email
3. Hash + set new password
4. Revoke all refresh sessions

---

### 6.8 Routes — `src/routes/authRoutes.ts`

```
POST   /api/v1/auth/login            → [validate] → login
POST   /api/v1/auth/refresh          →              refresh
POST   /api/v1/auth/logout           →              logout
POST   /api/v1/auth/forgot-password  → [validate] → forgotPassword
POST   /api/v1/auth/reset-password   → [validate] → resetPassword
PATCH  /api/v1/auth/change-password  → [auth][validate] → changePassword
GET    /api/v1/auth/me               → [auth]      → me
```

---

## 🌐 7. API Response Format

All responses follow this standard envelope:

```json
{
  "success": true | false,
  "message": "Human readable message",
  "data": { ... }   // Only present on success with a payload
}
```

Error responses with validation failures:
```json
{
  "success": false,
  "message": "Input validation failed",
  "data": {
    "errors": [
      { "field": "email", "message": "Invalid email address" }
    ]
  }
}
```

---

## 🔐 8. Security Architecture

```
Client
  │
  ├─ Access Token (JWT, 15m) ──► Sent in Authorization header for every request
  │                               Short-lived; loss risk is minimal
  │
  └─ Refresh Token (JWT, 7d) ──► Stored in HTTPOnly cookie (JS cannot read it)
                                  Hashed with SHA-256 before DB storage
                                  Rotated on every /refresh call
                                  Revoked on logout + password change
```

---

## ⚙️ 9. Environment Variables (`.env`)

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://...@neon.tech/saksham?sslmode=require
JWT_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<different-strong-random-secret>
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
CORS_ORIGIN=http://localhost:3000
```

---

## 🚀 10. Running Locally

```powershell
# Start the dev server (from d:\Saksham\backend)
npm run dev

# Server logs on success:
# 🚀 Saksham API Server running on port 5000 in development mode
# 📡 Health: http://localhost:5000/api/v1/health
# 🔐 Auth:   http://localhost:5000/api/v1/auth

# Stop: Ctrl+C
# Kill stuck port: taskkill /PID <pid> /F
```

---

## 📋 11. Code Conventions

| Convention | Rule |
|-----------|------|
| **Error handling** | Every controller wraps in `try/catch` and calls `next(error)` — never `throw` directly |
| **DB queries** | Use `pool.query()` for simple queries, `pool.connect()` + transaction for multi-step operations |
| **Response** | Always use the standard envelope: `{ success, message, data }` |
| **Security** | Never store raw tokens — always SHA-256 hash before DB |
| **Naming** | camelCase for variables/functions, PascalCase for types/interfaces |
| **Route file** | Only routing + middleware chaining — zero business logic |
| **Controller** | Business logic only — reads `req`, writes `res`, calls `next` |
| **Validator** | Zod schema only — no logic |
| **Utility** | Pure functions — no DB, no Express imports |

---

*End of Developer Handbook — Update this file whenever a new module is completed.*
