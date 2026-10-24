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
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { raw };
          }
          resolve({ status: res.statusCode || 500, data: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(payload);
    }
    req.end();
  });
};

async function runValidationTests() {
  console.log('=== RUNNING ADMISSION APPLICATION VALIDATION & FIELD TESTS ===\n');

  // Track created IDs for cleanup
  const createdAppIds: string[] = [];
  let testClassId = '';
  let testAyId = '';
  let adminToken = '';

  try {
    // 1. Authenticate as Super Admin
    console.log('[1] Logging in as Super Admin...');
    const loginRes = await request('POST', '/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234'
    });
    if (loginRes.status !== 200 || !loginRes.data?.data?.access_token) {
      throw new Error(`Super admin login failed with status ${loginRes.status}`);
    }
    adminToken = loginRes.data.data.access_token;
    console.log('    ✓ Super Admin authenticated successfully.\n');

    // 2. Setup isolated test fixtures
    console.log('[2] Setting up isolated test fixtures (Academic Year & Class)...');
    const timestamp = Date.now();
    const ayRes = await request(
      'POST',
      '/academic/academic-years',
      {
        name: `AY-ValTest-${timestamp}`,
        start_date: '2026-04-01',
        end_date: '2027-03-31'
      },
      adminToken
    );
    testAyId = ayRes.data.data.academic_year.id;

    const classRes = await request(
      'POST',
      '/academic/classes',
      {
        name: `Val-Class-${timestamp}`,
        code: `VC${timestamp.toString().slice(-4)}`,
        display_order: 1
      },
      adminToken
    );
    testClassId = classRes.data.data.class.id;
    console.log(`    ✓ Fixtures created: Class=${testClassId}, AcademicYear=${testAyId}\n`);

    // 3. Test Valid Application WITHOUT Preferred Section (verifying section is optional)
    console.log('[3] Testing Valid Application Creation WITHOUT Preferred Section (Optional Section Check)...');
    const validNoSectionRes = await request(
      'POST',
      '/admissions',
      {
        applicant_name: 'Aditi Verma',
        dob: '2016-08-20',
        gender: 'female',
        applied_class_id: testClassId,
        academic_year_id: testAyId,
        parent_name: 'Vikram Verma',
        parent_email: `parent.aditi.${timestamp}@example.com`,
        parent_phone: '9876543210',
        address: '124, Rosewood Colony, Indiranagar, Bengaluru, Karnataka, PIN: 560038',
        remarks: null
      },
      adminToken
    );

    if (validNoSectionRes.status === 201 && validNoSectionRes.data?.success) {
      const app = validNoSectionRes.data.data.admission;
      createdAppIds.push(app.id);
      console.log(`    ✓ Application created without section: ID=${app.id}, Status=${app.status}`);
      console.log(`    ✓ Application Number: ${app.application_number}\n`);
    } else {
      throw new Error(`Unexpected status ${validNoSectionRes.status}: ${JSON.stringify(validNoSectionRes.data)}`);
    }

    // 4. Test Valid Application WITH Structured Address & Optional Section Note in Remarks
    console.log('[4] Testing Valid Application WITH Structured Address (Residential + Permanent) & Preferred Section Note...');
    const validWithSectionRes = await request(
      'POST',
      '/admissions',
      {
        applicant_name: 'Karan Mehra',
        dob: '2015-11-12',
        gender: 'male',
        applied_class_id: testClassId,
        academic_year_id: testAyId,
        parent_name: 'Suresh Mehra',
        parent_email: `parent.karan.${timestamp}@example.com`,
        parent_phone: '9123456789',
        address: 'Residential: Flat 401, Sapphire Heights, Bengaluru, Karnataka, PIN: 560068 | Permanent: Vill. Rampur, PO Mehra, Patna, Bihar, PIN: 800001',
        remarks: '[Preferred Section: Section A] Sibling already studying in class 8'
      },
      adminToken
    );

    if (validWithSectionRes.status === 201 && validWithSectionRes.data?.success) {
      const app = validWithSectionRes.data.data.admission;
      createdAppIds.push(app.id);
      console.log(`    ✓ Application created with structured address: ID=${app.id}`);
      console.log(`    ✓ Address stored: "${app.address}"\n`);
    } else {
      throw new Error(`Unexpected status ${validWithSectionRes.status}: ${JSON.stringify(validWithSectionRes.data)}`);
    }

    // 5. Test Invalid Date Format (must be YYYY-MM-DD, e.g. "12-11-2015")
    console.log('[5] Testing Rejection of Invalid Date Format ("12-11-2015" instead of YYYY-MM-DD)...');
    const badDateRes = await request(
      'POST',
      '/admissions',
      {
        applicant_name: 'Invalid Date Student',
        dob: '12-11-2015',
        gender: 'male',
        applied_class_id: testClassId,
        academic_year_id: testAyId,
        parent_name: 'Parent Name',
        parent_email: 'parent@example.com',
        parent_phone: '9876543210'
      },
      adminToken
    );
    if (badDateRes.status === 400) {
      console.log(`    ✓ Correctly rejected with HTTP 400: ${JSON.stringify(badDateRes.data.message || badDateRes.data.errors)}\n`);
    } else {
      throw new Error(`Expected HTTP 400 for bad date format, got ${badDateRes.status}`);
    }

    // 6. Test Invalid Parent Email
    console.log('[6] Testing Rejection of Invalid Parent Email ("not-an-email")...');
    const badEmailRes = await request(
      'POST',
      '/admissions',
      {
        applicant_name: 'Valid Student Name',
        dob: '2016-01-15',
        gender: 'female',
        applied_class_id: testClassId,
        academic_year_id: testAyId,
        parent_name: 'Parent Name',
        parent_email: 'not-an-email',
        parent_phone: '9876543210'
      },
      adminToken
    );
    if (badEmailRes.status === 400) {
      console.log(`    ✓ Correctly rejected with HTTP 400: ${JSON.stringify(badEmailRes.data.message || badEmailRes.data.errors)}\n`);
    } else {
      throw new Error(`Expected HTTP 400 for bad email, got ${badEmailRes.status}`);
    }

    // 7. Test Short Phone (<10 digits)
    console.log('[7] Testing Rejection of Short Phone Number ("98765")...');
    const badPhoneRes = await request(
      'POST',
      '/admissions',
      {
        applicant_name: 'Valid Student Name',
        dob: '2016-01-15',
        gender: 'female',
        applied_class_id: testClassId,
        academic_year_id: testAyId,
        parent_name: 'Parent Name',
        parent_email: 'parent.valid@example.com',
        parent_phone: '98765'
      },
      adminToken
    );
    if (badPhoneRes.status === 400) {
      console.log(`    ✓ Correctly rejected with HTTP 400: ${JSON.stringify(badPhoneRes.data.message || badPhoneRes.data.errors)}\n`);
    } else {
      throw new Error(`Expected HTTP 400 for short phone, got ${badPhoneRes.status}`);
    }

    // 8. Test Invalid / Non-existent Class UUID
    console.log('[8] Testing Rejection of Malformed Class UUID ("not-a-uuid")...');
    const badUuidRes = await request(
      'POST',
      '/admissions',
      {
        applicant_name: 'Valid Student Name',
        dob: '2016-01-15',
        gender: 'female',
        applied_class_id: 'not-a-uuid',
        academic_year_id: testAyId,
        parent_name: 'Parent Name',
        parent_email: 'parent.valid@example.com',
        parent_phone: '9876543210'
      },
      adminToken
    );
    if (badUuidRes.status === 400) {
      console.log(`    ✓ Correctly rejected with HTTP 400: ${JSON.stringify(badUuidRes.data.message || badUuidRes.data.errors)}\n`);
    } else {
      throw new Error(`Expected HTTP 400 for bad UUID, got ${badUuidRes.status}`);
    }

    console.log('================================================================');
    console.log('🎉 ALL APPLICATION CREATION VALIDATION TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('================================================================\n');

  } catch (error: any) {
    console.error('❌ Validation Test Failed:', error.message);
    process.exitCode = 1;
  } finally {
    // 9. Teardown and Cleanup
    console.log('--- Cleaning up isolated test fixtures ---');
    try {
      for (const appId of createdAppIds) {
        await pool.query('DELETE FROM admission_applications WHERE id = $1', [appId]);
      }
      if (testClassId) {
        await pool.query('DELETE FROM classes WHERE id = $1', [testClassId]);
      }
      if (testAyId) {
        await pool.query('DELETE FROM academic_years WHERE id = $1', [testAyId]);
      }
      console.log('✓ Cleanup completed cleanly. Database restored.');
    } catch (cleanupErr: any) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
    await pool.end();
  }
}

runValidationTests();
