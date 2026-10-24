# Saksham — Module 10: Homework & Assignments System Specification & Design
> **Module:** Core ERP · Module 10 of 20  
> **Target Audience:** Super Admin, Principal, Teachers, Students, Parents  
> **Status:** Backend Complete · Automated Tests Complete · Frontend Implemented  

---

## 1. Executive Summary & Problem Statement

Homework and ongoing formative assessments are core components of school pedagogy. Without a centralized, digital assignment tracking system:
- Teachers struggle to track which students have submitted assignments across diverse sections and subjects.
- Students lose track of submission deadlines, revision tasks, and teacher remarks.
- School leadership lacks visibility into teacher workload, homework frequency, and grading responsiveness.
- Resubmission and correction cycles are messy and lack version accountability.

**Saksham Module 10 (Homework & Assignments)** provides a centralized, role-governed portal for assigning, tracking, submitting, and grading academic homework.

Key capabilities:
1. Teachers and administrators create structured assignments tied to Academic Year, Class, Section (or entire cohort), and Subject.
2. Definite due-date scheduling with automated late detection.
3. Assignment directory with rich filtering (by Class, Section, Subject, Academic Year, and Status: `active` vs `archived`).
4. Two-attempt student submission lifecycle with automated status tracking (`submitted` vs `late`).
5. Teacher review and grading workflow with qualitative remarks and status updates (`graded`).
6. Comprehensive audit logging for all creation, modification, grading, and archiving operations.

---

## 2. Stakeholders & Role-Based Access Control (RBAC)

The module enforces strict backend security boundaries:

| Stakeholder / Role | Permissions & Capabilities | Security / Scope Boundary |
| :--- | :--- | :--- |
| **Super Admin** | Full management: create, view, edit, archive/delete all assignments, view all submissions, grade/remark submissions. | System-wide scope. |
| **Principal** | School-wide management: create, view, edit, archive/delete all assignments, inspect submissions, grade/remark. | School-wide administrative scope. |
| **Teacher** | Create assignments for assigned/active classes; view class assignments; view all student submissions; grade and update submission status with remarks. | Assigned classes and subjects; creator/teacher scope for edits. |
| **Student** | View assigned active homework for their enrolled class & section (`/api/v1/homework/my`); submit work up to 2 attempts (`/api/v1/homework/:id/submit`); view past attempt statuses and teacher feedback. | Strictly scoped to own enrolled class/section via `students.user_id`. |
| **Parent** | Read-only view of linked ward's active homework and submission status (via ward portal integration). | Restricted to linked children via `students.parent_user_id`. |
| **Office Staff** | Read-only directory access where authorized. | Cannot create, mutate, or grade assignments. |

---

## 3. Data Architecture & Database Schema

The module builds on two relational PostgreSQL tables defined in `backend/src/config/initDb.ts`:

### 3.1 `homework_assignments`

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Unique assignment identifier |
| `title` | VARCHAR(255) | NOT NULL | Assignment title (min 3 chars) |
| `description` | TEXT | NULLABLE | Detailed instructions, page numbers, task brief |
| `class_id` | UUID | NOT NULL REFERENCES `classes(id)` ON DELETE CASCADE | Target class cohort |
| `subject_id` | UUID | NOT NULL REFERENCES `subjects(id)` ON DELETE CASCADE | Academic subject |
| `section_id` | UUID | NULLABLE REFERENCES `sections(id)` ON DELETE SET NULL | Specific section, or NULL for entire class cohort |
| `academic_year_id` | UUID | NOT NULL REFERENCES `academic_years(id)` ON DELETE CASCADE | Associated academic session |
| `assigned_by` | UUID | NULLABLE REFERENCES `users(id)` ON DELETE SET NULL | Teacher / admin who created the assignment |
| `due_date` | DATE | NOT NULL | Submission deadline (`YYYY-MM-DD`) |
| `status` | VARCHAR(20) | NOT NULL DEFAULT `'active'` | `'active'` or `'archived'` |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Last modification timestamp |

**Indexes:**
- `idx_homework_class` on `class_id`
- `idx_homework_due` on `due_date`
- `idx_homework_status` on `status`

### 3.2 `homework_submissions`

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Unique submission identifier |
| `homework_id` | UUID | NOT NULL REFERENCES `homework_assignments(id)` ON DELETE CASCADE | Target assignment |
| `student_id` | UUID | NOT NULL REFERENCES `students(id)` ON DELETE CASCADE | Enrolled student |
| `attempt_number` | INT | NOT NULL CHECK (attempt_number IN (1, 2)) | Attempt number: 1 (initial) or 2 (revision) |
| `status` | VARCHAR(20) | NOT NULL DEFAULT `'submitted'` | `'submitted'`, `'late'`, or `'graded'` |
| `remarks` | TEXT | NULLABLE | Student submission note or teacher grading feedback |
| `submitted_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Submission timestamp |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Last modification timestamp |

**Constraints & Indexes:**
- `UNIQUE(homework_id, student_id, attempt_number)` prevents duplicate attempt records.
- `idx_hw_submissions_homework` on `homework_id`
- `idx_hw_submissions_student` on `student_id`

---

## 4. Assignment Lifecycle & Business Rules

```
                      [Teacher / Admin Creates]
                                  │
                                  ▼
                          ┌───────────────┐
                          │    Active     │
                          └───────┬───────┘
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       [Student Submits (≤ Due Date)]    [Student Submits (> Due Date)]
                  │                               │
                  ▼                               ▼
          Status: 'submitted'               Status: 'late'
                  │                               │
                  └───────────────┬───────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
      [Attempt 1: Teacher Grades]      [Student Submits Attempt 2]
                  │                               │
                  ▼                               ▼
          Status: 'graded'                Attempt 2 Recorded
                                                  │
                                                  ▼
                                      [Attempt 3 Blocked (409)]
