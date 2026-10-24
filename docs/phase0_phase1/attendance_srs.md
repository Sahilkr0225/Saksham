# Saksham — Module 9: Student Attendance System Specification & Design
> **Module:** Core ERP · Module 9 of 20  
> **Target Audience:** Super Admin, Principal, Class Teachers, Students, Parents  
> **Status:** Backend Complete · Automated Tests Complete · Frontend Implemented  

---

## 1. Executive Summary & Problem Statement

Accurate and timely recording of student attendance is fundamental to school governance, student safety, academic accountability, and compliance. Traditional paper-based registers suffer from data loss, retroactive falsification, lack of real-time visibility for parents, and tedious manual consolidation for term reports.

**Saksham Module 9 (Student Attendance)** provides a centralized, role-aware, real-time student attendance management interface. It enables teachers and administrators to:
1. Select an Academic Year, Class, Section, and Date.
2. Retrieve the active, eligible student roster.
3. Record and update daily attendance statuses (`present`, `absent`, `late`, `half_day`) with optional remarks.
4. Prevent accidental duplicate entries while allowing authorized overwrites/corrections.
5. View real-time class metrics (headcount, present count, absent count, attendance percentage).
6. Inspect individual student attendance histories.

---

## 2. Stakeholders & Access Control (RBAC)

| Stakeholder / Role | Permissions & Capabilities | Security / Boundary Rules |
| :--- | :--- | :--- |
| **Super Admin** | Full access: View all classes, mark/correct attendance, view all student histories. | System-wide scope. |
| **Principal** | Full school-wide access: View, mark, and correct all classes. | School administrative scope. |
| **Teacher** | Mark and correct attendance for assigned/available classes; view student histories. | Authorized via role; mutations tracked via `marked_by` and audit logs. |
| **Parent** | Read-only access to linked ward's attendance history (`/api/v1/attendance/student/:id`). | Cannot mark attendance; restricted to own children via `students.parent_user_id`. |
| **Student** | Read-only access to own attendance history (`/api/v1/attendance/student/:id`). | Cannot mark attendance; restricted to own record via `students.user_id`. |
| **Office Staff** | Read-only inspection where authorized. | Cannot mutate daily attendance. |

---

## 3. Workflow & Functional Specifications

### 3.1 Attendance Marking Workflow
```
[Select Academic Year, Class, Section, Date]
                 │
                 ▼
     [Fetch Roster & Existing Records]
     (GET /api/v1/attendance/class/:classId)
                 │
                 ▼
     [Display Roster & Compute KPIs]
  (Total, Present, Absent, Late, Half-Day, Unmarked)
                 │
                 ▼
     [Mark / Edit Student Statuses]
  (Present | Absent | Late | Half Day + Remarks)
                 │
                 ▼
       [Submit Attendance]
      (POST /api/v1/attendance)
                 │
                 ▼
   [Server Upsert & Audit Logging]
                 │
                 ▼
    [Refresh Roster & Confirm Success]
```

1. **Selection & Filtering:**
   - The user selects an Academic Year (defaults to the currently active academic year `is_current: true`).
   - The user selects a Class from the academic structure.
   - The Section selector dynamically populates sections belonging to the chosen class, with an option for "All Sections".
   - The Date picker defaults to the current calendar date (`YYYY-MM-DD`). Future dates can be flagged or restricted based on administrative policy.

2. **Roster Retrieval:**
   - The frontend requests `GET /api/v1/attendance/class/:classId?date=YYYY-MM-DD&type=daily[&section_id=UUID]`.
   - The backend joins active students (`s.status = 'active'`) in that class/section with existing records in `attendance_records` for the specified date and type.
   - Students without a recorded attendance record return `a.status = null`, rendered in the UI distinctly as **Unmarked** (avoiding false assumptions of presence or absence).

3. **Status Marking:**
   - Supported statuses:
     - `present` (Green)
     - `absent` (Rose/Red)
     - `late` (Amber)
     - `half_day` (Sky Blue)
   - Quick bulk actions:
     - **Mark All Present:** Sets all unmarked or active students to `present`.
     - **Clear All:** Resets all unsaved changes to original server state.
   - Per-student remarks: Optional text field (max 255 chars) for excuses, late arrival notes, or medical alerts.

