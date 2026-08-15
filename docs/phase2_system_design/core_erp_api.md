# Core ERP Modules — API Contracts
> **Phase 2: System Design** | Modules 4, 5, 6 of 20
> Base URL: `/api/v1` | Auth: `Bearer <access_token>` in `Authorization` header

---

## 4. Academic Structure Endpoints

### POST `/api/v1/academic/academic-years`
Creates an academic year session.
* **Access:** `super_admin`, `principal`
* **Request:**
```json
{
  "name": "2025-2026",
  "start_date": "2025-04-01",
  "end_date": "2026-03-31",
  "is_current": true
}
```
* **Response 201:** Success envelope with `academic_year` details.

### GET `/api/v1/academic/academic-years`
Retrieves all configured academic years.
* **Access:** Authenticated Users

### POST `/api/v1/academic/academic-years/:id/set-current`
Sets context for the active academic year.
* **Access:** `super_admin`, `principal`

### POST `/api/v1/academic/classes`
Creates a grade/class.
* **Access:** `super_admin`, `principal`

### GET `/api/v1/academic/classes`
Retrieves all classes with nested sections.
* **Access:** Authenticated Users

### POST `/api/v1/academic/sections`
Subdivides a class into sections.
* **Access:** `super_admin`, `principal`

### POST `/api/v1/academic/subjects`
Creates a subject.
* **Access:** `super_admin`, `principal`

### GET `/api/v1/academic/subjects`
Retrieves all subjects.
* **Access:** Authenticated Users

### POST `/api/v1/academic/class-subjects`
Allocates subject to class and teachers.
* **Access:** `super_admin`, `principal`

### GET `/api/v1/academic/classes/:classId/subjects`
Gets active subjects taught in class.
* **Access:** Authenticated Users

---

## 5. Admissions Endpoints

### POST `/api/v1/admissions`
Submits a admission application.
* **Access:** `super_admin`, `principal`, `office_staff`

### GET `/api/v1/admissions`
Gets paginated list of admission records.
* **Access:** `super_admin`, `principal`, `office_staff`

### GET `/api/v1/admissions/:id`
Gets an admission application details.
* **Access:** `super_admin`, `principal`, `office_staff`

### PATCH `/api/v1/admissions/:id/status`
Updates admission state pipeline. Cannot set to `enrolled` directly.
* **Access:** `super_admin`, `principal`, `office_staff`

### POST `/api/v1/admissions/:id/enroll`
Graduates approved application, creating login user + student profile.
* **Access:** `super_admin`, `principal`

---

## 6. Student Management Endpoints

### GET `/api/v1/students`
Lists students with pagination, search, and filters.
* **Access:** `super_admin`, `principal`, `office_staff`, `teacher`
* **Query Params:**
  * `page` (integer, default 1)
  * `limit` (integer, default 10)
  * `class_id` (UUID format, optional)
  * `section_id` (UUID format, optional)
  * `status` (`active` | `transferred` | `graduated` | `suspended`, optional)
  * `search` (Search query for name, email, or admission number)

### GET `/api/v1/students/:id`
Retrieves single student's complete profile with user information.
* **Access:** `super_admin`, `principal`, `office_staff`, `teacher`. Also granted to owners (`student` checks matching user ID, `parent` checks linked child matching student ID).

### PUT `/api/v1/students/:id`
Edits student's details.
* **Access:** `super_admin`, `principal`, `office_staff`
* **Request:** (All optional)
```json
{
  "dob": "2012-05-15",
  "gender": "male",
  "roll_number": "12",
  "blood_group": "O+",
  "address": "123 Main St",
  "emergency_contact": "9876543210"
}
```

### PATCH `/api/v1/students/:id/status`
Modifies the status of a student (e.g., transferred).
* **Access:** `super_admin`, `principal`
* **Request:**
```json
{
  "status": "transferred",
  "remarks": "Leaving city"
}
```

### PATCH `/api/v1/students/:id/section`
Assigns student to a class and section.
* **Access:** `super_admin`, `principal`, `office_staff`
* **Request:**
```json
{
  "class_id": "class-uuid-here",
  "section_id": "section-uuid-here-optional",
  "roll_number": "roll-number-optional"
}
```
