import http from 'http';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = 'http://127.0.0.1:5000/api/v1';

// Helper for JSON HTTP requests
const request = (
  method: string,
  urlPath: string,
  body?: any,
  token?: string
): Promise<{ status: number; data: any }> => {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${urlPath}`);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const payload = body ? JSON.stringify(body) : '';
    if (body) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            const data = rawData ? JSON.parse(rawData) : null;
            resolve({ status: res.statusCode || 0, data });
          } catch {
            resolve({ status: res.statusCode || 0, data: rawData });
          }
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(payload);
    }
    req.end();
  });
};

async function runAttendanceFrontendVerification() {
  console.log('================================================================');
  console.log('🧪 SAKSHAM MODULE 9: STUDENT ATTENDANCE FRONTEND FLOW VERIFICATION');
  console.log('================================================================\n');

  // Track created fixtures for cleanup
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  let testClassId: string | null = null;
  let testSectionAId: string | null = null;
  let testSectionBId: string | null = null;
  let testAcademicYearId: string | null = null;

  try {
    // ─── Step 1: Authentication ───────────────────────────────────────────────
    console.log('▶ Step 1: Authenticating test accounts...');
    const adminRes = await request('POST', '/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234'
    });
    if (adminRes.status !== 200) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminRes.data)}`);
    }
    const adminToken = adminRes.data.data.access_token;
    console.log('  ✔ Super Admin login successful');

    // ─── Step 2: Fixture Setup ────────────────────────────────────────────────
    console.log('\n▶ Step 2: Creating isolated academic and student test fixtures...');
    const nonce = Date.now().toString().slice(-6);

    // 2.1 Academic Year
    const yearRes = await request('POST', '/academic/academic-years', {
      name: `AY-Test-${nonce}`,
      start_date: '2026-04-01',
      end_date: '2027-03-31',
      is_current: false
    }, adminToken);
    if (yearRes.status !== 201) throw new Error(`Create year failed: ${JSON.stringify(yearRes.data)}`);
    testAcademicYearId = yearRes.data.data.academic_year.id;

    // 2.2 Class
    const classRes = await request('POST', '/academic/classes', {
      name: `Class-Att-${nonce}`,
      code: `CA${nonce}`,
      display_order: 99
    }, adminToken);
    if (classRes.status !== 201) throw new Error(`Create class failed: ${JSON.stringify(classRes.data)}`);
    testClassId = classRes.data.data.class.id;

    // 2.3 Sections A and B
    const secARes = await request('POST', '/academic/sections', {
      class_id: testClassId,
      name: 'A',
      capacity: 30
    }, adminToken);
    testSectionAId = secARes.data.data.section.id;

    const secBRes = await request('POST', '/academic/sections', {
      class_id: testClassId,
      name: 'B',
      capacity: 30
    }, adminToken);
    testSectionBId = secBRes.data.data.section.id;

    // 2.4 Create 3 Students via direct helper
    // Student 1 (Section A)
    const s1User = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, 'dummy', $2) RETURNING id`,
      [`att_s1_${nonce}@student.saksham.edu`, `Student One ${nonce}`]
    );
    createdUserIds.push(s1User.rows[0].id);
    const s1 = await pool.query(
      `INSERT INTO students (user_id, admission_number, roll_number, current_class_id, current_section_id, dob, gender, status)
       VALUES ($1, $2, '101', $3, $4, '2015-05-10', 'male', 'active') RETURNING id`,
      [s1User.rows[0].id, `SKM-ATT-1-${nonce}`, testClassId, testSectionAId]
    );
    createdStudentIds.push(s1.rows[0].id);

    // Student 2 (Section A)
    const s2User = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, 'dummy', $2) RETURNING id`,
      [`att_s2_${nonce}@student.saksham.edu`, `Student Two ${nonce}`]
    );
    createdUserIds.push(s2User.rows[0].id);
    const s2 = await pool.query(
      `INSERT INTO students (user_id, admission_number, roll_number, current_class_id, current_section_id, dob, gender, status)
       VALUES ($1, $2, '102', $3, $4, '2015-06-15', 'female', 'active') RETURNING id`,
      [s2User.rows[0].id, `SKM-ATT-2-${nonce}`, testClassId, testSectionAId]
    );
    createdStudentIds.push(s2.rows[0].id);

    // Student 3 (Section B)
    const s3User = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, 'dummy', $2) RETURNING id`,
      [`att_s3_${nonce}@student.saksham.edu`, `Student Three ${nonce}`]
    );
    createdUserIds.push(s3User.rows[0].id);
    const s3 = await pool.query(
      `INSERT INTO students (user_id, admission_number, roll_number, current_class_id, current_section_id, dob, gender, status)
       VALUES ($1, $2, '201', $3, $4, '2015-07-20', 'male', 'active') RETURNING id`,
      [s3User.rows[0].id, `SKM-ATT-3-${nonce}`, testClassId, testSectionBId]
    );
    createdStudentIds.push(s3.rows[0].id);

    console.log(`  ✔ Created Class ${testClassId} with 2 Sections and 3 enrolled students`);

    // ─── Step 3: Loading Class Roster (Unmarked State) ─────────────────────────
    console.log('\n▶ Step 3: Verifying initial roster fetch for today...');
    const today = new Date().toISOString().split('T')[0];

    const rosterAll = await request(
      'GET',
      `/attendance/class/${testClassId}?date=${today}&type=daily`,
      null,
      adminToken
    );
    if (rosterAll.status !== 200) throw new Error(`Fetch roster failed: ${JSON.stringify(rosterAll.data)}`);
    const studentsAll = rosterAll.data.data.attendance;
    if (studentsAll.length !== 3) {
      throw new Error(`Expected 3 students in class, got ${studentsAll.length}`);
    }
    // Verify each student status is null (unmarked)
    const allUnmarked = studentsAll.every((st: any) => st.status === null);
    if (!allUnmarked) {
      throw new Error(`Expected all students initially to have status = null (unmarked)`);
    }
    console.log('  ✔ Loaded all 3 students with status: null (distinguished from absent)');

    // ─── Step 4: Section Filtering ────────────────────────────────────────────
    console.log('\n▶ Step 4: Verifying section-level roster filtering...');
    const rosterSecA = await request(
      'GET',
      `/attendance/class/${testClassId}?date=${today}&type=daily&section_id=${testSectionAId}`,
      null,
      adminToken
    );
    if (rosterSecA.status !== 200 || rosterSecA.data.data.attendance.length !== 2) {
      throw new Error(`Expected exactly 2 students in Section A, got ${rosterSecA.data.data.attendance?.length}`);
    }
    console.log('  ✔ Filtered Section A returned exactly 2 students');

    const rosterSecB = await request(
      'GET',
      `/attendance/class/${testClassId}?date=${today}&type=daily&section_id=${testSectionBId}`,
      null,
      adminToken
    );
    if (rosterSecB.status !== 200 || rosterSecB.data.data.attendance.length !== 1) {
      throw new Error(`Expected exactly 1 student in Section B, got ${rosterSecB.data.data.attendance?.length}`);
    }
    console.log('  ✔ Filtered Section B returned exactly 1 student');

    // ─── Step 5: Bulk Marking Attendance with Supported Statuses ──────────────
    console.log('\n▶ Step 5: Submitting attendance with valid statuses (present, absent, late)...');
    const markRes = await request(
      'POST',
      '/attendance',
      {
        class_id: testClassId,
        academic_year_id: testAcademicYearId,
        date: today,
        type: 'daily',
        records: [
          { student_id: createdStudentIds[0], status: 'present', remarks: 'Present and punctual' },
          { student_id: createdStudentIds[1], status: 'absent', remarks: 'Medical excuse' },
          { student_id: createdStudentIds[2], status: 'late', remarks: 'Bus delay 15m' }
        ]
      },
      adminToken
    );
    if (markRes.status !== 200 || !markRes.data.success) {
      throw new Error(`Bulk mark failed: ${JSON.stringify(markRes.data)}`);
    }
    console.log('  ✔ Bulk mark succeeded for 3 students');

    // Verify roster reload reflects the exact statuses and remarks
    const refreshedRoster = await request(
      'GET',
      `/attendance/class/${testClassId}?date=${today}&type=daily`,
      null,
      adminToken
    );
    const rStudents = refreshedRoster.data.data.attendance;
    const s1Rec = rStudents.find((st: any) => st.student_id === createdStudentIds[0]);
    const s2Rec = rStudents.find((st: any) => st.student_id === createdStudentIds[1]);
    const s3Rec = rStudents.find((st: any) => st.student_id === createdStudentIds[2]);

    if (s1Rec.status !== 'present' || s1Rec.remarks !== 'Present and punctual') {
      throw new Error(`Student 1 status/remarks mismatch: ${JSON.stringify(s1Rec)}`);
    }
    if (s2Rec.status !== 'absent' || s2Rec.remarks !== 'Medical excuse') {
      throw new Error(`Student 2 status/remarks mismatch: ${JSON.stringify(s2Rec)}`);
    }
    if (s3Rec.status !== 'late' || s3Rec.remarks !== 'Bus delay 15m') {
      throw new Error(`Student 3 status/remarks mismatch: ${JSON.stringify(s3Rec)}`);
    }
    console.log('  ✔ Verified persisted statuses: S1=present, S2=absent, S3=late');

    // ─── Step 6: Overwrite / Correction (Idempotent Upsert) ────────────────────
    console.log('\n▶ Step 6: Verifying authorized correction / repeated submission (upsert)...');
    const overwriteRes = await request(
      'POST',
      '/attendance',
      {
        class_id: testClassId,
        academic_year_id: testAcademicYearId,
        date: today,
        type: 'daily',
        records: [
          { student_id: createdStudentIds[1], status: 'half_day', remarks: 'Left after lunch' }
        ]
      },
      adminToken
    );
    if (overwriteRes.status !== 200 || !overwriteRes.data.success) {
      throw new Error(`Overwrite submission failed: ${JSON.stringify(overwriteRes.data)}`);
    }

    const recheckRoster = await request(
      'GET',
      `/attendance/class/${testClassId}?date=${today}&type=daily`,
      null,
      adminToken
    );
    const correctedS2 = recheckRoster.data.data.attendance.find((st: any) => st.student_id === createdStudentIds[1]);
    if (correctedS2.status !== 'half_day' || correctedS2.remarks !== 'Left after lunch') {
      throw new Error(`Correction not persisted, got: ${JSON.stringify(correctedS2)}`);
    }
    console.log('  ✔ Successfully updated S2 status to half_day without duplicate row creation');

    // ─── Step 7: Individual Student Attendance History ────────────────────────
    console.log('\n▶ Step 7: Verifying student individual attendance history...');
    const s2History = await request(
      'GET',
      `/attendance/student/${createdStudentIds[1]}?type=daily`,
      null,
      adminToken
    );
    if (s2History.status !== 200 || !s2History.data.success) {
      throw new Error(`Student history fetch failed: ${JSON.stringify(s2History.data)}`);
    }
    const historyEntries = s2History.data.data.attendance;
    if (historyEntries.length !== 1 || historyEntries[0].status !== 'half_day') {
      throw new Error(`Expected 1 history record with status half_day, got ${JSON.stringify(historyEntries)}`);
    }
    console.log('  ✔ Student attendance history returned accurate chronological record');

    // ─── Step 8: UUID Validation & Parameter Robustness ───────────────────────
    console.log('\n▶ Step 8: Verifying UUID parameter validation (preventing 500 crashes)...');
    const invalidClassRes = await request(
      'GET',
      `/attendance/class/not-a-valid-uuid?date=${today}`,
      null,
      adminToken
    );
    if (invalidClassRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for invalid class UUID, got ${invalidClassRes.status}`);
    }
    console.log('  ✔ Invalid classId UUID correctly rejected with HTTP 400');

    const invalidStudentRes = await request(
      'GET',
      `/attendance/student/12345-not-uuid`,
      null,
      adminToken
    );
    if (invalidStudentRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for invalid student UUID, got ${invalidStudentRes.status}`);
    }
    console.log('  ✔ Invalid studentId UUID correctly rejected with HTTP 400');

    // ─── Step 9: Request Schema & Status Validation ───────────────────────────
    console.log('\n▶ Step 9: Verifying payload validation (invalid status & empty records)...');
    const invalidStatusRes = await request(
      'POST',
      '/attendance',
      {
        class_id: testClassId,
        academic_year_id: testAcademicYearId,
        date: today,
        type: 'daily',
        records: [{ student_id: createdStudentIds[0], status: 'skipping_school' }]
      },
      adminToken
    );
    if (invalidStatusRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for unsupported status, got ${invalidStatusRes.status}`);
    }
    console.log('  ✔ Unsupported status string correctly rejected with HTTP 400');

    const emptyRecordsRes = await request(
      'POST',
      '/attendance',
      {
        class_id: testClassId,
        academic_year_id: testAcademicYearId,
        date: today,
        type: 'daily',
        records: []
      },
      adminToken
    );
    if (emptyRecordsRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for empty records array, got ${emptyRecordsRes.status}`);
    }
    console.log('  ✔ Empty records array correctly rejected with HTTP 400');

    // ─── Step 10: RBAC Boundary Checks ────────────────────────────────────────
    console.log('\n▶ Step 10: Verifying RBAC boundaries...');
    // Create an unprivileged user (e.g. parent role)
    const unprivilegedUser = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, 'dummy', 'Parent Test') RETURNING id`,
      [`parent_test_${nonce}@test.com`]
    );
    createdUserIds.push(unprivilegedUser.rows[0].id);

    const parentRole = await pool.query(`SELECT id FROM roles WHERE name = 'parent'`);
    if (parentRole.rows.length > 0) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
        [unprivilegedUser.rows[0].id, parentRole.rows[0].id]
      );
    }

    // Generate JWT for parent
    const jwt = require('jsonwebtoken');
    const parentToken = jwt.sign(
      { userId: unprivilegedUser.rows[0].id, email: `parent_test_${nonce}@test.com`, role: 'parent' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    // Parent cannot mark attendance
    const parentMarkRes = await request(
      'POST',
      '/attendance',
      {
        class_id: testClassId,
        academic_year_id: testAcademicYearId,
        date: today,
        type: 'daily',
        records: [{ student_id: createdStudentIds[0], status: 'present' }]
      },
      parentToken
    );
    if (parentMarkRes.status !== 403) {
      throw new Error(`Expected HTTP 403 for unauthorized parent write, got ${parentMarkRes.status}`);
    }
    console.log('  ✔ Unauthorized role (parent) forbidden from marking attendance (HTTP 403)');

    // Parent cannot view unlinked student's history
    const parentHistoryRes = await request(
      'GET',
      `/attendance/student/${createdStudentIds[0]}?type=daily`,
      null,
      parentToken
    );
    if (parentHistoryRes.status !== 403) {
      throw new Error(`Expected HTTP 403 for viewing unlinked student history, got ${parentHistoryRes.status}`);
    }
    console.log('  ✔ Privacy boundary enforced: Parent forbidden from viewing unlinked student history (HTTP 403)');

    console.log('\n================================================================');
    console.log('🎉 ALL 10 MODULE 9 STUDENT ATTENDANCE VERIFICATIONS PASSED! (100%)');
    console.log('================================================================\n');
  } finally {
    // ─── Step 11: Cleanup Isolated Fixtures ───────────────────────────────────
    console.log('▶ Cleaning up test fixtures...');
    try {
      if (testClassId) {
        await pool.query('DELETE FROM attendance_records WHERE student_id = ANY($1::uuid[])', [createdStudentIds]);
      }
      if (createdStudentIds.length > 0) {
        await pool.query('DELETE FROM students WHERE id = ANY($1::uuid[])', [createdStudentIds]);
      }
      if (testClassId) {
        await pool.query('DELETE FROM sections WHERE class_id = $1', [testClassId]);
        await pool.query('DELETE FROM classes WHERE id = $1', [testClassId]);
      }
      if (testAcademicYearId) {
        await pool.query('DELETE FROM academic_years WHERE id = $1', [testAcademicYearId]);
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])', [createdUserIds]);
        await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])', [createdUserIds]);
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
      }
      console.log('  ✔ Test database clean. No residual fixtures left.');
    } catch (cleanupErr: any) {
      console.warn('  ⚠ Warning during fixture cleanup:', cleanupErr.message);
    } finally {
      await pool.end();
    }
  }
}

runAttendanceFrontendVerification().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