4. **Submission & Idempotency:**
   - Frontend validates that at least one student record is marked before submission.
   - Submits `POST /api/v1/attendance` with payload `{ class_id, academic_year_id, date, type: 'daily', records: [...] }`.
   - Backend processes records within a single database transaction (`BEGIN ... COMMIT`).
   - Idempotent upsert utilizes the partial unique index:
     `ON CONFLICT (student_id, date) WHERE type = 'daily' DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks, marked_by = EXCLUDED.marked_by, updated_at = NOW()`.
   - Repeated submissions update existing rows without duplicate row generation.
   - Mutation creates an audit log entry (`resource: 'attendance'`, `action: 'UPDATE'`).

5. **Student Attendance History Modal:**
   - Clicking "View History" on any student row fetches `GET /api/v1/attendance/student/:studentId?type=daily`.
   - Displays chronological history, total recorded days, breakdown of statuses, and attendance percentage rate.

---

## 4. API Data Contracts

### 4.1 Bulk Mark Attendance
- **Method & Route:** `POST /api/v1/attendance`
- **Authorized Roles:** `super_admin`, `principal`, `teacher`
- **Request Body:**
```json
{
  "class_id": "9794cb1f-4b09-4089-a20c-72ca453f68a7",
  "academic_year_id": "f5e13d96-b072-46bb-9f20-fa7075c3db64",
  "date": "2026-10-21",
  "type": "daily",
  "records": [
    {
      "student_id": "76e3d749-c178-4ea1-88f6-4fb4bb70eec3",
      "status": "present",
      "remarks": "On time"
    },
    {
      "student_id": "a9d701a2-5b96-4a41-b0db-6a75908b8b0e",
      "status": "absent",
      "remarks": "Fever, parent informed"
    }
  ]
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Attendance marked successfully",
  "data": {
    "records": [
      {
        "id": "19b45627-2c93-4a0b-8527-bb1a6ea9f0f1",
        "student_id": "76e3d749-c178-4ea1-88f6-4fb4bb70eec3",
        "academic_year_id": "f5e13d96-b072-46bb-9f20-fa7075c3db64",
        "date": "2026-10-21T00:00:00.000Z",
        "type": "daily",
        "subject_id": null,
        "status": "present",
        "remarks": "On time",
        "marked_by": "80fd8888-9f17-4860-afbf-338bfa79f060",
        "created_at": "2026-10-21T18:25:00.000Z",
        "updated_at": "2026-10-21T18:25:00.000Z"
      }
    ]
  }
}
```

### 4.2 Get Class Attendance Roster
- **Method & Route:** `GET /api/v1/attendance/class/:classId`
- **Query Parameters:**
  - `date` (required, string `YYYY-MM-DD`)
  - `type` (optional, default `'daily'`)
  - `section_id` (optional, UUID)
- **Authorized Roles:** `super_admin`, `principal`, `teacher`
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "attendance": [
      {
        "id": "19b45627-2c93-4a0b-8527-bb1a6ea9f0f1",
        "student_id": "76e3d749-c178-4ea1-88f6-4fb4bb70eec3",
        "admission_number": "SKM-2026-0042",
        "roll_number": "101",
        "current_section_id": "b3e3e070-5544-48f5-9614-239bb409d564",
        "section_name": "Section A",
        "student_name": "Aarav Sharma",
        "status": "present",
        "remarks": "On time"
      }
    ]
  }
}
```

### 4.3 Get Student Attendance History
- **Method & Route:** `GET /api/v1/attendance/student/:studentId`
- **Query Parameters:**
  - `start_date` (optional, `YYYY-MM-DD`)
  - `end_date` (optional, `YYYY-MM-DD`)
  - `type` (optional, default `'daily'`)
- **Authorized Roles:** `super_admin`, `principal`, `teacher`, `parent` (ward only), `student` (self only)
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "attendance": [
      {
        "date": "2026-10-21T00:00:00.000Z",
        "status": "present",
        "remarks": "On time",
        "subject_id": null,
        "marked_by": "80fd8888-9f17-4860-afbf-338bfa79f060"
      }
    ]
  }
}
```

---

