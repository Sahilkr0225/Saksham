import http from 'http';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const BASE_URL = 'http://127.0.0.1:5000/api/v1';

const request = (
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; data: any }> => {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const parsedUrl = new URL(url);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const payload = body ? JSON.stringify(body) : '';
    if (body) headers['Content-Length'] = Buffer.byteLength(payload).toString();
    const req = http.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
      },
      (res) => {
        let rawData = '';
        res.on('data', (d) => (rawData += d));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode || 0,
              data: rawData ? JSON.parse(rawData) : null,
            });
          } catch (e) {
            reject(new Error(`Parse error (${res.statusCode}): ${rawData}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(payload);
    req.end();
  });
};

const SUPER_ADMIN = {
  email: 'admin@gmail.com',
  password: 'Saksham_developer@1234',
};

const TEST_PASSWORD = 'Password@1234';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    testsFailed++;
  }
}

async function runSecurityHardeningTests() {
  console.log('🔒 Starting Phase 1 Notices & Events Security Hardening Test Suite\n');

  // Track created entities for 100% clean teardown
  const createdUserIds: string[] = [];
  const createdNoticeIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdClassIds: string[] = [];
  let testYearId = '';

  try {
    // ─── Setup Roles & Helper ──────────────────────────────────────────────────
    const bcrypt = await import('bcryptjs');
    const pwdHash = await bcrypt.default.hash(TEST_PASSWORD, 10);

    const createUserWithRole = async (name: string, roleName: string) => {
      const email = `sec_${roleName}_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
      const uRes = await pool.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
        [name, email, pwdHash]
      );
      const uid = uRes.rows[0].id;
      createdUserIds.push(uid);

      const rRes = await pool.query(`SELECT id FROM roles WHERE name = $1`, [roleName]);
      if (rRes.rows.length === 0) throw new Error(`Role ${roleName} not found`);
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [uid, rRes.rows[0].id]
      );

      const loginRes = await request('POST', '/auth/login', { email, password: TEST_PASSWORD });
      const token = loginRes.data?.data?.accessToken || loginRes.data?.data?.access_token;
      if (!token) throw new Error(`Failed to login as ${roleName}: ${JSON.stringify(loginRes.data)}`);

      return { id: uid, email, token };
    };

    // 1. Authenticate Super Admin
    const adminLogin = await request('POST', '/auth/login', SUPER_ADMIN);
    const adminToken = adminLogin.data?.data?.accessToken || adminLogin.data?.data?.access_token;
    if (!adminToken) throw new Error('Could not login as Super Admin');

    // 2. Prepare Academic Year & 2 distinct Classes
    const ayRes = await pool.query(
      `INSERT INTO academic_years (name, start_date, end_date, is_current) 
       VALUES ('Sec Test Year', '2026-04-01', '2027-03-31', false) 
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    testYearId = ayRes.rows[0].id;

    const classARes = await pool.query(
      `INSERT INTO classes (name, code) VALUES ('Sec Class A', 'SCA_${Date.now()}') RETURNING id`
    );
    const classBRes = await pool.query(
      `INSERT INTO classes (name, code) VALUES ('Sec Class B', 'SCB_${Date.now()}') RETURNING id`
    );
    const classAId = classARes.rows[0].id;
    const classBId = classBRes.rows[0].id;
    createdClassIds.push(classAId, classBId);

    // 3. Create Teachers
    const teacherA = await createUserWithRole('Teacher Alice', 'teacher');
    const teacherB = await createUserWithRole('Teacher Bob', 'teacher');
    const officeStaff = await createUserWithRole('Staff Sam', 'office_staff');

    // 4. Create Student A in Class A
    const studentA = await createUserWithRole('Student Alpha', 'student');
    await pool.query(
      `INSERT INTO students (user_id, admission_number, dob, gender, current_class_id, status)
       VALUES ($1, $2, '2010-01-01', 'Female', $3, 'active')`,
      [studentA.id, `ADM-A-${Date.now()}`, classAId]
    );

    // 5. Create Parent A (guardian of Student A)
    const parentA = await createUserWithRole('Parent Alpha', 'parent');
    await pool.query(
      `UPDATE students SET parent_user_id = $1 WHERE user_id = $2`,
      [parentA.id, studentA.id]
    );

    // 6. Create Student B in Class B (unrelated to Class A or Parent A)
    const studentB = await createUserWithRole('Student Beta', 'student');
    await pool.query(
      `INSERT INTO students (user_id, admission_number, dob, gender, current_class_id, status)
       VALUES ($1, $2, '2010-05-05', 'Male', $3, 'active')`,
      [studentB.id, `ADM-B-${Date.now()}`, classBId]
    );

    console.log('✅ Test fixture setup complete.\n');

    // ═════════════════════════════════════════════════════════════════════════════
    // SECTION 1: PRIORITY & PINNING RESTRICTION
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('--- Testing Priority & Pinning Authorization ---');

    // 1. Teacher cannot set priority = 'high' on creation
    const teacherHighPrioCreate = await request(
      'POST',
      '/notices',
      {
        title: 'Teacher Illegal Pin',
        content: 'This should fail because teachers cannot set high priority.',
        type: 'general',
        priority: 'high',
        target_audience: 'all',
      },
      teacherA.token
    );
    assert(
      teacherHighPrioCreate.status === 403,
      'Teacher cannot set priority = high on creation',
      `Got status ${teacherHighPrioCreate.status}`
    );

    // 2. Office staff cannot set priority = 'high' on creation
    const staffHighPrioCreate = await request(
      'POST',
      '/notices',
      {
        title: 'Staff Illegal Pin',
        content: 'This should fail because office staff cannot set high priority.',
        type: 'general',
        priority: 'high',
        target_audience: 'all',
      },
      officeStaff.token
    );
    assert(
      staffHighPrioCreate.status === 403,
      'Office staff cannot set priority = high on creation',
      `Got status ${staffHighPrioCreate.status}`
    );

    // 3. Teacher can create notice with normal priority
    const teacherNormalNotice = await request(
      'POST',
      '/notices',
      {
        title: 'Teacher Alice Normal Notice',
        content: 'Valid content created by Teacher Alice.',
        type: 'academic',
        priority: 'normal',
        target_audience: 'all',
        published: true,
      },
      teacherA.token
    );
    assert(
      teacherNormalNotice.status === 201,
      'Teacher can create notice with normal priority',
      `Got status ${teacherNormalNotice.status}`
    );
    const noticeAliceId = teacherNormalNotice.data?.data?.notice?.id;
    if (noticeAliceId) createdNoticeIds.push(noticeAliceId);

    // 4. Teacher cannot escalate priority = 'high' via standard update
    const teacherUpdateHighPrio = await request(
      'PATCH',
      `/notices/${noticeAliceId}`,
      { priority: 'high' },
      teacherA.token
    );
    assert(
      teacherUpdateHighPrio.status === 403,
      'Teacher cannot set priority = high through updateNotice',
      `Got status ${teacherUpdateHighPrio.status}`
    );

    // 5. Super Admin / Principal CAN set priority = 'high' on creation & pin endpoint
    const adminHighNotice = await request(
      'POST',
      '/notices',
      {
        title: 'Admin High Priority Notice',
        content: 'Legitimate high priority notice created by admin.',
        type: 'urgent',
        priority: 'high',
        target_audience: 'all',
        published: true,
      },
      adminToken
    );
    assert(
      adminHighNotice.status === 201,
      'Super Admin can create notice with high priority',
      `Got status ${adminHighNotice.status}`
    );
    const adminNoticeId = adminHighNotice.data?.data?.notice?.id;
    if (adminNoticeId) createdNoticeIds.push(adminNoticeId);

    const pinToggle = await request(
      'PATCH',
      `/notices/${adminNoticeId}/pin`,
      { action: 'unpin' },
      adminToken
    );
    assert(
      pinToggle.status === 200,
      'Super Admin can toggle pin action via dedicated pin endpoint',
      `Got status ${pinToggle.status}`
    );

    // ═════════════════════════════════════════════════════════════════════════════
    // SECTION 2: NOTICE OWNERSHIP & MODIFICATION AUTHORIZATION
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('\n--- Testing Teacher Ownership Restrictions ---');

    // 1. Teacher Alice can edit her own notice
    const aliceEditOwn = await request(
      'PATCH',
      `/notices/${noticeAliceId}`,
      { title: 'Teacher Alice Updated Title' },
      teacherA.token
    );
    assert(
      aliceEditOwn.status === 200,
      'Teacher can edit their own notice',
      `Got status ${aliceEditOwn.status}`
    );

    // 2. Teacher Bob CANNOT edit Teacher Alice's notice
    const bobEditAlice = await request(
      'PATCH',
      `/notices/${noticeAliceId}`,
      { title: 'Hacked by Bob' },
      teacherB.token
    );
    assert(
      bobEditAlice.status === 403,
      'Teacher cannot edit another user\'s notice',
      `Got status ${bobEditAlice.status}`
    );

    // 3. Teacher Bob CANNOT delete Teacher Alice's notice
    const bobDeleteAlice = await request(
      'DELETE',
      `/notices/${noticeAliceId}`,
      null,
      teacherB.token
    );
    assert(
      bobDeleteAlice.status === 403,
      'Teacher cannot delete another user\'s notice',
      `Got status ${bobDeleteAlice.status}`
    );

    // 4. Admin CAN edit Teacher Alice's notice (administrative override preserved)
    const adminEditAlice = await request(
      'PATCH',
      `/notices/${noticeAliceId}`,
      { title: 'Admin Reviewed Alice Notice' },
      adminToken
    );
    assert(
      adminEditAlice.status === 200,
      'Super Admin preserves administrative permission to edit any notice',
      `Got status ${adminEditAlice.status}`
    );

    // ═════════════════════════════════════════════════════════════════════════════
    // SECTION 3: NOTICE DETAILS AUTHORIZATION (GET /notices/:id)
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('\n--- Testing Notice Details Authorization (GET /notices/:id) ---');

    // Create fixture notices:
    // Notice 1: Draft notice (unpublished)
    const draftRes = await request(
      'POST',
      '/notices',
      {
        title: 'Top Secret Exam Draft',
        content: 'Draft questions for final exams.',
        type: 'academic',
        target_audience: 'all',
        published: false,
      },
      adminToken
    );
    const draftNoticeId = draftRes.data?.data?.notice?.id;
    if (draftNoticeId) createdNoticeIds.push(draftNoticeId);

    // Notice 2: Teacher-only notice
    const teacherOnlyRes = await request(
      'POST',
      '/notices',
      {
        title: 'Staff Meeting Agenda',
        content: 'Teachers only meeting tomorrow.',
        type: 'general',
        target_audience: 'role',
        target_role: 'teacher',
        published: true,
      },
      adminToken
    );
    const teacherOnlyId = teacherOnlyRes.data?.data?.notice?.id;
    if (teacherOnlyId) createdNoticeIds.push(teacherOnlyId);

    // Notice 3: Class B targeted notice
    const classBNoticeRes = await request(
      'POST',
      '/notices',
      {
        title: 'Class B Field Trip',
        content: 'Field trip instructions exclusively for Class B.',
        type: 'event',
        target_audience: 'class',
        target_class_id: classBId,
        published: true,
      },
      adminToken
    );
    const classBNoticeId = classBNoticeRes.data?.data?.notice?.id;
    if (classBNoticeId) createdNoticeIds.push(classBNoticeId);

    // Notice 4: Class A targeted notice
    const classANoticeRes = await request(
      'POST',
      '/notices',
      {
        title: 'Class A Homework Announcement',
        content: 'Homework instructions for Class A.',
        type: 'academic',
        target_audience: 'class',
        target_class_id: classAId,
        published: true,
      },
      adminToken
    );
    const classANoticeId = classANoticeRes.data?.data?.notice?.id;
    if (classANoticeId) createdNoticeIds.push(classANoticeId);

    // Notice 5: Deleted notice
    const deletedNoticeRes = await request(
      'POST',
      '/notices',
      {
        title: 'Notice to be Deleted',
        content: 'Temporary notice.',
        target_audience: 'all',
        published: true,
      },
      adminToken
    );
    const delNoticeId = deletedNoticeRes.data?.data?.notice?.id;
    await request('DELETE', `/notices/${delNoticeId}`, null, adminToken);

    // TEST: Student A attempts to access draft notice -> MUST be 404
    const studentDraftCheck = await request('GET', `/notices/${draftNoticeId}`, null, studentA.token);
    assert(
      studentDraftCheck.status === 404,
      'Student cannot view an unpublished notice via GET /notices/:id',
      `Got status ${studentDraftCheck.status}`
    );

    // TEST: Staff CAN access draft notice
    const staffDraftCheck = await request('GET', `/notices/${draftNoticeId}`, null, teacherA.token);
    assert(
      staffDraftCheck.status === 200,
      'Staff can view an unpublished draft notice via GET /notices/:id',
      `Got status ${staffDraftCheck.status}`
    );

    // TEST: Student A attempts to access teacher-only notice -> MUST be 404
    const studentTeacherOnlyCheck = await request('GET', `/notices/${teacherOnlyId}`, null, studentA.token);
    assert(
      studentTeacherOnlyCheck.status === 404,
      'Student cannot view a teacher-only notice via GET /notices/:id',
      `Got status ${studentTeacherOnlyCheck.status}`
    );

    // TEST: Student A attempts to access Class B notice -> MUST be 404
    const studentClassBCheck = await request('GET', `/notices/${classBNoticeId}`, null, studentA.token);
    assert(
      studentClassBCheck.status === 404,
      'Student cannot view another class\'s notice via GET /notices/:id',
      `Got status ${studentClassBCheck.status}`
    );

    // TEST: Student A CAN access Class A notice -> MUST be 200
    const studentClassACheck = await request('GET', `/notices/${classANoticeId}`, null, studentA.token);
    assert(
      studentClassACheck.status === 200,
      'Student can view their own class notice via GET /notices/:id',
      `Got status ${studentClassACheck.status}`
    );

    // TEST: Parent A CAN access Class A notice (ward\'s class) -> MUST be 200
    const parentClassACheck = await request('GET', `/notices/${classANoticeId}`, null, parentA.token);
    assert(
      parentClassACheck.status === 200,
      'Parent can view notice targeted to their ward\'s class via GET /notices/:id',
      `Got status ${parentClassACheck.status}`
    );

    // TEST: Parent A CANNOT access Class B notice -> MUST be 404
    const parentClassBCheck = await request('GET', `/notices/${classBNoticeId}`, null, parentA.token);
    assert(
      parentClassBCheck.status === 404,
      'Parent cannot view unrelated class notice via GET /notices/:id',
      `Got status ${parentClassBCheck.status}`
    );

    // TEST: Student A can view school-wide notice -> MUST be 200
    const studentAllCheck = await request('GET', `/notices/${adminNoticeId}`, null, studentA.token);
    assert(
      studentAllCheck.status === 200,
      'Student can view school-wide published notice via GET /notices/:id',
      `Got status ${studentAllCheck.status}`
    );

    // TEST: Deleted notice returns 404 to everyone
    const delCheckStudent = await request('GET', `/notices/${delNoticeId}`, null, studentA.token);
    const delCheckAdmin = await request('GET', `/notices/${delNoticeId}`, null, adminToken);
    assert(
      delCheckStudent.status === 404 && delCheckAdmin.status === 404,
      'Deleted notice is completely inaccessible (404) to all users',
      `Student status: ${delCheckStudent.status}, Admin status: ${delCheckAdmin.status}`
    );

    // ═════════════════════════════════════════════════════════════════════════════
    // SECTION 4: CLASS-TARGETED EVENT VISIBILITY (GET /events)
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('\n--- Testing Class-Targeted Event Visibility ---');

    // Event 1: School-wide event
    const evtAllRes = await request(
      'POST',
      '/notices/events',
      {
        title: 'Independence Day Assembly',
        event_type: 'cultural',
        start_date: '2026-08-15',
        target_audience: 'all',
      },
      adminToken
    );
    const evtAllId = evtAllRes.data?.data?.event?.id;
    if (evtAllId) createdEventIds.push(evtAllId);

    // Event 2: Class A targeted event
    const evtClassARes = await request(
      'POST',
      '/notices/events',
      {
        title: 'Class A Math Workshop',
        event_type: 'other',
        start_date: '2026-09-10',
        target_audience: 'class',
        target_class_id: classAId,
      },
      adminToken
    );
    const evtClassAId = evtClassARes.data?.data?.event?.id;
    if (evtClassAId) createdEventIds.push(evtClassAId);

    // Event 3: Class B targeted event
    const evtClassBRes = await request(
      'POST',
      '/notices/events',
      {
        title: 'Class B Robotics Lab Session',
        event_type: 'other',
        start_date: '2026-09-12',
        target_audience: 'class',
        target_class_id: classBId,
      },
      adminToken
    );
    const evtClassBId = evtClassBRes.data?.data?.event?.id;
    if (evtClassBId) createdEventIds.push(evtClassBId);

    // 1. Student A queries GET /events without params
    const studentAEvents = await request('GET', '/notices/events', null, studentA.token);
    const sAEvtList: any[] = studentAEvents.data?.data?.events || [];
    assert(
      sAEvtList.some((e) => e.id === evtAllId),
      'Student A receives school-wide event'
    );
    assert(
      sAEvtList.some((e) => e.id === evtClassAId),
      'Student A receives Class A targeted event'
    );
    assert(
      !sAEvtList.some((e) => e.id === evtClassBId),
      'Student A does NOT receive Class B targeted event'
    );

    // 2. Student A tries bypass via ?target_class_id=<Class B ID>
    const studentABypassEvents = await request(
      'GET',
      `/notices/events?target_class_id=${classBId}`,
      null,
      studentA.token
    );
    const sABypassList: any[] = studentABypassEvents.data?.data?.events || [];
    assert(
      !sABypassList.some((e) => e.id === evtClassBId),
      'Student A cannot retrieve Class B event even when specifying ?target_class_id=<Class B>'
    );

    // 3. Parent A queries GET /events
    const parentAEvents = await request('GET', '/notices/events', null, parentA.token);
    const pAEvtList: any[] = parentAEvents.data?.data?.events || [];
    assert(
      pAEvtList.some((e) => e.id === evtClassAId),
      'Parent receives ward\'s Class A event'
    );
    assert(
      !pAEvtList.some((e) => e.id === evtClassBId),
      'Parent does NOT receive unrelated Class B event'
    );

    // 4. Staff queries GET /events (can see all classes)
    const staffEvents = await request('GET', '/notices/events', null, teacherA.token);
    const staffEvtList: any[] = staffEvents.data?.data?.events || [];
    assert(
      staffEvtList.some((e) => e.id === evtClassAId) && staffEvtList.some((e) => e.id === evtClassBId),
      'Staff can view all school and class-targeted events'
    );

    // 5. Individual event access via GET /events/:id
    const studentAGetClassAEvt = await request('GET', `/notices/events/${evtClassAId}`, null, studentA.token);
    assert(
      studentAGetClassAEvt.status === 200,
      'Student A can view Class A event by ID'
    );
    const studentAGetClassBEvt = await request('GET', `/notices/events/${evtClassBId}`, null, studentA.token);
    assert(
      studentAGetClassBEvt.status === 404,
      'Student A cannot view Class B event by ID (returns 404)'
    );

    console.log('\n═════════════════════════════════════════════════════════════════');
    console.log(`🎉 TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('═════════════════════════════════════════════════════════════════\n');

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ UNEXPECTED TEST ERROR:', error);
    process.exit(1);
  } finally {
    // ═════════════════════════════════════════════════════════════════════════════
    // CLEANUP ALL TEST ARTIFACTS
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('🧹 Cleaning up security test database records...');
    try {
      for (const eid of createdEventIds) {
        await pool.query('DELETE FROM events WHERE id = $1', [eid]);
      }
      for (const nid of createdNoticeIds) {
        await pool.query('DELETE FROM notices WHERE id = $1', [nid]);
      }
      for (const uid of createdUserIds) {
        await pool.query('DELETE FROM students WHERE user_id = $1 OR parent_user_id = $1', [uid]);
        await pool.query('DELETE FROM user_roles WHERE user_id = $1', [uid]);
        await pool.query('DELETE FROM users WHERE id = $1', [uid]);
      }
      for (const cid of createdClassIds) {
        await pool.query('DELETE FROM classes WHERE id = $1', [cid]);
      }
      if (testYearId) {
        await pool.query('DELETE FROM academic_years WHERE id = $1', [testYearId]);
      }
    } catch (cleanErr: any) {
      console.error('Error during cleanup:', cleanErr.message);
    } finally {
      await pool.end();
    }
  }
}

runSecurityHardeningTests();
