# Foundation Module — API Contracts
> **Phase 2: System Design** | Module 1 of 20
> Base URL: `/api/v1` | Auth: `Bearer <access_token>` in `Authorization` header

---

## Standard Response Envelope

All responses follow this structure:

```json
// Success
{
  "success": true,
  "message": "Login successful",
  "data": { ... },
  "pagination": { "page": 1, "limit": 20, "total": 100 }  // only on list endpoints
}

// Error
{
  "success": false,
  "message": "Invalid credentials",
  "errors": [ { "field": "email", "message": "Email is required" } ]
}
```

---

## HTTP Status Codes Used

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not logged in / token expired) |
| 403 | Forbidden (logged in but no permission) |
| 404 | Not Found |
| 409 | Conflict (e.g., duplicate email) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

---

# 1. Auth Endpoints

## POST `/api/v1/auth/login`
Login with email + password.

**Auth Required:** No

**Request Body:**
```json
{
  "email": "teacher@saksham.in",
  "password": "SecurePass@123"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "access_token": "eyJhbGci...",
    "user": {
      "id": "uuid",
      "name": "Rahul Sharma",
      "email": "teacher@saksham.in",
      "role": "teacher",
      "avatar_url": null
    }
  }
}
```
> Refresh token set as **HTTP-only cookie** (`saksham_rt`)

**Error Cases:**
- `401` — Invalid credentials
- `403` — Account deactivated
- `429` — 5 failed attempts → locked 15 mins

---

## POST `/api/v1/auth/refresh`
Get a new access token using the refresh token cookie.

**Auth Required:** No (uses HTTP-only cookie)

**Request Body:** None

**Response 200:**
```json
{
  "success": true,
  "data": { "access_token": "eyJhbGci..." }
}
```

**Error Cases:**
- `401` — Refresh token missing, expired, or revoked

---

## POST `/api/v1/auth/logout`
Revoke the refresh token and clear the cookie.

**Auth Required:** Yes

**Request Body:** None

**Response 200:**
```json
{ "success": true, "message": "Logged out successfully" }
```

---

## POST `/api/v1/auth/forgot-password`
Send OTP to email for password reset.

**Auth Required:** No

**Request Body:**
```json
{ "email": "teacher@saksham.in" }
```

**Response 200:**
```json
{ "success": true, "message": "OTP sent to registered email" }
```

---

## POST `/api/v1/auth/reset-password`
Reset password using OTP.

**Auth Required:** No

**Request Body:**
```json
{
  "email": "teacher@saksham.in",
  "otp": "482910",
  "new_password": "NewSecurePass@456"
}
```

**Response 200:**
```json
{ "success": true, "message": "Password reset successfully" }
```

---

## PATCH `/api/v1/auth/change-password`
Change own password (used on first login or voluntary change).

**Auth Required:** Yes

**Request Body:**
```json
{
  "current_password": "TempPass@123",
  "new_password": "NewSecurePass@456"
}
```

**Response 200:**
```json
{ "success": true, "message": "Password changed successfully" }
```

---

## GET `/api/v1/auth/me`
Get current logged-in user's profile.

**Auth Required:** Yes

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Rahul Sharma",
    "email": "teacher@saksham.in",
    "phone": "9876543210",
    "avatar_url": null,
    "role": "teacher",
    "permissions": ["attendance:write", "homework:write"],
    "must_change_password": false
  }
}
```

---

# 2. User Management Endpoints

> **Permission required:** `users:manage` (Super Admin only)

## GET `/api/v1/users`
List all users with pagination and filters.

**Auth Required:** Yes | **Permission:** `users:read`

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Page number (default: 1) |
| `limit` | int | Records per page (default: 20, max: 100) |
| `role` | string | Filter by role name |
| `is_active` | boolean | Filter by active status |
| `search` | string | Search by name or email |

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Rahul Sharma", "email": "...", "role": "teacher", "is_active": true }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 85 }
}
```

---

## POST `/api/v1/users`
Create a new user (invite-only).

**Auth Required:** Yes | **Permission:** `users:manage`

**Request Body:**
```json
{
  "name": "Priya Mehta",
  "email": "priya@saksham.in",
  "phone": "9123456780",
  "role_id": "uuid-of-teacher-role"
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "User created. Invite email sent.",
  "data": { "id": "uuid", "name": "Priya Mehta", "email": "priya@saksham.in" }
}
```

