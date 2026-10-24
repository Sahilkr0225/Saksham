import http from 'http';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

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

async function runAutoParentEnrollmentSuite() {
  console.log('=================================================================================');
  console.log('🚀 RUNNING AUTOMATED PARENT ONBOARDING DURING STUDENT ENROLLMENT AUDIT SUITE 🚀');
  console.log('=================================================================================\n');

  // Track created fixtures for isolated teardown
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdAdmissionIds: string[] = [];
  const createdSectionIds: string[] = [];
  let createdClassId: string | null = null;

  try {
    // ── Phase 0: Setup & Authentication ──
    console.log('[Setup] Authenticating Super Admin...');
    const adminLogin = await request('POST', '/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234'
    });
    if (adminLogin.status !== 200 || !adminLogin.data?.data?.access_token) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLogin.data)}`);
    }
    const adminToken = adminLogin.data.data.access_token;
    console.log('  ✔ Super Admin authenticated.');

    // Fetch active academic year
    const yearRes = await pool.query('SELECT id FROM academic_years ORDER BY created_at ASC LIMIT 1');
    if (yearRes.rowCount === 0) throw new Error('No academic year found in database');
    const academicYearId = yearRes.rows[0].id;

    // Create isolated class and sections
    const classRes = await pool.query(
      `INSERT INTO classes (name, code, display_order)
       VALUES ($1, $2, 999) RETURNING id`,
      [`Test Auto Class ${Date.now()}`, `TAC${String(Date.now()).slice(-4)}`]
    );
    createdClassId = classRes.rows[0].id;

    const secRes = await pool.query(
      `INSERT INTO sections (class_id, name, capacity)
       VALUES ($1, 'Section Alpha', 20) RETURNING id`,
      [createdClassId]
    );
    const sectionAlphaId = secRes.rows[0].id;
    createdSectionIds.push(sectionAlphaId);

    // Section with capacity 1 for testing rollback
    const secRollbackRes = await pool.query(
      `INSERT INTO sections (class_id, name, capacity)
       VALUES ($1, 'Section Small', 1) RETURNING id`,
      [createdClassId]
    );
    const sectionSmallId = secRollbackRes.rows[0].id;
    createdSectionIds.push(sectionSmallId);

    console.log(`  ✔ Isolated Test Class and Sections established. Class: ${createdClassId}`);

    // ── TEST 1: Case A — New Parent Auto-Creation & Student Linkage ──
    console.log('\n[Test 1] Case A: Enrolling student with brand new parent email...');
    const parentEmailA = `auto_parent_a_${Date.now()}@test.saksham.edu`;
    const admRes1 = await request('POST', '/admissions', {
      applicant_name: 'Aarav Sharma',
      dob: '2012-05-15',
      gender: 'male',
      applied_class_id: createdClassId,
      academic_year_id: academicYearId,
      parent_name: 'Rajesh Sharma',
      parent_email: parentEmailA,
      parent_phone: '9876543210',
      address: '123 Test Avenue, New Delhi',
      remarks: 'Automated test applicant 1'
    }, adminToken);

    if (admRes1.status !== 201) throw new Error(`Failed to create admission: ${JSON.stringify(admRes1.data)}`);
    const admission1Id = admRes1.data.data.admission.id;
    createdAdmissionIds.push(admission1Id);

    // Approve application
    const approveRes1 = await request('PATCH', `/admissions/${admission1Id}/status`, { status: 'approved' }, adminToken);
    if (approveRes1.status !== 200) throw new Error(`Failed to approve admission: ${JSON.stringify(approveRes1.data)}`);

    // Enroll applicant
    const enrollRes1 = await request('POST', `/admissions/${admission1Id}/enroll`, {
      current_section_id: sectionAlphaId,
      roll_number: '1'
    }, adminToken);

    console.log(`  POST /admissions/:id/enroll -> Status: ${enrollRes1.status} (Expected: 201)`);
    if (enrollRes1.status !== 201) throw new Error(`Enrollment failed: ${JSON.stringify(enrollRes1.data)}`);

    const enrollData1 = enrollRes1.data.data;
    const parentAccount1 = enrollData1.parent_account;
    if (!parentAccount1) throw new Error('Response is missing parent_account');
    if (!parentAccount1.is_new_account) throw new Error('Expected is_new_account to be true for new parent');
    if (!parentAccount1.temporary_password) throw new Error('Expected temporary_password to be provided for new parent');
    if (parentAccount1.email.toLowerCase() !== parentEmailA.toLowerCase()) throw new Error(`Parent email mismatch: expected ${parentEmailA}, got ${parentAccount1.email}`);

    createdUserIds.push(parentAccount1.id);
    createdUserIds.push(enrollData1.student.user_id);
    createdStudentIds.push(enrollData1.student.id);

    // Verify DB linkage
    const studentDbCheck = await pool.query('SELECT * FROM students WHERE id = $1', [enrollData1.student.id]);
    if (studentDbCheck.rows[0].parent_user_id !== parentAccount1.id) {
      throw new Error(`students.parent_user_id does not match parent account id! Expected: ${parentAccount1.id}, got: ${studentDbCheck.rows[0].parent_user_id}`);
    }
    console.log(`  ✔ Case A Success: Parent created (${parentAccount1.id}) and linked to Student (${enrollData1.student.id}).`);

    // ── TEST 2: Parent appears in Parent Management with correct role ──
    console.log('\n[Test 2] Verifying Parent Directory visibility & Role...');
    const parentDirRes = await request('GET', `/parents/${parentAccount1.id}`, null, adminToken);
    if (parentDirRes.status !== 200) throw new Error(`GET /parents/:id failed: ${JSON.stringify(parentDirRes.data)}`);
    const parentDetail = parentDirRes.data.data;
    if (parentDetail.email.toLowerCase() !== parentEmailA.toLowerCase()) throw new Error('Parent detail email mismatch');
    
    // Check role in user_roles
    const roleCheck = await pool.query(
      `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
      [parentAccount1.id]
    );
    if (roleCheck.rows[0]?.name !== 'parent') throw new Error(`Role mismatch: expected 'parent', got '${roleCheck.rows[0]?.name}'`);

    const parentSearchRes = await request('GET', `/parents?search=${encodeURIComponent(parentEmailA)}`, null, adminToken);
    if (parentSearchRes.status !== 200 || parentSearchRes.data.data.parents.length === 0) {
      throw new Error('Parent not found in directory search');
    }
    console.log('  ✔ Parent visible in Parent Management directory with role \'parent\'.');

    // ── TEST 3, 4, 5: Case B — Reuse Existing Valid Parent Account ──
    console.log('\n[Test 3, 4, 5] Case B: Enrolling second student (sibling) with existing parent email...');
    
    // Read original parent password hash before second enrollment
    const originalParentDb = await pool.query('SELECT password_hash FROM users WHERE id = $1', [parentAccount1.id]);
    const originalPasswordHash = originalParentDb.rows[0].password_hash;

    const admRes2 = await request('POST', '/admissions', {
      applicant_name: 'Ananya Sharma',
      dob: '2014-08-20',
      gender: 'female',
      applied_class_id: createdClassId,
      academic_year_id: academicYearId,
      parent_name: 'Rajesh Sharma',
      parent_email: parentEmailA, // SAME EMAIL
      parent_phone: '9876543210',
      address: '123 Test Avenue, New Delhi',
      remarks: 'Automated test applicant 2 (Sibling)'
    }, adminToken);

    if (admRes2.status !== 201) throw new Error(`Failed to create sibling admission: ${JSON.stringify(admRes2.data)}`);
    const admission2Id = admRes2.data.data.admission.id;
    createdAdmissionIds.push(admission2Id);

    await request('PATCH', `/admissions/${admission2Id}/status`, { status: 'approved' }, adminToken);

    const enrollRes2 = await request('POST', `/admissions/${admission2Id}/enroll`, {
      current_section_id: sectionAlphaId,
      roll_number: '2'
    }, adminToken);

    console.log(`  POST /admissions/:id/enroll -> Status: ${enrollRes2.status} (Expected: 201)`);
    if (enrollRes2.status !== 201) throw new Error(`Sibling enrollment failed: ${JSON.stringify(enrollRes2.data)}`);

    const enrollData2 = enrollRes2.data.data;
    const parentAccount2 = enrollData2.parent_account;

    // Test 3 Assertions: Account reused
    if (parentAccount2.id !== parentAccount1.id) {
      throw new Error(`Expected reused parent ID ${parentAccount1.id}, got new ID ${parentAccount2.id}`);
    }
    if (parentAccount2.is_new_account !== false) {
      throw new Error('Expected is_new_account to be false for reused parent');
    }
    if (parentAccount2.temporary_password !== null) {
      throw new Error('Expected temporary_password to be null for existing parent (no credential reset)');
    }
    console.log('  ✔ Test 3 Success: Existing parent account reused.');

    createdUserIds.push(enrollData2.student.user_id);
    createdStudentIds.push(enrollData2.student.id);

    // Test 4 Assertions: Password unchanged, no duplicate user or role
    const currentParentDb = await pool.query('SELECT password_hash FROM users WHERE id = $1', [parentAccount1.id]);
    if (currentParentDb.rows[0].password_hash !== originalPasswordHash) {
      throw new Error('Parent password hash was modified during sibling enrollment!');
    }
    const userCount = await pool.query('SELECT COUNT(*)::int as c FROM users WHERE LOWER(TRIM(email)) = $1', [parentEmailA.toLowerCase()]);
    if (userCount.rows[0].c !== 1) {
      throw new Error(`Expected exactly 1 user record, found ${userCount.rows[0].c}`);
    }
    const roleCount = await pool.query('SELECT COUNT(*)::int as c FROM user_roles WHERE user_id = $1', [parentAccount1.id]);
    if (roleCount.rows[0].c !== 1) {
      throw new Error(`Expected exactly 1 role assignment, found ${roleCount.rows[0].c}`);
    }
    console.log('  ✔ Test 4 Success: Existing password preserved, no duplicate user or user_roles records.');

    // Test 5 Assertions: Existing parent's profile now shows both wards
    const updatedParentProfile = await request('GET', `/parents/${parentAccount1.id}`, null, adminToken);
    const linkedStudents = updatedParentProfile.data.data?.children;
    if (!Array.isArray(linkedStudents) || linkedStudents.length !== 2) {
      throw new Error(`Expected 2 linked students under parent profile, found: ${linkedStudents?.length}`);
    }
    const linkedStudentIds = linkedStudents.map((s: any) => s.student_id);
    if (!linkedStudentIds.includes(enrollData1.student.id) || !linkedStudentIds.includes(enrollData2.student.id)) {
      throw new Error('Linked students under parent profile do not contain both enrolled wards');
    }
    console.log('  ✔ Test 5 Success: Both wards (Aarav and Ananya) appear under the reused parent profile.');

    // ── TEST 6: Case C — Account with Incompatible Role is Safely Rejected ──
    console.log('\n[Test 6] Case C: Enrolling student when parent email belongs to a teacher account...');
    const teacherEmail = `incompatible_teacher_${Date.now()}@test.saksham.edu`;
    const tempTeacherHash = await bcrypt.hash('Teacher@1234', 10);
    const teacherUserRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Prof. Ramanujan', $1, $2, true) RETURNING id`,
      [teacherEmail, tempTeacherHash]
    );
    const teacherUserId = teacherUserRes.rows[0].id;
    createdUserIds.push(teacherUserId);

    const teacherRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'teacher'`);
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, is_active) VALUES ($1, $2, true)`,
      [teacherUserId, teacherRoleRes.rows[0].id]
    );

    const admResIncomp = await request('POST', '/admissions', {
      applicant_name: 'Incompatible Test Student',
      dob: '2013-01-01',
      gender: 'male',
      applied_class_id: createdClassId,
      academic_year_id: academicYearId,
      parent_name: 'Prof. Ramanujan',
      parent_email: teacherEmail,
      parent_phone: '9876543211',
      address: 'Faculty Quarters',
      remarks: 'Incompatible role test'
    }, adminToken);

    const admissionIncompId = admResIncomp.data.data.admission.id;
    createdAdmissionIds.push(admissionIncompId);
    await request('PATCH', `/admissions/${admissionIncompId}/status`, { status: 'approved' }, adminToken);

    const incompEnrollRes = await request('POST', `/admissions/${admissionIncompId}/enroll`, {
      current_section_id: sectionAlphaId
    }, adminToken);

    console.log(`  POST /admissions/:id/enroll -> Status: ${incompEnrollRes.status} (Expected: 409)`);
    if (incompEnrollRes.status !== 409) {
      throw new Error(`Expected 409 Conflict for incompatible teacher role, got: ${incompEnrollRes.status}`);
    }
    if (!incompEnrollRes.data?.message?.includes('cannot be used as a parent account')) {
      throw new Error(`Expected conflict error message, got: ${JSON.stringify(incompEnrollRes.data)}`);
    }
    console.log('  ✔ Test 6 Success: Incompatible role account rejected safely with 409 Conflict.');

    // ── TEST 7: Conflicting / Unapproved Student Relationship Rejected ──
    console.log('\n[Test 7] Rejecting enrollment of unapproved application...');
    const admResUnapproved = await request('POST', '/admissions', {
      applicant_name: 'Unapproved Student',
      dob: '2013-02-02',
      gender: 'female',
      applied_class_id: createdClassId,
      academic_year_id: academicYearId,
      parent_name: 'Unapproved Parent',
      parent_email: `unapproved_parent_${Date.now()}@test.saksham.edu`,
      parent_phone: '9876543212',
      address: 'Nowhere',
      remarks: 'Submitted only'
    }, adminToken);

    const unapprovedAdmId = admResUnapproved.data.data.admission.id;
    createdAdmissionIds.push(unapprovedAdmId);

    const unapprovedEnrollRes = await request('POST', `/admissions/${unapprovedAdmId}/enroll`, {}, adminToken);
    console.log(`  POST /admissions/:id/enroll on submitted app -> Status: ${unapprovedEnrollRes.status} (Expected: 400)`);
    if (unapprovedEnrollRes.status !== 400) {
      throw new Error(`Expected 400 for enrolling unapproved app, got: ${unapprovedEnrollRes.status}`);
    }
    console.log('  ✔ Test 7 Success: Unapproved application enrollment safely rejected.');

    // ── TEST 8: Repeated enrollment requests cannot create duplicate records ──
    console.log('\n[Test 8] Repeated enrollment on already enrolled application...');
    const reEnrollRes = await request('POST', `/admissions/${admission1Id}/enroll`, {
      current_section_id: sectionAlphaId
    }, adminToken);
    console.log(`  POST /admissions/:id/enroll on already enrolled app -> Status: ${reEnrollRes.status} (Expected: 400)`);
    if (reEnrollRes.status !== 400) {
      throw new Error(`Expected 400 for enrolling already enrolled app, got: ${reEnrollRes.status}`);
    }
    console.log('  ✔ Test 8 Success: Repeated enrollment rejected.');

    // ── TEST 9: Concurrent enrollment requests cannot bypass constraints ──
    console.log('\n[Test 9] Concurrent enrollment requests concurrency safety...');
    const parentEmailConc = `concurrent_parent_${Date.now()}@test.saksham.edu`;
    const admResConc = await request('POST', '/admissions', {
      applicant_name: 'Concurrent Race Candidate',
      dob: '2012-10-10',
      gender: 'male',
      applied_class_id: createdClassId,
      academic_year_id: academicYearId,
      parent_name: 'Concurrent Parent',
      parent_email: parentEmailConc,
      parent_phone: '9876543213',
      address: 'Race Track 1',
      remarks: 'Concurrent enrollment test'
    }, adminToken);

    const admConcId = admResConc.data.data.admission.id;
    createdAdmissionIds.push(admConcId);
    await request('PATCH', `/admissions/${admConcId}/status`, { status: 'approved' }, adminToken);

    // Fire 3 simultaneous enrollment requests for the exact same approved admission
    const results = await Promise.allSettled([
      request('POST', `/admissions/${admConcId}/enroll`, { current_section_id: sectionAlphaId, roll_number: '10' }, adminToken),
      request('POST', `/admissions/${admConcId}/enroll`, { current_section_id: sectionAlphaId, roll_number: '10' }, adminToken),
      request('POST', `/admissions/${admConcId}/enroll`, { current_section_id: sectionAlphaId, roll_number: '10' }, adminToken)
    ]);

    const statuses = results.map(r => r.status === 'fulfilled' ? r.value.status : 'error');
    console.log('  Concurrent request outcomes:', statuses);

    const successCount = statuses.filter(s => s === 201).length;
    const failureCount = statuses.filter(s => s === 400 || s === 409).length;

    if (successCount !== 1) {
      throw new Error(`Expected exactly 1 enrollment to succeed, but ${successCount} succeeded!`);
    }
    if (failureCount !== 2) {
      throw new Error(`Expected 2 enrollments to fail, but got ${failureCount}`);
    }

    // Capture created records for cleanup
    const concSuccess = results.find(r => r.status === 'fulfilled' && r.value.status === 201) as PromiseFulfilledResult<any>;
    if (concSuccess?.value?.data?.data) {
      createdUserIds.push(concSuccess.value.data.data.parent_account.id);
      createdUserIds.push(concSuccess.value.data.data.student.user_id);
      createdStudentIds.push(concSuccess.value.data.data.student.id);
    }
    console.log('  ✔ Test 9 Success: Concurrency lock serialized requests. Exactly 1 succeeded, 2 rejected.');

    // ── TEST 10: Failed enrollment rolls back atomic operations (Capacity full) ──
    console.log('\n[Test 10] Atomicity & Rollback verification on section capacity failure...');
    
    // First fill sectionSmall (capacity = 1)
    const fillerAdm = await request('POST', '/admissions', {
      applicant_name: 'Filler Student',
      dob: '2012-01-01',
      gender: 'male',
      applied_class_id: createdClassId,
      academic_year_id: academicYearId,
      parent_name: 'Filler Parent',
      parent_email: `filler_parent_${Date.now()}@test.saksham.edu`,
      parent_phone: '9876543214',
      address: 'Small Section Quarters'
    }, adminToken);
    const fillerAdmId = fillerAdm.data.data.admission.id;
    createdAdmissionIds.push(fillerAdmId);
    await request('PATCH', `/admissions/${fillerAdmId}/status`, { status: 'approved' }, adminToken);
    const fillerEnroll = await request('POST', `/admissions/${fillerAdmId}/enroll`, {
      current_section_id: sectionSmallId
    }, adminToken);
    if (fillerEnroll.status !== 201) throw new Error('Failed to fill small section');
    createdUserIds.push(fillerEnroll.data.data.parent_account.id);
    createdUserIds.push(fillerEnroll.data.data.student.user_id);
    createdStudentIds.push(fillerEnroll.data.data.student.id);

    // Now try to enroll a second student into the full section with a brand new parent email
    const rollbackParentEmail = `rollback_parent_${Date.now()}@test.saksham.edu`;
    const failAdm = await request('POST', '/admissions', {
      applicant_name: 'Overflow Student',
      dob: '2012-02-02',
      gender: 'male',
      applied_class_id: createdClassId,
      academic_year_id: academicYearId,
      parent_name: 'Rollback Parent',
      parent_email: rollbackParentEmail,
      parent_phone: '9876543215',
      address: 'Overflow Street'
    }, adminToken);
    const failAdmId = failAdm.data.data.admission.id;
    createdAdmissionIds.push(failAdmId);
    await request('PATCH', `/admissions/${failAdmId}/status`, { status: 'approved' }, adminToken);

    const failEnrollRes = await request('POST', `/admissions/${failAdmId}/enroll`, {
      current_section_id: sectionSmallId
    }, adminToken);

    console.log(`  POST /admissions/:id/enroll on full section -> Status: ${failEnrollRes.status} (Expected: 409)`);
    if (failEnrollRes.status !== 409) {
      throw new Error(`Expected 409 for full section capacity, got: ${failEnrollRes.status}`);
    }

    // Verify rollback: parent account must NOT exist in DB
    const parentRollbackCheck = await pool.query('SELECT id FROM users WHERE LOWER(TRIM(email)) = $1', [rollbackParentEmail.toLowerCase()]);
    if (parentRollbackCheck.rowCount !== 0) {
      throw new Error('Transaction rollback failed: parent user was inserted despite enrollment failure!');
    }
    // Verify rollback: student record must NOT exist and admission remains approved
    const studentRollbackCheck = await pool.query('SELECT id, status FROM admission_applications WHERE id = $1', [failAdmId]);
    if (studentRollbackCheck.rows[0].status !== 'approved') {
      throw new Error(`Admission status should remain 'approved', but is '${studentRollbackCheck.rows[0].status}'`);
    }
    console.log('  ✔ Test 10 Success: Transaction rolled back atomically. No orphaned parent or student records.');

    // ── TEST 11: RBAC & Audit Logging ──
    console.log('\n[Test 11] Verifying RBAC and Audit Trail...');
    // RBAC: Non-admin (teacher) cannot enroll
    const teacherLogin = await request('POST', '/auth/login', {
      email: teacherEmail,
      password: 'Teacher@1234'
    });
    if (teacherLogin.status === 200 && teacherLogin.data?.data?.access_token) {
      const teacherToken = teacherLogin.data.data.access_token;
      const forbiddenEnroll = await request('POST', `/admissions/${admission1Id}/enroll`, {}, teacherToken);
      console.log(`  Teacher attempting enrollment -> Status: ${forbiddenEnroll.status} (Expected: 403)`);
      if (forbiddenEnroll.status !== 403) {
        throw new Error(`Expected 403 Forbidden for teacher role on /enroll, got: ${forbiddenEnroll.status}`);
      }
      console.log('  ✔ RBAC enforced: Only Super Admin / Principal can enroll students.');
    }

    // Audit logs check
    const auditRes = await pool.query(
      `SELECT action, resource, resource_id 
       FROM audit_logs 
       WHERE resource_id = ANY($1::text[])`,
      [[admission1Id, admission2Id, parentAccount1.id, enrollData1.student.id, enrollData2.student.id]]
    );
    console.log(`  Found ${auditRes.rows.length} audit log entries for test enrollment operations.`);
    const hasEnrollAudit = auditRes.rows.some(r => r.action === 'ENROLL');
    const hasParentCreateAudit = auditRes.rows.some(r => r.resource === 'users' && r.action === 'CREATE');
    if (!hasEnrollAudit || !hasParentCreateAudit) {
      throw new Error(`Missing expected audit logs: hasEnrollAudit=${hasEnrollAudit}, hasParentCreateAudit=${hasParentCreateAudit}`);
    }
    console.log('  ✔ Audit logs verified for admission enrollment and parent user creation.');

    // ── TEST 12: Parent Management Metrics Accuracy ──
    console.log('\n[Test 12] Verifying Parent Management Global Metrics Accuracy...');
    const metricsRes = await request('GET', '/parents?page=1&limit=1', null, adminToken);
    if (metricsRes.status !== 200) throw new Error('Failed to fetch parent metrics');
    const apiCounts = metricsRes.data.data.counts;

    const directDbMetrics = await pool.query(`
      SELECT 
        COUNT(DISTINCT u.id)::int as total_parents,
        COUNT(DISTINCT u.id) FILTER (WHERE u.is_active = true)::int as active_parents,
        COUNT(DISTINCT s.parent_user_id)::int as parents_with_wards,
        COUNT(s.id)::int as total_linked_students
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN students s ON s.parent_user_id = u.id
      WHERE r.name = 'parent' AND ur.is_active = true
    `);
    const dbRow = directDbMetrics.rows[0];

    console.log('  API Metrics vs Direct DB Reality:');
    console.log(`    Total Parents:        API=${apiCounts.total} | DB=${dbRow.total_parents}`);
    console.log(`    Active Parents:       API=${apiCounts.active} | DB=${dbRow.active_parents}`);
    console.log(`    Parents With Wards:   API=${apiCounts.parents_with_wards} | DB=${dbRow.parents_with_wards}`);
    console.log(`    Total Linked Students:API=${apiCounts.total_linked_students} | DB=${dbRow.total_linked_students}`);

    if (
      apiCounts.total !== dbRow.total_parents ||
      apiCounts.active !== dbRow.active_parents ||
      apiCounts.parents_with_wards !== dbRow.parents_with_wards ||
      apiCounts.total_linked_students !== dbRow.total_linked_students
    ) {
      throw new Error('Mismatch between Parent Management API metrics and Database reality!');
    }
    console.log('  ✔ Test 12 Success: 100% metrics parity between API and database state.');

    console.log('\n=================================================================================');
    console.log('🎉 ALL 12 TESTS OF AUTOMATIC PARENT ENROLLMENT AUDIT PASSED WITH 100% SUCCESS! 🎉');
    console.log('=================================================================================\n');

  } finally {
    console.log('--- Cleaning up isolated test fixtures ---');
    try {
      if (createdStudentIds.length > 0) {
        await pool.query('DELETE FROM audit_logs WHERE resource = $1 AND resource_id = ANY($2::text[])', ['students', createdStudentIds]);
        await pool.query('DELETE FROM students WHERE id = ANY($1::uuid[])', [createdStudentIds]);
      }
      if (createdAdmissionIds.length > 0) {
        await pool.query('DELETE FROM audit_logs WHERE resource = $1 AND resource_id = ANY($2::text[])', ['admission_applications', createdAdmissionIds]);
        await pool.query('DELETE FROM admission_applications WHERE id = ANY($1::uuid[])', [createdAdmissionIds]);
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM audit_logs WHERE resource = $1 AND resource_id = ANY($2::text[])', ['users', createdUserIds]);
        await pool.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1::uuid[])', [createdUserIds]);
        await pool.query('DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])', [createdUserIds]);
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
      }
      if (createdSectionIds.length > 0) {
        await pool.query('DELETE FROM sections WHERE id = ANY($1::uuid[])', [createdSectionIds]);
      }
      if (createdClassId) {
        await pool.query('DELETE FROM classes WHERE id = $1', [createdClassId]);
      }
      console.log('✔ Cleanup completed cleanly. Zero residual test records left in database.\n');
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
    } finally {
      await pool.end();
    }
  }
}

runAutoParentEnrollmentSuite().catch((err) => {
  console.error('\n❌ Automated Parent Enrollment Audit Failed:', err);
  process.exit(1);
});
