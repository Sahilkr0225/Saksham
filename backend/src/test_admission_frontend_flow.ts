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

async function runAdmissionFrontendFlowTest() {
  console.log('=== RUNNING ADMISSIONS FRONTEND CONTRACT & FLOW VERIFICATION ===\n');

  // Track created fixtures for reliable cleanup
  const createdAdmissionIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];
  let createdClassId: string | null = null;
  let createdSectionId: string | null = null;
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

    // 2. Test Dropdowns (Classes & Academic Years)
    console.log('\n[2] Verifying Dropdowns for Form Population...');
    const classesRes = await request('GET', '/academic/classes', null, token);
    console.log(`    GET /academic/classes -> Status: ${classesRes.status}`);
    if (classesRes.status !== 200 || !Array.isArray(classesRes.data?.data?.classes)) {
      throw new Error('Failed to fetch academic classes');
    }

    const yearsRes = await request('GET', '/academic/academic-years', null, token);
    console.log(`    GET /academic/academic-years -> Status: ${yearsRes.status}`);
    if (yearsRes.status !== 200 || !Array.isArray(yearsRes.data?.data?.academic_years)) {
      throw new Error('Failed to fetch academic years');
    }

    // 3. Setup Dedicated Isolated Fixtures
    console.log('\n[3] Setting up test class, section, and academic year...');
    const now = Date.now();
    const ayRes = await request(
      'POST',
      '/academic/academic-years',
      { name: `AY-AdmTest-${now}`, start_date: '2026-04-01', end_date: '2027-03-31', is_current: false },
      token
    );
    if (ayRes.status !== 201) throw new Error('Failed to create test academic year');
    createdAcademicYearId = ayRes.data.data.academic_year.id;

    const clsRes = await request(
      'POST',
      '/academic/classes',
      { name: `Adm-Class-${now}`, code: `AC-${String(now).slice(-4)}`, display_order: 95 },
      token
    );
    if (clsRes.status !== 201) throw new Error('Failed to create test class');
    createdClassId = clsRes.data.data.class.id;

    const secRes = await request(
      'POST',
      '/academic/sections',
      { class_id: createdClassId, name: 'A', capacity: 2, room_number: 'Room-A' },
      token
    );
    if (secRes.status !== 201) throw new Error('Failed to create test section');
    createdSectionId = secRes.data.data.section.id;

    // 4. Test Directory Listing with Filters & Pagination
    console.log('\n[4] Testing Directory Listing with filters...');
    const dirRes = await request('GET', '/admissions?page=1&limit=5', null, token);
    console.log(`    GET /admissions?page=1&limit=5 -> Status: ${dirRes.status}`);
    if (dirRes.status !== 200 || !Array.isArray(dirRes.data?.data?.admissions)) {
      throw new Error('Directory listing failed');
    }
    const pagination = dirRes.data.data.pagination;
    console.log(`    Pagination metadata verified: total=${pagination.total}, pages=${pagination.total_pages}`);

    // 5. Test Application Creation via POST /admissions
    console.log('\n[5] Submitting New Admission Application (POST /admissions)...');
    const parentEmail = `parent-${now}@testportal.com`;
    const createRes = await request(
      'POST',
      '/admissions',
      {
        applicant_name: 'Pooja Verma',
        dob: '2015-09-12',
        gender: 'female',
        applied_class_id: createdClassId,
        academic_year_id: createdAcademicYearId,
        parent_name: 'Suresh Verma',
        parent_email: parentEmail,
        parent_phone: '9876543210',
        address: 'Sector 62, Noida, UP',
        remarks: 'Sports quota consideration'
      },
      token
    );
    console.log(`    POST /admissions -> Status: ${createRes.status}`);
    if (createRes.status !== 201 || !createRes.data?.data?.admission?.id) {
      throw new Error(`Application creation failed: ${JSON.stringify(createRes.data)}`);
    }
    const admission = createRes.data.data.admission;
    createdAdmissionIds.push(admission.id);
    console.log(`    Application Created: ID=${admission.id}, Number=${admission.application_number}, Status=${admission.status}`);

    // Verify application number format APP-<YEAR>-<SEQ>
    if (!/^APP-\d{4}-\d{5}$/.test(admission.application_number)) {
      throw new Error(`Unexpected application number format: ${admission.application_number}`);
    }

    // 6. Test Fetch Single Application Details via GET /admissions/:id
    console.log('\n[6] Fetching Application Details (GET /admissions/:id)...');
    const getSingleRes = await request('GET', `/admissions/${admission.id}`, null, token);
    console.log(`    GET /admissions/${admission.id} -> Status: ${getSingleRes.status}`);
    if (getSingleRes.status !== 200) throw new Error('Failed to fetch single admission');
    const fetchedAdm = getSingleRes.data.data.admission;
    console.log(`    Joined Class: "${fetchedAdm.class_name}", Year: "${fetchedAdm.academic_year_name}"`);
    if (!fetchedAdm.class_name || !fetchedAdm.academic_year_name) {
      throw new Error('Joined class_name or academic_year_name missing from detail response');
    }

    // 7. Test Status Workflow Transitions
    console.log('\n[7] Testing Status Transitions...');

    // 7a. Transition to 'under_review'
    const reviewRes = await request(
      'PATCH',
      `/admissions/${admission.id}/status`,
      { status: 'under_review', remarks: 'Documents under verification by office staff' },
      token
    );
    console.log(`    PATCH status='under_review' -> Status: ${reviewRes.status}`);
    if (reviewRes.status !== 200 || reviewRes.data?.data?.admission?.status !== 'under_review') {
      throw new Error('Failed to transition to under_review');
    }

    // 7b. Guard Check: Attempting to directly set status to 'enrolled' via status endpoint must return 400
    const directEnrollRes = await request(
      'PATCH',
      `/admissions/${admission.id}/status`,
      { status: 'enrolled' },
      token
    );
    console.log(`    PATCH status='enrolled' (direct guard check) -> Status: ${directEnrollRes.status} (Expected: 400)`);
    if (directEnrollRes.status !== 400) {
      throw new Error('Backend failed to guard against direct status update to enrolled');
    }

    // 7c. Transition to 'approved'
    const approveRes = await request(
      'PATCH',
      `/admissions/${admission.id}/status`,
      { status: 'approved', remarks: 'Eligibility verified and approved for enrollment' },
      token
    );
    console.log(`    PATCH status='approved' -> Status: ${approveRes.status}`);
    if (approveRes.status !== 200 || approveRes.data?.data?.admission?.status !== 'approved') {
      throw new Error('Failed to transition to approved');
    }

    // 8. Test Student Enrollment & One-Time Credentials
    console.log('\n[8] Enrolling Student & Capturing Credentials (POST /admissions/:id/enroll)...');
    const enrollRes = await request(
      'POST',
      `/admissions/${admission.id}/enroll`,
      {
        current_section_id: createdSectionId,
        roll_number: 'PV-01',
        blood_group: 'B+',
        emergency_contact: '9876543210'
      },
      token
    );
    console.log(`    POST /admissions/${admission.id}/enroll -> Status: ${enrollRes.status}`);
    if (enrollRes.status !== 201) {
      throw new Error(`Enrollment failed: ${JSON.stringify(enrollRes.data)}`);
    }

    const enrollData = enrollRes.data.data;
    console.log('    Enrollment Response Verified:');
    console.log(`    - Admission Number: ${enrollData.admission_number}`);
    console.log(`    - Login User Email: ${enrollData.user_email}`);
    console.log(`    - Temporary Password: ${enrollData.temporary_password}`);
    console.log(`    - Student Record ID: ${enrollData.student?.id}`);

    if (!enrollData.temporary_password || !enrollData.admission_number || !enrollData.student?.id) {
      throw new Error('Expected credentials payload missing required temporary credentials');
    }
    createdStudentIds.push(enrollData.student.id);
    createdUserIds.push(enrollData.student.user_id);

    // 9. Guard Check: Application must now be locked as 'enrolled'
    console.log('\n[9] Verifying Post-Enrollment Guards...');
    const lockedRes = await request(
      'PATCH',
      `/admissions/${admission.id}/status`,
      { status: 'rejected' },
      token
    );
    console.log(`    PATCH status on enrolled application -> Status: ${lockedRes.status} (Expected: 400)`);
    if (lockedRes.status !== 400) {
      throw new Error('Enrolled application was not locked against modification');
    }

    console.log('\n============================================================');
    console.log('🎉 ALL ADMISSION MANAGEMENT FRONTEND CONTRACT TESTS PASSED! 🎉');
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
      if (createdSectionId) {
        await pool.query('DELETE FROM sections WHERE id = $1', [createdSectionId]);
      }
      if (createdClassId) {
        await pool.query('DELETE FROM classes WHERE id = $1', [createdClassId]);
      }
      if (createdAcademicYearId) {
        await pool.query('DELETE FROM academic_years WHERE id = $1', [createdAcademicYearId]);
      }
      console.log('Cleanup completed successfully. Database clean.\n');
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
    } finally {
      await pool.end();
    }
  }
}

runAdmissionFrontendFlowTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
