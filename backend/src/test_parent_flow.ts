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
  console.log('🧪 Starting End-to-End Parent Management API Tests...\n');

  try {
    // 1. Health check
    const health = await request('GET', '/health');
    console.log(`[1] Ping Server... ${health.data.success ? '✅ ONLINE' : '❌ OFFLINE'}`);

    // 2. Login as super_admin
    const adminLogin = await request('POST', '/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234'
    });
    const adminToken = adminLogin.data.data.access_token;
    console.log(`[2] Admin Login... ✅ Success`);

    // 3. Create a parent user manually via Admin API
    const parentEmail = `parent_${Date.now()}@test.com`;
    const parentInsert = await request('POST', '/users', {
      name: 'Test Parent',
      email: parentEmail,
      role: 'parent'
    }, adminToken);
    
    if (parentInsert.status !== 201) {
      throw new Error(`Failed to create parent: ${JSON.stringify(parentInsert.data)}`);
    }
    const tempPassword = parentInsert.data.data.temporary_password;
    const parentUserId = parentInsert.data.data.user.id;
    console.log(`[3] Spawned Test Parent via Admin API... ✅ ID: ${parentUserId}`);

    // 4. Get an existing student via admin query
    const studentQuery = await request('GET', '/students?limit=1', null, adminToken);
    if (!studentQuery.data.data.students || studentQuery.data.data.students.length === 0) {
      throw new Error('No students found in DB to link!');
    }
    const student = studentQuery.data.data.students[0];
    const studentId = student.id;
    console.log(`[4] Found Student to Link... ✅ ID: ${studentId}`);

    // 5. Link Student to Parent
    const linkRes = await request('POST', `/parents/${parentUserId}/link-student`, {
      student_id: studentId
    }, adminToken);
    if (linkRes.status !== 200) throw new Error(`Link failed: ${JSON.stringify(linkRes.data)}`);
    console.log(`[5] Linked Student to Parent using Admin API... ✅`);

    // 6. Query parent by admin
    const queryParentRes = await request('GET', `/parents/${parentUserId}`, null, adminToken);
    console.log(`[6] Fetched Parent details (Admin)... ✅ Connected Children: ${queryParentRes.data.data.children.length}`);

    // 7. Query parent list
    const parentListRes = await request('GET', '/parents?limit=5', null, adminToken);
    console.log(`[7] Fetched Parent Paginated List (Admin)... ✅ Found: ${parentListRes.data.data.parents.length}`);

    // 8. Parent Login
    const parentLogin = await request('POST', '/auth/login', {
      email: parentEmail,
      password: tempPassword
    });
    if (parentLogin.status !== 200) throw new Error(`Parent login failed: ${JSON.stringify(parentLogin.data)}`);
    const parentToken = parentLogin.data.data.access_token;
    console.log(`[8] Parent Login... ✅ Success`);

    // 9. Parent checking their children
    const myChildrenRes = await request('GET', '/parents/me/children', null, parentToken);
    console.log(`[9] Parent Fetched /me/children... ✅ Visible Children: ${myChildrenRes.data.data.length}`);
    if (myChildrenRes.data.data[0].student_id !== studentId) {
      throw new Error('Linked child mismatch!');
    }

    // 10. Try linking another random uuid and expect 404
    console.log(`[10] Invalid Link Test... `);
    const invalidRes = await request('POST', `/parents/${parentUserId}/link-student`, {
      student_id: "00000000-0000-0000-0000-000000000000"
    }, adminToken);
    if (invalidRes.status === 404) {
      console.log(`✅ Caught expected Error: ${invalidRes.data.message || '404'}`);
    } else {
      console.log(`❌ Failed (Did not throw 404, status=${invalidRes.status})`);
      throw new Error('Invalid link test failed');
    }

    // 11. Unlink the student
    const unlinkRes = await request('POST', `/parents/${parentUserId}/unlink-student`, {
      student_id: studentId
    }, adminToken);
    if (unlinkRes.status !== 200) throw new Error(`Unlink failed: ${JSON.stringify(unlinkRes.data)}`);
    console.log(`[11] Unlinked Student using Admin API... ✅`);

    console.log('\n🎉 ALL PARENT MANAGEMENT API TESTS PASSED SUCCESSFULLY! ✅\n');
  } catch (error: any) {
    console.error('\n❌ TEST RUN FAILED!', error.message || error);
    process.exit(1);
  }
}

runTests();
