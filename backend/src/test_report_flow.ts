import pool from './config/db';
import { generateAccessToken } from './utils/auth';

const API_BASE = 'http://localhost:5000/api/v1';

async function request(
  method: string,
  endpoint: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any; headers?: Headers; text?: string }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  let responseBody: any = null;
  let text = '';

  if (contentType.includes('application/json')) {
    responseBody = await res.json();
  } else {
    text = await res.text();
  }

  return { status: res.status, body: responseBody, headers: res.headers, text };
}

async function runReportTests() {
  console.log('📊 Starting Module 16 Reports & Analytics Test Suite\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  try {
    const timestamp = Date.now();
    const adminEmail = `admin_rep_${timestamp}@saksham.test`;
    const staffEmail = `staff_rep_${timestamp}@saksham.test`;
    const teacherEmail = `teacher_rep_${timestamp}@saksham.test`;
    const studentEmail = `student_rep_${timestamp}@saksham.test`;

    const adminUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Admin Rep', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [adminEmail]
    );
    const adminId = adminUser.rows[0].id;

    const staffUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Staff Rep', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [staffEmail]
    );
    const staffId = staffUser.rows[0].id;

    const teacherUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Teacher Rep', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [teacherEmail]
    );
    const teacherId = teacherUser.rows[0].id;

    const studentUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Student Rep', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [studentEmail]
    );
    const studentId = studentUser.rows[0].id;

    const adminRole = await pool.query(`SELECT id FROM roles WHERE name = 'super_admin'`);
    const staffRole = await pool.query(`SELECT id FROM roles WHERE name = 'office_staff'`);
    const teacherRole = await pool.query(`SELECT id FROM roles WHERE name = 'teacher'`);
    const studentRole = await pool.query(`SELECT id FROM roles WHERE name = 'student'`);

    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [adminId, adminRole.rows[0].id]);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [staffId, staffRole.rows[0].id]);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [teacherId, teacherRole.rows[0].id]);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [studentId, studentRole.rows[0].id]);

    const adminToken = generateAccessToken({ userId: adminId, role: 'super_admin' });
    const staffToken = generateAccessToken({ userId: staffId, role: 'office_staff' });
    const teacherToken = generateAccessToken({ userId: teacherId, role: 'teacher' });
    const studentToken = generateAccessToken({ userId: studentId, role: 'student' });

    console.log('--- Testing Executive Overview Reports & RBAC ---');

    // Test: Student cannot view overview report (403)
    const studentOverviewRes = await request('GET', '/reports/overview', null, studentToken);
    assert(studentOverviewRes.status === 403, 'Student is forbidden from viewing executive overview report (returns 403)');

    // Test: Admin can view overview report
    const adminOverviewRes = await request('GET', '/reports/overview', null, adminToken);
    assert(adminOverviewRes.status === 200, 'Super Admin can view overview report');
    const overviewData = adminOverviewRes.body?.data;
    assert(typeof overviewData?.students?.active === 'number', 'Overview contains active students count');
    assert(typeof overviewData?.academics?.teachers === 'number', 'Overview contains teachers count');
    assert(typeof overviewData?.fees?.total_collected === 'number', 'Overview contains total fee collection');
    assert(typeof overviewData?.documents?.total === 'number', 'Overview contains documents total');

    // Test: Teacher can view overview report
    const teacherOverviewRes = await request('GET', '/reports/overview', null, teacherToken);
    assert(teacherOverviewRes.status === 200, 'Teacher can view overview report');

    console.log('\n--- Testing Attendance Reports ---');

    const attRes = await request('GET', '/reports/attendance', null, staffToken);
    assert(attRes.status === 200, 'Staff can view attendance report');
    assert(Array.isArray(attRes.body?.data?.by_class), 'Attendance by_class is an array');
    assert(Array.isArray(attRes.body?.data?.daily_trends), 'Attendance daily_trends is an array');

    console.log('\n--- Testing Fee Reports & Role Restrictions ---');

    // Test: Teacher cannot view fee reports (returns 403)
    const teacherFeeRes = await request('GET', '/reports/fees', null, teacherToken);
    assert(teacherFeeRes.status === 403, 'Teacher cannot view fee financials report (returns 403)');

    // Test: Staff can view fee reports
    const staffFeeRes = await request('GET', '/reports/fees', null, staffToken);
    assert(staffFeeRes.status === 200, 'Office staff can view fee financials report');
    assert(Array.isArray(staffFeeRes.body?.data?.by_class), 'Fee by_class is an array');
    assert(Array.isArray(staffFeeRes.body?.data?.payment_methods), 'Payment methods summary is an array');

    console.log('\n--- Testing Academic Exam Reports ---');

    const examRes = await request('GET', '/reports/academics', null, teacherToken);
    assert(examRes.status === 200, 'Teacher can view academic examination reports');
    assert(Array.isArray(examRes.body?.data), 'Academic report data is an array');

    console.log('\n--- Testing CSV Export ---');

    // Test: Student cannot export reports (returns 403)
    const studentExportRes = await request('GET', '/reports/export?report_type=students', null, studentToken);
    assert(studentExportRes.status === 403, 'Student cannot export reports to CSV (returns 403)');

    // Test: Staff can export student roster CSV
    const staffExportRes = await request('GET', '/reports/export?report_type=students', null, staffToken);
    assert(staffExportRes.status === 200, 'Staff can export student report to CSV');
    assert(
      Boolean(staffExportRes.text?.startsWith('Admission Number,Student Name,Email')),
      'Exported CSV contains correct column headers'
    );

    // Cleanup test records
    await pool.query(`DELETE FROM user_roles WHERE user_id IN ($1, $2, $3, $4)`, [adminId, staffId, teacherId, studentId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4)`, [adminId, staffId, teacherId, studentId]);

    console.log(`\n═════════════════════════════════════════════════════════════════`);
    console.log(`🎉 MODULE 16 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`═════════════════════════════════════════════════════════════════\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Unexpected test error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runReportTests();