**Error Cases:**
- `409` — Email already exists

---

## GET `/api/v1/users/:id`
Get a specific user's details.

**Auth Required:** Yes | **Permission:** `users:read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Priya Mehta",
    "email": "priya@saksham.in",
    "phone": "9123456780",
    "role": "teacher",
    "is_active": true,
    "last_login_at": "2026-07-17T10:30:00Z",
    "created_at": "2026-07-01T00:00:00Z"
  }
}
```

---

## PATCH `/api/v1/users/:id`
Update a user's profile details.

**Auth Required:** Yes | **Permission:** `users:manage`

**Request Body:** (all fields optional)
```json
{
  "name": "Priya Mehta Singh",
  "phone": "9999999999",
  "avatar_url": "https://..."
}
```

**Response 200:**
```json
{ "success": true, "message": "User updated", "data": { ... } }
```

---

## PATCH `/api/v1/users/:id/deactivate`
Deactivate a user (soft — blocks login, preserves data).

**Auth Required:** Yes | **Permission:** `users:manage`

**Response 200:**
```json
{ "success": true, "message": "User deactivated" }
```

---

## PATCH `/api/v1/users/:id/activate`
Reactivate a previously deactivated user.

**Auth Required:** Yes | **Permission:** `users:manage`

**Response 200:**
```json
{ "success": true, "message": "User activated" }
```

---

# 3. RBAC Endpoints

## GET `/api/v1/roles`
List all roles.

**Auth Required:** Yes | **Permission:** `roles:read`

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "teacher", "description": "Own classes..." }
  ]
}
```

---

## GET `/api/v1/roles/:id/permissions`
Get all permissions assigned to a role.

**Auth Required:** Yes | **Permission:** `roles:read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "role": "teacher",
    "permissions": ["attendance:write", "homework:write", "results:read"]
  }
}
```

---

## POST `/api/v1/roles/:id/permissions`
Assign a permission to a role.

**Auth Required:** Yes | **Permission:** `roles:manage`

**Request Body:**
```json
{ "permission_id": "uuid" }
```

**Response 201:**
```json
{ "success": true, "message": "Permission assigned to role" }
```

---

## DELETE `/api/v1/roles/:id/permissions/:permissionId`
Remove a permission from a role.

**Auth Required:** Yes | **Permission:** `roles:manage`

**Response 200:**
```json
{ "success": true, "message": "Permission removed from role" }
```

---

## PATCH `/api/v1/users/:id/role`
Assign or change a user's role.

**Auth Required:** Yes | **Permission:** `users:manage`

**Request Body:**
```json
{ "role_id": "uuid-of-new-role" }
```

**Response 200:**
```json
{ "success": true, "message": "Role assigned to user" }
```

---

# 4. Audit Log Endpoints

## GET `/api/v1/audit-logs`
Get paginated audit logs with filters.

**Auth Required:** Yes | **Permission:** `audit_logs:read` (Super Admin, Principal)

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Page number |
| `limit` | int | Records per page (max: 100) |
| `user_id` | uuid | Filter by user |
| `action` | string | `CREATE` / `UPDATE` / `DELETE` |
| `resource` | string | e.g. `students`, `fees` |
| `from` | ISO date | Start date |
| `to` | ISO date | End date |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user": { "id": "uuid", "name": "Admin User" },
      "action": "UPDATE",
      "resource": "students",
      "resource_id": "uuid",
      "old_value": { "name": "Rohan" },
      "new_value": { "name": "Rohan Kumar" },
      "ip_address": "192.168.1.10",
      "created_at": "2026-07-18T06:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 340 }
}
```

---

## GET `/api/v1/audit-logs/:id`
Get a single audit log entry.

**Auth Required:** Yes | **Permission:** `audit_logs:read`

**Response 200:**
```json
{
  "success": true,
  "data": { ...full log entry... }
}
```

---

## Permission Reference Table

| Permission | Roles with Access |
|------------|-------------------|
| `users:read` | super_admin |
| `users:manage` | super_admin |
| `roles:read` | super_admin |
| `roles:manage` | super_admin |
| `audit_logs:read` | super_admin, principal |
| `attendance:write` | teacher |
| `attendance:read` | teacher, principal, office_staff |
| `homework:write` | teacher |
| `results:read` | teacher, student, parent, principal |
| `fees:write` | office_staff |
| `fees:read` | office_staff, principal, parent |
| *(more added per module)*  | |