## 5. UI/UX Design & Component Hierarchy

### 5.1 Component Structure
```
<AttendancePage>
  ├── <TopRow>
  │     ├── <HeaderRow> (Title, Subtitle, Refresh Button, Unsaved Indicator, Save Button)
  │     └── <FilterCard> (Academic Year, Class, Section, Attendance Date)
  ├── <KPICardsRow>
  │     ├── Total Students (Eligible students in selected scope)
  │     ├── Present (Marked present with % of cohort)
  │     ├── Absent (Marked absent with % of cohort)
  │     ├── Late & Half Day (Late arrival & partial sessions)
  │     └── Attendance Rate (% present of total eligible students)
  ├── <AnalyticsGrid>
  │     ├── <AttendanceDistributionCard>
  │     │     ├── SVG Doughnut Chart (arc segments, center total & rate badge)
  │     │     ├── Interactive Legend (color dot, label, count, percentage)
  │     │     └── Textual Summary Callout (narrative breakdown of cohort)
  │     └── <AttendanceTrendsAndScopeCard>
  │           ├── Cohort Marking Progress Bar (% recorded vs pending)
  │           ├── Status Mini Grid (Present, Absent, Late, Half Day)
  │           └── API Scope Boundary Callout (transparent single-date contract note)
  ├── <ToolbarRow>
  │     ├── Search Input (Filter roster by name, roll no, admission no)
  │     ├── Quick Actions: [Mark All Present] [Reset Changes]
  │     └── Submit Action: [Save Attendance] (with spinner & duplicate lock)
  ├── <RosterTable>
  │     ├── Table Header (Roll, Admission, Student, Section, Status, Remarks, Actions)
  │     ├── Table Rows (Status segmented pill controls, inline remarks input, history trigger)
  │     └── Empty / Loading / Error states
  └── <StudentHistoryModal> (Individual student timeline, metrics, and filter)
```

### 5.2 Analytics Dashboard Specifications
- **Pure SVG Doughnut Chart:** Rendered using mathematical arc paths with zero runtime external library bloat, ensuring full React 19 compatibility. Center displays total eligible headcount and attendance rate percentage.
- **Empty & Unmarked States:** If class has 0 students, renders a neutral ring with "No Students Enrolled". If 100% of students are unmarked, renders a dashed ring with "Unrecorded Roster" to prevent false assumptions of zero attendance or absence.
- **Class Trends & Comparison API Boundary:** The existing backend contract queries attendance on a per-class, per-date basis (`GET /attendance/class/:id?date=...`). Multi-date class aggregation (`GET /attendance/class/:id/trends`) and school-wide comparative bar charts are scheduled for future backend expansion. The UI honors this by presenting real data only, avoiding synthetic data points.

### 5.3 Micro-Interactions & Usability Details
- **Unmarked vs. Absent distinction:** Unmarked rows display neutral styling with "Not Recorded" tag. Absent rows highlight in soft rose red.
- **Dirty State Tracking:** A badge notifies the user if changes have been made locally but not yet committed to the backend.
- **Double-Click Protection:** Submitting attendance disables the submit button and status controls until the API returns a response.
- **Responsive Layout:**
  - On desktop (≥1024px): 5 KPI cards in top row, 2-column analytics grid, full roster table.
  - On tablet (768px): 2–3 column KPI grid, stacked 1-column analytics cards, contained table scroll.
  - On mobile (≤480px): 2-column KPI grid, stacked cards, touch-optimized segmented status buttons.

---

## 6. Security & Data Integrity

1. **Authentication:** Enforced on all routes via `authenticate` JWT middleware.
2. **Role-Based Authorization:** Validated at the router level via `authorize('super_admin', 'principal', 'teacher')` and in the controller.
3. **Parameter Validation:** `validateUUIDParam` blocks malformed IDs with HTTP 400 before database execution.
4. **Student Privacy Protection:** Students and parents attempting to access another student's attendance records receive HTTP 403 Forbidden.
5. **Transactional Consistency:** Database operations run within `BEGIN ... COMMIT` with `ROLLBACK` on error.
6. **Audit Trail:** Every attendance mutation records the actor, IP, timestamp, class, date, and count in the system audit logs.
