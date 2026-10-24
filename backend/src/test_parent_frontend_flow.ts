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
  token?: string | null
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

async function runParentFrontendFlowTest() {
  console.log('=== RUNNING PARENT MANAGEMENT FRONTEND CONTRACT & WORKFLOW VERIFICATION ===\n');

  const timestamp = Date.now();
  let createdParentUserId: string | null = null;
  let tempPassword = '';
  let testStudentId: string | null = null;
  let testStudentUserId: string | null = null;
  let principalUserId: string | null = null;
  let officeStaffUserId: string | null = null;

  try {
    // 1. Authenticate as Super Admin
    console.log('[1] Authenticating as Super Admin...');
    const login = await request('POST', '/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234'
    });
    if (login.status !== 200 || !login.data?.data?.access_token) {
      throw new Error(`Admin login failed: status ${login.status}`);
    }
    const adminToken = login.data.data.access_token;
    console.log('    ✓ Super Admin authenticated.');

    // 2. Test Parent Directory Listing & Pagination (Phase 1)
    console.log('\n[2] Testing Parent Directory Listing & Search Filtering...');
    const listRes = await request('GET', '/parents?page=1&limit=5', null, adminToken);
    if (listRes.status !== 200 || !Array.isArray(listRes.data?.data?.parents)) {
      throw new Error(`GET /parents failed: ${JSON.stringify(listRes.data)}`);
    }
    console.log(`    ✓ GET /parents succeeded. Total: ${listRes.data.data.pagination.total}, Page items: ${listRes.data.data.parents.length}`);

    // Search filter test
    const searchRes = await request('GET', '/parents?search=nonexistentparentxyz123', null, adminToken);
    if (searchRes.status !== 200 || searchRes.data?.data?.parents?.length !== 0) {
      throw new Error(`Search filter failed: expected 0 results for non-existent parent`);
    }
    console.log('    ✓ Search query filtering verified.');

    // 3. Test Parent Onboarding via POST /users (role=parent)
    console.log('\n[3] Testing Parent Onboarding (POST /users with role=parent)...');
    const parentEmail = `test_parent_${timestamp}@sakshamschool.edu.in`;
    const onboardRes = await request('POST', '/users', {
      name: `Mr. Alok Sharma ${timestamp}`,
      email: parentEmail,
      phone: '+91 98765 88990',
      role: 'parent'
    }, adminToken);

    if (onboardRes.status !== 201 || !onboardRes.data?.data?.user?.id || !onboardRes.data?.data?.temporary_password) {
      throw new Error(`Parent onboarding failed: ${JSON.stringify(onboardRes.data)}`);
    }
    createdParentUserId = onboardRes.data.data.user.id;
    tempPassword = onboardRes.data.data.temporary_password;
    console.log(`    ✓ Parent account created. ID: ${createdParentUserId}`);
    console.log(`    ✓ Temporary password generated for one-time reveal: [CONFIDENTIAL]`);

    // 4. Test Parent Profile Details Retrieval (GET /parents/:id)
    console.log('\n[4] Testing Parent Detail Retrieval (GET /parents/:id)...');
    const detailRes = await request('GET', `/parents/${createdParentUserId}`, null, adminToken);
    if (detailRes.status !== 200 || detailRes.data?.data?.email !== parentEmail) {
      throw new Error(`GET /parents/:id failed: ${JSON.stringify(detailRes.data)}`);
    }
    console.log(`    ✓ Parent details fetched. Name: ${detailRes.data.data.name}, Children: ${detailRes.data.data.children?.length || 0}`);

    // 5. Test Parent Identity Update (PATCH /users/:id)
    console.log('\n[5] Testing Parent Identity Update (PATCH /users/:id)...');
    const updateRes = await request('PATCH', `/users/${createdParentUserId}`, {
      name: `Mr. Alok Kumar Sharma ${timestamp}`,
      phone: '+91 99999 11111'
    }, adminToken);
    if (updateRes.status !== 200 || updateRes.data?.data?.user?.name !== `Mr. Alok Kumar Sharma ${timestamp}`) {
      throw new Error(`PATCH /users/:id failed: ${JSON.stringify(updateRes.data)}`);
    }
    console.log('    ✓ Parent identity updated successfully.');

    // 6. Create a transient test student fixture to test Link & Unlink workflows
    console.log('\n[6] Preparing test student fixture for ward linkage testing...');
    const stuEmail = `test_ward_${timestamp}@sakshamschool.edu.in`;
    const stuUserRes = await request('POST', '/users', {
      name: `Aarav Sharma ${timestamp}`,
      email: stuEmail,
      role: 'student'
    }, adminToken);
    if (stuUserRes.status !== 201 || !stuUserRes.data?.data?.user?.id) {
      throw new Error(`Failed to create student user fixture: ${JSON.stringify(stuUserRes.data)}`);
    }
    testStudentUserId = stuUserRes.data.data.user.id;

    // Insert student row into students table
    const stuInsert = await pool.query(
      `INSERT INTO students (user_id, admission_number, dob, gender, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id`,
      [testStudentUserId, `ADM-${timestamp.toString().slice(-6)}`, '2014-05-10', 'male']
    );
    testStudentId = stuInsert.rows[0].id;
    console.log(`    ✓ Test student fixture spawned. Student ID: ${testStudentId}`);

    // 7. Test Linking Student to Parent (POST /parents/:id/link-student)
    console.log('\n[7] Testing Linking Student Ward (POST /parents/:id/link-student)...');
    const linkRes = await request('POST', `/parents/${createdParentUserId}/link-student`, {
      student_id: testStudentId
    }, adminToken);
    if (linkRes.status !== 200 || linkRes.data?.data?.student_id !== testStudentId) {
      throw new Error(`Link student failed: ${JSON.stringify(linkRes.data)}`);
    }
    console.log('    ✓ Student successfully linked to parent.');

    // Verify student is returned in parent profile
    const verifyLinkRes = await request('GET', `/parents/${createdParentUserId}`, null, adminToken);
    if (verifyLinkRes.status !== 200 || !verifyLinkRes.data?.data?.children?.some((c: any) => c.student_id === testStudentId)) {
      throw new Error(`Student link verification failed: child not present in children array`);
    }
    console.log(`    ✓ Verified: Child appears in parent's children array (${verifyLinkRes.data.data.children.length} ward linked).`);

    // 8. Test Parent Authentication & Self Children Retrieval (GET /parents/me/children)
    console.log('\n[8] Testing Parent Login & Self Children View (/parents/me/children)...');
    const parentLogin = await request('POST', '/auth/login', {
      email: parentEmail,
      password: tempPassword
    });
    if (parentLogin.status !== 200 || !parentLogin.data?.data?.access_token) {
      throw new Error(`Parent login failed: ${JSON.stringify(parentLogin.data)}`);
    }
    const parentToken = parentLogin.data.data.access_token;
    console.log('    ✓ Parent successfully logged in with temporary credentials.');

    const myChildrenRes = await request('GET', '/parents/me/children', null, parentToken);
    if (myChildrenRes.status !== 200 || !Array.isArray(myChildrenRes.data?.data) || myChildrenRes.data.data.length !== 1) {
      throw new Error(`GET /parents/me/children failed: ${JSON.stringify(myChildrenRes.data)}`);
    }
    console.log(`    ✓ GET /parents/me/children returned linked ward: ${myChildrenRes.data.data[0].name}`);

    // 9. Test RBAC Cross-Parent Boundary Security
    console.log('\n[9] Testing Cross-Parent Access Boundary Protection...');
    const fakeOtherParentId = '00000000-0000-0000-0000-000000000000';
    const crossRes = await request('GET', `/parents/${fakeOtherParentId}`, null, parentToken);
    if (crossRes.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for cross-parent lookup, got ${crossRes.status}`);
    }
    console.log('    ✓ Cross-parent profile access blocked with HTTP 403 Forbidden.');

    // 10. Test Unlinking Student (POST /parents/:id/unlink-student)
    console.log('\n[10] Testing Unlinking Student Ward (POST /parents/:id/unlink-student)...');
    const unlinkRes = await request('POST', `/parents/${createdParentUserId}/unlink-student`, {
      student_id: testStudentId
    }, adminToken);
    if (unlinkRes.status !== 200) {
      throw new Error(`Unlink student failed: ${JSON.stringify(unlinkRes.data)}`);
    }
    console.log('    ✓ Student unlinked from parent.');

    const verifyUnlinkRes = await request('GET', `/parents/${createdParentUserId}`, null, adminToken);
    if (verifyUnlinkRes.data?.data?.children?.length !== 0) {
      throw new Error(`Student unlink verification failed: children array should be empty`);
    }
    console.log('    ✓ Verified: Children array is now empty (0 wards).');

    // 11. Test Status Toggling (Deactivate & Reactivate) with Role Guards
    console.log('\n[11] Testing Status Toggling Permissions (Deactivate / Reactivate)...');

    // Parent cannot deactivate/reactivate
    const pDeact = await request('POST', `/users/${createdParentUserId}/deactivate`, {}, parentToken);
    if (pDeact.status !== 403) throw new Error(`Expected 403 for parent deactivate, got ${pDeact.status}`);
    const pReact = await request('POST', `/users/${createdParentUserId}/reactivate`, {}, parentToken);
    if (pReact.status !== 403) throw new Error(`Expected 403 for parent reactivate, got ${pReact.status}`);
    console.log('    ✓ Parent role strictly blocked from status mutation (403 Forbidden).');

    // Provision transient principal & office staff to test role boundaries
    const pEmail = `test_p_parent_mod_${timestamp}@sakshamschool.edu.in`;
    const osEmail = `test_os_parent_mod_${timestamp}@sakshamschool.edu.in`;

    const pUser = await request('POST', '/users', { name: 'Principal User', email: pEmail, role: 'principal' }, adminToken);
    principalUserId = pUser.data?.data?.user?.id;
    const pPw = pUser.data?.data?.temporary_password;

    const osUser = await request('POST', '/users', { name: 'Staff User', email: osEmail, role: 'office_staff' }, adminToken);
    officeStaffUserId = osUser.data?.data?.user?.id;
    const osPw = osUser.data?.data?.temporary_password;

    const pLogin = await request('POST', '/auth/login', { email: pEmail, password: pPw });
    const principalToken = pLogin.data?.data?.access_token;

    const osLogin = await request('POST', '/auth/login', { email: osEmail, password: osPw });
    const officeStaffToken = osLogin.data?.data?.access_token;

    // Office staff blocked from deactivate/reactivate
    const osDeact = await request('POST', `/users/${createdParentUserId}/deactivate`, {}, officeStaffToken);
    if (osDeact.status !== 403) throw new Error(`Expected 403 for office staff deactivate, got ${osDeact.status}`);
    console.log('    ✓ Office Staff blocked from deactivation (403 Forbidden).');

    // Principal allowed to deactivate
    const princDeact = await request('POST', `/users/${createdParentUserId}/deactivate`, {}, principalToken);
    if (princDeact.status !== 200) throw new Error(`Expected 200 for principal deactivate, got ${princDeact.status}`);
    console.log('    ✓ Principal authorized to deactivate parent account (200 OK).');

    // Principal blocked from reactivate (Super Admin only!)
    const princReact = await request('POST', `/users/${createdParentUserId}/reactivate`, {}, principalToken);
    if (princReact.status !== 403) throw new Error(`Expected 403 for principal reactivate, got ${princReact.status}`);
    console.log('    ✓ Principal blocked from reactivation (403 Forbidden - Super Admin only).');

    // Super Admin reactivates
    const adminReact = await request('POST', `/users/${createdParentUserId}/reactivate`, {}, adminToken);
    if (adminReact.status !== 200) throw new Error(`Expected 200 for Super Admin reactivate, got ${adminReact.status}`);
    console.log('    ✓ Super Admin successfully reactivated parent account (200 OK).');

    console.log('\n=== ALL PARENT FRONTEND WORKFLOWS AND CONTRACTS PASSED 100%! ===\n');
  } finally {
    // Clean up created fixtures safely
    const usersToClean = [createdParentUserId, testStudentUserId, principalUserId, officeStaffUserId].filter(Boolean);
    for (const uid of usersToClean) {
      if (testStudentId) {
        await pool.query('DELETE FROM students WHERE id = $1', [testStudentId]);
      }
      await pool.query('DELETE FROM user_roles WHERE user_id = $1', [uid]);
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [uid]);
      await pool.query('DELETE FROM audit_logs WHERE user_id = $1 OR resource_id = $1::text', [uid]);
      await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    }
    console.log('[Cleanup] All transient test fixtures removed cleanly.');
    await pool.end();
  }
}

runParentFrontendFlowTest().catch((err) => {
  console.error('\n❌ PARENT TEST RUN FAILED:', err);
  pool.end();
  process.exit(1);
});
