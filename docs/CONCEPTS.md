# Saksham — Concepts & Learning Notes

> **Living Document** — Every question asked during development gets answered and stored here.
> Last Updated: 2026-07-25

---

## Table of Contents

1. [TypeScript & Express Basics](#1-typescript--express-basics)
2. [CORS](#2-cors)
3. [Cookie Parser](#3-cookie-parser)
4. [JSON Body Parser](#4-json-body-parser)
5. [JWT — JSON Web Token](#5-jwt--json-web-token)
6. [Hashing & bcrypt](#6-hashing--bcrypt)
7. [Connection Pooling](#7-connection-pooling)
8. [Access Token vs Refresh Token](#8-access-token-vs-refresh-token)
9. [XSS Protection](#9-xss-protection)
10. [Token Rotation](#10-token-rotation)
11. [Zod — Request Validation](#11-zod--request-validation)
12. [SHA-256](#12-sha-256)
13. [How a Login Request Flows](#13-how-a-login-request-flows)

---

## 1. TypeScript & Express Basics

### TypeScript — "JavaScript with a safety net"
JavaScript lets you write anything. TypeScript forces you to declare what type of data a function expects.

```typescript
// JavaScript — no safety
function greet(user) { return "Hello " + user.name; }

// TypeScript — compiler catches mistakes
function greet(user: { name: string; age: number }) {
  return "Hello " + user.name;
}
```

TypeScript compiles to plain JavaScript before running. `ts-node-dev` does this automatically during `npm run dev`.

### Express — "A traffic controller for web requests"
Express receives HTTP requests and sends responses. Three core concepts:

| Concept | What it is | Example in project |
|---------|-----------|-------------------|
| **Middleware** | Runs on every (or some) requests | `app.use(cors(...))` |
| **Route** | Maps URL + method to a function | `router.post('/login', login)` |
| **Controller** | Function that handles the request | `authController.ts → login()` |

### How a request flows through Express:
```
POST /api/v1/auth/login
    → cors()              (is origin allowed?)
    → express.json()      (parse request body)
    → cookieParser()      (parse cookies)
    → morgan()            (log request)
    → validateRequest()   (Zod validation)
    → login()             (controller logic)
    → Response sent ✅
```

---

## 2. CORS

**CORS** = Cross-Origin Resource Sharing

Your backend runs on `localhost:5000`. Your frontend runs on `localhost:3000`. Browsers **block** requests between different origins by default. CORS tells the browser which origins are allowed.

```typescript
app.use(cors({
  origin: 'http://localhost:3000', // Only this frontend is allowed
  credentials: true                // Allow cookies to be sent
}));
```

Without CORS configured correctly → browser blocks the request with a red error before it even reaches your server.

---

## 3. Cookie Parser

Browsers send cookies as raw text in request headers:
```
Cookie: refresh_token=eyJhbGci...; theme=dark
```

`cookie-parser` parses this string into a usable object:
```typescript
app.use(cookieParser());

// Now in controllers:
const token = req.cookies?.refresh_token; // ✅ Works
```

Without it, `req.cookies` is `undefined`.

---

## 4. JSON Body Parser

When Postman sends:
```json
{ "email": "admin@school.com", "password": "Secret@123" }
```
It arrives as raw bytes. `express.json()` translates it into a JS object.

```typescript
app.use(express.json());

// Now in controllers:
const { email, password } = req.body; // ✅ Works
```

Without it, `req.body` is `undefined`.

---

## 5. JWT — JSON Web Token

A tamper-proof string in 3 parts separated by dots:
```
eyJhbGciOiJIUzI1NiJ9 . eyJ1c2VySWQiOiIxMjMifQ . SflKxwRJSMeKKF2QT
       HEADER                    PAYLOAD                  SIGNATURE
```

- **Header** — algorithm used
- **Payload** — the data inside (userId, role) — *readable by anyone*
- **Signature** — proof the token wasn't tampered with (only your server can create this using `JWT_SECRET`)

```typescript
generateAccessToken({ userId: '123', role: 'teacher' })
// Returns: "eyJhbGci...signed-with-JWT_SECRET"
```

Think of it like a **government ID card** — anyone can read your name, but only the government can issue one that passes verification.

---

## 6. Hashing & bcrypt

Hashing converts a password into a fixed-length scrambled string. **It cannot be reversed.**

```
"Secret@123"  →  bcrypt  →  "$2b$12$aK9...xQz"  (different every time due to salt)
```

On login, bcrypt **compares** — it doesn't decrypt:
```typescript
bcrypt.compare("Secret@123", "$2b$12$aK9...xQz") // → true ✅
bcrypt.compare("WrongPass",  "$2b$12$aK9...xQz") // → false ❌
```

**12 salt rounds** = each round doubles compute time → brute-force attacks become extremely slow.

---

## 7. Connection Pooling

Every DB query needs a connection. Opening/closing one takes ~50ms. A **pool** keeps connections open and reuses them:

```
Request 1 → grabs connection #1 → query → returns it to pool
Request 2 → grabs connection #2 → query → returns it to pool
Request 3 → waits → #1 is free → grabs it
```

```typescript
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT * FROM users WHERE id = $1', [userId]);
```

Without pooling → every request opens + closes a new connection → much slower.

---

## 8. Access Token vs Refresh Token

| | Access Token | Refresh Token |
|--|-------------|--------------|
| **Stored in** | App memory / JS variable | HTTPOnly cookie (browser) |
| **Lifespan** | 15 minutes | 7 days |
| **Purpose** | Prove identity on every API call | Get a new access token when expired |
| **Sent with** | Every request as `Authorization: Bearer <token>` | Only to `/refresh` endpoint |
| **If stolen** | Attacker has max 15 minutes | Serious — hence HTTPOnly cookie |

**Flow:**
```
Login → Access Token (15m) + Refresh Token (7d in cookie)
         ↓
   Access Token expires
         ↓
   Call /refresh → get new Access Token
```

---

## 9. XSS Protection

**XSS** = Cross-Site Scripting — an attacker injects malicious JavaScript into your page:
```javascript
// Attacker's injected script:
document.cookie // Reads all cookies → steals tokens!
```

`httpOnly: true` makes a cookie **invisible to JavaScript** — completely unreadable:
```typescript
res.cookie('refresh_token', refreshToken, {
  httpOnly: true,   // ← JS cannot access this
  secure: true,     // ← Only sent over HTTPS
  sameSite: 'strict'
});
```

That's why the **refresh token** is in an HTTPOnly cookie, and the **access token** is in the response body (stored in app state, not localStorage).

---

## 10. Token Rotation

Every `/refresh` call destroys the old refresh token and issues a new one:

```
Old Refresh Token → /refresh → Marked REVOKED in DB
                           └→ New Refresh Token issued
```

**Why?** If an attacker steals your refresh token:
- You use it first → their copy is revoked before they can use it ✅
- They use it first → new token issued, you get a fresh one next time → their copy is now useless ✅

Limits the damage window significantly.

---

## 11. Zod — Request Validation

Zod defines the **exact shape** request data must be — like a bouncer checking IDs:

```typescript
const loginSchema = z.object({
  email: z.string().email(),   // Must be valid email format
  password: z.string().min(1)  // Must not be empty
});

// If someone sends: { "email": "not-an-email" }
// Zod returns: [{ field: "email", message: "Invalid email address" }]
```

Without Zod → you'd write endless manual `if (!email || ...)` checks for every route.

Password strength rules enforced via Zod in this project:
- Minimum 8 characters
- At least 1 uppercase, 1 lowercase, 1 digit, 1 special character

---

## 12. SHA-256

A **fast, one-way hashing algorithm** (different from bcrypt — bcrypt is intentionally slow for passwords; SHA-256 is for data fingerprinting).

```typescript
crypto.createHash('sha256').update(token).digest('hex')
// "eyJhbGci..." (long JWT) → "a3f9b2c...64chars" (fixed-length hash)
```

**Why hash refresh tokens before storing in DB?**
If someone hacks your database, they get the hash — useless without the original token (which only lives in the user's cookie).

> Like a fingerprint: you can confirm "this finger matches this print" but you can't reconstruct the finger from the print.

---

## 13. How a Login Request Flows

Putting it all together:

```
User submits { email, password }
        │
        ▼
CORS check ✓
        │
        ▼
express.json() parses body ✓
        │
        ▼
Zod validates { email, password } ✓
        │
        ▼
Pool grabs a DB connection
        │
        ▼
SELECT user + role FROM DB
        │
        ▼
bcrypt.compare(password, stored_hash) → true ✓
        │
        ▼
generateAccessToken()  → JWT (15m) → returned in JSON body
generateRefreshToken() → JWT (7d)
        │
        ▼
SHA-256 hash refresh token → stored in refresh_tokens table
        │
        ▼
Set refresh token as HTTPOnly cookie (XSS protection)
        │
        ▼
Response: { success: true, access_token: "...", user: {...} }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
15 minutes later → access token expires
        │
        ▼
Call POST /refresh (cookie sent automatically by browser)
        │
        ▼
Token Rotation: old revoked → new pair issued
```

---

*Add new questions below as the project grows.*
