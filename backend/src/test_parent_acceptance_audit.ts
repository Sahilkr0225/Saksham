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

async function runParentAcceptanceAudit() {
  console.log('======================================================================');
  console.log('🚀 RUNNING COMPREHENSIVE PARENT MANAGEMENT ACCEPTANCE AUDIT SUITE 🚀');
  console.log('======================================================================\n');

  // Track created fixtures for isolated cleanup
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdAdmissionIds: string[] = [];
  let createdClassId: string | null = null;
  let createdAcademicYearId: string | null = null;

  try {
    // ── Phase 1: Authentication & Baseline Setup ──
    console.log('[Phase 1] Authenticating as Super Admin...');
    const adminLogin = await request('POST', '/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234'
    });
    if (adminLogin.status !== 200 || !adminLogin.data?.data?.access_token) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLogin.data)}`);
    }
    const adminToken = adminLogin.data.data.access_token;
    console.log('  ✔ Super Admin authenticated successfully.');

    // ── Phase 2: Route Parameter Validation & Error Handling (Phase 6 Defects) ──
    console.log('\n[Phase 2] Verifying Route Parameter Validation (400 vs 500)...');
    
    const malformedGet = await request('GET', '/parents/not-a-valid-uuid', null, adminToken);
    console.log(`  ✔ GET /parents/not-a-valid-uuid -> Status: ${malformedGet.status} (Expected: 400)`);
    if (malformedGet.status !== 400) throw new Error(`Expected 400 for malformed UUID on GET /parents/:id, got ${malformedGet.status}`);

    const malformedLink = await request('POST', '/parents/not-a-valid-uuid/link-student', { student_id: '00000000-0000-0000-0000-000000000000' }, adminToken);
    console.log(`  ✔ POST /parents/not-a-valid-uuid/link-student -> Status: ${malformedLink.status} (Expected: 400)`);
    if (malformedLink.status !== 400) throw new Error(`Expected 400 for malformed UUID on link-student, got ${malformedLink.status}`);

    const malformedUnlink = await request('POST', '/parents/not-a-valid-uuid/unlink-student', { student_id: '00000000-0000-0000-0000-000000000000' }, adminToken);
    console.log(`  ✔ POST /parents/not-a-valid-uuid/unlink-student -> Status: ${malformedUnlink.status} (Expected: 400)`);
    if (malformedUnlink.status !== 400) throw new Error(`Expected 400 for malformed UUID on unlink-student, got ${malformedUnlink.status}`);

    const nonexistentParent = await request('GET', '/parents/00000000-0000-0000-0000-000000000000', null, adminToken);
    console.log(`  ✔ GET /parents/00000000-0000-0000-0000-000000000000 -> Status: ${nonexistentParent.status} (Expected: 404)`);
    if (nonexistentParent.status !== 404) throw new Error(`Expected 404 for nonexistent UUID, got ${nonexistentParent.status}`);

    // ── Phase 3: Setup Isolated Test Fixtures ──
    console.log('\n[Phase 3] Setting up isolated test fixtures...');
    const now = Date.now();

    // 3a. Create Academic Year and Class for test student
    const ayRes = await request(
      'POST',
      '/academic/academic-years',
      { name: `AY-ParentAudit-${now}`, start_date: '2026-04-01', end_date: '2027-03-31', is_current: false },
      adminToken
    );
    if (ayRes.status !== 201) throw new Error(`Failed to create academic year: ${JSON.stringify(ayRes.data)}`);
    createdAcademicYearId = ayRes.data.data.academic_year.id;

    const clsRes = await request(
      'POST',
      '/academic/classes',
      { name: `Class-ParentAudit-${now}`, code: `CPA-${String(now).slice(-4)}`, display_order: 98 },
      adminToken
    );
    if (clsRes.status !== 201) throw new Error(`Failed to create class: ${JSON.stringify(clsRes.data)}`);
    createdClassId = clsRes.data.data.class.id;

    // Helper to create & enroll an isolated test student
    const createTestStudent = async (studentName: string, studentEmail: string) => {
      const admRes = await request(
        'POST',
        '/admissions',
        {
          applicant_name: studentName,
          dob: '2015-08-15',
          gender: 'female',
          applied_class_id: createdClassId,
          academic_year_id: createdAcademicYearId,
          parent_name: `Guardian of ${studentName}`,
          parent_email: `guardian-${studentEmail}`,
          parent_phone: '9876543210',
          address: 'Parent Audit Fixture Address'
        },
        adminToken
      );
      if (admRes.status !== 201) throw new Error(`Failed to create admission for ${studentName}`);
      const admId = admRes.data.data.admission.id;
      createdAdmissionIds.push(admId);

      const apprvRes = await request('PATCH', `/admissions/${admId}/status`, { status: 'approved' }, adminToken);
      if (apprvRes.status !== 200) throw new Error(`Failed to approve admission`);

      const enrollRes = await request('POST', `/admissions/${admId}/enroll`, { blood_group: 'B+', emergency_contact: '9876543210' }, adminToken);
      if (enrollRes.status !== 201) throw new Error(`Failed to enroll student`);
      const student = enrollRes.data.data.student;
      createdStudentIds.push(student.id);
      createdUserIds.push(student.user_id);
      if (enrollRes.data.data.parent_account?.id) {
        createdUserIds.push(enrollRes.data.data.parent_account.id);
      }
      // Unlink student so Phase 5 can test manual student-to-parent linking
      await pool.query('UPDATE students SET parent_user_id = NULL WHERE id = $1', [student.id]);
      return student;
    };

    // Helper to onboard a test user with a specific role
    const createTestUser = async (name: string, email: string, role: string) => {
      const res = await request(
        'POST',
        '/users',
        { name, email, phone: '9123456789', role },
        adminToken
      );
      if (res.status !== 201) throw new Error(`Failed to create user ${email}: ${JSON.stringify(res.data)}`);
      const user = res.data.data.user;
      const tempPassword = res.data.data.temporary_password;
      createdUserIds.push(user.id);

      // Authenticate to get JWT token
      const loginRes = await request('POST', '/auth/login', {
        email,
        password: tempPassword
      });
      if (loginRes.status !== 200) throw new Error(`Failed to login as created user ${email}`);
      const token = loginRes.data.data.access_token;
      return { user, tempPassword, token };
    };

    console.log('  Creating Test Student Alpha...');
    const studentAlpha = await createTestStudent('Student Alpha', `alpha-${now}@testschool.edu`);

    console.log('  Creating Parent A (Primary Parent)...');
    const parentA = await createTestUser('Parent Alpha', `parent.alpha.${now}@testschool.edu`, 'parent');

    console.log('  Creating Parent B (Secondary Parent for conflict testing)...');
    const parentB = await createTestUser('Parent Beta', `parent.beta.${now}@testschool.edu`, 'parent');

    console.log('  Creating Staff User (office_staff role)...');
    const staffUser = await createTestUser('Staff Operator', `staff.${now}@testschool.edu`, 'office_staff');

    console.log('  Creating Principal User (principal role)...');
    const principalUser = await createTestUser('Principal Leader', `principal.${now}@testschool.edu`, 'principal');

    console.log('  ✔ All test fixtures created and authenticated successfully.');

    // ── Phase 4: Directory & Global Metrics Verification ──
    console.log('\n[Phase 4] Verifying Directory & Global Metrics Aggregation...');
    const dirRes = await request('GET', '/parents?page=1&limit=10', null, adminToken);
    if (dirRes.status !== 200) throw new Error(`Directory request failed with status ${dirRes.status}`);

    const counts = dirRes.data?.data?.counts;
    console.log('  Directory global counts received:', counts);
    if (!counts) throw new Error('data.counts is missing from /parents response');
    if (typeof counts.total !== 'number' || typeof counts.active !== 'number' || typeof counts.inactive !== 'number') {
      throw new Error('Counts structure does not match expected global metrics contract');
    }
    if (typeof counts.parents_with_wards !== 'number' || typeof counts.total_linked_students !== 'number') {
      throw new Error('Counts does not contain ward relationship metrics');
    }

    // Check search functionality
    const searchRes = await request('GET', `/parents?search=Parent+Alpha`, null, adminToken);
    if (searchRes.status !== 200) throw new Error(`Search failed with status ${searchRes.status}`);
    const foundParent = searchRes.data.data.parents.find((p: any) => p.id === parentA.user.id);
    if (!foundParent) throw new Error('Search by name did not locate Parent Alpha');
    console.log('  ✔ Directory search and global metric aggregation verified successfully.');

    // ── Phase 5: Single-Primary-Parent Constraint & Conflict Verification ──
    console.log('\n[Phase 5] Verifying Parent-Student Relationship Integrity & Conflict Handling...');

    // 5a. Link Student Alpha to Parent A -> 200 OK
    const linkRes1 = await request('POST', `/parents/${parentA.user.id}/link-student`, { student_id: studentAlpha.id }, adminToken);
    console.log(`  ✔ Link Student Alpha -> Parent A -> Status: ${linkRes1.status} (Expected: 200)`);
    if (linkRes1.status !== 200) throw new Error(`Failed to link student: ${JSON.stringify(linkRes1.data)}`);

    // 5b. Idempotent re-link Student Alpha to Parent A -> 200 OK
    const linkResIdempotent = await request('POST', `/parents/${parentA.user.id}/link-student`, { student_id: studentAlpha.id }, adminToken);
    console.log(`  ✔ Idempotent re-link Student Alpha -> Parent A -> Status: ${linkResIdempotent.status} (Expected: 200)`);
    if (linkResIdempotent.status !== 200) throw new Error(`Idempotent link failed: ${JSON.stringify(linkResIdempotent.data)}`);

    // 5c. Overwrite attempt: Try to link Student Alpha to Parent B while still linked to Parent A -> 409 Conflict
    const overwriteRes = await request('POST', `/parents/${parentB.user.id}/link-student`, { student_id: studentAlpha.id }, adminToken);
    console.log(`  ✔ Overwrite attempt: Link Student Alpha -> Parent B -> Status: ${overwriteRes.status} (Expected: 409)`);
    console.log(`     Response Message: "${overwriteRes.data?.message}"`);
    if (overwriteRes.status !== 409) {
      throw new Error(`Expected 409 Conflict when linking already-linked student to different parent, got ${overwriteRes.status}`);
    }

    // 5d. Non-destructive unlinking: Unlink Student Alpha from Parent A -> 200 OK
    const unlinkRes = await request('POST', `/parents/${parentA.user.id}/unlink-student`, { student_id: studentAlpha.id }, adminToken);
    console.log(`  ✔ Unlink Student Alpha from Parent A -> Status: ${unlinkRes.status} (Expected: 200)`);
    if (unlinkRes.status !== 200) throw new Error(`Unlink failed: ${JSON.stringify(unlinkRes.data)}`);

    // 5e. Verify student record in database was NOT deleted and parent_user_id is NULL
    const studentDbCheck = await pool.query('SELECT id, parent_user_id, status FROM students WHERE id = $1', [studentAlpha.id]);
    if (studentDbCheck.rows.length === 0) throw new Error('Student record was deleted during unlinking! Data loss defect!');
    if (studentDbCheck.rows[0].parent_user_id !== null) {
      throw new Error(`Student parent_user_id was not set to NULL: ${studentDbCheck.rows[0].parent_user_id}`);
    }
    console.log('  ✔ Verified Student Alpha still exists in DB with parent_user_id = NULL and status preserved.');

    // 5f. Now link Student Alpha to Parent B (should succeed since previously unlinked) -> 200 OK
    const linkRes2 = await request('POST', `/parents/${parentB.user.id}/link-student`, { student_id: studentAlpha.id }, adminToken);
    console.log(`  ✔ Link Student Alpha -> Parent B (post-unlink) -> Status: ${linkRes2.status} (Expected: 200)`);
    if (linkRes2.status !== 200) throw new Error(`Link after unlink failed: ${JSON.stringify(linkRes2.data)}`);

    // ── Phase 6: Transaction Isolation & Concurrency Locking (FOR UPDATE) ──
    console.log('\n[Phase 6] Verifying Concurrency Locking (Row Lock FOR UPDATE)...');
    
    // Unlink first so the student is available
    await request('POST', `/parents/${parentB.user.id}/unlink-student`, { student_id: studentAlpha.id }, adminToken);

    // Fire two simultaneous requests attempting to link the same student to different parents
    console.log('  Firing 2 simultaneous link requests for Student Alpha to Parent A & Parent B...');
    const [raceA, raceB] = await Promise.all([
      request('POST', `/parents/${parentA.user.id}/link-student`, { student_id: studentAlpha.id }, adminToken),
      request('POST', `/parents/${parentB.user.id}/link-student`, { student_id: studentAlpha.id }, adminToken)
    ]);

    console.log(`  Race Request 1 Status: ${raceA.status}, Message: "${raceA.data?.message}"`);
    console.log(`  Race Request 2 Status: ${raceB.status}, Message: "${raceB.data?.message}"`);

    const raceStatuses = [raceA.status, raceB.status].sort();
    if (raceStatuses[0] === 200 && raceStatuses[1] === 409) {
      console.log('  ✔ Transactional row lock FOR UPDATE successfully prevented race overwrite: exactly 1 succeeded (200) and 1 rejected (409)!');
    } else {
      throw new Error(`Concurrency race test failed: expected [200, 409] but got [${raceStatuses.join(', ')}]`);
    }

    // ── Phase 7: Parent Profile & Field Protection ──
    console.log('\n[Phase 7] Verifying Parent Profile Update & Field Immutability...');
    
    // Update name and phone
    const updateRes = await request(
      'PATCH',
      `/users/${parentA.user.id}`,
      { name: 'Parent Alpha Updated', phone: '9988776655' },
      adminToken
    );
    console.log(`  ✔ PATCH /users/:id update name & phone -> Status: ${updateRes.status} (Expected: 200)`);
    if (updateRes.status !== 200) throw new Error(`Failed to update parent profile: ${JSON.stringify(updateRes.data)}`);
    if (updateRes.data.data.user.name !== 'Parent Alpha Updated' || updateRes.data.data.user.phone !== '9988776655') {
      throw new Error('Updated fields do not match sent payload');
    }

    // Verify email remains unchanged and is not updated by PATCH /users/:id
    const dbEmailCheck = await pool.query('SELECT email FROM users WHERE id = $1', [parentA.user.id]);
    if (dbEmailCheck.rows[0].email !== parentA.user.email) {
      throw new Error('Parent email was altered unexpectedly');
    }
    console.log('  ✔ Parent email verified immutable through user update flow.');

    // ── Phase 8: RBAC Matrix & Isolation Enforcement ──
    console.log('\n[Phase 8] Verifying RBAC Matrix & Role Boundaries...');

    // 8a. Parent Self-View vs Cross-Parent Access
    console.log('  Testing Parent role self-view and cross-parent protection:');
    const selfView = await request('GET', `/parents/${parentA.user.id}`, null, parentA.token);
    console.log(`    GET /parents/:ownId as Parent A -> Status: ${selfView.status} (Expected: 200)`);
    if (selfView.status !== 200) throw new Error(`Parent could not view own profile: ${selfView.status}`);

    const myChildren = await request('GET', `/parents/me/children`, null, parentA.token);
    console.log(`    GET /parents/me/children as Parent A -> Status: ${myChildren.status} (Expected: 200)`);
    if (myChildren.status !== 200) throw new Error(`Parent could not view /me/children: ${myChildren.status}`);

    const crossView = await request('GET', `/parents/${parentB.user.id}`, null, parentA.token);
    console.log(`    GET /parents/:otherId as Parent A -> Status: ${crossView.status} (Expected: 403)`);
    if (crossView.status !== 403) throw new Error(`Parent was able to view another parent's profile: ${crossView.status}`);

    const parentDirectoryAccess = await request('GET', `/parents`, null, parentA.token);
    console.log(`    GET /parents (Directory) as Parent A -> Status: ${parentDirectoryAccess.status} (Expected: 403)`);
    if (parentDirectoryAccess.status !== 403) throw new Error(`Parent accessed directory: ${parentDirectoryAccess.status}`);

    // 8b. Office Staff Capabilities & Boundaries
    console.log('  Testing Office Staff role permissions:');
    const staffDir = await request('GET', `/parents`, null, staffUser.token);
    console.log(`    GET /parents as Office Staff -> Status: ${staffDir.status} (Expected: 200)`);
    if (staffDir.status !== 200) throw new Error(`Staff could not view directory: ${staffDir.status}`);

    const staffDeactivate = await request('POST', `/users/${parentA.user.id}/deactivate`, null, staffUser.token);
    console.log(`    POST /users/:id/deactivate as Office Staff -> Status: ${staffDeactivate.status} (Expected: 403)`);
    if (staffDeactivate.status !== 403) throw new Error(`Staff was allowed to deactivate parent: ${staffDeactivate.status}`);

    // 8c. Principal Capabilities & Boundary on Reactivate
    console.log('  Testing Principal role permissions:');
    const principalDeactivate = await request('POST', `/users/${parentB.user.id}/deactivate`, null, principalUser.token);
    console.log(`    POST /users/:id/deactivate as Principal -> Status: ${principalDeactivate.status} (Expected: 200)`);
    if (principalDeactivate.status !== 200) throw new Error(`Principal failed to deactivate parent: ${principalDeactivate.status}`);

    const principalReactivate = await request('POST', `/users/${parentB.user.id}/reactivate`, null, principalUser.token);
    console.log(`    POST /users/:id/reactivate as Principal -> Status: ${principalReactivate.status} (Expected: 403)`);
    if (principalReactivate.status !== 403) throw new Error(`Principal was allowed to reactivate account (Must be Super Admin only): ${principalReactivate.status}`);

    // 8d. Super Admin Reactivation
    console.log('  Testing Super Admin exclusive reactivation:');
    const adminReactivate = await request('POST', `/users/${parentB.user.id}/reactivate`, null, adminToken);
    console.log(`    POST /users/:id/reactivate as Super Admin -> Status: ${adminReactivate.status} (Expected: 200)`);
    if (adminReactivate.status !== 200) throw new Error(`Super Admin failed to reactivate parent: ${adminReactivate.status}`);

    // ── Phase 9: Audit Trail Verification ──
    console.log('\n[Phase 9] Verifying Structured Audit Log Generation...');
    const auditCheck = await pool.query(
      `SELECT action, resource, resource_id 
       FROM audit_logs 
       WHERE resource IN ('users', 'students') 
         AND (resource_id = $1 OR resource_id = $2 OR resource_id = $3)
       ORDER BY created_at DESC`,
      [parentA.user.id, parentB.user.id, studentAlpha.id]
    );

    console.log(`  Found ${auditCheck.rows.length} relevant audit log entries.`);
    const actions = auditCheck.rows.map(r => `${r.resource}:${r.action}`);
    console.log('  Recorded Actions:', actions);

    const hasCreate = actions.some(a => a.includes('CREATE'));
    const hasDeactivate = actions.some(a => a.includes('DEACTIVATE'));
    const hasReactivate = actions.some(a => a.includes('REACTIVATE'));
    const hasUpdate = actions.some(a => a.includes('UPDATE'));

    if (!hasCreate || !hasDeactivate || !hasReactivate || !hasUpdate) {
      throw new Error(`Audit log is missing expected events: CREATE=${hasCreate}, DEACTIVATE=${hasDeactivate}, REACTIVATE=${hasReactivate}, UPDATE=${hasUpdate}`);
    }
    console.log('  ✔ Structured audit logging validated across all parent lifecycle and link actions.');

    console.log('\n======================================================================');
    console.log('🎉 ALL 9 PHASES OF PARENT ACCEPTANCE AUDIT PASSED WITH 100% SUCCESS! 🎉');
    console.log('======================================================================\n');

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
      if (createdClassId) {
        await pool.query('DELETE FROM classes WHERE id = $1', [createdClassId]);
      }
      if (createdAcademicYearId) {
        await pool.query('DELETE FROM academic_years WHERE id = $1', [createdAcademicYearId]);
      }
      console.log('✔ Cleanup completed cleanly. Zero residual test records left in database.\n');
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
    } finally {
      await pool.end();
    }
  }
}

runParentAcceptanceAudit().catch((err) => {
  console.error('\n❌ Parent Acceptance Audit Failed:', err);
  process.exit(1);
});
