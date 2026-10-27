import pool from './config/db';
import { generateAccessToken } from './utils/auth';
import { initDb } from './config/initDb';

const API_BASE = 'http://localhost:5000/api/v1';

async function request(
  method: string,
  endpoint: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any; headers?: Headers; text?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
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

async function runAdminTests() {
  console.log('⚙️ Starting Module 17 Administration & Settings Test Suite\n');
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
    await initDb();

    const timestamp = Date.now();
    const adminEmail = `admin_adm_${timestamp}@saksham.test`;
    const teacherEmail = `teacher_adm_${timestamp}@saksham.test`;
    const studentEmail = `student_adm_${timestamp}@saksham.test`;

    const adminUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Admin Setting', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [adminEmail]
    );
    const adminId = adminUser.rows[0].id;

    const teacherUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Teacher Setting', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [teacherEmail]
    );
    const teacherId = teacherUser.rows[0].id;

    const studentUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Student Setting', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [studentEmail]
    );
    const studentId = studentUser.rows[0].id;

    const adminRole = await pool.query(`SELECT id FROM roles WHERE name = 'super_admin'`);
    const teacherRole = await pool.query(`SELECT id FROM roles WHERE name = 'teacher'`);
    const studentRole = await pool.query(`SELECT id FROM roles WHERE name = 'student'`);

    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [adminId, adminRole.rows[0].id]);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [teacherId, teacherRole.rows[0].id]);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [studentId, studentRole.rows[0].id]);

    const adminToken = generateAccessToken({ userId: adminId, role: 'super_admin' });
    const teacherToken = generateAccessToken({ userId: teacherId, role: 'teacher' });
    const studentToken = generateAccessToken({ userId: studentId, role: 'student' });

    console.log('--- Testing School Settings Management ---');

    // Test: Retrieve settings
    const getSettingsRes = await request('GET', '/admin/settings', null, studentToken);
    assert(getSettingsRes.status === 200, 'Authenticated users can view school settings');
    assert(typeof getSettingsRes.body?.data?.school_name === 'string', 'Settings response includes school_name');

    // Test: Teacher cannot update settings (returns 403)
    const teacherUpdateRes = await request(
      'PUT',
      '/admin/settings',
      { school_name: 'Unauthorized Edit' },
      teacherToken
    );
    assert(teacherUpdateRes.status === 403, 'Teacher cannot update school settings (returns 403)');

    // Test: Super Admin updates settings
    const adminUpdateRes = await request(
      'PUT',
      '/admin/settings',
      {
        school_name: 'Saksham Premier Academy',
        phone: '+91 9876543210',
        email: 'info@saksham.edu',
        motto: 'Empowering Education through Technology',
        currency: 'INR'
      },
      adminToken
    );
    assert(adminUpdateRes.status === 200, 'Super Admin can update school settings');
    assert(adminUpdateRes.body?.data?.school_name === 'Saksham Premier Academy', 'School name updated successfully');
    assert(adminUpdateRes.body?.data?.phone === '+91 9876543210', 'Phone updated successfully');

    console.log('\n--- Testing Bulk Student Promotion & Capacity Check ---');

    // Setup classes: Class Source & Class Target
    const c1Res = await pool.query(
      `INSERT INTO classes (name, code) VALUES ($1, $2) RETURNING id`,
      [`Class 9 Adm ${timestamp}`, `C9_${timestamp}`]
    );
    const sourceClassId = c1Res.rows[0].id;

    const c2Res = await pool.query(
      `INSERT INTO classes (name, code) VALUES ($1, $2) RETURNING id`,
      [`Class 10 Adm ${timestamp}`, `C10_${timestamp}`]
    );
    const targetClassId = c2Res.rows[0].id;

    // Create target section with capacity = 1
    const secRes = await pool.query(
      `INSERT INTO sections (class_id, name, capacity) VALUES ($1, 'A', 1) RETURNING id`,
      [targetClassId]
    );
    const targetSectionId = secRes.rows[0].id;

    // Create 2 students in source class
    const s1Res = await pool.query(
      `INSERT INTO students (user_id, admission_number, dob, gender, current_class_id, status)
       VALUES ($1, $2, '2010-01-01', 'Male', $3, 'active') RETURNING id`,
      [studentId, `ADM_P1_${timestamp}`, sourceClassId]
    );
    const stu1Id = s1Res.rows[0].id;

    const u2Res = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Student 2 Adm', $1, 'hash', TRUE) RETURNING id`,
      [`stu2_${timestamp}@saksham.test`]
    );
    const s2Res = await pool.query(
      `INSERT INTO students (user_id, admission_number, dob, gender, current_class_id, status)
       VALUES ($1, $2, '2010-01-01', 'Female', $3, 'active') RETURNING id`,
      [u2Res.rows[0].id, `ADM_P2_${timestamp}`, sourceClassId]
    );
    const stu2Id = s2Res.rows[0].id;

    // Test: Promote 2 students into section with capacity 1 (returns 409)
    const overCapacityRes = await request(
      'POST',
      '/admin/promote-students',
      {
        source_class_id: sourceClassId,
        target_class_id: targetClassId,
        target_section_id: targetSectionId,
        student_ids: [stu1Id, stu2Id]
      },
      adminToken
    );
    assert(overCapacityRes.status === 409, 'Section capacity overflow is rejected with 409 Conflict');

    // Test: Promote 2 students without section restriction (succeeds)
    const promoteSuccessRes = await request(
      'POST',
      '/admin/promote-students',
      {
        source_class_id: sourceClassId,
        target_class_id: targetClassId
      },
      adminToken
    );
    assert(promoteSuccessRes.status === 200, 'Bulk promotion succeeds without section constraint');
    assert(promoteSuccessRes.body?.data?.promoted_count === 2, 'Exactly 2 students promoted');

    // Verify student is now in target class
    const checkStu1 = await pool.query('SELECT current_class_id FROM students WHERE id = $1', [stu1Id]);
    assert(checkStu1.rows[0].current_class_id === targetClassId, 'Student class updated to target class in DB');

    console.log('\n--- Testing System Data Backup ---');

    // Test: Teacher cannot generate backup (returns 403)
    const teacherBackupRes = await request('GET', '/admin/backup', null, teacherToken);
    assert(teacherBackupRes.status === 403, 'Teacher cannot generate full backup (returns 403)');

    // Test: Super Admin can generate full JSON backup
    const adminBackupRes = await request('GET', '/admin/backup', null, adminToken);
    assert(adminBackupRes.status === 200, 'Super Admin can generate system JSON backup');
    assert(adminBackupRes.body?.system === 'Saksham School Management Platform', 'Backup JSON contains platform branding');
    assert(typeof adminBackupRes.body?.counts?.total_students === 'number', 'Backup contains student counts');
    assert(Array.isArray(adminBackupRes.body?.classes), 'Backup contains classes list');

    // Cleanup test records
    await pool.query(`DELETE FROM students WHERE id IN ($1, $2)`, [stu1Id, stu2Id]);
    await pool.query(`DELETE FROM sections WHERE id = $1`, [targetSectionId]);
    await pool.query(`DELETE FROM classes WHERE id IN ($1, $2)`, [sourceClassId, targetClassId]);
    await pool.query(`DELETE FROM user_roles WHERE user_id IN ($1, $2, $3, $4)`, [adminId, teacherId, studentId, u2Res.rows[0].id]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4)`, [adminId, teacherId, studentId, u2Res.rows[0].id]);

    console.log(`\n═════════════════════════════════════════════════════════════════`);
    console.log(`🎉 MODULE 17 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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

runAdminTests();
