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

async function runRemediationRegressionSuite() {
  console.log('=== RUNNING ISOLATED STUDENT MANAGEMENT REMEDIATION TEST SUITE ===\n');

  // Track created fixtures for reliable cleanup
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdAdmissionIds: string[] = [];
  const createdSectionIds: string[] = [];
  let createdClassId: string | null = null;
  let createdAcademicYearId: string | null = null;

  try {
    // 1. Authenticate as Super Admin
    console.log('[1] Logging in as Super Admin...');
    const login = await request('POST', '/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234'
    });
    if (login.status !== 200 || !login.data?.data?.access_token) {
      throw new Error(`Admin login failed: status ${login.status}`);
    }
    const token = login.data.data.access_token;
    console.log('    Super Admin token received successfully.');

    // 2. Test Malformed UUID parameter validation (400) and nonexistent UUID (404)
    console.log('\n[2] Testing UUID parameter validation on all 4 student routes...');

    const malformedGet = await request('GET', '/students/not-a-valid-uuid', null, token);
    console.log(`    GET /students/not-a-valid-uuid -> Status: ${malformedGet.status} (Expected: 400)`);
    if (malformedGet.status !== 400) throw new Error('Malformed UUID on GET did not return 400');

    const malformedPut = await request('PUT', '/students/12345', { roll_number: '12' }, token);
    console.log(`    PUT /students/12345 -> Status: ${malformedPut.status} (Expected: 400)`);
    if (malformedPut.status !== 400) throw new Error('Malformed UUID on PUT did not return 400');

    const malformedStatus = await request('PATCH', '/students/abc-def-xyz/status', { status: 'suspended' }, token);
    console.log(`    PATCH /students/abc-def-xyz/status -> Status: ${malformedStatus.status} (Expected: 400)`);
    if (malformedStatus.status !== 400) throw new Error('Malformed UUID on PATCH status did not return 400');

    const malformedSection = await request('PATCH', '/students/invalid-uuid/section', { class_id: '00000000-0000-0000-0000-000000000000' }, token);
    console.log(`    PATCH /students/invalid-uuid/section -> Status: ${malformedSection.status} (Expected: 400)`);
    if (malformedSection.status !== 400) throw new Error('Malformed UUID on PATCH section did not return 400');

    const nonexistentGet = await request('GET', '/students/00000000-0000-0000-0000-000000000000', null, token);
    console.log(`    GET /students/00000000-0000-0000-0000-000000000000 -> Status: ${nonexistentGet.status} (Expected: 404)`);
    if (nonexistentGet.status !== 404) throw new Error('Nonexistent UUID on GET did not return 404');

    console.log('    >>> UUID validation tests PASSED! ✅');

    // 3. Create Isolated Test Fixtures
    console.log('\n[3] Setting up isolated test fixtures...');
    const now = Date.now();

    // Academic Year
    const ayRes = await request(
      'POST',
      '/academic/academic-years',
      { name: `AY-Remediation-${now}`, start_date: '2026-04-01', end_date: '2027-03-31', is_current: false },
      token
    );
    if (ayRes.status !== 201) throw new Error(`Failed to create academic year: ${JSON.stringify(ayRes.data)}`);
    createdAcademicYearId = ayRes.data.data.academic_year.id;

    // Class
    const clsRes = await request(
      'POST',
      '/academic/classes',
      { name: `Remediation-Class-${now}`, code: `RC-${String(now).slice(-4)}`, display_order: 99 },
      token
    );
    if (clsRes.status !== 201) throw new Error(`Failed to create class: ${JSON.stringify(clsRes.data)}`);
    createdClassId = clsRes.data.data.class.id;

    // Section 1: Capacity = 1 (for capacity tests)
    const sec1Res = await request(
      'POST',
      '/academic/sections',
      { class_id: createdClassId, name: `Sec-Cap1-${now}`, capacity: 1, room_number: 'R-C1' },
      token
    );
    if (sec1Res.status !== 201) throw new Error(`Failed to create section 1: ${JSON.stringify(sec1Res.data)}`);
    const section1Id = sec1Res.data.data.section.id;
    createdSectionIds.push(section1Id);

    // Section 2: Capacity = 5 (for roll number tests)
    const sec2Res = await request(
      'POST',
      '/academic/sections',
      { class_id: createdClassId, name: `Sec-Cap5-${now}`, capacity: 5, room_number: 'R-C5' },
      token
    );
    if (sec2Res.status !== 201) throw new Error(`Failed to create section 2: ${JSON.stringify(sec2Res.data)}`);
    const section2Id = sec2Res.data.data.section.id;
    createdSectionIds.push(section2Id);

    // Helper to create & enroll an isolated test student
    const enrollTestStudent = async (name: string, email: string) => {
      const admRes = await request(
        'POST',
        '/admissions',
        {
          applicant_name: name,
          dob: '2015-05-10',
          gender: 'female',
          applied_class_id: createdClassId,
          academic_year_id: createdAcademicYearId,
          parent_name: `Parent ${name}`,
          parent_email: email,
          parent_phone: '9876543210',
          address: 'Test Address'
        },
        token
      );
      if (admRes.status !== 201) throw new Error(`Failed to submit admission for ${name}`);
      const admId = admRes.data.data.admission.id;
      createdAdmissionIds.push(admId);

      const apprvRes = await request('PATCH', `/admissions/${admId}/status`, { status: 'approved' }, token);
      if (apprvRes.status !== 200) throw new Error(`Failed to approve admission for ${name}`);

      const enrollRes = await request(
        'POST',
        `/admissions/${admId}/enroll`,
        { blood_group: 'O+', emergency_contact: '9876543210' },
        token
      );
      if (enrollRes.status !== 201) throw new Error(`Failed to enroll ${name}`);
      const student = enrollRes.data.data.student;
      createdStudentIds.push(student.id);
      createdUserIds.push(student.user_id);
      return student;
    };

    console.log('    Creating Student A, Student B, and Student C...');
    const studentA = await enrollTestStudent('Student Alpha', `alpha-${now}@test.com`);
    const studentB = await enrollTestStudent('Student Beta', `beta-${now}@test.com`);
    const studentC = await enrollTestStudent('Student Gamma', `gamma-${now}@test.com`);
    console.log('    Test fixtures established.');

    // 4. Test Roll-Number Uniqueness
    console.log('\n[4] Testing Roll-Number Uniqueness...');

    // 4a. Assign R-01 to Student A in Section 2 -> Expect 200
    const assignA = await request(
      'PATCH',
      `/students/${studentA.id}/section`,
      { class_id: createdClassId, section_id: section2Id, roll_number: 'R-01' },
      token
    );
    console.log(`    Assign Student A to Section 2 with roll R-01 -> Status: ${assignA.status} (Expected: 200)`);
    if (assignA.status !== 200) throw new Error(`Expected 200 but got ${assignA.status}`);

    // 4b. Assign duplicate roll R-01 to Student B in same Section 2 -> Expect 409
    const assignBDup = await request(
      'PATCH',
      `/students/${studentB.id}/section`,
      { class_id: createdClassId, section_id: section2Id, roll_number: 'R-01' },
      token
    );
    console.log(`    Assign Student B to Section 2 with duplicate roll R-01 -> Status: ${assignBDup.status} (Expected: 409)`);
    console.log(`    Conflict Message: "${assignBDup.data?.message}"`);
    if (assignBDup.status !== 409) throw new Error(`Expected 409 for duplicate roll number, got ${assignBDup.status}`);

    // 4c. Cross-section reuse: Assign roll R-01 to Student C in Section 1 -> Expect 200
    const assignCCross = await request(
      'PATCH',
      `/students/${studentC.id}/section`,
      { class_id: createdClassId, section_id: section1Id, roll_number: 'R-01' },
      token
    );
    console.log(`    Cross-section roll reuse: Assign Student C to Section 1 with roll R-01 -> Status: ${assignCCross.status} (Expected: 200)`);
    if (assignCCross.status !== 200) throw new Error(`Expected 200 for cross-section reuse, got ${assignCCross.status}`);

    // 4d. Update roll number via PUT /students/:id
    const updateADup = await request(
      'PUT',
      `/students/${studentB.id}`,
      { roll_number: 'R-01' },
      token
    );
    // Note: Student B is not yet in Section 2, so assign Student B to Section 2 with roll R-02 first
    const assignBOk = await request(
      'PATCH',
      `/students/${studentB.id}/section`,
      { class_id: createdClassId, section_id: section2Id, roll_number: 'R-02' },
      token
    );
    if (assignBOk.status !== 200) throw new Error('Assign Student B to R-02 failed');

    // Now try to update Student B's roll number to R-01 in Section 2 via PUT /students/:id -> Expect 409
    const updateBCollision = await request(
      'PUT',
      `/students/${studentB.id}`,
      { roll_number: 'R-01' },
      token
    );
    console.log(`    Update Student B to R-01 via PUT (colliding with Student A in Section 2) -> Status: ${updateBCollision.status} (Expected: 409)`);
    if (updateBCollision.status !== 409) throw new Error(`Expected 409 on PUT roll conflict, got ${updateBCollision.status}`);

    // 4e. NULL roll number allowed without conflict
    const assignNullRoll = await request(
      'PATCH',
      `/students/${studentB.id}/section`,
      { class_id: createdClassId, section_id: section2Id, roll_number: null },
      token
    );
    console.log(`    Assign NULL roll number to Student B in Section 2 -> Status: ${assignNullRoll.status} (Expected: 200)`);
    if (assignNullRoll.status !== 200) throw new Error('Assigning NULL roll number failed');

    console.log('    >>> Roll-number uniqueness tests PASSED! ✅');

    // 5. Test Section Capacity Enforcement
    console.log('\n[5] Testing Section Capacity Enforcement...');
    // Section 1 has capacity = 1. Student C is currently in Section 1 (count = 1).
    // Attempting to assign Student A to Section 1 must return 409 Conflict!
    const assignOverCap = await request(
      'PATCH',
      `/students/${studentA.id}/section`,
      { class_id: createdClassId, section_id: section1Id, roll_number: 'R-99' },
      token
    );
    console.log(`    Assign Student A to full Section 1 (Capacity 1/1) -> Status: ${assignOverCap.status} (Expected: 409)`);
    console.log(`    Capacity Error Message: "${assignOverCap.data?.message}"`);
    if (assignOverCap.status !== 409) throw new Error(`Expected 409 for full section, got ${assignOverCap.status}`);

    // Test Admissions enrollment path capacity enforcement
    console.log('    Testing Admissions enrollment path with full section...');
    const admOverRes = await request(
      'POST',
      '/admissions',
      {
        applicant_name: 'Over Capacity Applicant',
        dob: '2015-01-01',
        gender: 'male',
        applied_class_id: createdClassId,
        academic_year_id: createdAcademicYearId,
        parent_name: 'Parent OverCap',
        parent_email: `overcap-${now}@test.com`,
        parent_phone: '9876543210'
      },
      token
    );
    const admOverId = admOverRes.data.data.admission.id;
    createdAdmissionIds.push(admOverId);
    await request('PATCH', `/admissions/${admOverId}/status`, { status: 'approved' }, token);

    const enrollOverRes = await request(
      'POST',
      `/admissions/${admOverId}/enroll`,
      { current_section_id: section1Id, roll_number: 'R-50' },
      token
    );
    console.log(`    Enroll applicant into full Section 1 -> Status: ${enrollOverRes.status} (Expected: 409)`);
    if (enrollOverRes.status !== 409) throw new Error(`Expected 409 on enrollment into full section, got ${enrollOverRes.status}`);

    console.log('    >>> Section capacity tests PASSED! ✅');

    // 6. Test Concurrency Race Condition Protection
    console.log('\n[6] Testing Concurrency Race Condition Protection (2 simultaneous assignments for 1 remaining seat)...');
    // Create Section Race with capacity = 1
    const secRaceRes = await request(
      'POST',
      '/academic/sections',
      { class_id: createdClassId, name: `Sec-Race-${now}`, capacity: 1, room_number: 'R-RACE' },
      token
    );
    const raceSectionId = secRaceRes.data.data.section.id;
    createdSectionIds.push(raceSectionId);

    const studentX = await enrollTestStudent('Student X', `x-${now}@test.com`);
    const studentY = await enrollTestStudent('Student Y', `y-${now}@test.com`);

    // Fire 2 simultaneous section assignment requests to raceSectionId
    const [resX, resY] = await Promise.all([
      request('PATCH', `/students/${studentX.id}/section`, { class_id: createdClassId, section_id: raceSectionId, roll_number: 'R-X' }, token),
      request('PATCH', `/students/${studentY.id}/section`, { class_id: createdClassId, section_id: raceSectionId, roll_number: 'R-Y' }, token)
    ]);

    console.log(`    Concurrent Request 1 Status: ${resX.status}, Message: ${resX.data?.message}`);
    console.log(`    Concurrent Request 2 Status: ${resY.status}, Message: ${resY.data?.message}`);

    const statuses = [resX.status, resY.status].sort();
    if (statuses[0] === 200 && statuses[1] === 409) {
      console.log('    >>> Concurrency race condition correctly handled: exactly 1 succeeded (200) and 1 rejected (409)! ✅');
    } else {
      throw new Error(`Concurrency race condition failed: statuses were ${statuses.join(', ')}`);
    }

    console.log('\n============================================================');
    console.log('🎉 ALL REMEDIATION & REGRESSION SUITE TESTS PASSED 100%! 🎉');
    console.log('============================================================\n');
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
        await pool.query('DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])', [createdUserIds]);
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
      }
      if (createdSectionIds.length > 0) {
        await pool.query('DELETE FROM sections WHERE id = ANY($1::uuid[])', [createdSectionIds]);
      }
      if (createdClassId) {
        await pool.query('DELETE FROM classes WHERE id = $1', [createdClassId]);
      }
      if (createdAcademicYearId) {
        await pool.query('DELETE FROM academic_years WHERE id = $1', [createdAcademicYearId]);
      }
      console.log('Cleanup completed successfully. Database restored to clean state.\n');
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
    } finally {
      await pool.end();
    }
  }
}

runRemediationRegressionSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
