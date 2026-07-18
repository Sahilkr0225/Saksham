# Saksham — Phase 0 & Phase 1: Foundation Module
> **Modules Covered:** Auth & User Management · RBAC · Audit Logs

---

# PHASE 0 — Planning & Research

## Problem Statement
School administration today is fragmented — attendance is in registers, fees in Excel sheets, notices on whiteboards, and results in files. There is no single system where a **Principal, Teacher, Parent, or Student** can log in and see exactly what they need. Manual processes lead to:
- Lost academic records
- Delayed fee collection
- No accountability trail (who changed what, when?)
- Zero visibility for parents into their child's progress

**Saksham** solves this by being a centralized, role-aware, production-grade School Management Platform.

---

## Stakeholders

| Stakeholder | Role in System | Key Pain Points |
|-------------|---------------|-----------------|
| **School Principal** | Approves workflows, views reports | No single dashboard for school health |
| **Office Staff** | Admissions, Fees, Document management | Manual paperwork, errors in records |
| **Teachers** | Attendance, Homework, Marks entry | Repetitive manual data entry |
| **Students** | View own results, notices, timetable | No self-service portal |
| **Parents** | Track child's attendance, fees, results | No real-time visibility |
| **Super Admin** | Full system access, settings | No control plane for the whole platform |
| **IT Admin / Developer** | Deploy, maintain, monitor | Needs clean audit trail and monitoring |

---

## Scope — Version 1 (Single School Deployment)

### ✅ IN SCOPE (v1)
- Single school instance (one school per deployment)
- Web application (responsive, works on desktop & mobile browser)
- Role-based access for: Super Admin, Principal, Office Staff, Teacher, Parent, Student
- Foundation layer: Auth, RBAC, Audit Logs
- Core ERP: All 20 modules (designed & built module by module)
- Basic analytics & reports
- Notification engine (in-app + email)
- Docker-based deployment

### ❌ OUT OF SCOPE (v1)
- Multi-school / enterprise support
- Mobile native app (iOS / Android)
- AI layer (RAG, LLMs, vector DB) — **Future Scope**
- Payment gateway integration (fee recording only, no online payment in v1)
- Third-party ERP integrations
- White-labeling

---

# PHASE 1 — SRS: Foundation Module

> The Foundation module is the backbone of the entire platform. Nothing else works without it.
> It covers three sub-modules: **Auth & User Management**, **RBAC**, and **Audit Logs**.

---

## 1. Functional Requirements

### 1.1 Auth & User Management

| ID | Requirement |
|----|-------------|
| F-AU-01 | System shall allow users to register/login with email & password |
| F-AU-02 | System shall issue a JWT access token (15 min expiry) on successful login |
| F-AU-03 | System shall issue a Refresh Token (7 days, stored in HTTP-only cookie) |
| F-AU-04 | System shall allow token refresh without re-login |
| F-AU-05 | System shall allow users to logout (invalidate refresh token) |
| F-AU-06 | System shall support forgot password via email OTP |
| F-AU-07 | System shall allow Super Admin to create, update, deactivate users |
| F-AU-08 | System shall store user profile: name, email, phone, avatar, role |
| F-AU-09 | System shall prevent login for deactivated accounts |
| F-AU-10 | System shall support forced password change on first login |

### 1.2 RBAC (Roles & Permissions)

| ID | Requirement |
|----|-------------|
| F-RB-01 | System shall define 6 roles: Super Admin, Principal, Office Staff, Teacher, Parent, Student |
| F-RB-02 | Each role shall have a set of permissions (e.g., `students:read`, `fees:write`) |
| F-RB-03 | Permissions shall be checked on every API request via middleware |
| F-RB-04 | Super Admin can assign/revoke roles to any user |
| F-RB-05 | A user can have only one active role at a time (v1) |
| F-RB-06 | Role-permission mappings shall be configurable (stored in DB, not hardcoded) |
| F-RB-07 | System shall return 403 Forbidden when a user accesses an unauthorized resource |

### 1.3 Audit Logs

