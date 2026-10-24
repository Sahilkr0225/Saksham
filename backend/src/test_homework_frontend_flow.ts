import http from 'http';

const BASE_URL = 'http://127.0.0.1:5000/api/v1';

const request = (method: string, path: string, body?: any, token?: string): Promise<{ status: number; data: any }> => {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const parsedUrl = new URL(url);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const payload = body ? JSON.stringify(body) : '';
    if (body) headers['Content-Length'] = Buffer.byteLength(payload).toString();
    const req = http.request(
      { hostname: parsedUrl.hostname, port: parsedUrl.port, path: parsedUrl.pathname + parsedUrl.search, method, headers },
      (res) => {
        let rawData = '';
        res.on('data', (d) => rawData += d);
        res.on('end', () => {
          try { resolve({ status: res.statusCode || 0, data: rawData ? JSON.parse(rawData) : null }); }
          catch (e) { reject(new Error(`Parse error: ${rawData}`)); }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(payload);
    req.end();
  });
};

async function runFrontendFlowTests() {
  console.log('🧪 Starting Homework & Assignments Frontend-Flow Verification Tests...\n');
  try {
    // 1. Ping
    const health = await request('GET', '/health');
    console.log(`[1] Ping Server... ${health.data.success ? '✅ ONLINE' : '❌ OFFLINE'}`);

    // 2. Admin login
    const adminLogin = await request('POST', '/auth/login', { email: 'admin@gmail.com', password: 'Saksham_developer@1234' });
    if (adminLogin.status !== 200) throw new Error('Admin login failed');
    const adminToken = adminLogin.data.data.access_token;
    console.log(`[2] Admin Login... ✅`);

    // 3. Setup test data
    const stamp = Date.now();
    const yearRes = await request('POST', '/academic/academic-years', {
      name: `HW-FE-AY-${stamp}`, start_date: '2026-04-01', end_date: '2027-03-31', is_current: true
    }, adminToken);
    const academicYearId = yearRes.data.data.academic_year.id;

    const classRes = await request('POST', '/academic/classes', { name: `HW-FE-Class-${stamp}`, code: `HW${stamp.toString().slice(-4)}`, display_order: 1 }, adminToken);
    const classId = classRes.data.data.class.id;
    const sectionRes = await request('POST', '/academic/sections', { class_id: classId, name: 'A', capacity: 30 }, adminToken);
    const sectionId = sectionRes.data.data.section.id;

    const subjectRes = await request('POST', '/academic/subjects', { name: `Math-${stamp}`, code: `MTH${stamp.toString().slice(-4)}`, type: 'core' }, adminToken);
    const subjectId = subjectRes.data.data.subject.id;

    // Enroll a student
    const admDob = '2012-08-10';
    const admRes = await request('POST', '/admissions', {
      applicant_name: 'HW Frontend Student', dob: admDob, gender: 'female', applied_class_id: classId, academic_year_id: academicYearId,
      parent_name: 'HW Parent FE', parent_email: `hwp_fe_${stamp}@test.com`, parent_phone: '9876543210'
    }, adminToken);
    const admissionId = admRes.data.data.admission.id;
    await request('PATCH', `/admissions/${admissionId}/status`, { status: 'approved', remarks: 'auto' }, adminToken);
    const enrollRes = await request('POST', `/admissions/${admissionId}/enroll`, { current_section_id: sectionId, roll_number: `R-${stamp.toString().slice(-3)}` }, adminToken);
    const studentUserId = enrollRes.data.data.student.user_id;
    const studentTempPw = enrollRes.data.data.temporary_password;
    console.log(`[3] Test Fixtures Initialized... ✅`);

    // 4. Create Teacher
    const teacherRes = await request('POST', '/users', { name: 'HW Teacher FE', email: `hwt_fe_${stamp}@test.com`, role: 'teacher' }, adminToken);
    const teacherTempPw = teacherRes.data.data.temporary_password;
    const teacherEmail = teacherRes.data.data.user.email;
    const teacherLogin = await request('POST', '/auth/login', { email: teacherEmail, password: teacherTempPw });
    const teacherToken = teacherLogin.data.data.access_token;
    console.log(`[4] Teacher Created & Authenticated... ✅`);

    // 5. List all homework before creation
    const initialList = await request('GET', `/homework?class_id=${classId}`, null, teacherToken);
    if (initialList.status !== 200) throw new Error('Initial list fetch failed');
    console.log(`[5] Filtered Directory Listing (Empty state)... ✅ Found: ${initialList.data.data.homework.length}`);

    // 6. Create Homework via POST /homework
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const createRes = await request('POST', '/homework', {
      title: 'Trigonometry Problem Set 1',
      description: 'Solve exercises 1 to 10 from Chapter 4 textbook.',
      class_id: classId,
      section_id: sectionId,
      subject_id: subjectId,
      academic_year_id: academicYearId,
      due_date: dueDateStr
    }, teacherToken);
    if (createRes.status !== 201) throw new Error(`Create failed: ${JSON.stringify(createRes.data)}`);
    const homeworkId = createRes.data.data.homework.id;
    console.log(`[6] Created Homework Assignment... ✅ ID: ${homeworkId}`);

    // 7. Get single homework details via GET /homework/:id
    const singleRes = await request('GET', `/homework/${homeworkId}`, null, teacherToken);
    if (singleRes.status !== 200 || singleRes.data.data.homework.title !== 'Trigonometry Problem Set 1') {
      throw new Error(`Single get failed: ${JSON.stringify(singleRes.data)}`);
    }
    console.log(`[7] Single Homework Inspection... ✅ Class: ${singleRes.data.data.homework.class_name}, Subject: ${singleRes.data.data.homework.subject_name}`);

    // 8. Search & Directory Query with Filters via GET /homework
    const filteredRes = await request('GET', `/homework?class_id=${classId}&search=Trigonometry`, null, teacherToken);
    if (filteredRes.status !== 200 || filteredRes.data.data.homework.length === 0) {
      throw new Error(`Filter search failed: ${JSON.stringify(filteredRes.data)}`);
    }
    console.log(`[8] Multi-Parameter Search & Filter... ✅ Matches found: ${filteredRes.data.data.homework.length}`);

    // 9. Update Homework Assignment via PATCH /homework/:id
    const updateRes = await request('PATCH', `/homework/${homeworkId}`, {
      title: 'Trigonometry Problem Set 1 (Updated)',
      description: 'Solve exercises 1 to 15 (includes bonus problem #15).'
    }, teacherToken);
    if (updateRes.status !== 200 || updateRes.data.data.homework.title !== 'Trigonometry Problem Set 1 (Updated)') {
      throw new Error(`Update failed: ${JSON.stringify(updateRes.data)}`);
    }
    console.log(`[9] Homework Updated via PATCH... ✅ Title updated successfully`);

    // 10. Student submits work
    const studentUserData = await request('GET', `/users/${studentUserId}`, null, adminToken);
    const studentEmail = studentUserData.data.data.user.email;
    const studentLogin = await request('POST', '/auth/login', { email: studentEmail, password: studentTempPw });
    const studentToken = studentLogin.data.data.access_token;

    const subRes = await request('POST', `/homework/${homeworkId}/submit`, { remarks: 'Solved all 15 questions!' }, studentToken);
    if (subRes.status !== 201) throw new Error(`Submission failed: ${JSON.stringify(subRes.data)}`);
    const submissionId = subRes.data.data.submission.id;
    console.log(`[10] Student Submitted Assignment... ✅ Attempt 1 Status: ${subRes.data.data.submission.status}`);

    // 11. Teacher views submissions
    const subsList = await request('GET', `/homework/${homeworkId}/submissions`, null, teacherToken);
    if (subsList.status !== 200 || subsList.data.data.submissions.length === 0) {
      throw new Error(`Fetch submissions failed: ${JSON.stringify(subsList.data)}`);
    }
    console.log(`[11] Teacher Views Submissions... ✅ Found: ${subsList.data.data.submissions.length}`);

    // 12. Teacher grades submission via PATCH /homework/submissions/:submissionId
    const gradeRes = await request('PATCH', `/homework/submissions/${submissionId}`, {
      status: 'graded',
      remarks: 'Excellent work, 15/15 solutions are clean!'
    }, teacherToken);
    if (gradeRes.status !== 200 || gradeRes.data.data.submission.status !== 'graded') {
      throw new Error(`Grading failed: ${JSON.stringify(gradeRes.data)}`);
    }
    console.log(`[12] Teacher Graded Submission... ✅ Graded with qualitative feedback`);

    // 13. Archive Homework Assignment via PATCH
    const archiveRes = await request('PATCH', `/homework/${homeworkId}`, { status: 'archived' }, teacherToken);
    if (archiveRes.status !== 200 || archiveRes.data.data.homework.status !== 'archived') {
      throw new Error(`Archiving failed: ${JSON.stringify(archiveRes.data)}`);
    }
    console.log(`[13] Assignment Archived... ✅ Status: archived`);

    // 14. Negative RBAC Check: Student cannot update homework
    const negUpdate = await request('PATCH', `/homework/${homeworkId}`, { title: 'Hacked HW' }, studentToken);
    if (negUpdate.status !== 403) throw new Error(`Expected 403 for student edit, got ${negUpdate.status}`);
    console.log(`[14] RBAC Protection: Student blocked from editing... ✅ (403 Forbidden)`);

    // 15. Delete Homework via DELETE /homework/:id (Admin only)
    const delRes = await request('DELETE', `/homework/${homeworkId}`, null, adminToken);
    if (delRes.status !== 200) throw new Error(`Delete failed: ${JSON.stringify(delRes.data)}`);
    const check404 = await request('GET', `/homework/${homeworkId}`, null, adminToken);
    if (check404.status !== 404) throw new Error(`Expected 404 after deletion, got ${check404.status}`);
    console.log(`[15] Admin Deleted Assignment & Verified 404... ✅`);

    console.log('\n🎉 ALL 15 HOMEWORK FRONTEND-FLOW VERIFICATION TESTS PASSED 100%! ✅\n');
  } catch (error: any) {
    console.error('\n❌ FRONTEND-FLOW TEST SUITE FAILED!', error.message || error);
    process.exit(1);
  }
}

runFrontendFlowTests();
