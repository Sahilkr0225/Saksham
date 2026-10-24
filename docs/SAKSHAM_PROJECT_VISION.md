# Saksham — School Management Platform
## Complete Project Vision Document

> **Author:** Sahil Kumar  
> **Last Updated:** 2026-10-21  
> **Status:** Core ERP & Foundation Portals Operational — 13 of 20 Backend Modules Complete, 7 Major Frontend Portals Live, 100% Automated Test Suites Passing

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [The Solution — Why Saksham?](#2-the-solution--why-saksham)
3. [Target Users & Stakeholders](#3-target-users--stakeholders)
4. [Tech Stack](#4-tech-stack)
5. [System Architecture](#5-system-architecture)
6. [All Features — Module Breakdown](#6-all-features--module-breakdown)
7. [Edge Cases & How We Solve Them](#7-edge-cases--how-we-solve-them)
8. [Security Model](#8-security-model)
9. [Deployment Strategy](#9-deployment-strategy)
10. [Future Scope — AI Layer](#10-future-scope--ai-layer)
11. [Project Scope Boundaries](#11-project-scope-boundaries)

---

## 1. Problem Statement

School administration in India (and globally for most mid-size schools) is deeply fragmented:

| Area | Current Reality |
|------|-----------------|
| **Attendance** | Maintained in paper registers; no digital trail |
| **Fees** | Excel sheets, register books — prone to errors and loss |
| **Results / Marks** | Printed report cards; no historical digital record |
| **Notices** | WhatsApp groups or physical boards — no archive |
| **Admissions** | Manual forms, no status tracking for parents |
| **Communication** | Phone calls, informal messages — no audit trail |
| **Accountability** | No record of who changed what data, and when |

**This creates real problems:**
- Lost or tampered academic records
- Parents have zero real-time visibility into their child's progress
- Delayed fee collection due to manual follow-up
- Teachers waste hours on administrative paperwork instead of teaching
- Principals have no consolidated view of school health
- No accountability if a record is changed wrongly

**The current "solutions" fail because:**
- Basic tally or spreadsheet tools lack role-awareness (anyone sees everything)
- Expensive ERP solutions are built for enterprises, not affordable for individual schools
- WhatsApp/Google Forms solutions are informal and not integrated

---

## 2. The Solution — Why Saksham?

**Saksham** (meaning *"Capable"* in Hindi) is a **centralized, role-aware, production-grade School Management Platform** — built specifically for mid-size Indian schools.

### Core Philosophy
> Every person in a school ecosystem — Principal, Teacher, Parent, Student — sees exactly what they need, nothing more, and can act where they need to act.

### What Makes Saksham Different

| Feature | Saksham | Typical School App |
|---------|---------|-------------------|
| **Role-Based Access** | 6 roles with granular permissions | Admin vs. User only |
| **Audit Trail** | Every data change tracked with old/new value, IP, timestamp | None |
| **Enrollment Flow** | Full pipeline: Application → Review → Approval → Enrolled Student Account | Manual |
| **Parent Dashboard** | Real-time child's attendance, results, fees, notices | Periodic SMS only |
| **AI Layer (Future)** | Smart queries, fee risk detection, attendance prediction | Not planned |
| **Modular Architecture** | 20 independent, interlinked modules | Monolithic |
| **Token Security** | JWT rotation, bcrypt hashing, XSS-safe cookies | Basic auth |

---

## 3. Target Users & Stakeholders

| Role | Who They Are | What They Do in Saksham |
|------|-------------|------------------------|
| **Super Admin** | IT Admin / Developer | Full platform access, system settings, user creation, monitoring |
| **Principal** | School Head | View all reports, approve admissions, manage teachers, see audit logs |
| **Office Staff** | Admin team | Admissions, fee collection, notices, document management |
| **Teacher** | Class teacher / Subject teacher | Mark attendance, enter marks, submit homework, post notices |
| **Parent** | Student's guardian | View child's attendance, results, fees, homework, notices |
| **Student** | Enrolled learner | View own timetable, notices, results, homework |

---

## 4. Tech Stack

### Backend
| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | v20+ | Runtime environment |
| **TypeScript** | v5.5 | Type safety, better developer tooling |
| **Express.js** | v4.19 | REST API framework |
| **PostgreSQL** | v15 | Primary relational database (ACID-compliant) |
| **Neon.tech** | Serverless PG | Cloud-hosted PostgreSQL for development |
| **JSON Web Token** | v9 | Access token authentication |
| **bcryptjs** | v2.4 | Password hashing (12 salt rounds) |
| **Zod** | v3.23 | Runtime request validation and schema enforcement |
| **morgan** | v1.10 | HTTP request logger |
| **cookie-parser** | v1.4 | HTTPOnly cookie parsing for refresh tokens |
| **dotenv** | v16 | Environment variable management |

### Frontend *(Operational Production Stack)*
| Tool | Purpose |
|------|---------|
| **React 19 & Vite** | Blazing-fast SPA architecture, instant HMR, optimized production builds |
| **TypeScript (v5.5)** | Full type safety across components, models, and API response contracts |
| **Vanilla CSS Modules** | Modern, scoped styling with CSS variables, glassmorphic accents, and zero runtime overhead |
| **React Router DOM (v7)** | Client-side routing, protected route guards, and URL query state persistence |
| **Axios** | HTTP client with automatic bearer token attachment and refresh interceptors |
| **Lucide React** | Consistent, modern iconography across all operational portals |
| **Context API** | Centralized auth, session, and role state management |

### Database
| Decision | Reason |
|----------|--------|
| **PostgreSQL** | Relational, ACID, foreign key constraints, JOINs needed across 20+ tables |
| **UUID Primary Keys** | No ID enumeration attacks; globally unique across exports |
| **Timestamptz** | All timestamps in UTC, converted to IST on frontend |
| **Soft deletes** | `deleted_at` column — records never fully erased, preserves audit integrity |

### Infrastructure *(Production — Phase 7)*
| Tool | Purpose |
|------|---------|
| **Docker + Docker Compose** | Containerization, environment parity |
| **Nginx** | Reverse proxy, SSL termination, rate limiting |
| **GitHub Actions** | CI/CD pipeline for automated deployment |
| **VPS / Render** | Cloud hosting |
| **Neon.tech → Self-hosted PG** | Migrate to self-hosted PostgreSQL in production |

---

## 5. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│     Browser (React + Vite SPA) | Mobile Browser (Responsive)     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API GATEWAY (Nginx)                       │
│  Rate Limiting | SSL Termination | Static File Serving          │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS REST API (Node.js/TS)                 │
│                       /api/v1/...                               │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Middleware  │  │  Controllers │  │    Validators (Zod)  │  │
│  │  cors        │  │  auth        │  │    authValidator     │  │
│  │  authenticate│  │  users       │  │    userValidator     │  │
│  │  authorize   │  │  academic    │  │    studentValidator  │  │
│  │  validateReq │  │  admissions  │  │    admissionValidator│  │
│  └──────────────┘  │  students    │  └──────────────────────┘  │
│                    │  ... (20+)   │                             │
│                    └──────────────┘                             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Shared Utilities                                │   │
│  │  auth.ts (JWT)  |  audit.ts  |  db.ts (Pool)           │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                          │
│                                                                 │
│   Foundation:   users | roles | user_roles | refresh_tokens     │
│                 audit_logs                                      │
│                                                                 │
│   Core ERP:     academic_years | classes | sections | subjects   │
│                 class_subjects | admission_applications          │
│                 students | parents | teachers | ...             │
└─────────────────────────────────────────────────────────────────┘
```

### Request Lifecycle
```
Request → Nginx → Express → [CORS → JSON Parse → Cookie Parse → Morgan]
       → validateRequest (Zod) → authenticate (JWT) → authorize (RBAC)
       → Controller → DB Query → Response
```

---

## 6. All Features — Module Breakdown

Saksham is organized into **20 modules** across 4 layers.

---

### 🏗️ Layer 1: Foundation (Modules 1–3)

#### Module 1 — Auth & User Management ✅ Backend & Frontend Complete
- Email + password login with JWT (15-min access token + 7-day refresh token)
- Invite-only account creation by Super Admin (no self-registration)
- Temporary password issued on account creation; one-time reveal in secure UI modal
- Forgot password via OTP email verification
- Token rotation — refresh token invalidated on every refresh cycle
- Account activation / deactivation with status preservation
- User profile: name, email, phone, avatar, role

#### Module 2 — RBAC (Role-Based Access Control) ✅ Backend & Frontend Complete
- 6 roles: `super_admin`, `principal`, `office_staff`, `teacher`, `parent`, `student`
- Granular permissions enforced on every API route via `authorize()` middleware
- Role stored in JWT payload — instant enforcement on every request
- Frontend route guards and role-gated UI actions (buttons, modals, tabs)
- Super Admin can assign/revoke roles; strict role boundary protection

#### Module 3 — Audit Logs ✅ Backend Complete, System-Wide Logging Active
- Every write operation (CREATE, UPDATE, DELETE, ENROLL) automatically logged in `audit_logs`
- Each log entry captures: `user_id`, `action`, `resource`, `resource_id`, `old_value`, `new_value`, `ip_address`, `user_agent`, `timestamp`
- Logs are immutable — no edit or delete allowed
- Filterable by user, action, resource, date range
- Accessible to Super Admin and Principal only

---

### 📚 Layer 2: Core ERP (Modules 4–20)

#### Module 4 — Academic Structure ✅ Backend & Frontend Complete
- Create and manage academic years (set and activate current year with confirmation modal)
- Create hierarchical class structure: Classes → Sections with capacity constraints
- Create subjects (core, elective, lab, activity types)
- Allocate subjects to classes with assigned teacher per academic year
- Live frontend UI with full editing, validation, and real-time count updates

#### Module 5 — Admissions ✅ Backend & Frontend Complete
- Submit admission applications for prospective students with complete demographic details
- Track application status pipeline: `submitted` → `under_review` → `approved` / `rejected` → `enrolled`
- Approved applicant enrollment: creates student user account (`@student.saksham.edu`) and `students` record atomically
- **Automatic Parent Onboarding:** Automatically provisions parent user account with `'parent'` role (Case A) or safely reuses existing account without password clobber (Case B)
- Atomically links `students.parent_user_id` to parent account
- Concurrency protection: `FOR UPDATE` locking on applications and users prevents race collisions
- Reveals dual student and parent one-time temporary credentials in Modal 5 with direct clipboard copy and directory navigation

#### Module 6 — Student Management ✅ Backend & Frontend Complete
- Paginated student list with live search (name, email, admission number), filtering (class, section, status)
- Detailed student profile drawer with academic info, contact details, and linked parent overview
- Update student personal details (DOB, blood group, address, emergency contact, roll number)
- Status management: `active`, `transferred`, `graduated`, `suspended`
- Section capacity enforcement and active roll-number uniqueness verification with transactional locking
- Self-service: students can only view their own profile; parents can only view their child's profile

#### Module 7 — Parent Management ✅ Backend & Frontend Complete
- Dedicated Parent Directory with debounced search and pagination
- Real-time dataset-wide KPI metric counts (total, active, inactive, parents with wards, linked students, unlinked students)
- Detailed Parent Profile Drawer with dynamic ward inspection
- Student linking and unlinking with single-primary-parent enforcement (`students.parent_user_id`)
- Safe non-destructive student unlinking preserving student history and academic status
- Direct parent onboarding modal with one-time temporary password reveal
- Super Admin and Principal account deactivation and exclusive reactivation controls
- Auto-reflects newly enrolled parents and wards from Admission workflow without manual steps

#### Module 8 — Teacher Management ✅ Backend & Frontend Complete
- Dedicated Teacher Directory with search, pagination, and status filters
- Teacher Profile Drawer with qualifications, contact, and assigned subjects
- Teacher onboarding modal generating credentials with role `'teacher'`
- Account activation and deactivation toggle with status preservation

#### Module 9 — Attendance ✅ Backend Complete
- Daily attendance marking by class teacher (present / absent / late)
- Subject-wise attendance for subject teachers
- Real-time attendance dashboard for Principal
- Parent notification on absence
- Attendance percentage calculation per student
- Monthly attendance reports

#### Module 10 — Homework & Assignments ✅ Backend Complete
- Teachers post homework per class/subject with due dates and attachment support
- Students mark homework as completed
- Parents view pending homework
- Assignment submissions tracking

#### Module 11 — Exams & Results ✅ Backend Complete
- Create exam schedules (unit test, mid-term, final)
- Marks entry per student per subject
- Auto-calculate grade and percentage
- Report card generation (printable PDF)
- Historical result archive per academic year
- Result publish flow (draft → reviewed → published)

#### Module 12 — Fee Management ✅ Backend & Frontend Complete
- Define fee structures per class per academic year with base tuition and optional components
- Collect and record fee payments with automated receipt number generation
- Student fee ledger and assignment tracking
- Analytics summary KPI cards (total collected, total pending, total assigned)

#### Module 13 — Notices & Events ✅ Backend Complete
- Create announcements with audience targeting (all, specific role, specific class)
- Event calendar (exams, holidays, sports day, PTM)
- Pinned/priority notices
- Notice archive with search

#### Module 14 — Notification Engine *(Planned)*
- In-app notifications for all events (attendance marked, new notice, fee due, result published)
- Email notifications for critical alerts
- Notification preferences per user
- Notification read/unread tracking

#### Module 15 — Document Management *(Planned)*
- Upload and store student documents (birth certificate, transfer certificate, mark sheets)
- Document verification status (verified / pending)
- Download access controlled by role
- Storage: local filesystem in development, cloud storage (S3/Cloudflare R2) in production

#### Module 16 — Reports & Analytics *(Planned)*
- School-level dashboard: total students, attendance rate, fee collection rate
- Attendance trends (weekly/monthly graphs)
- Class-wise performance comparison
- Fee collection reports (amount collected vs. pending)
- Exportable to PDF/Excel
- Custom date range filtering

#### Module 17 — Administration & Settings *(Planned)*
- School profile management (name, logo, address, contact)
- Academic year configuration
- System-wide settings (working days, period structure)
- Bulk operations (promote all students to next class)
- Data export (full school data backup)

#### Module 18 — Help & Support *(Planned)*
- In-app FAQ section
- Raise support ticket to Super Admin
- Contact school administrator form
- System status page

#### Module 19 — Gallery & Media *(Planned)*
- Upload and organize school photos and event media
- Albums by event/date
- Role-controlled access
- Public/private album toggle

#### Module 20 — Public Website (CMS) *(Planned)*
- School's public-facing website built on top of Saksham's CMS
- Editable pages: About, Admissions, Faculty, Gallery, Contact
- Auto-populated from existing platform data (classes, events, gallery)
- SEO-friendly static rendering via Next.js

---

## 7. Edge Cases & How We Solve Them

### Auth & Security

| Edge Case | Solution |
|-----------|----------|
| **User logs in from 2 devices simultaneously** | Both sessions maintain independent refresh tokens. Logout from one device revokes only that session's token. |
| **Stolen access token** | Access tokens expire in 15 minutes — attacker has a very short window. No DB call needed to verify. |
| **Stolen refresh token** | Token rotation: once you use a refresh token, it's revoked. If attacker uses it before you, your next valid request will force a re-login. |
| **Admin deactivates a logged-in user** | Access token still valid for up to 15 minutes (by design). All subsequent refresh attempts blocked immediately since `is_active = false` check on refresh. |
| **Brute-force login attack** | Rate limiting on login endpoint (Nginx + future middleware): max 5 failed attempts → 15-minute lockout. |
| **User changes password** | All existing refresh tokens for that user are immediately revoked in DB. All other sessions become invalid. |
| **SQL injection** | All DB queries use parameterized queries (`$1, $2` in pg) — never string concatenation. |
| **XSS cookie theft** | Refresh token stored in `httpOnly: true` cookie — completely inaccessible to JavaScript. |

---

### Enrollment & Admissions

| Edge Case | Solution |
|-----------|----------|
| **Parent account auto-provisioning & linking** | Case A automatically provisions a new parent account in `users` (`role = 'parent'`), generates one-time temporary password, and links student via `students.parent_user_id`. |
| **Existing parent account reuse** | Case B matches existing parent account by normalized email, preserves their existing credentials and profile details without clobber, and links the new ward. |
| **Incompatible account role collision** | Case C rejects enrollment with `409 Conflict` if the email belongs to an existing staff/teacher user to prevent cross-role boundary corruption. |
| **Duplicate student login email** | Student user email is dynamically generated as `<cleanAdmNo>@student.saksham.edu`, leaving parent emails unpolluted and eligible for parent onboarding and login. |
| **Concurrent double-enrollment race condition** | Enrollment handler locks `admission_applications WHERE id = $1 FOR UPDATE` and `users WHERE email = $1 FOR UPDATE` to serialize concurrent requests. Exactly one succeeds; subsequent requests hit `status !== 'approved'` and roll back. |
| **Section capacity overflow during enrollment** | Section locked with `FOR UPDATE`; capacity is verified against active students before enrollment. If full, returns `409 Conflict` and transaction rolls back atomically. |

---

### Student Management

| Edge Case | Solution |
|-----------|----------|
| **Student queries another student's profile** | `getStudentById` checks: if role is `student`, `user_id` must match current logged-in user. Returns 403 otherwise. |
| **Parent queries a child not linked to them** | `parent_user_id` on student record matched against logged-in parent's ID. Returns 403 if mismatch. |
| **Duplicate roll numbers within active section** | Enforced by partial unique index `uk_students_active_section_roll` and transactional checks before assignment. Returns `409 Conflict`. |
| **Assigning student to section belonging to different class** | `assignStudentSection` validates `sections.class_id = class_id` before update. Returns 400 if mismatch. |
| **Graduated student getting marked present** | Status checks in Attendance module verify `student.status = 'active'` before accepting attendance entry. |
| **Bulk class promotion at year-end** | Module 17 (Administration) will have a bulk-promote action: iterates all active students, moves to next class, archives current year data. |

---

### Parent Management

| Edge Case | Solution |
|-----------|----------|
| **Single primary parent rule (V1)** | In V1, each student has at most one primary parent (`students.parent_user_id`). Linking an already linked student returns `409 Conflict` unless unlinked first. |
| **Non-destructive student unlinking** | Unlinking sets `students.parent_user_id = NULL` without deleting or modifying the student record or their academic standing. |
| **Exclusive account reactivation** | Accounts deactivated by Principal or Super Admin can only be reactivated by Super Admin, strictly preserving executive oversight. |
| **Global metric aggregation parity** | Parent directory metrics (`counts.total`, `active`, `parents_with_wards`, `total_linked_students`) aggregate live across the whole school database, matching exact database state. |

---

### Academic Structure

| Edge Case | Solution |
|-----------|----------|
| **Two academic years marked as current simultaneously** | `setCurrentAcademicYear` endpoint wraps in transaction: first sets all years to `is_current = false`, then sets target to `true`. |
| **Duplicate class names** | `classes.name` has a `UNIQUE` constraint. Returns 409 on duplicate. |
| **Duplicate section within same class** | `UNIQUE(class_id, name)` on sections table. |
| **Duplicate subject in same class for same year** | `UNIQUE(class_id, subject_id, academic_year_id)` on `class_subjects` table. |
| **Deleting a class that has students enrolled** | `ON DELETE SET NULL` on `students.current_class_id` — students remain but class reference becomes null. Prevents orphan failures. |

---

### Fee Management *(Module 12)*

| Edge Case | Solution |
|-----------|----------|
| **Fee recorded for a transferred student** | Fee module will check `student.status = 'active'` before accepting payment — transferred students must first be handled administratively. |
| **Duplicate fee payment entry** | Receipt number generated as `FEE-YEAR-STUDENTID-SEQ` unique index — prevents accidental duplicate recording. |
| **Fee structure changes mid-year** | Fee structure versions tied to academic year. A student's dues calculated against the structure at the time of enrollment. |

---

### Attendance *(Module 9)*

| Edge Case | Solution |
|-----------|----------|
| **Attendance marked twice for same student/date** | `UNIQUE(student_id, class_id, date)` or similar composite index — prevents duplicate daily entries. |
| **Teacher marks attendance for a class they don't teach** | `authorize()` middleware extended with class-teacher ownership check. Only the class teacher or subject teacher for that period can mark. |
| **Holiday marked as present** | School calendar (admin settings) consulted before attendance submission — holidays block the submission flow. |
| **Attendance marked retroactively** | Date validation: attendance can only be submitted for today or within a configurable back-date window (e.g., 3 days) — controlled by Principal. |

---

### Exams & Results *(Module 11)*

| Edge Case | Solution |
|-----------|----------|
| **Marks entered exceed maximum marks** | Zod validation: `marks_obtained <= max_marks` constraint at request validation layer. |
| **Result published before all students have marks** | Publish flow checks completeness: all enrolled students in class must have an entry before publish is allowed. |
| **Student promoted before all results finalized** | Promotion check (Module 17) requires all results for current year to be in `published` state for the student. |

---

## 8. Security Model

```
┌─────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                      │
│                                                         │
│  1. Transport:    HTTPS everywhere (Nginx + SSL cert)   │
│  2. Auth:         JWT (15min) + Refresh Token rotation  │
│  3. Storage:      bcrypt (12 rounds) for passwords      │
│                   SHA-256 hash for refresh tokens in DB │
│  4. Cookies:      httpOnly + secure + sameSite=strict   │
│  5. Validation:   Zod schema on every write request     │
│  6. Access:       Role-based middleware on every route  │
│  7. DB Safety:    Parameterized queries (no raw concat) │
│  8. Audit:        Every write operation logged w/ IP    │
│  9. Rate Limit:   Nginx + login-specific throttle       │
│  10. Soft Delete: Records never permanently erased      │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Deployment Strategy

### Development (Current)
- Backend: `ts-node-dev` with hot reload
- Database: Neon.tech serverless PostgreSQL (cloud)
- Environment: `.env` file with secrets

### Staging / Production (Phase 7)
```
GitHub Push → GitHub Actions CI
                  │
                  ▼
         npm run build (tsc)
                  │
                  ▼
         Docker build image
                  │
                  ▼
         Push to Docker Hub / Registry
                  │
                  ▼
         VPS: docker-compose up -d
         (Nginx + Node + PostgreSQL containers)
```

### Environment Variables in Production
- Managed via GitHub Secrets → injected into Dockerfile
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL` never in code

---

## 10. Future Scope — AI Layer

Once the platform reaches v1.0 (all 20 modules complete + frontend live), an AI layer will be added on top:

| Feature | Technology | Description |
|---------|-----------|-------------|
| **Smart Query (RAG)** | LLM + pgvector | Principal can ask: *"Which students had attendance below 75% last month?"* — answered in natural language |
| **Fee Risk Prediction** | ML model | Identify students likely to default on next fee payment based on history |
| **Attendance Anomaly Detection** | ML | Flag unusual patterns (e.g., sudden drop in attendance for a student) |
| **Auto Report Generation** | LLM | Generate narrative reports: *"Here is the summary for Class 10A's performance in Q1..."* |
| **Parent Chatbot** | LLM | Parents can ask questions about their child in natural language via a chat interface |

---

## 11. Project Scope Boundaries

### ✅ v1 IN SCOPE
- Single school deployment (one school per instance)
- Web application (responsive, desktop + mobile browser)
- All 20 modules (backend + frontend)
- 6 user roles with full RBAC
- Docker-based deployment with CI/CD
- Basic analytics and PDF report generation
- Email notifications (SMTP-based)

### ❌ v1 OUT OF SCOPE
- Multi-school / SaaS enterprise support
- Native mobile app (iOS / Android)
- Online payment gateway (fees recorded manually; payment link in v2)
- AI/ML layer (deferred to post-v1)
- Third-party ERP integrations (Tally, SAP)
- White-labeling for different schools
- Video classes / e-learning content

---

*This document is the single source of truth for the complete Saksham project vision. Update after every major milestone.*
