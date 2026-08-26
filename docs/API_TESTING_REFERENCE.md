# Saksham Platform — API Testing Reference & Documentation

> **Living Document** — Parallel reference for backend API testing.  
> Base URL: `http://localhost:5000/api/v1`  
> Headers for Protected Endpoints: `Authorization: Bearer <access_token>`  
> Refresh Token Handling: Sent automatically via HTTPOnly Cookie (`refresh_token`) or in Request Body.

---

## 📋 Table of Contents
1. [Environment & Global Setup](#1-environment--global-setup)
2. [Auth Module Endpoints](#2-auth-module-endpoints)
   - [POST /api/v1/auth/login](#post-apiv1authlogin)
   - [GET /api/v1/auth/me](#get-apiv1authme)
   - [POST /api/v1/auth/refresh](#post-apiv1authrefresh)
   - [PATCH /api/v1/auth/change-password](#patch-apiv1authchange-password)
   - [POST /api/v1/auth/forgot-password](#post-apiv1authforgot-password)
   - [POST /api/v1/auth/reset-password](#post-apiv1authreset-password)
   - [POST /api/v1/auth/logout](#post-apiv1authlogout)
3. [User Management Endpoints](#3-user-management-endpoints)
   - [POST /api/v1/users](#post-apiv1users)
   - [GET /api/v1/users](#get-apiv1users)
   - [GET /api/v1/users/:id](#get-apiv1usersid)
   - [PATCH /api/v1/users/:id](#patch-apiv1usersid)
   - [POST /api/v1/users/:id/deactivate](#post-apiv1usersiddeactivate)
   - [POST /api/v1/users/:id/reactivate](#post-apiv1usersidreactivate)
4. [Academic Structure Endpoints (Module 4)](#4-academic-structure-endpoints-module-4)
   - [POST /api/v1/academic/academic-years](#post-apiv1academicacademic-years)
   - [GET /api/v1/academic/academic-years](#get-apiv1academicacademic-years)
   - [POST /api/v1/academic/academic-years/:id/set-current](#post-apiv1academicacademic-yearsidset-current)
   - [POST /api/v1/academic/classes](#post-apiv1academicclasses)
   - [GET /api/v1/academic/classes](#get-apiv1academicclasses)
   - [POST /api/v1/academic/sections](#post-apiv1academicsections)
   - [POST /api/v1/academic/subjects](#post-apiv1academicsubjects)
   - [GET /api/v1/academic/subjects](#get-apiv1academicsubjects)
   - [POST /api/v1/academic/class-subjects](#post-apiv1academicclass-subjects)
   - [GET /api/v1/academic/classes/:classId/subjects](#get-apiv1academicclassesclassidsubjects)
5. [Admissions Endpoints (Module 5)](#5-admissions-endpoints-module-5)
   - [POST /api/v1/admissions](#post-apiv1admissions)
   - [GET /api/v1/admissions](#get-apiv1admissions)
   - [GET /api/v1/admissions/:id](#get-apiv1admissionsid)
   - [PATCH /api/v1/admissions/:id/status](#patch-apiv1admissionsidstatus)
   - [POST /api/v1/admissions/:id/enroll](#post-apiv1admissionsidenroll)
6. [Student Management Endpoints (Module 6)](#6-student-management-endpoints-module-6)
7. [Parent Management Endpoints (Module 7)](#7-parent-management-endpoints-module-7)
   - [GET /api/v1/parents](#get-apiv1parents)
   - [GET /api/v1/parents/me/children](#get-apiv1parentsmechildren)
   - [GET /api/v1/parents/:id](#get-apiv1parentsid)
   - [POST /api/v1/parents/:id/link-student](#post-apiv1parentsidlink-student)
   - [POST /api/v1/parents/:id/unlink-student](#post-apiv1parentsidunlink-student)
8. [Teacher Management Endpoints (Module 8)](#8-teacher-management-endpoints-module-8)
   - [GET /api/v1/teachers](#get-apiv1teachers)
   - [GET /api/v1/teachers/me](#get-apiv1teachersme)
   - [GET /api/v1/teachers/:id](#get-apiv1teachersid)
   - [PUT /api/v1/teachers/:id](#put-apiv1teachersid)
   - [GET /api/v1/teachers/:id/subjects](#get-apiv1teachersidsubjects)
9. [System Health & Status](#9-system-health--status)
10. [Complete E2E Testing Sequence](#10-complete-e2e-testing-sequence)

---

## 1. Environment & Global Setup

### Default Super Admin Credentials (Seeded on server start):
- **Email:** `sahil@gmail.com`
- **Password:** `Password@1234`

### Standard Response Envelope
All API endpoints return JSON responses using this envelope:

#### Success Response
```json
{
  "success": true,
  "message": "Human readable summary",
  "data": { ... }
}
```

#### Validation Error Response (400 Bad Request)
```json
{
  "success": false,
  "message": "Input validation failed",
  "data": {
    "errors": [
      {
        "field": "email",
        "message": "Invalid email address"
      }
    ]
  }
}
```

---

## 2. Auth Module Endpoints

### POST `/api/v1/auth/login`
Authenticates a user and returns a 15-minute Access Token while setting a 7-day HTTPOnly Refresh Cookie.

- **Access:** Public
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "email": "sahil@gmail.com",
  "password": "Password@1234"
}
```

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sahil@gmail.com","password":"Password@1234"}'
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": {
    "user": {
      "id": "c1f7b8a2-9b21-4f12-b91e-3f8d229a1b02",
      "name": "Sahil Kumar",
      "email": "sahil@gmail.com",
      "role": "super_admin",
      "must_change_password": false
    },
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### GET `/api/v1/auth/me`
Fetches the profile details of the currently authenticated caller.

- **Access:** Authenticated
- **Headers:** `Authorization: Bearer <access_token>`

#### Curl Command
```bash
curl -X GET http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Profile details fetched successfully",
  "data": {
    "user": {
      "id": "c1f7b8a2-9b21-4f12-b91e-3f8d229a1b02",
      "name": "Sahil Kumar",
      "email": "sahil@gmail.com",
      "phone": null,
      "avatar_url": null,
      "is_active": true,
      "role_name": "super_admin"
    }
  }
}
```

---

### POST `/api/v1/auth/refresh`
Rotates the refresh token session and generates a brand new access token. Reads refresh token from HTTPOnly cookie or body fallback.

- **Access:** Public (requires refresh session)
- **Headers:** `Content-Type: application/json`

#### Request Body (Fallback if cookies are disabled in client)
```json
{
  "refresh_token": "YOUR_REFRESH_TOKEN"
}
```

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -b "refresh_token=YOUR_REFRESH_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Tokens rotated successfully",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### PATCH `/api/v1/auth/change-password`
Changes the user's password and revokes all existing refresh token sessions.

- **Access:** Authenticated
- **Headers:** `Authorization: Bearer <access_token>`, `Content-Type: application/json`

#### Request Body
```json
{
  "current_password": "Password@1234",
  "new_password": "NewSecurePassword@2026"
}
```

#### Curl Command
```bash
curl -X PATCH http://localhost:5000/api/v1/auth/change-password \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"Password@1234","new_password":"NewSecurePassword@2026"}'
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Password changed successfully. Please log in again with your new credentials."
}
```

---

### POST `/api/v1/auth/forgot-password`
Triggers password reset request. Outputs simulated dev OTP `123456` in console logs.

- **Access:** Public
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "email": "sahil@gmail.com"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "If the email matches an active account, password reset instructions have been sent."
}
```

---

### POST `/api/v1/auth/reset-password`
Resets user password using the OTP code (`123456` in development mode).

- **Access:** Public
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "email": "sahil@gmail.com",
  "otp": "123456",
  "new_password": "ResetPassword@2026"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Password reset successfully. Please log in using your new password."
}
```

---

### POST `/api/v1/auth/logout`
Revokes the refresh token in the database and clears the HTTPOnly cookie on the client.

- **Access:** Public
- **Headers:** `Content-Type: application/json`

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 3. User Management Endpoints

### POST `/api/v1/users`
Creates a new user account (invite-only flow) and generates a temporary password.

- **Access:** Protected (`super_admin`, `principal`)
- **Headers:** `Authorization: Bearer <access_token>`, `Content-Type: application/json`

#### Request Body
```json
{
  "name": "Ananya Roy",
  "email": "ananya.teacher@saksham.edu",
  "phone": "+919876543210",
  "role": "teacher",
  "avatar_url": "https://example.com/avatars/ananya.jpg"
}
```

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/users \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ananya Roy",
    "email": "ananya.teacher@saksham.edu",
    "phone": "+919876543210",
    "role": "teacher"
  }'
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "User created successfully. Provide the temporary password to the user.",
  "data": {
    "user": {
      "id": "e89a2b5c-4d3e-4f12-a87d-998811223344",
      "name": "Ananya Roy",
      "email": "ananya.teacher@saksham.edu",
      "phone": "+919876543210",
      "avatar_url": null,
      "is_active": true,
      "must_change_password": true,
      "created_at": "2026-07-30T22:15:00.000Z",
      "role": "teacher"
    },
    "temporary_password": "Temp@A1B2C3D4"
  }
}
```

---

### GET `/api/v1/users`
Returns a paginated list of users with optional filtering.

- **Access:** Protected (`super_admin`, `principal`, `office_staff`)
- **Headers:** `Authorization: Bearer <access_token>`
- **Query Parameters:**
  - `page` (default: 1)
  - `limit` (default: 10, max: 100)
  - `role` (e.g. `teacher`, `principal`, `student`)
  - `search` (searches name and email case-insensitively)
  - `is_active` (`true` / `false`)

#### Curl Command
```bash
curl -X GET "http://localhost:5000/api/v1/users?page=1&limit=10&role=teacher&search=Ananya" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Users fetched successfully",
  "data": {
    "users": [
      {
        "id": "e89a2b5c-4d3e-4f12-a87d-998811223344",
        "name": "Ananya Roy",
        "email": "ananya.teacher@saksham.edu",
        "phone": "+919876543210",
        "avatar_url": null,
        "is_active": true,
        "must_change_password": true,
        "last_login_at": null,
        "created_at": "2026-07-30T22:15:00.000Z",
        "role": "teacher"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

---

### GET `/api/v1/users/:id`
Fetches a single user by their UUID.

- **Access:** Protected (Authenticated Users)
- **Headers:** `Authorization: Bearer <access_token>`

#### Response (200 OK)
```json
{
  "success": true,
  "message": "User details fetched successfully",
  "data": {
    "user": {
      "id": "e89a2b5c-4d3e-4f12-a87d-998811223344",
      "name": "Ananya Roy",
      "email": "ananya.teacher@saksham.edu",
      "phone": "+919876543210",
      "avatar_url": null,
      "is_active": true,
      "must_change_password": true,
      "last_login_at": null,
      "created_at": "2026-07-30T22:15:00.000Z",
      "updated_at": "2026-07-30T22:15:00.000Z",
      "role": "teacher"
    }
  }
}
```

---

### PATCH `/api/v1/users/:id`
Updates profile details of a specific user.

- **Access:** Protected (`super_admin`, `principal`)
- **Headers:** `Authorization: Bearer <access_token>`, `Content-Type: application/json`

#### Request Body
```json
{
  "name": "Ananya Roy Sharma",
  "phone": "+919999988888",
  "avatar_url": "https://example.com/avatars/ananya-updated.jpg"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "User updated successfully",
  "data": {
    "user": {
      "id": "e89a2b5c-4d3e-4f12-a87d-998811223344",
      "name": "Ananya Roy Sharma",
      "email": "ananya.teacher@saksham.edu",
      "phone": "+919999988888",
      "avatar_url": "https://example.com/avatars/ananya-updated.jpg",
      "is_active": true,
      "updated_at": "2026-07-30T22:25:00.000Z"
    }
  }
}
```

---

### POST `/api/v1/users/:id/deactivate`
Deactivates a user account (`is_active = false`) and revokes all active refresh token sessions.

- **Access:** Protected (`super_admin`, `principal`)
- **Headers:** `Authorization: Bearer <access_token>`

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/users/e89a2b5c-4d3e-4f12-a87d-998811223344/deactivate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "User account 'ananya.teacher@saksham.edu' deactivated successfully"
}
```

---

### POST `/api/v1/users/:id/reactivate`
Reactivates a deactivated user account (`is_active = true`).

- **Access:** Protected (`super_admin` only)
- **Headers:** `Authorization: Bearer <access_token>`

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/users/e89a2b5c-4d3e-4f12-a87d-998811223344/reactivate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "User account 'ananya.teacher@saksham.edu' reactivated successfully"
}
```

---

---

## 4. Academic Structure Endpoints (Module 4)

### POST `/api/v1/academic/academic-years`
Creates a new academic year session.

- **Access:** Protected (`super_admin`, `principal`)
- **Headers:** `Authorization: Bearer <access_token>`, `Content-Type: application/json`

#### Request Body
```json
{
  "name": "2025-2026",
  "start_date": "2025-04-01",
  "end_date": "2026-03-31",
  "is_current": true
}
```

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/academic/academic-years \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "2025-2026", "start_date": "2025-04-01", "end_date": "2026-03-31", "is_current": true}'
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "Academic year created successfully",
  "data": {
    "academic_year": {
      "id": "a1b2c3d4-e5f6-7890-abcd-112233445566",
      "name": "2025-2026",
      "start_date": "2025-04-01T00:00:00.000Z",
      "end_date": "2026-03-31T00:00:00.000Z",
      "is_current": true
    }
  }
}
```

---

### GET `/api/v1/academic/academic-years`
Returns all configured academic years.

- **Access:** Protected (Authenticated Users)

#### Curl Command
```bash
curl -X GET http://localhost:5000/api/v1/academic/academic-years \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Academic years fetched successfully",
  "data": {
    "academic_years": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-112233445566",
        "name": "2025-2026",
        "start_date": "2025-04-01T00:00:00.000Z",
        "end_date": "2026-03-31T00:00:00.000Z",
        "is_current": true
      }
    ]
  }
}
```

---

### POST `/api/v1/academic/academic-years/:id/set-current`
Sets the specified academic year as the currently active one. Unsets any previously active year.

- **Access:** Protected (`super_admin`, `principal`)

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/academic/academic-years/a1b2c3d4-e5f6-7890-abcd-112233445566/set-current \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "'2025-2026' set as active academic year",
  "data": {
    "academic_year": {
      "id": "a1b2c3d4-e5f6-7890-abcd-112233445566",
      "name": "2025-2026",
      "is_current": true
    }
  }
}
```

---

### POST `/api/v1/academic/classes`
Creates a new grade/class.

- **Access:** Protected (`super_admin`, `principal`)

#### Request Body
```json
{
  "name": "Grade 10",
  "code": "G10",
  "display_order": 10
}
```

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/academic/classes \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Grade 10", "code": "G10", "display_order": 10}'
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "Class created successfully",
  "data": {
    "class": {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
      "name": "Grade 10",
      "code": "G10",
      "display_order": 10
    }
  }
}
```

---

### GET `/api/v1/academic/classes`
Fetches all classes with nested sections array.

- **Access:** Protected (Authenticated Users)

#### Curl Command
```bash
curl -X GET http://localhost:5000/api/v1/academic/classes \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Classes fetched successfully",
  "data": {
    "classes": [
      {
        "id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
        "name": "Grade 10",
        "code": "G10",
        "display_order": 10,
        "sections": [
          { "id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233", "name": "Section A", "capacity": 40, "room_number": "101-A" }
        ]
      }
    ]
  }
}
```

---

### POST `/api/v1/academic/sections`
Creates a section under a class.

- **Access:** Protected (`super_admin`, `principal`)

#### Request Body
```json
{
  "class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
  "name": "Section A",
  "capacity": 40,
  "room_number": "101-A"
}
```

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/academic/sections \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5", "name": "Section A", "capacity": 40, "room_number": "101-A"}'
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "Section created successfully",
  "data": {
    "section": {
      "id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233",
      "class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
      "name": "Section A",
      "capacity": 40,
      "room_number": "101-A"
    }
  }
}
```

---

### POST `/api/v1/academic/subjects`
Creates a subject. `type` can be `core` or `elective`.

- **Access:** Protected (`super_admin`, `principal`)

#### Request Body
```json
{
  "name": "Mathematics",
  "code": "MATH10",
  "type": "core"
}
```

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/academic/subjects \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Mathematics", "code": "MATH10", "type": "core"}'
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "Subject created successfully",
  "data": {
    "subject": {
      "id": "d0e1f2a3-b4c5-6d7e-8f9a-001122334455",
      "name": "Mathematics",
      "code": "MATH10",
      "type": "core"
    }
  }
}
```

---

### GET `/api/v1/academic/subjects`
Fetches all subjects ordered by name.

- **Access:** Protected (Authenticated Users)

#### Curl Command
```bash
curl -X GET http://localhost:5000/api/v1/academic/subjects \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Subjects fetched successfully",
  "data": {
    "subjects": [
      {
        "id": "d0e1f2a3-b4c5-6d7e-8f9a-001122334455",
        "name": "Mathematics",
        "code": "MATH10",
        "type": "core"
      }
    ]
  }
}
```

---

### POST `/api/v1/academic/class-subjects`
Allocates a subject to a class for an academic year, with optional assigned teacher. Upserts on conflict.

- **Access:** Protected (`super_admin`, `principal`)

#### Request Body
```json
{
  "class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
  "subject_id": "d0e1f2a3-b4c5-6d7e-8f9a-001122334455",
  "academic_year_id": "a1b2c3d4-e5f6-7890-abcd-112233445566",
  "teacher_id": "e89a2b5c-4d3e-4f12-a87d-998811223344"
}
```

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/academic/class-subjects \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
    "subject_id": "d0e1f2a3-b4c5-6d7e-8f9a-001122334455",
    "academic_year_id": "a1b2c3d4-e5f6-7890-abcd-112233445566",
    "teacher_id": "e89a2b5c-4d3e-4f12-a87d-998811223344"
  }'
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Subject allocated to class successfully",
  "data": {
    "allocation": {
      "id": "c5d6e7f8-a9b0-1c2d-3e4f-556677889900",
      "class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
      "subject_id": "d0e1f2a3-b4c5-6d7e-8f9a-001122334455",
      "academic_year_id": "a1b2c3d4-e5f6-7890-abcd-112233445566",
      "teacher_id": "e89a2b5c-4d3e-4f12-a87d-998811223344"
    }
  }
}
```

---

### GET `/api/v1/academic/classes/:classId/subjects`
Fetches all subjects allocated to a specific class for a given academic year.

- **Access:** Protected (Authenticated Users)
- **Query Parameters:**
  - `academic_year_id` (optional UUID) — filters by academic year

#### Curl Command
```bash
curl -X GET "http://localhost:5000/api/v1/academic/classes/f47ac10b-58cc-4372-a567-0e02b2c3d4e5/subjects?academic_year_id=a1b2c3d4-e5f6-7890-abcd-112233445566" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Class subjects fetched successfully",
  "data": {
    "class_subjects": [
      {
        "id": "c5d6e7f8-a9b0-1c2d-3e4f-556677889900",
        "class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
        "academic_year_id": "a1b2c3d4-e5f6-7890-abcd-112233445566",
        "subject_id": "d0e1f2a3-b4c5-6d7e-8f9a-001122334455",
        "subject_name": "Mathematics",
        "subject_code": "MATH10",
        "subject_type": "core",
        "teacher_id": "e89a2b5c-4d3e-4f12-a87d-998811223344",
        "teacher_name": "Ananya Roy",
        "teacher_email": "ananya.teacher@saksham.edu"
      }
    ]
  }
}
```

---

## 5. Admissions Endpoints (Module 5)

### POST `/api/v1/admissions`
Submits a new admission application. Auto-generates an `application_number` (e.g. `APP-2026-00001`).

- **Access:** Protected (`super_admin`, `principal`, `office_staff`)
- **Headers:** `Authorization: Bearer <access_token>`, `Content-Type: application/json`

#### Request Body
```json
{
  "applicant_name": "Riya Sharma",
  "dob": "2015-06-15",
  "gender": "female",
  "applied_class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
  "academic_year_id": "a1b2c3d4-e5f6-7890-abcd-112233445566",
  "parent_name": "Rahul Sharma",
  "parent_email": "rahul.sharma@gmail.com",
  "parent_phone": "9876543210",
  "address": "12, MG Road, Bengaluru",
  "remarks": "Sibling already enrolled in Grade 8"
}
```

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/admissions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "applicant_name": "Riya Sharma",
    "dob": "2015-06-15",
    "gender": "female",
    "applied_class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
    "academic_year_id": "a1b2c3d4-e5f6-7890-abcd-112233445566",
    "parent_name": "Rahul Sharma",
    "parent_email": "rahul.sharma@gmail.com",
    "parent_phone": "9876543210"
  }'
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "Admission application submitted successfully",
  "data": {
    "admission": {
      "id": "d1e2f3a4-b5c6-7d8e-9f0a-112233445566",
      "application_number": "APP-2026-00001",
      "applicant_name": "Riya Sharma",
      "dob": "2015-06-15T00:00:00.000Z",
      "gender": "female",
      "applied_class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
      "academic_year_id": "a1b2c3d4-e5f6-7890-abcd-112233445566",
      "parent_name": "Rahul Sharma",
      "parent_email": "rahul.sharma@gmail.com",
      "parent_phone": "9876543210",
      "address": "12, MG Road, Bengaluru",
      "status": "submitted",
      "remarks": "Sibling already enrolled in Grade 8",
      "created_at": "2026-08-04T13:00:00.000Z",
      "updated_at": "2026-08-04T13:00:00.000Z"
    }
  }
}
```

---

### GET `/api/v1/admissions`
Fetches a paginated list of admissions. Supports filtering by `status`, `applied_class_id`, `academic_year_id`, and `search`.

- **Access:** Protected (`super_admin`, `principal`, `office_staff`)
- **Query Parameters:**
  - `page` (default: 1)
  - `limit` (default: 10, max: 100)
  - `status` (`submitted` | `under_review` | `approved` | `rejected` | `enrolled`)
  - `applied_class_id` (UUID)
  - `academic_year_id` (UUID)
  - `search` (searches `applicant_name`, `application_number`, `parent_email`)

#### Curl Command
```bash
curl -X GET "http://localhost:5000/api/v1/admissions?status=submitted&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Admission applications fetched successfully",
  "data": {
    "admissions": [
      {
        "id": "d1e2f3a4-b5c6-7d8e-9f0a-112233445566",
        "application_number": "APP-2026-00001",
        "applicant_name": "Riya Sharma",
        "status": "submitted",
        "class_name": "Grade 10",
        "academic_year_name": "2025-2026",
        "created_at": "2026-08-04T13:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

---

### GET `/api/v1/admissions/:id`
Fetches a single admission application with joined class and academic year details.

- **Access:** Protected (`super_admin`, `principal`, `office_staff`)

#### Curl Command
```bash
curl -X GET http://localhost:5000/api/v1/admissions/d1e2f3a4-b5c6-7d8e-9f0a-112233445566 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Admission application fetched successfully",
  "data": {
    "admission": {
      "id": "d1e2f3a4-b5c6-7d8e-9f0a-112233445566",
      "application_number": "APP-2026-00001",
      "applicant_name": "Riya Sharma",
      "dob": "2015-06-15T00:00:00.000Z",
      "gender": "female",
      "class_name": "Grade 10",
      "class_code": "G10",
      "academic_year_name": "2025-2026",
      "parent_name": "Rahul Sharma",
      "parent_email": "rahul.sharma@gmail.com",
      "parent_phone": "9876543210",
      "status": "submitted",
      "remarks": null
    }
  }
}
```

---

### PATCH `/api/v1/admissions/:id/status`
Updates the workflow status of an application. Cannot be used to set status to `enrolled` — use the `/enroll` endpoint for that.

- **Access:** Protected (`super_admin`, `principal`, `office_staff`)
- **Status Flow:** `submitted` → `under_review` → `approved` or `rejected`

#### Request Body
```json
{
  "status": "approved",
  "remarks": "Documents verified. Approved for enrollment."
}
```

#### Curl Command
```bash
curl -X PATCH http://localhost:5000/api/v1/admissions/d1e2f3a4-b5c6-7d8e-9f0a-112233445566/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "approved", "remarks": "Documents verified."}'
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Application status updated to 'approved'",
  "data": {
    "admission": {
      "id": "d1e2f3a4-b5c6-7d8e-9f0a-112233445566",
      "application_number": "APP-2026-00001",
      "status": "approved",
      "remarks": "Documents verified. Approved for enrollment.",
      "updated_at": "2026-08-04T14:00:00.000Z"
    }
  }
}
```

---

### POST `/api/v1/admissions/:id/enroll`
Converts an **approved** admission into a student. Creates a user account (role: `student`) with a temporary password and a `students` record. Marks the application as `enrolled`.

- **Access:** Protected (`super_admin`, `principal`)
- **Prerequisite:** Application status must be `approved`

#### Request Body
```json
{
  "current_section_id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233",
  "roll_number": "10A-01",
  "blood_group": "O+",
  "emergency_contact": "9988776655"
}
```

#### Curl Command
```bash
curl -X POST http://localhost:5000/api/v1/admissions/d1e2f3a4-b5c6-7d8e-9f0a-112233445566/enroll \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roll_number": "10A-01", "blood_group": "O+"}'
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "Applicant 'Riya Sharma' enrolled successfully as a student",
  "data": {
    "student": {
      "id": "e2f3a4b5-c6d7-8e9f-0a1b-223344556677",
      "user_id": "f3a4b5c6-d7e8-9f0a-1b2c-334455667788",
      "admission_number": "STU-2026-123456",
      "admission_date": "2026-08-04",
      "dob": "2015-06-15",
      "gender": "female",
      "current_class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
      "current_section_id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233",
      "roll_number": "10A-01",
      "blood_group": "O+",
      "status": "active"
    },
    "user_email": "rahul.sharma@gmail.com",
    "temporary_password": "Temp@A1B2C3D4",
    "admission_number": "STU-2026-123456"
  }
}
```

---

## 6. Student Management Endpoints (Module 6)

### GET `/api/v1/students`
Fetches a paginated list of students with optional search query (`name`, `email`, `admission_number`), status filter (`active`, `transferred`, `graduated`, `suspended`), `class_id`, and `section_id`.

- **Access:** Protected (`super_admin`, `principal`, `office_staff`, `teacher`)
- **Headers:** `Authorization: Bearer <access_token>`

#### Curl Command
```bash
curl -X GET "http://localhost:5000/api/v1/students?search=Riya&status=active&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Students fetched successfully",
  "data": {
    "students": [
      {
        "id": "e2f3a4b5-c6d7-8e9f-0a1b-223344556677",
        "admission_number": "STU-2026-123456",
        "admission_date": "2026-08-04T00:00:00.000Z",
        "dob": "2015-06-15T00:00:00.000Z",
        "gender": "female",
        "current_class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
        "current_section_id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233",
        "roll_number": "10A-01",
        "blood_group": "O+",
        "address": "Green Park, New Delhi",
        "emergency_contact": "9876543210",
        "status": "active",
        "student_name": "Riya Sharma",
        "student_email": "rahul.sharma@gmail.com",
        "student_phone": null,
        "student_avatar_url": null,
        "class_name": "Grade 10",
        "class_code": "G10",
        "section_name": "Section A"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

---

### GET `/api/v1/students/:id`
Retrieves detailed profile metadata for a specific student.

- **Access:** Protected (`super_admin`, `principal`, `office_staff`, `teacher`). Also granted to owners (`student` checks matching user ID, `parent` checks matching child user ID).
- **Headers:** `Authorization: Bearer <access_token>`

#### Curl Command
```bash
curl -X GET http://localhost:5000/api/v1/students/e2f3a4b5-c6d7-8e9f-0a1b-223344556677 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Student record fetched successfully",
  "data": {
    "student": {
      "id": "e2f3a4b5-c6d7-8e9f-0a1b-223344556677",
      "user_id": "f3a4b5c6-d7e8-9f0a-1b2c-334455667788",
      "admission_number": "STU-2026-123456",
      "admission_date": "2026-08-04T00:00:00.000Z",
      "dob": "2015-06-15T00:00:00.000Z",
      "gender": "female",
      "current_class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
      "current_section_id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233",
      "roll_number": "10A-01",
      "parent_user_id": null,
      "blood_group": "O+",
      "address": "Green Park, New Delhi",
      "emergency_contact": "9876543210",
      "status": "active",
      "created_at": "2026-08-04T13:30:00.000Z",
      "updated_at": "2026-08-04T13:30:00.000Z",
      "student_name": "Riya Sharma",
      "student_email": "rahul.sharma@gmail.com",
      "student_phone": null,
      "student_avatar_url": null,
      "user_active": true,
      "class_name": "Grade 10",
      "class_code": "G10",
      "section_name": "Section A",
      "parent_name": null,
      "parent_email": null,
      "parent_phone": null
    }
  }
}
```

---

### PUT `/api/v1/students/:id`
Updates academic and personal information in the student file record.

- **Access:** Protected (`super_admin`, `principal`, `office_staff`)
- **Headers:** `Authorization: Bearer <access_token>`, `Content-Type: application/json`

#### Request Body
```json
{
  "dob": "2015-06-16",
  "gender": "female",
  "roll_number": "10A-02",
  "blood_group": "A+",
  "address": "Vasant Vihar, New Delhi",
  "emergency_contact": "9999988888"
}
```

#### Curl Command
```bash
curl -X PUT http://localhost:5000/api/v1/students/e2f3a4b5-c6d7-8e9f-0a1b-223344556677 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dob": "2015-06-16", "gender": "female", "roll_number": "10A-02", "blood_group": "A+", "address": "Vasant Vihar, New Delhi", "emergency_contact": "9999988888"}'
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Student record updated successfully",
  "data": {
    "student": {
      "id": "e2f3a4b5-c6d7-8e9f-0a1b-223344556677",
      "user_id": "f3a4b5c6-d7e8-9f0a-1b2c-334455667788",
      "admission_number": "STU-2026-123456",
      "admission_date": "2026-08-04T00:00:00.000Z",
      "dob": "2015-06-16T00:00:00.000Z",
      "gender": "female",
      "current_class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
      "current_section_id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233",
      "roll_number": "10A-02",
      "parent_user_id": null,
      "blood_group": "A+",
      "address": "Vasant Vihar, New Delhi",
      "emergency_contact": "9999988888",
      "status": "active",
      "created_at": "2026-08-04T13:30:00.000Z",
      "updated_at": "2026-08-08T12:00:00.000Z"
    }
  }
}
```

---

### PATCH `/api/v1/students/:id/status`
Updates registration status of Student (e.g. transferred, suspended).

- **Access:** Protected (`super_admin`, `principal`)
- **Headers:** `Authorization: Bearer <access_token>`, `Content-Type: application/json`

#### Request Body
```json
{
  "status": "transferred",
  "remarks": "Family relocated to Mumbai."
}
```

#### Curl Command
```bash
curl -X PATCH http://localhost:5000/api/v1/students/e2f3a4b5-c6d7-8e9f-0a1b-223344556677/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "transferred", "remarks": "Family relocated to Mumbai."}'
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Student status updated to 'transferred' successfully",
  "data": {
    "student": {
      "id": "e2f3a4b5-c6d7-8e9f-0a1b-223344556677",
      "user_id": "f3a4b5c6-d7e8-9f0a-1b2c-334455667788",
      "admission_number": "STU-2026-123456",
      "admission_date": "2026-08-04T00:00:00.000Z",
      "dob": "2015-06-16T00:00:00.000Z",
      "gender": "female",
      "current_class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
      "current_section_id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233",
      "roll_number": "10A-02",
      "parent_user_id": null,
      "blood_group": "A+",
      "address": "Vasant Vihar, New Delhi",
      "emergency_contact": "9999988888",
      "status": "transferred",
      "created_at": "2026-08-04T13:30:00.000Z",
      "updated_at": "2026-08-08T12:05:00.000Z"
    }
  }
}
```

---

### PATCH `/api/v1/students/:id/section`
Assigns or updates class, section and/or roll number for a student.

- **Access:** Protected (`super_admin`, `principal`, `office_staff`)
- **Headers:** `Authorization: Bearer <access_token>`, `Content-Type: application/json`

#### Request Body
```json
{
  "class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
  "section_id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233",
  "roll_number": "10A-08"
}
```

#### Curl Command
```bash
curl -X PATCH http://localhost:5000/api/v1/students/e2f3a4b5-c6d7-8e9f-0a1b-223344556677/section \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5", "section_id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233", "roll_number": "10A-08"}'
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Student assigned to class / section successfully",
  "data": {
    "student": {
      "id": "e2f3a4b5-c6d7-8e9f-0a1b-223344556677",
      "user_id": "f3a4b5c6-d7e8-9f0a-1b2c-334455667788",
      "admission_number": "STU-2026-123456",
      "admission_date": "2026-08-04T00:00:00.000Z",
      "dob": "2015-06-16T00:00:00.000Z",
      "gender": "female",
      "current_class_id": "f47ac10b-58cc-4372-a567-0e02b2c3d4e5",
      "current_section_id": "b8c9d0e1-f2a3-4b5c-6d7e-889900112233",
      "roll_number": "10A-08",
      "parent_user_id": null,
      "blood_group": "A+",
      "address": "Vasant Vihar, New Delhi",
      "emergency_contact": "9999988888",
      "status": "active",
      "created_at": "2026-08-04T13:30:00.000Z",
      "updated_at": "2026-08-08T12:10:00.000Z"
    }
  }
}
```

---

## 7. Parent Management Endpoints (Module 7)

### GET `/api/v1/parents`
Retrieve a paginated list of all users with the `parent` role.

- **Access:** Super Admin, Principal, Office Staff
- **Query Params:** `?page=1&limit=10&search=john`

#### Example `curl`
```bash
curl -X GET "http://localhost:5000/api/v1/parents?page=1" \
  -H "Authorization: Bearer <access_token>"
```

### GET `/api/v1/parents/me/children`
Retrieve a list of all students currently linked to the authenticated parent user.

- **Access:** Parent only

#### Example `curl`
```bash
curl -X GET "http://localhost:5000/api/v1/parents/me/children" \
  -H "Authorization: Bearer <parent_access_token>"
```

### GET `/api/v1/parents/:id`
Get full details of a specific parent account, including a nested list of all their linked children.

- **Access:** Super Admin, Principal, Office Staff, Parent (only their own ID)

#### Example `curl`
```bash
curl -X GET "http://localhost:5000/api/v1/parents/<parent_user_id>" \
  -H "Authorization: Bearer <access_token>"
```

### POST `/api/v1/parents/:id/link-student`
Links an existing student file to a parent user account.

- **Access:** Super Admin, Principal, Office Staff
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "student_id": "<student_uuid>"
}
```

#### Example `curl`
```bash
curl -X POST "http://localhost:5000/api/v1/parents/<parent_user_id>/link-student" \
  -H "Authorization: Bearer <admin_access_token>" \
  -H "Content-Type: application/json" \
  -d '{"student_id":"<student_uuid>"}'
```

### POST `/api/v1/parents/:id/unlink-student`
Removes the association between a student file and a parent user account.

- **Access:** Super Admin, Principal, Office Staff
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "student_id": "<student_uuid>"
}
```

---

## 8. Teacher Management Endpoints (Module 8)

### GET `/api/v1/teachers`
Fetch a paginated list of all users with the `teacher` role and their profile data.

- **Access:** Super Admin, Principal, Office Staff
- **Query Params:** `?page=1&limit=10&search=doe`

#### Example `curl`
```bash
curl -X GET "http://localhost:5000/api/v1/teachers?page=1" \
  -H "Authorization: Bearer <access_token>"
```

### GET `/api/v1/teachers/me`
Restricted endpoint for currently authenticated teacher to view their own profile.

- **Access:** Teacher only

#### Example `curl`
```bash
curl -X GET "http://localhost:5000/api/v1/teachers/me" \
  -H "Authorization: Bearer <teacher_access_token>"
```

### GET `/api/v1/teachers/:id`
Retrieves a full profile for a specific teacher.

- **Access:** Super Admin, Principal, Office Staff, Teacher (only their own)

#### Example `curl`
```bash
curl -X GET "http://localhost:5000/api/v1/teachers/<teacher_user_id>" \
  -H "Authorization: Bearer <access_token>"
```

### PUT `/api/v1/teachers/:id`
Upserts a specific teacher's extended profile data. 

- **Access:** Super Admin, Principal, Office Staff
- **Headers:** `Content-Type: application/json`

#### Request Body
```json
{
  "employee_id": "T-10025",
  "specialization": "Mathematics, Physics",
  "qualification": "M.Sc. Physics, B.Ed",
  "joining_date": "2024-01-15",
  "address": "Dwarka, New Delhi",
  "emergency_contact": "9000100020"
}
```

### GET `/api/v1/teachers/:id/subjects`
Gets all subject classes mapped to a specific teacher from `class_subjects`.

- **Access:** Super Admin, Principal, Office Staff, Teacher (only their own)

#### Example `curl`
```bash
curl -X GET "http://localhost:5000/api/v1/teachers/<teacher_user_id>/subjects" \
  -H "Authorization: Bearer <access_token>"
```

---

## 9. System Health & Status

### GET `/api/v1/health`
- **Access:** Public

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Saksham School Management API is running",
  "timestamp": "2026-08-04T13:00:00.000Z",
  "env": "development"
}
```

---

## 10. Complete E2E Testing Sequence

Follow this sequence to test the backend API flow from end-to-end:

1. **Start Dev Server:** `cd backend && npm run dev`
2. **Health Check:** `GET /api/v1/health`
3. **Login as Super Admin:** `POST /api/v1/auth/login` with `sahil@gmail.com` / `Password@1234` ➔ save returned `access_token`.
4. **Fetch Profile:** `GET /api/v1/auth/me` with `Authorization: Bearer <access_token>`.
5. **Create Academic Year:** `POST /api/v1/academic/academic-years` (`2025-2026`).
6. **Create Class & Section:** `POST /api/v1/academic/classes` (`Grade 10`) ➔ `POST /api/v1/academic/sections` (`Section A`).
7. **Create Subject:** `POST /api/v1/academic/subjects` (`Mathematics`).
8. **Allocate Subject:** `POST /api/v1/academic/class-subjects` (link subject + class + teacher).
9. **Submit Admission:** `POST /api/v1/admissions` for a student applying to Grade 10.
10. **Review & Approve:** `PATCH /api/v1/admissions/:id/status` with `{ "status": "approved" }`.
11. **Enroll Student:** `POST /api/v1/admissions/:id/enroll` ➔ receive `temporary_password` for the student login and a student `id`.
12. **Query Student List:** `GET /api/v1/students` ➔ verify the new student is listed.
13. **Fetch Student Profile:** `GET /api/v1/students/:id` using the student `id`.
14. **Update Student Details:** `PUT /api/v1/students/:id` to add roll number, emergency contact, or blood group details.
15. **Query Updated Student:** Verify the updated details are correctly persisted.