```

### Business Rules:
1. **Creation Validation:** Title must be 3–255 characters. `class_id`, `subject_id`, `academic_year_id`, and `due_date` (format `YYYY-MM-DD`) are strictly required. `section_id` is optional; if omitted, the homework applies to all sections within the class.
2. **Due Date & Late Handling:** Submissions made with timestamp strictly after `due_date` are automatically classified as `late`. On-time submissions are marked as `submitted`.
3. **Attempt Capping:** Each student is permitted a maximum of **2 attempts** per assignment. Attempt 1 allows initial work, and Attempt 2 allows corrections/resubmission based on teacher feedback. A third attempt is strictly rejected by the backend with HTTP `409 Conflict`.
4. **Grading & Feedback:** Authorized teachers/admins can update any submission's status to `graded` (or re-mark as `submitted`/`late`) and provide qualitative teacher `remarks` (e.g., "Well done!", "Please review problem #4").
5. **Archiving & Deletion:** Assignments can be archived (`status: 'archived'`) or removed. Archiving preserves historical student submission logs without cluttering the active cohort directory.
6. **Cohort Scope Isolation:** Students can only view and submit homework assigned to their currently enrolled class and section.

---

## 5. API Endpoints Specification

| Method | Endpoint | Authorized Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/homework` | `super_admin`, `principal`, `teacher` | Create an assignment with audit logging |
| `GET` | `/api/v1/homework` | `super_admin`, `principal`, `teacher` | List assignments with filters (`class_id`, `section_id`, `subject_id`, `academic_year_id`, `status`, `search`) |
| `GET` | `/api/v1/homework/class/:classId` | `super_admin`, `principal`, `teacher` | List assignments for a class (optional `subject_id`, `status`) |
| `GET` | `/api/v1/homework/:homeworkId` | `super_admin`, `principal`, `teacher` | Get single assignment details with submission stats |
| `PATCH` | `/api/v1/homework/:homeworkId` | `super_admin`, `principal`, `teacher` | Update assignment title, instructions, due date, status |
| `DELETE` | `/api/v1/homework/:homeworkId` | `super_admin`, `principal` | Delete an assignment with audit logging |
| `GET` | `/api/v1/homework/my` | `student` | Student view of their pending active assignments |
| `POST` | `/api/v1/homework/:homeworkId/submit` | `student` | Student submits work (max 2 attempts) |
| `GET` | `/api/v1/homework/:homeworkId/submissions` | `super_admin`, `principal`, `teacher` | View all student submissions for an assignment |
| `PATCH` | `/api/v1/homework/submissions/:submissionId`| `super_admin`, `principal`, `teacher` | Teacher grades or adds remarks to a submission |

---

## 6. Frontend UI / UX Architecture

The frontend lives in `frontend/src/pages/Homework.tsx` and `frontend/src/pages/Homework.module.css`, matching the design language of `Attendance.tsx` and `Students.tsx`.

### 6.1 Key Components & Visual Hierarchy:
1. **Header & Context:**
   - Title: "Homework & Assignments" with descriptive subtitle and real-time total count.
   - Action Buttons: "New Assignment" (role-gated to Super Admin, Principal, Teacher) and "Refresh".
2. **Dashboard KPI Summary Cards:**
   - **Total Assignments**: Total active assignments in current filter scope.
   - **Due Soon (≤ 3 Days)**: Assignments with upcoming deadlines requiring attention.
   - **Pending Grading**: Submissions awaiting teacher evaluation.
   - **Submission Completion Rate**: Percentage of eligible students who submitted their work.
3. **Filter & Search Bar:**
   - Academic Year dropdown (defaults to active session).
   - Class selector (with all classes option).
   - Section selector (dynamically filtered by selected class).
   - Subject selector (dynamically filtered or all subjects).
   - Status selector (`active` vs `archived`).
   - Debounced search input (title, description, subject name).
4. **Assignment Directory Cards & Grid:**
   - Assignment card featuring Subject badge, Title, Due Date indicator with status pill (Upcoming, Due Today, Overdue, Archived).
   - Class and Section badge (e.g. "Class 10 · Section A" or "Class 10 · All Sections").
   - Teacher / Creator attribution.
   - Live submission progress bar (e.g., `18 / 24 submitted · 75%`).
   - Action buttons: "Submissions & Grading", "Edit", "Archive / Delete".
5. **Modals & Drawers:**
   - **Create / Edit Assignment Modal:** Form with title, academic year, class, section, subject, due date, and instructions.
   - **Submissions & Grading Drawer:** Roster of student submissions showing Student Name, Roll Number, Attempt Number (1 or 2), Status badge (`submitted`, `late`, `graded`), Submission Timestamp, and an inline Grading Form to update status and enter Teacher Remarks.

---

## 7. Gaps & Non-Implemented Features (Honest Accounting)

To preserve honesty and adherence to existing code:
- **File Attachments / File Uploads:** Not supported in schema (`attachment_url` column does not exist). The UI uses qualitative text instructions and submission remarks.
- **Numeric Marks / Max Marks:** The schema uses qualitative status grading (`submitted`, `late`, `graded`) with descriptive teacher feedback remarks rather than numeric point scores.
- **Student Portal Upload UI:** Module 10 focuses on the administrative and teacher portal. Student self-submission is fully supported by the REST API (`POST /homework/:id/submit`) and will be integrated into the dedicated Student Portal.
