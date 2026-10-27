import pool from './config/db';
import { generateAccessToken } from './utils/auth';
import { initDb } from './config/initDb';

const API_BASE = 'http://localhost:5000/api/v1';

async function request(
  method: string,
  endpoint: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any; headers?: Headers }> {
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

  let responseBody: any = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    responseBody = await res.json();
  }

  return { status: res.status, body: responseBody, headers: res.headers };
}

async function runDocumentTests() {
  console.log('📄 Starting Module 15 Document Management Test Suite\n');
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

    // 1. Setup test fixture accounts
    const timestamp = Date.now();
    const adminEmail = `admin_doc_${timestamp}@saksham.test`;
    const staffEmail = `staff_doc_${timestamp}@saksham.test`;
    const student1Email = `student1_doc_${timestamp}@saksham.test`;
    const student2Email = `student2_doc_${timestamp}@saksham.test`;

    const adminUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Admin Doc', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [adminEmail]
    );
    const adminId = adminUser.rows[0].id;

    const staffUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Staff Doc', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [staffEmail]
    );
    const staffId = staffUser.rows[0].id;

    const student1User = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Student 1 Doc', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [student1Email]
    );
    const student1UserId = student1User.rows[0].id;

    const student2User = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Student 2 Doc', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [student2Email]
    );
    const student2UserId = student2User.rows[0].id;

    // Student profile records
    const student1Profile = await pool.query(
      `INSERT INTO students (user_id, admission_number, dob, gender, status)
       VALUES ($1, $2, '2010-01-01', 'Male', 'active') RETURNING id`,
      [student1UserId, `ADM_DOC1_${timestamp}`]
    );
    const student1Id = student1Profile.rows[0].id;

    const student2Profile = await pool.query(
      `INSERT INTO students (user_id, admission_number, dob, gender, status)
       VALUES ($1, $2, '2010-02-02', 'Female', 'active') RETURNING id`,
      [student2UserId, `ADM_DOC2_${timestamp}`]
    );
    const student2Id = student2Profile.rows[0].id;

    // Assign roles in user_roles
    const adminRole = await pool.query(`SELECT id FROM roles WHERE name = 'super_admin'`);
    const staffRole = await pool.query(`SELECT id FROM roles WHERE name = 'office_staff'`);
    const studentRole = await pool.query(`SELECT id FROM roles WHERE name = 'student'`);

    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [adminId, adminRole.rows[0].id]);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [staffId, staffRole.rows[0].id]);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [student1UserId, studentRole.rows[0].id]);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [student2UserId, studentRole.rows[0].id]);

    const adminToken = generateAccessToken({ userId: adminId, role: 'super_admin' });
    const staffToken = generateAccessToken({ userId: staffId, role: 'office_staff' });
    const student1Token = generateAccessToken({ userId: student1UserId, role: 'student' });
    const student2Token = generateAccessToken({ userId: student2UserId, role: 'student' });

    console.log('--- Testing Document Upload & Entity Access Control ---');

    // Dummy base64 file data ("Sample Document Content")
    const dummyBase64 = Buffer.from('Sample Document Content for Saksham ERP').toString('base64');

    // Test: Student 1 cannot upload for Student 2 (returns 403)
    const unauthorizedUploadRes = await request(
      'POST',
      '/documents',
      {
        entity_type: 'student',
        entity_id: student2Id,
        document_type: 'birth_certificate',
        title: 'Tampered Certificate',
        file_name: 'tampered.pdf',
        file_data: dummyBase64,
        mime_type: 'application/pdf'
      },
      student1Token
    );
    assert(unauthorizedUploadRes.status === 403, 'Student cannot upload document for another student (returns 403)');

    // Test: Student 1 can upload document for themselves (returns 201)
    const uploadRes1 = await request(
      'POST',
      '/documents',
      {
        entity_type: 'student',
        entity_id: student1Id,
        document_type: 'birth_certificate',
        title: 'Student 1 Official Birth Certificate',
        file_name: 'birth_cert.pdf',
        file_data: dummyBase64,
        mime_type: 'application/pdf'
      },
      student1Token
    );
    assert(uploadRes1.status === 201, 'Student can upload their own document (returns 201)');
    const doc1Id = uploadRes1.body?.data?.id;
    assert(uploadRes1.body?.data?.status === 'pending', 'Uploaded document initial status is "pending"');

    console.log('\n--- Testing Document Listing & Isolation ---');

    // Test: Staff can see all documents
    const staffListRes = await request('GET', '/documents', null, staffToken);
    assert(staffListRes.status === 200, 'Staff can query documents catalog');
    const foundByStaff = staffListRes.body?.data?.some((d: any) => d.id === doc1Id);
    assert(foundByStaff, 'Staff can see student uploaded document');

    // Test: Student 1 can see their own document
    const student1ListRes = await request('GET', '/documents', null, student1Token);
    assert(student1ListRes.body?.data?.length === 1, 'Student 1 sees their uploaded document');
    assert(student1ListRes.body?.data?.[0]?.id === doc1Id, 'Document ID matches for Student 1');

    // Test: Student 2 cannot see Student 1's document (isolation)
    const student2ListRes = await request('GET', '/documents', null, student2Token);
    assert(student2ListRes.body?.data?.length === 0, 'Student 2 cannot see Student 1 document (user isolation)');

    console.log('\n--- Testing Document Download Access ---');

    // Test: Student 2 cannot download Student 1 document (returns 403)
    const student2DownloadRes = await request('GET', `/documents/${doc1Id}/download`, null, student2Token);
    assert(student2DownloadRes.status === 403, 'Student 2 cannot download Student 1 document (returns 403)');

    // Test: Student 1 can download their document
    const student1DownloadRes = await request('GET', `/documents/${doc1Id}/download`, null, student1Token);
    assert(student1DownloadRes.status === 200, 'Student 1 can download their own document (returns 200)');

    console.log('\n--- Testing Verification Workflow & Automated Notification ---');

    // Test: Student cannot verify documents (returns 403)
    const studentVerifyRes = await request(
      'PATCH',
      `/documents/${doc1Id}/verify`,
      { status: 'verified', remarks: 'Self verification' },
      student1Token
    );
    assert(studentVerifyRes.status === 403, 'Student cannot verify documents (returns 403)');

    // Test: Staff verifies student document
    const staffVerifyRes = await request(
      'PATCH',
      `/documents/${doc1Id}/verify`,
      { status: 'verified', remarks: 'Original certificate verified against government portal' },
      staffToken
    );
    assert(staffVerifyRes.status === 200, 'Staff can verify document (returns 200)');
    assert(staffVerifyRes.body?.data?.status === 'verified', 'Status updated to "verified"');
    assert(staffVerifyRes.body?.data?.verification_remarks?.includes('Original certificate verified'), 'Verification remarks persisted');

    // Test: Verification triggered an in-app notification in student's inbox
    const studentNotifRes = await request('GET', '/notifications', null, student1Token);
    const hasDocNotif = studentNotifRes.body?.data?.some(
      (n: any) => n.type === 'document' && n.title.includes('Verified')
    );
    assert(hasDocNotif, 'Document verification automatically triggered in-app notification to uploader');

    console.log('\n--- Testing Deletion Restrictions & Administrative Cleanup ---');

    // Test: Student cannot delete a verified document (returns 403)
    const studentDeleteRes = await request('DELETE', `/documents/${doc1Id}`, null, student1Token);
    assert(studentDeleteRes.status === 403, 'Student cannot delete a verified document (returns 403)');

    // Test: Super Admin can delete document
    const adminDeleteRes = await request('DELETE', `/documents/${doc1Id}`, null, adminToken);
    assert(adminDeleteRes.status === 200, 'Super Admin can delete document (returns 200)');

    // Cleanup test records
    await pool.query(`DELETE FROM notifications WHERE user_id IN ($1, $2, $3, $4)`, [adminId, staffId, student1UserId, student2UserId]);
    await pool.query(`DELETE FROM documents WHERE entity_id IN ($1, $2)`, [student1Id, student2Id]);
    await pool.query(`DELETE FROM students WHERE id IN ($1, $2)`, [student1Id, student2Id]);
    await pool.query(`DELETE FROM user_roles WHERE user_id IN ($1, $2, $3, $4)`, [adminId, staffId, student1UserId, student2UserId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4)`, [adminId, staffId, student1UserId, student2UserId]);

    console.log(`\n═════════════════════════════════════════════════════════════════`);
    console.log(`🎉 MODULE 15 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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

runDocumentTests();