| ID | Requirement |
|----|-------------|
| F-AL-01 | System shall log every write operation (CREATE, UPDATE, DELETE) automatically |
| F-AL-02 | Each log entry shall capture: `user_id`, `action`, `resource`, `resource_id`, `old_value`, `new_value`, `ip_address`, `timestamp` |
| F-AL-03 | Audit logs shall be immutable (no update or delete allowed on logs) |
| F-AL-04 | Super Admin and Principal can view audit logs |
| F-AL-05 | Logs shall be filterable by user, action, resource, and date range |

---

## 2. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF-01 | **Performance** | Login API response < 500ms under normal load |
| NF-02 | **Scalability** | System should handle 2000 concurrent users (single school) |
| NF-03 | **Security** | Passwords hashed with bcrypt (min 12 salt rounds) |
| NF-04 | **Security** | All APIs served over HTTPS only |
| NF-05 | **Security** | Rate limiting on login endpoint (max 5 failed attempts → 15 min lockout) |
| NF-06 | **Reliability** | Refresh token rotation on every refresh (old token invalidated) |
| NF-07 | **Maintainability** | All auth logic in a dedicated service layer, not in route handlers |
| NF-08 | **Compliance** | No plaintext passwords stored anywhere, including logs |
| NF-09 | **Availability** | 99.5% uptime target (non-critical downtime window: 2–4 AM) |

---

## 3. Use Cases

### UC-01: User Login
- **Actor:** Any registered user
- **Precondition:** User account exists and is active
- **Steps:**
  1. User enters email + password
  2. System validates credentials
  3. System issues access token + refresh token
  4. User is redirected to their role-specific dashboard
- **Alternate Flow:** Invalid credentials → error message; 5 failed attempts → account locked 15 mins

### UC-02: Token Refresh
- **Actor:** Any logged-in user
- **Precondition:** Valid refresh token in cookie
- **Steps:**
  1. Frontend detects access token expiry
  2. Sends refresh request automatically
  3. System validates refresh token, issues new access + refresh token
  4. Old refresh token invalidated
- **Alternate Flow:** Expired/invalid refresh token → redirect to login

### UC-03: Super Admin Creates a User
- **Actor:** Super Admin
- **Steps:**
  1. Admin fills in user details (name, email, phone, role)
  2. System creates account, sends invite email with temp password
  3. User logs in, forced to change password on first login
  4. Audit log entry created

### UC-04: Role Assignment
- **Actor:** Super Admin
- **Steps:**
  1. Admin selects a user
  2. Assigns a role (e.g., Teacher)
  3. System updates `user_roles` table
  4. Audit log entry created
  5. User's access changes immediately on next API call

### UC-05: View Audit Logs
- **Actor:** Super Admin or Principal
- **Steps:**
  1. Actor navigates to Audit Logs section
  2. Applies filters (by user / action / date)
  3. System returns paginated list of log entries
  4. Actor can inspect old vs. new values for any record change

---

## 4. User Stories

```
As a Teacher, I want to log in with my email and password
so that I can access my class management dashboard.

As a Super Admin, I want to create user accounts and assign roles
so that the right people have access to the right parts of the system.

As a Principal, I want to see a log of all changes made in the system
so that I have full accountability over who changed what and when.

As any user, I want my session to stay active without re-logging in every 15 minutes
so that I can work without interruption (via refresh token).

As a Super Admin, I want to deactivate a user account
so that ex-employees or ex-students can no longer access the system.
```

---

## 5. Acceptance Criteria

| Story | Acceptance Criteria |
|-------|-------------------|
| Login | ✅ Valid credentials → JWT returned; ❌ Invalid → 401 error; 5 fails → 15 min lockout |
| Signup/Create User | ✅ Email unique validation; temp password sent; forced change on first login |
| Token Refresh | ✅ New tokens issued; old refresh token invalidated (rotation) |
| Role Assignment | ✅ Only Super Admin can assign; permission changes take effect immediately |
| RBAC Enforcement | ✅ Unauthorized resource → 403; no data leak across roles |
| Audit Log | ✅ Every write logged; logs immutable; filterable by user/action/date |
| Deactivate User | ✅ Login blocked immediately on deactivation |

---

## 6. Constraints & Assumptions

- **v1 assumption:** One role per user (no multi-role in v1)
- **Email is unique** across the entire system
- **School year** is the top-level scoping boundary (data archived per year)
- Invite-only signup — users cannot self-register; only Super Admin creates accounts
- All dates stored in **UTC** in the database; converted to IST on frontend
