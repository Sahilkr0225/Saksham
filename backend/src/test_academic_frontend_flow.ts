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

async function runAcademicFrontendFlowTest() {
  console.log('=== RUNNING ACADEMIC STRUCTURE FRONTEND CONTRACTS & FLOW VERIFICATION ===\n');

  const timestamp = Date.now();
  let createdYearId: string | null = null;
  let createdClassId: string | null = null;
  let createdSectionId: string | null = null;
  let createdSubjectId: string | null = null;
  let createdAllocationId: string | null = null;

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
    const token = login.data.data.access_token;
    console.log('    ✓ Super Admin authenticated.');

    // 2. Academic Years Contract
    console.log('\n[2] Testing Academic Years (GET & POST)...');
    const getYearsRes = await request('GET', '/academic/academic-years', null, token);
    if (getYearsRes.status !== 200 || !Array.isArray(getYearsRes.data?.data?.academic_years)) {
      throw new Error(`GET /academic/academic-years failed: ${JSON.stringify(getYearsRes.data)}`);
    }
    console.log(`    ✓ GET /academic/academic-years succeeded. Found ${getYearsRes.data.data.academic_years.length} sessions.`);

    // Find previous active year to restore later
    const initialActiveYear = getYearsRes.data.data.academic_years.find((y: any) => y.is_current);

    const postYearRes = await request('POST', '/academic/academic-years', {
      name: `AY-TEST-${timestamp}`,
      start_date: '2026-04-01',
      end_date: '2027-03-31',
      is_current: false
    }, token);

    if (postYearRes.status !== 201 || !postYearRes.data?.data?.academic_year?.id) {
      throw new Error(`POST /academic/academic-years failed: ${JSON.stringify(postYearRes.data)}`);
    }
    createdYearId = postYearRes.data.data.academic_year.id;
    console.log(`    ✓ POST /academic/academic-years succeeded. Created ID: ${createdYearId}`);

    // Test Set-Current
    console.log('\n[3] Testing Setting Academic Year as Current (POST /:id/set-current)...');
    const setCurrentRes = await request('POST', `/academic/academic-years/${createdYearId}/set-current`, {}, token);
    if (setCurrentRes.status !== 200 || !setCurrentRes.data?.data?.academic_year?.is_current) {
      throw new Error(`POST set-current failed: ${JSON.stringify(setCurrentRes.data)}`);
    }
    console.log('    ✓ Session successfully marked as active.');

    // Restore previous active year if existed
    if (initialActiveYear) {
      await request('POST', `/academic/academic-years/${initialActiveYear.id}/set-current`, {}, token);
      console.log(`    ✓ Restored initial active session (${initialActiveYear.name}).`);
    }

    // 4. Classes & Sections Contract
    console.log('\n[4] Testing Classes & Sections (GET & POST)...');
    const getClassesRes = await request('GET', '/academic/classes', null, token);
    if (getClassesRes.status !== 200 || !Array.isArray(getClassesRes.data?.data?.classes)) {
      throw new Error(`GET /academic/classes failed: ${JSON.stringify(getClassesRes.data)}`);
    }
    console.log(`    ✓ GET /academic/classes succeeded. Found ${getClassesRes.data.data.classes.length} classes.`);

    const postClassRes = await request('POST', '/academic/classes', {
      name: `Test Class ${timestamp}`,
      code: `TC-${timestamp.toString().slice(-4)}`,
      display_order: 99
    }, token);
    if (postClassRes.status !== 201 || !postClassRes.data?.data?.class?.id) {
      throw new Error(`POST /academic/classes failed: ${JSON.stringify(postClassRes.data)}`);
    }
    createdClassId = postClassRes.data.data.class.id;
    console.log(`    ✓ POST /academic/classes succeeded. Created Class ID: ${createdClassId}`);

    const postSectionRes = await request('POST', '/academic/sections', {
      class_id: createdClassId,
      name: 'Section Alpha',
      capacity: 35,
      room_number: 'R-99'
    }, token);
    if (postSectionRes.status !== 201 || !postSectionRes.data?.data?.section?.id) {
      throw new Error(`POST /academic/sections failed: ${JSON.stringify(postSectionRes.data)}`);
    }
    createdSectionId = postSectionRes.data.data.section.id;
    console.log(`    ✓ POST /academic/sections succeeded. Created Section ID: ${createdSectionId}`);

    // Verify nested section appears in GET /academic/classes
    const verifyClassesRes = await request('GET', '/academic/classes', null, token);
    const targetClass = verifyClassesRes.data.data.classes.find((c: any) => c.id === createdClassId);
    if (!targetClass || !targetClass.sections.some((s: any) => s.id === createdSectionId)) {
      throw new Error('Nested section verification failed: section not nested inside class response');
    }
    console.log('    ✓ Nested section structure verified in GET /academic/classes.');

    // 5. Subjects Contract
    console.log('\n[5] Testing Subjects (GET & POST)...');
    const getSubjectsRes = await request('GET', '/academic/subjects', null, token);
    if (getSubjectsRes.status !== 200 || !Array.isArray(getSubjectsRes.data?.data?.subjects)) {
      throw new Error(`GET /academic/subjects failed: ${JSON.stringify(getSubjectsRes.data)}`);
    }
    console.log(`    ✓ GET /academic/subjects succeeded. Found ${getSubjectsRes.data.data.subjects.length} subjects.`);

    const postSubjectRes = await request('POST', '/academic/subjects', {
      name: `Robotics Lab ${timestamp}`,
      code: `ROB-${timestamp.toString().slice(-4)}`,
      type: 'lab'
    }, token);
    if (postSubjectRes.status !== 201 || !postSubjectRes.data?.data?.subject?.id) {
      throw new Error(`POST /academic/subjects failed: ${JSON.stringify(postSubjectRes.data)}`);
    }
    createdSubjectId = postSubjectRes.data.data.subject.id;
    console.log(`    ✓ POST /academic/subjects succeeded. Created Subject ID: ${createdSubjectId}`);

    // 6. Subject Allocation (Class Subjects)
    console.log('\n[6] Testing Subject Allocation & Fetching...');
    const allocateRes = await request('POST', '/academic/class-subjects', {
      class_id: createdClassId,
      academic_year_id: createdYearId,
      subject_id: createdSubjectId,
      teacher_id: null
    }, token);
    if (allocateRes.status !== 200 || !allocateRes.data?.data?.allocation?.id) {
      throw new Error(`POST /academic/class-subjects failed: ${JSON.stringify(allocateRes.data)}`);
    }
    createdAllocationId = allocateRes.data.data.allocation.id;
    console.log(`    ✓ POST /academic/class-subjects succeeded. Allocation ID: ${createdAllocationId}`);

    // Test GET /academic/classes/:classId/subjects?academic_year_id=...
    const getClassSubjectsRes = await request(
      'GET',
      `/academic/classes/${createdClassId}/subjects?academic_year_id=${createdYearId}`,
      null,
      token
    );
    if (
      getClassSubjectsRes.status !== 200 ||
      !Array.isArray(getClassSubjectsRes.data?.data?.class_subjects) ||
      getClassSubjectsRes.data.data.class_subjects.length === 0
    ) {
      throw new Error(`GET /academic/classes/:classId/subjects failed: ${JSON.stringify(getClassSubjectsRes.data)}`);
    }
    console.log(`    ✓ GET /academic/classes/:classId/subjects verified. Found ${getClassSubjectsRes.data.data.class_subjects.length} allocated subjects.`);

    // 7. Test RBAC protection: Unauthorized role attempt to mutate
    console.log('\n[7] Testing RBAC Protection for Mutations...');
    const unauthRes = await request('POST', '/academic/classes', {
      name: 'Hacker Class'
    }); // No token -> 401
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for unauthenticated POST, got ${unauthRes.status}`);
    }
    console.log('    ✓ Unauthenticated POST blocked with HTTP 401.');

    console.log('\n=== ALL ACADEMIC FRONTEND BACKEND CONTRACTS PASSED CLEANLY! ===\n');
  } finally {
    // Clean up created fixtures safely
    console.log('[Cleanup] Safely removing isolated test fixtures...');
    if (createdAllocationId) {
      await pool.query('DELETE FROM class_subjects WHERE id = $1', [createdAllocationId]);
    }
    if (createdSectionId) {
      await pool.query('DELETE FROM sections WHERE id = $1', [createdSectionId]);
    }
    if (createdClassId) {
      await pool.query('DELETE FROM classes WHERE id = $1', [createdClassId]);
    }
    if (createdSubjectId) {
      await pool.query('DELETE FROM subjects WHERE id = $1', [createdSubjectId]);
    }
    if (createdYearId) {
      await pool.query('DELETE FROM academic_years WHERE id = $1', [createdYearId]);
    }
    await pool.end();
    console.log('    ✓ Test fixtures cleaned up successfully.');
  }
}

runAcademicFrontendFlowTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
