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
  console.log('🧪 Starting End-to-End Exams & Results API Tests...\n');
  try {
    // 1. Health check
    const health = await request('GET', '/health');
    console.log(`[1] Ping Server... ${health.data.success ? '✅ ONLINE' : '❌ OFFLINE'}`);

    // 2. Admin login
    const adminLogin = await request('POST', '/auth/login', { email: 'admin@gmail.com', password: 'Saksham_developer@1234' });
    if (adminLogin.status !== 200) throw new Error('Admin login failed');
    const adminToken = adminLogin.data.data.access_token;
    console.log(`[2] Admin Login... ✅`);

    // 3. Test Data Setup
    const timestamp = Date.now();
    const yearRes = await request('POST', '/academic/academic-years', {
      name: `EX-AY-${timestamp}`, start_date: '2026-04-01', end_date: '2027-03-31', is_current: true
    }, adminToken);
    const academicYearId = yearRes.data.data.academic_year.id;

    const classRes = await request('POST', '/academic/classes', { name: `EX-Class-${timestamp}`, code: `EX${timestamp.toString().slice(-4)}`, display_order: 1 }, adminToken);
    const classId = classRes.data.data.class.id;

    const sectionRes = await request('POST', '/academic/sections', { class_id: classId, name: 'A', capacity: 40 }, adminToken);
    const sectionId = sectionRes.data.data.section.id;

    const mathRes = await request('POST', '/academic/subjects', { name: `Math-${timestamp}`, code: `MTH${timestamp.toString().slice(-4)}`, type: 'core' }, adminToken);
    const mathSubjectId = mathRes.data.data.subject.id;

    const engRes = await request('POST', '/academic/subjects', { name: `English-${timestamp}`, code: `ENG${timestamp.toString().slice(-4)}`, type: 'core' }, adminToken);
    const engSubjectId = engRes.data.data.subject.id;

    // Enroll Student 1
    const adm1 = await request('POST', '/admissions', {
      applicant_name: 'Aarav Sharma', dob: '2012-01-10', gender: 'male', applied_class_id: classId, academic_year_id: academicYearId,
      parent_name: 'Rajesh Sharma', parent_email: `parent1_${timestamp}@test.com`, parent_phone: '9876543210'
    }, adminToken);
    const adm1Id = adm1.data.data.admission.id;
    await request('PATCH', `/admissions/${adm1Id}/status`, { status: 'approved', remarks: 'Eligible' }, adminToken);
    const enroll1 = await request('POST', `/admissions/${adm1Id}/enroll`, { current_section_id: sectionId, roll_number: '101' }, adminToken);
    const student1Id = enroll1.data.data.student.id;

    // Enroll Student 2
    const adm2 = await request('POST', '/admissions', {
      applicant_name: 'Bhavna Verma', dob: '2012-03-15', gender: 'female', applied_class_id: classId, academic_year_id: academicYearId,
      parent_name: 'Sanjay Verma', parent_email: `parent2_${timestamp}@test.com`, parent_phone: '9876543211'
    }, adminToken);
    const adm2Id = adm2.data.data.admission.id;
    await request('PATCH', `/admissions/${adm2Id}/status`, { status: 'approved', remarks: 'Eligible' }, adminToken);
    const enroll2 = await request('POST', `/admissions/${adm2Id}/enroll`, { current_section_id: sectionId, roll_number: '102' }, adminToken);
    const student2Id = enroll2.data.data.student.id;

    console.log(`[3] Test Data Setup (Year, Class, 2 Subjects, 2 Students)... ✅`);

    // 4. Create Teacher & Login
    const teacherRes = await request('POST', '/users', { name: 'Exam Teacher', email: `teacher_${timestamp}@test.com`, role: 'teacher' }, adminToken);
    const teacherTempPw = teacherRes.data.data.temporary_password;
    const teacherEmail = teacherRes.data.data.user.email;

    const teacherLogin = await request('POST', '/auth/login', { email: teacherEmail, password: teacherTempPw });
    const teacherToken = teacherLogin.data.data.access_token;
    console.log(`[4] Teacher Created & Authenticated... ✅`);

    // 5. Teacher creates Exam term
    const examRes = await request('POST', '/exams', {
      title: 'Mid-Term Examination 2026', type: 'mid_term', academic_year_id: academicYearId, class_id: classId
    }, teacherToken);
    if (examRes.status !== 201) throw new Error(`Create exam failed: ${JSON.stringify(examRes.data)}`);
    const examId = examRes.data.data.exam.id;
    console.log(`[5] Exam Term Created ('draft' state)... ✅ ID: ${examId}`);

    // 6. Teacher adds Exam Subject Schedules
    const exMathRes = await request('POST', '/exams/subjects', {
      exam_id: examId, subject_id: mathSubjectId, exam_date: '2026-09-15', start_time: '09:00', end_time: '12:00', max_marks: 100, pass_marks: 40
    }, teacherToken);
    const exMathId = exMathRes.data.data.exam_subject.id;

    const exEngRes = await request('POST', '/exams/subjects', {
      exam_id: examId, subject_id: engSubjectId, exam_date: '2026-09-17', start_time: '09:00', end_time: '12:00', max_marks: 100, pass_marks: 40
    }, teacherToken);
    const exEngId = exEngRes.data.data.exam_subject.id;

    console.log(`[6] Exam Subjects Added (Math & English)... ✅`);

    // 7. Teacher enters Bulk Marks
    // Math Marks: Student 1 = 85, Student 2 = 35 (below pass mark 40)
    const mathMarksRes = await request('POST', '/exams/marks', {
      exam_subject_id: exMathId,
      marks: [
        { student_id: student1Id, marks_obtained: 85, remarks: 'Very Good' },
        { student_id: student2Id, marks_obtained: 35, remarks: 'Needs Improvement' }
      ]
    }, teacherToken);
    if (mathMarksRes.status !== 200) throw new Error(`Math marks entry failed: ${JSON.stringify(mathMarksRes.data)}`);

    // English Marks: Student 1 = 92, Student 2 = 78
    const engMarksRes = await request('POST', '/exams/marks', {
      exam_subject_id: exEngId,
      marks: [
        { student_id: student1Id, marks_obtained: 92, remarks: 'Outstanding' },
        { student_id: student2Id, marks_obtained: 78, remarks: 'Good' }
      ]
    }, teacherToken);
    if (engMarksRes.status !== 200) throw new Error(`English marks entry failed: ${JSON.stringify(engMarksRes.data)}`);

    console.log(`[7] Bulk Marks Entered for Math & English... ✅`);

    // 8. Attempt Student result lookup while exam is in 'draft' status -> Expect 403
    // Student 1 login
    const s1User = await request('GET', `/users/${enroll1.data.data.student.user_id}`, null, adminToken);
    const s1Email = s1User.data.data.user.email;
    const s1Pw = enroll1.data.data.temporary_password;
    const s1Login = await request('POST', '/auth/login', { email: s1Email, password: s1Pw });
    const s1Token = s1Login.data.data.access_token;

    const draftResultRes = await request('GET', `/exams/${examId}/results/student/${student1Id}`, null, s1Token);
    if (draftResultRes.status !== 403) throw new Error(`Expected 403 for unpublished results but got ${draftResultRes.status}`);
    console.log(`[8] Unpublished Results Blocked for Students (403)... ✅`);

    // 9. Admin updates Exam status to 'published'
    const pubRes = await request('PATCH', `/exams/${examId}/status`, { status: 'published' }, adminToken);
    if (pubRes.status !== 200) throw new Error(`Publish failed: ${JSON.stringify(pubRes.data)}`);
    console.log(`[9] Exam Status Updated to 'published'... ✅`);

    // 10. Student 1 fetches report card after publishing
    const s1Report = await request('GET', `/exams/${examId}/results/student/${student1Id}`, null, s1Token);
    if (s1Report.status !== 200) throw new Error(`Student 1 report failed: ${JSON.stringify(s1Report.data)}`);
    const s1Data = s1Report.data.data;

    console.log(`[10] Student 1 Report Card fetched:`);
    console.log(`     Total: ${s1Data.summary.total_marks_obtained}/${s1Data.summary.total_max_marks} (${s1Data.summary.overall_percentage}%)`);
    console.log(`     Grade: ${s1Data.summary.overall_grade}, Status: ${s1Data.summary.overall_status} ✅`);

    if (s1Data.summary.overall_status !== 'PASS' || s1Data.summary.overall_grade !== 'A') {
      throw new Error(`Unexpected Student 1 result metrics: ${JSON.stringify(s1Data.summary)}`);
    }

    // 11. Student 2 report card (should be FAIL due to Math score of 35)
    const s2Report = await request('GET', `/exams/${examId}/results/student/${student2Id}`, null, teacherToken);
    const s2Data = s2Report.data.data;
    console.log(`[11] Student 2 Report Card fetched:`);
    console.log(`     Total: ${s2Data.summary.total_marks_obtained}/${s2Data.summary.total_max_marks} (${s2Data.summary.overall_percentage}%)`);
    console.log(`     Grade: ${s2Data.summary.overall_grade}, Status: ${s2Data.summary.overall_status} (Failed Math with 35 marks) ✅`);

    if (s2Data.summary.overall_status !== 'FAIL') {
      throw new Error(`Expected Student 2 status to be FAIL but got ${s2Data.summary.overall_status}`);
    }

    // 12. Class-wide result summary for Teacher
    const classSummary = await request('GET', `/exams/${examId}/results/class/${classId}`, null, teacherToken);
    if (classSummary.status !== 200 || classSummary.data.data.results.length !== 2) {
      throw new Error(`Class summary failed: ${JSON.stringify(classSummary.data)}`);
    }
    console.log(`[12] Teacher Class Result Summary... ✅ (${classSummary.data.data.results.length} students processed)`);

    console.log('\n🎉 ALL EXAMS & RESULTS API TESTS PASSED SUCCESSFULLY! ✅\n');
  } catch (error: any) {
    console.error('\n❌ TEST RUN FAILED!', error.message || error);
    process.exit(1);
  }
}

runTests();
