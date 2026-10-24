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

const runTests = async () => {
  try {
    console.log('🧪 Starting End-to-End Student Management API Tests...');

    // 1. Health check
    console.log('\n[1] Testing Health check...');
    const health = await request('GET', '/health');
    console.log(`Status: ${health.status}, Message: ${health.data.message}`);
    if (health.status !== 200 || !health.data.success) {
      throw new Error('Health check failed');
    }

    // 2. Login as Super Admin
    console.log('\n[2] Logging in as Super Admin...');
    const login = await request('POST', '/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234'
    });
    console.log(`Status: ${login.status}, Success: ${login.data.success}`);
    if (login.status !== 200 || !login.data.data.access_token) {
      throw new Error('Super admin login failed');
    }
    const token = login.data.data.access_token;
    console.log('Access token received successfully.');

    // 3. Create Academic Year
    console.log('\n[3] Creating Academic Year...');
    const yearName = `AY-${Date.now()}`;
    const start_date = '2026-04-01';
    const end_date = '2027-03-31';
    const acYear = await request(
      'POST',
      '/academic/academic-years',
      { name: yearName, start_date, end_date, is_current: true },
      token
    );
    console.log(`Status: ${acYear.status}, Message: ${acYear.data.message}`);
    if (acYear.status !== 201) {
      throw new Error('Failed to create academic year');
    }
    const targetYearId = acYear.data.data.academic_year.id;

    // 4. Create Class
    console.log('\n[4] Creating Class...');
    const className = `Test Class ${Date.now()}`;
    const classResult = await request(
      'POST',
      '/academic/classes',
      { name: className, code: `TC-${String(Date.now()).slice(-4)}`, display_order: 1 },
      token
    );
    console.log(`Status: ${classResult.status}, Message: ${classResult.data.message}`);
    if (classResult.status !== 201) {
      throw new Error('Failed to create class');
    }
    const targetClassId = classResult.data.data.class.id;

    // 5. Create Section
    console.log('\n[5] Creating Section...');
    const sectionName = `Section A-${Date.now()}`;
    const sectionResult = await request(
      'POST',
      '/academic/sections',
      { class_id: targetClassId, name: sectionName, capacity: 30, room_number: 'R101' },
      token
    );
    console.log(`Status: ${sectionResult.status}, Message: ${sectionResult.data.message}`);
    if (sectionResult.status !== 201) {
      throw new Error('Failed to create section');
    }
    const targetSectionId = sectionResult.data.data.section.id;

    // 6. Create Admission Application (Submit)
    console.log('\n[6] Submitting Admission Application...');
    const applicantEmail = `parent-${Date.now()}@test.com`;
    const admissionResult = await request(
      'POST',
      '/admissions',
      {
        applicant_name: 'Aditya Sen',
        dob: '2016-08-15',
        gender: 'male',
        applied_class_id: targetClassId,
        academic_year_id: targetYearId,
        parent_name: 'Rahul Sen',
        parent_email: applicantEmail,
        parent_phone: '9999988888',
        address: 'Delhi NCR',
        remarks: 'Direct admission'
      },
      token
    );
    console.log(`Status: ${admissionResult.status}, Message: ${admissionResult.data.message}`);
    if (admissionResult.status !== 201) {
      throw new Error('Failed to submit admission application');
    }
    const targetAdmissionId = admissionResult.data.data.admission.id;

    // 7. Approve Admission Application
    console.log('\n[7] Approving Admission Application...');
    const approveResult = await request(
      'PATCH',
      `/admissions/${targetAdmissionId}/status`,
      { status: 'approved', remarks: 'Documents verified and approved' },
      token
    );
    console.log(`Status: ${approveResult.status}, Status updated to: ${approveResult.data.data.admission.status}`);
    if (approveResult.status !== 200 || approveResult.data.data.admission.status !== 'approved') {
      throw new Error('Failed to approve admission application');
    }

    // 8. Enroll Student
    console.log('\n[8] Enrolling Student...');
    const enrollResult = await request(
      'POST',
      `/admissions/${targetAdmissionId}/enroll`,
      {
        current_section_id: targetSectionId,
        roll_number: '1A-05',
        blood_group: 'AB+',
        emergency_contact: '9999911111'
      },
      token
    );
    console.log(`Status: ${enrollResult.status}, Message: ${enrollResult.data.message}`);
    if (enrollResult.status !== 201) {
      throw new Error('Student enrollment failed');
    }
    const studentData = enrollResult.data.data.student;
    console.log(`Student enrolled! STU ID: ${studentData.id}, Admission Number: ${studentData.admission_number}`);
    const targetStudentId = studentData.id;

    // 9. Query Student List
    console.log('\n[9] Querying Student list...');
    const studentList = await request(
      'GET',
      `/students?search=Aditya`,
      null,
      token
    );
    console.log(`Status: ${studentList.status}, Items found: ${studentList.data.data.students.length}`);
    if (studentList.status !== 200 || studentList.data.data.students.length === 0) {
      throw new Error('Failed to list newly enrolled student');
    }

    // 10. Fetch Student Profile
    console.log('\n[10] Fetching detailed student profile...');
    const studentDetail = await request(
      'GET',
      `/students/${targetStudentId}`,
      null,
      token
    );
    console.log(`Status: ${studentDetail.status}, Student Name: ${studentDetail.data.data.student.student_name}`);
    if (studentDetail.status !== 200 || studentDetail.data.data.student.id !== targetStudentId) {
      throw new Error('Failed to fetch detailed student profile');
    }

    // 11. Update Student details
    console.log('\n[11] Updating student details...');
    const updateResult = await request(
      'PUT',
      `/students/${targetStudentId}`,
      {
        dob: '2016-08-16',
        roll_number: '1A-10',
        blood_group: 'B+',
        address: 'Gurgaon, Haryana',
        emergency_contact: '8888877777'
      },
      token
    );
    console.log(`Status: ${updateResult.status}, Message: ${updateResult.data.message}`);
    if (updateResult.status !== 200) {
      throw new Error('Failed to update student details');
    }
    if (updateResult.data.data.student.roll_number !== '1A-10') {
      throw new Error('Update fields did not persist correctly');
    }

    // 12. Update Student status
    console.log('\n[12] Updating student status to suspended...');
    const statusUpdate = await request(
      'PATCH',
      `/students/${targetStudentId}/status`,
      { status: 'suspended', remarks: 'Disciplinary check' },
      token
    );
    console.log(`Status: ${statusUpdate.status}, PERSISTED status: ${statusUpdate.data.data.student.status}`);
    if (statusUpdate.status !== 200 || statusUpdate.data.data.student.status !== 'suspended') {
      throw new Error('Failed to update student status');
    }

    // 13. Re-assign Student Section
    console.log('\n[13] Promoting/moving student to class & section...');
    const sectionAssign = await request(
      'PATCH',
      `/students/${targetStudentId}/section`,
      { class_id: targetClassId, section_id: targetSectionId, roll_number: '1A-25' },
      token
    );
    console.log(`Status: ${sectionAssign.status}, Roll number after update: ${sectionAssign.data.data.student.roll_number}`);
    if (sectionAssign.status !== 200 || sectionAssign.data.data.student.roll_number !== '1A-25') {
      throw new Error('Section/roll re-assignment failed');
    }

    console.log('\n🎉 ALL STUDENT MANAGEMENT API TESTS PASSED SUCCESSFULLY! ✅');
  } catch (error) {
    console.error('\n❌ TEST RUN FAILED!', error);
    process.exit(1);
  }
};

runTests();
