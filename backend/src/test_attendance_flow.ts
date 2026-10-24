import http from 'http';

const BASE_URL = 'http://127.0.0.1:5000/api/v1';

const request = (method: string, path: string, body?: any, token?: string): Promise<{ status: number; data: any }> => {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error(`Invalid URL: ${url}`));
    }

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
  console.log('🧪 Starting End-to-End Attendance Management API Tests...\n');
  try {
    const health = await request('GET', '/health');
    console.log(`[1] Ping Server... ${health.data.success ? '✅ ONLINE' : '❌ OFFLINE'}`);

    const adminLogin = await request('POST', '/auth/login', { email: 'admin@gmail.com', password: 'Saksham_developer@1234' });
    if (adminLogin.status !== 200) throw new Error('Admin login failed');
    const adminToken = adminLogin.data.data.access_token;
    console.log(`[2] Admin Login... ✅ Success`);

    // Create an Academic Year
    let academicYearId;
    const yearReq = await request('POST', '/academic/academic-years', { name: `AY-${Date.now()}`, start_date: '2026-04-01', end_date: '2027-03-31', is_current: true }, adminToken);
    if (yearReq.status === 201) {
      academicYearId = yearReq.data.data.academic_year.id;
    } else {
      const years = await request('GET', '/academic/academic-years', null, adminToken);
      academicYearId = years.data.data.academic_years[0].id;
    }
    
    // Create Class
    const classReq = await request('POST', '/academic/classes', { name: `Class-${Date.now()}`, code: `C${Date.now().toString().slice(-4)}`, display_order: 1 }, adminToken);
    const classId = classReq.data.data.class.id;

    // Create Section
    const sectionReq = await request('POST', `/academic/sections`, { class_id: classId, name: 'A', capacity: 40 }, adminToken);
    const sectionId = sectionReq.data.data.section.id;

    // Submit Admission
    const admissionReq = await request('POST', '/admissions', {
      applicant_name: 'Test Student', dob: '2016-08-15', gender: 'male', applied_class_id: classId,
      academic_year_id: academicYearId, parent_name: 'Test Parent', parent_email: `ptr_${Date.now()}@test.com`, parent_phone: '9999999999'
    }, adminToken);
    if(admissionReq.status !== 201) throw new Error(`Admission failed: ${JSON.stringify(admissionReq.data)}`);
    const admissionId = admissionReq.data.data.admission.id;

    // Approve Admission
    await request('PATCH', `/admissions/${admissionId}/status`, { status: 'approved', remarks: 'Ok' }, adminToken);
    
    // Enroll Student
    const admitReq = await request('POST', `/admissions/${admissionId}/enroll`, {
      current_section_id: sectionId, roll_number: `1A-${Date.now().toString().slice(-3)}`
    }, adminToken);
    if(admitReq.status !== 201) throw new Error(`Enrollment failed: ${JSON.stringify(admitReq.data)}`);
    const studentId = admitReq.data.data.student.id;

    console.log(`[3] Test Data Setup (Year, Class, Student)... ✅ Added student ${studentId}`);

    // Mark daily attendance
    const today = new Date().toISOString().split('T')[0];
    const markReq = await request('POST', '/attendance', {
      class_id: classId, academic_year_id: academicYearId, date: today, type: 'daily',
      records: [{ student_id: studentId, status: 'present', remarks: 'On time' }]
    }, adminToken);

    if (markReq.status !== 200) throw new Error(`Mark attendance failed: ${JSON.stringify(markReq.data)}`);
    console.log(`[4] Mark Daily Attendance... ✅ Success`);

    // Try dup attendance update (should act as upsert)
    const markDupReq = await request('POST', '/attendance', {
      class_id: classId, academic_year_id: academicYearId, date: today, type: 'daily',
      records: [{ student_id: studentId, status: 'absent' }]
    }, adminToken);
    
    if (markDupReq.status !== 200) throw new Error(`Overwrite attendance failed: ${JSON.stringify(markDupReq.data)}`);
    console.log(`[5] Update/Overwrite Attendance... ✅ Success`);

    // Fetch class attendance
    const classAtt = await request('GET', `/attendance/class/${classId}?date=${today}&type=daily`, null, adminToken);
    if (!classAtt.data.data.attendance || classAtt.data.data.attendance.length === 0) throw new Error('Class attendance empty');
    if (classAtt.data.data.attendance[0].status !== 'absent') throw new Error(`Attendance not updated to absent, got ${classAtt.data.data.attendance[0].status}`);
    console.log(`[6] Get Class Attendance... ✅ Success (Verified status 'absent' after update)`);

    // Fetch individual student attendance
    const stdAtt = await request('GET', `/attendance/student/${studentId}?type=daily`, null, adminToken);
    if (stdAtt.status !== 200 || stdAtt.data.data.attendance.length === 0) throw new Error('Student attendance fetch failed');
    console.log(`[7] Get Student Individual Attendance... ✅ Success`);

    console.log('\n🎉 ALL ATTENDANCE API TESTS PASSED SUCCESSFULLY! ✅\n');
  } catch (error: any) {
    console.error('\n❌ TEST RUN FAILED!', error.message || error);
    process.exit(1);
  }
}
runTests();
