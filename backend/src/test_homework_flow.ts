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

async function runTests() {
  console.log('🧪 Starting End-to-End Homework & Assignments API Tests...\n');
  try {
    const health = await request('GET', '/health');
    console.log(`[1] Ping Server... ${health.data.success ? '✅ ONLINE' : '❌ OFFLINE'}`);

    // Admin login
    const adminLogin = await request('POST', '/auth/login', { email: 'admin@gmail.com', password: 'Saksham_developer@1234' });
    if (adminLogin.status !== 200) throw new Error('Admin login failed');
    const adminToken = adminLogin.data.data.access_token;
    console.log(`[2] Admin Login... ✅`);

    // Create Academic Year
    const yearRes = await request('POST', '/academic/academic-years', {
      name: `HW-AY-${Date.now()}`, start_date: '2026-04-01', end_date: '2027-03-31', is_current: true
    }, adminToken);
    const academicYearId = yearRes.data.data.academic_year.id;

    // Create Class & Section
    const classRes = await request('POST', '/academic/classes', { name: `HW-Class-${Date.now()}`, code: `HW${Date.now().toString().slice(-4)}`, display_order: 1 }, adminToken);
    const classId = classRes.data.data.class.id;
    const sectionRes = await request('POST', '/academic/sections', { class_id: classId, name: 'A', capacity: 30 }, adminToken);
    const sectionId = sectionRes.data.data.section.id;

    // Create Subject
    const subjectRes = await request('POST', '/academic/subjects', { name: `Science-${Date.now()}`, code: `SCI${Date.now().toString().slice(-4)}`, type: 'core' }, adminToken);
    const subjectId = subjectRes.data.data.subject.id;

    // Enroll a student via admissions flow
    const admDob = '2012-05-15';
    const admRes = await request('POST', '/admissions', {
      applicant_name: 'HW Student', dob: admDob, gender: 'male', applied_class_id: classId, academic_year_id: academicYearId,
      parent_name: 'HW Parent', parent_email: `hwp_${Date.now()}@test.com`, parent_phone: '9988776655'
    }, adminToken);
    const admissionId = admRes.data.data.admission.id;
    await request('PATCH', `/admissions/${admissionId}/status`, { status: 'approved', remarks: 'ok' }, adminToken);
    const enrollRes = await request('POST', `/admissions/${admissionId}/enroll`, { current_section_id: sectionId, roll_number: `HW-${Date.now().toString().slice(-3)}` }, adminToken);
    const studentUserId = enrollRes.data.data.student.user_id;
    console.log(`[3] Test Data Setup (Year, Class, Subject, Student)... ✅`);

    // Create Teacher then login
    const teacherRes = await request('POST', '/users', { name: 'HW Teacher', email: `hwt_${Date.now()}@test.com`, role: 'teacher' }, adminToken);
    const teacherTempPw = teacherRes.data.data.temporary_password;
    const teacherEmail = teacherRes.data.data.user.email;
    const teacherLogin = await request('POST', '/auth/login', { email: teacherEmail, password: teacherTempPw });
    const teacherToken = teacherLogin.data.data.access_token;
    console.log(`[4] Teacher Creation & Login... ✅`);

    // Teacher creates homework
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const dueDateStr = dueDate.toISOString().split('T')[0];
    const hwRes = await request('POST', '/homework', {
      title: 'Chapter 5 - Fill in the Blanks', description: 'Complete the exercise from page 78',
      class_id: classId, subject_id: subjectId, academic_year_id: academicYearId, due_date: dueDateStr
    }, teacherToken);
    if (hwRes.status !== 201) throw new Error(`Create homework failed: ${JSON.stringify(hwRes.data)}`);
    const homeworkId = hwRes.data.data.homework.id;
    console.log(`[5] Teacher Created Homework... ✅ ID: ${homeworkId}`);

    // Teacher views class homework list
    const listRes = await request('GET', `/homework/class/${classId}`, null, teacherToken);
    if (listRes.status !== 200 || listRes.data.data.homework.length === 0) throw new Error('Homework list empty');
    console.log(`[6] Fetch Homework for Class... ✅ Found ${listRes.data.data.homework.length} assignments`);

    // Student login
    const studentLogin = await request('POST', '/auth/login', { email: (await request('GET', `/users/${studentUserId}`, null, adminToken)).data.data.user.email, password: '' });
    // We'll submit as admin on behalf of student for simplicity — let's use admin to update the submission
    // Submit as student: first get student token
    const studentUserData = await request('GET', `/users/${studentUserId}`, null, adminToken);
    const studentEmail = studentUserData.data.data.user.email;
    // Student must change password on first login — retrieve temp password from enrollment
    const studentTempPw = enrollRes.data.data.temporary_password;
    const studentLoginRes = await request('POST', '/auth/login', { email: studentEmail, password: studentTempPw });
    if (studentLoginRes.status !== 200) throw new Error(`Student login failed: ${JSON.stringify(studentLoginRes.data)}`);
    const studentToken = studentLoginRes.data.data.access_token;
    console.log(`[7] Student Login... ✅`);

    // Student - Attempt 1 submission
    const sub1 = await request('POST', `/homework/${homeworkId}/submit`, { remarks: 'My first attempt' }, studentToken);
    if (sub1.status !== 201) throw new Error(`Attempt 1 failed: ${JSON.stringify(sub1.data)}`);
    console.log(`[8] Student Attempt 1 Submission... ✅ (${sub1.data.message})`);

    // Student - Attempt 2 (correction)
    const sub2 = await request('POST', `/homework/${homeworkId}/submit`, { remarks: 'Corrected my mistake!' }, studentToken);
    if (sub2.status !== 201) throw new Error(`Attempt 2 failed: ${JSON.stringify(sub2.data)}`);
    console.log(`[9] Student Attempt 2 (Resubmission)... ✅ (${sub2.data.message})`);

    // Student - Attempt 3 (should fail with 409)
    const sub3 = await request('POST', `/homework/${homeworkId}/submit`, { remarks: 'Third attempt' }, studentToken);
    if (sub3.status !== 409) throw new Error(`Expected 409 for 3rd attempt but got ${sub3.status}`);
    console.log(`[10] Student Attempt 3 Blocked... ✅ (409 - Max attempts reached)`);

    // Teacher views submissions
    const subsRes = await request('GET', `/homework/${homeworkId}/submissions`, null, teacherToken);
    if (subsRes.status !== 200 || subsRes.data.data.submissions.length !== 2) throw new Error(`Expected 2 submissions, got ${subsRes.data.data.submissions.length}`);
    console.log(`[11] Teacher Views Submissions... ✅ Found ${subsRes.data.data.submissions.length} attempts`);

    // Teacher grades the 2nd attempt
    const sub2Id = subsRes.data.data.submissions.find((s: any) => s.attempt_number === 2)?.id;
    const gradeRes = await request('PATCH', `/homework/submissions/${sub2Id}`, { status: 'graded', remarks: 'Good correction!' }, teacherToken);
    if (gradeRes.status !== 200) throw new Error(`Grading failed: ${JSON.stringify(gradeRes.data)}`);
    console.log(`[12] Teacher Graded Final Attempt... ✅`);

    // Negative: Student tries to create homework (should 403)
    const negRes = await request('POST', '/homework', {
      title: 'Unauthorized HW', class_id: classId, subject_id: subjectId, academic_year_id: academicYearId, due_date: dueDateStr
    }, studentToken);
    if (negRes.status !== 403) throw new Error(`Expected 403 for student creating homework but got ${negRes.status}`);
    console.log(`[13] Negative: Student blocked from creating homework... ✅ (403)`);

    console.log('\n🎉 ALL HOMEWORK & ASSIGNMENTS API TESTS PASSED SUCCESSFULLY! ✅\n');
  } catch (error: any) {
    console.error('\n❌ TEST RUN FAILED!', error.message || error);
    process.exit(1);
  }
}
runTests();
