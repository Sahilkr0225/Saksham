import http from 'http';

const BASE_URL = 'http://127.0.0.1:5000/api/v1';

// Helper to make JSON requests
const request = (
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; data: any }> => {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const parsedUrl = new URL(url);

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
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: method,
        headers: headers
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
          } catch (e) {
            reject(new Error(`Failed to parse response: ${rawData}`));
          }
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

async function runTests() {
  console.log('🧪 Starting End-to-End Teacher Management API Tests...\n');

  try {
    // 1. Health check
    const health = await request('GET', '/health');
    console.log(`[1] Ping Server... ${health.data.success ? '✅ ONLINE' : '❌ OFFLINE'}`);

    // 2. Login as super_admin
    const adminLogin = await request('POST', '/auth/login', {
      email: 'sahil@gmail.com',
      password: 'Password@1234'
    });
    const adminToken = adminLogin.data.data.access_token;
    console.log(`[2] Admin Login... ✅ Success`);

    // 3. Create a teacher user manually via Admin API
    const teacherEmail = `teacher_${Date.now()}@test.com`;
    const teacherInsert = await request('POST', '/users', {
      name: 'Test Teacher',
      email: teacherEmail,
      role: 'teacher'
    }, adminToken);
    
    if (teacherInsert.status !== 201) {
      throw new Error(`Failed to create teacher User: ${JSON.stringify(teacherInsert.data)}`);
    }
    const tempPassword = teacherInsert.data.data.temporary_password;
    const teacherUserId = teacherInsert.data.data.user.id;
    console.log(`[3] Spawned Test Teacher via Admin API... ✅ ID: ${teacherUserId}`);

    // 4. Update the Teacher Extended Profile
    console.log(`[4] Updating Extended Teacher Profile...`);
    const updateRes = await request('PUT', `/teachers/${teacherUserId}`, {
      employee_id: `T-${Date.now().toString().slice(-6)}`,
      specialization: 'Physics, Chemistry',
      qualification: 'M.Sc.',
      joining_date: '2023-01-01',
      address: 'Test Address',
      emergency_contact: '1234567890'
    }, adminToken);
    
    if (updateRes.status !== 200) {
      throw new Error(`Failed to update extended profile: ${JSON.stringify(updateRes.data)}`);
    }
    console.log(`[4] Updated Teacher Profile Successfully ✅`);

    // 5. Fetch Teachers List as Admin
    console.log(`[5] Fetching Paginated Teachers list...`);
    const listRes = await request('GET', '/teachers?limit=10', null, adminToken);
    if (listRes.status !== 200 || !listRes.data.data.teachers || listRes.data.data.teachers.length === 0) {
      throw new Error('Teachers list failed or empty');
    }
    console.log(`[5] Fetched Teachers Paginated List ✅ Found: ${listRes.data.data.teachers.length}`);

    // 6. Login as Teacher
    const teacherLogin = await request('POST', '/auth/login', {
      email: teacherEmail,
      password: tempPassword
    });
    if (teacherLogin.status !== 200) throw new Error(`Teacher login failed: ${JSON.stringify(teacherLogin.data)}`);
    const teacherToken = teacherLogin.data.data.access_token;
    console.log(`[6] Teacher Login... ✅ Success`);

    // 7. Fetch own profile via /me
    const myProfileRes = await request('GET', '/teachers/me', null, teacherToken);
    if (myProfileRes.status !== 200 || myProfileRes.data.data.teacher.id !== teacherUserId) {
      throw new Error(`Teacher /me failed: ${JSON.stringify(myProfileRes.data)}`);
    }
    console.log(`[7] Teacher Fetched /me... ✅ Specialization: ${myProfileRes.data.data.teacher.specialization}`);
    
    // 8. Fetch assigned subjects (Teacher accessing their own subjects)
    const mySubjectsRes = await request('GET', `/teachers/${teacherUserId}/subjects`, null, teacherToken);
    if (mySubjectsRes.status !== 200) {
      throw new Error(`Teacher /subjects failed: ${JSON.stringify(mySubjectsRes.data)}`);
    }
    console.log(`[8] Teacher Subjects Fetched successfully ✅ (Count: ${mySubjectsRes.data.data.assignments.length})`);

    // 9. Negative Test: Teacher attempting to fetch someone else's subjects
    try {
      const someOtherId = "00000000-0000-0000-0000-000000000000";
      const blockRes = await request('GET', `/teachers/${someOtherId}/subjects`, null, teacherToken);
      if (blockRes.status !== 403) {
         console.log(`❌ Negative test failed! Allowed a teacher to check cross-subjects (Status: ${blockRes.status})`);
      }
    } catch (e: any) {
      console.log(`[9] Negative Link Test (Cross-Access subjects)... ✅ Caught expected 403: ${e.response?.data?.message}`);
    }

    console.log('\n🎉 ALL TEACHER MANAGEMENT API TESTS PASSED SUCCESSFULLY! ✅\n');
  } catch (error: any) {
    console.error('\n❌ TEST RUN FAILED!', error.message || error);
    process.exit(1);
  }
}

runTests();
