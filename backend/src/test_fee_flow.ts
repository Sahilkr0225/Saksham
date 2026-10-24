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
  console.log('🧪 Starting End-to-End Fee Management API Tests...\n');
  try {
    // ─────────────────────────────────────────────────────────
    // SETUP: server, login, create test data
    // ─────────────────────────────────────────────────────────
    const health = await request('GET', '/health');
    console.log(`[1]  Ping Server... ${health.data.success ? '✅ ONLINE' : '❌ OFFLINE'}`);

    // Admin login
    const adminLogin = await request('POST', '/auth/login', { email: 'admin@gmail.com', password: 'Saksham_developer@1234' });
    if (adminLogin.status !== 200) throw new Error('Admin login failed');
    const adminToken = adminLogin.data.data.access_token;
    console.log(`[2]  Admin Login... ✅`);

    // Create Academic Year
    const ts = Date.now();
    const yearRes = await request('POST', '/academic/academic-years', {
      name: `FEE-AY-${ts}`, start_date: '2026-04-01', end_date: '2027-03-31', is_current: true
    }, adminToken);
    const academicYearId = yearRes.data.data.academic_year.id;

    // Create Class & Section
    const classRes = await request('POST', '/academic/classes', { name: `FEE-Class-${ts}`, code: `FC${ts.toString().slice(-4)}`, display_order: 1 }, adminToken);
    const classId = classRes.data.data.class.id;
    const sectionRes = await request('POST', '/academic/sections', { class_id: classId, name: 'A', capacity: 30 }, adminToken);
    const sectionId = sectionRes.data.data.section.id;

    // Enroll a student (via admissions flow)
    const admRes = await request('POST', '/admissions', {
      applicant_name: `Fee Student ${ts}`, dob: '2012-05-15', gender: 'male',
      applied_class_id: classId, academic_year_id: academicYearId,
      parent_name: 'Fee Parent', parent_email: `feep_${ts}@test.com`, parent_phone: '9988776655'
    }, adminToken);
    const admissionId = admRes.data.data.admission.id;
    await request('PATCH', `/admissions/${admissionId}/status`, { status: 'approved', remarks: 'ok' }, adminToken);
    const enrollRes = await request('POST', `/admissions/${admissionId}/enroll`, {
      current_section_id: sectionId, roll_number: `FEE-${ts.toString().slice(-3)}`
    }, adminToken);
    const studentId = enrollRes.data.data.student.id;
    const studentUserId = enrollRes.data.data.student.user_id;
    const studentTempPw = enrollRes.data.data.temporary_password;
    
    // Fetch user to get email
    const studentUserData = await request('GET', `/users/${studentUserId}`, null, adminToken);
    const studentEmail = studentUserData.data.data.user.email;

    console.log(`[3]  Test Data Setup (Year, Class, Section, Student)... ✅`);

    // Create office_staff user and login
    const staffRes = await request('POST', '/users', { name: 'Office Staff', email: `staff_${ts}@test.com`, role: 'office_staff' }, adminToken);
    const staffTempPw = staffRes.data.data.temporary_password;
    const staffEmail = staffRes.data.data.user.email;
    const staffLogin = await request('POST', '/auth/login', { email: staffEmail, password: staffTempPw });
    if (staffLogin.status !== 200) throw new Error('Staff login failed');
    const staffToken = staffLogin.data.data.access_token;
    console.log(`[4]  Office Staff Creation & Login... ✅`);

    // Student login
    const studentLogin = await request('POST', '/auth/login', { email: studentEmail, password: studentTempPw });
    if (studentLogin.status !== 200) throw new Error(`Student login failed: ${JSON.stringify(studentLogin.data)}`);
    const studentToken = studentLogin.data.data.access_token;
    console.log(`[5]  Student Login... ✅`);

    // ─────────────────────────────────────────────────────────
    // FEE STRUCTURE
    // ─────────────────────────────────────────────────────────

    // Create fee structure with components
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 2);
    const dueDateStr = futureDate.toISOString().split('T')[0];

    const structureRes = await request('POST', '/fees/structures', {
      name: `Grade Fee Plan ${ts}`,
      class_id: classId,
      academic_year_id: academicYearId,
      due_date: dueDateStr,
      description: 'Annual fee plan for test class',
      components: [
        { name: 'Tuition Fee', amount: 30000, is_optional: false },
        { name: 'Lab Fee',     amount: 5000,  is_optional: false },
        { name: 'Transport',   amount: 8000,  is_optional: true  },
      ]
    }, adminToken);
    if (structureRes.status !== 201) throw new Error(`Create fee structure failed: ${JSON.stringify(structureRes.data)}`);
    const feeStructureId = structureRes.data.data.structure.id;
    const structureTotal = structureRes.data.data.structure.total_amount;
    console.log(`[6]  Create Fee Structure... ✅ Total: ₹${structureTotal} | ID: ${feeStructureId}`);

    // List fee structures
    const listStructRes = await request('GET', `/fees/structures?class_id=${classId}`, null, adminToken);
    if (listStructRes.status !== 200 || listStructRes.data.data.structures.length === 0) throw new Error('Fee structures list empty');
    console.log(`[7]  List Fee Structures... ✅ Found ${listStructRes.data.data.structures.length} structure(s)`);

    // Get fee structure by ID (with components)
    const getStructRes = await request('GET', `/fees/structures/${feeStructureId}`, null, adminToken);
    if (getStructRes.status !== 200 || getStructRes.data.data.structure.components.length !== 3) throw new Error(`Expected 3 components, got ${getStructRes.data.data.structure.components.length}`);
    console.log(`[8]  Get Fee Structure by ID... ✅ (${getStructRes.data.data.structure.components.length} components)`);

    // Add a new component
    const addCompRes = await request('POST', `/fees/structures/${feeStructureId}/components`, {
      name: 'Exam Fee', amount: 2000, is_optional: false
    }, staffToken);
    if (addCompRes.status !== 201) throw new Error(`Add component failed: ${JSON.stringify(addCompRes.data)}`);
    const newCompId = addCompRes.data.data.component.id;
    console.log(`[9]  Add Fee Component (Exam Fee ₹2000)... ✅ New Total: ₹${addCompRes.data.data.new_structure_total}`);

    // Update the component
    const updCompRes = await request('PATCH', `/fees/components/${newCompId}`, { amount: 2500 }, staffToken);
    if (updCompRes.status !== 200) throw new Error(`Update component failed: ${JSON.stringify(updCompRes.data)}`);
    console.log(`[10] Update Fee Component (Exam Fee → ₹2500)... ✅ New Total: ₹${updCompRes.data.data.new_structure_total}`);

    // Update fee structure (change due date)
    const updStructRes = await request('PATCH', `/fees/structures/${feeStructureId}`, { description: 'Updated description' }, staffToken);
    if (updStructRes.status !== 200) throw new Error(`Update structure failed: ${JSON.stringify(updStructRes.data)}`);
    console.log(`[11] Update Fee Structure... ✅`);

    // Delete the extra component we added
    const delCompRes = await request('DELETE', `/fees/components/${newCompId}`, null, staffToken);
    if (delCompRes.status !== 200) throw new Error(`Delete component failed: ${JSON.stringify(delCompRes.data)}`);
    console.log(`[12] Delete Fee Component... ✅ Total back to: ₹${delCompRes.data.data.new_structure_total}`);

    // ─────────────────────────────────────────────────────────
    // STUDENT FEE ASSIGNMENT
    // ─────────────────────────────────────────────────────────

    // Get the optional transport component ID
    const structWithComps = await request('GET', `/fees/structures/${feeStructureId}`, null, adminToken);
    const optionalComp = structWithComps.data.data.structure.components.find((c: any) => c.is_optional);
    const optionalCompId = optionalComp?.id;
    const mandatoryTotal = structWithComps.data.data.structure.components
      .filter((c: any) => !c.is_optional)
      .reduce((sum: number, c: any) => sum + parseFloat(c.amount), 0);

    // Assign fee structure to student (include optional transport)
    const assignRes = await request('POST', '/fees/assign', {
      student_id: studentId,
      fee_structure_id: feeStructureId,
      academic_year_id: academicYearId,
      include_optional_component_ids: [optionalCompId]
    }, staffToken);
    if (assignRes.status !== 201) throw new Error(`Fee assignment failed: ${JSON.stringify(assignRes.data)}`);
    const assignedTotal = assignRes.data.data.assignment.total_amount;
    console.log(`[13] Assign Fee to Student (with optional transport)... ✅ Assigned Total: ₹${assignedTotal}`);

    // Duplicate assignment should fail
    const dupAssign = await request('POST', '/fees/assign', {
      student_id: studentId, fee_structure_id: feeStructureId, academic_year_id: academicYearId
    }, staffToken);
    if (dupAssign.status !== 409) throw new Error(`Expected 409 for duplicate assignment, got ${dupAssign.status}`);
    console.log(`[14] Duplicate Assignment Blocked... ✅ (409)`);

    // ─────────────────────────────────────────────────────────
    // PAYMENTS
    // ─────────────────────────────────────────────────────────

    // Record cash payment
    const pay1Res = await request('POST', '/fees/payments', {
      student_id: studentId,
      academic_year_id: academicYearId,
      amount_paid: 20000,
      payment_mode: 'cash',
      payment_date: new Date().toISOString().split('T')[0],
      notes: 'First instalment - cash'
    }, staffToken);
    if (pay1Res.status !== 201) throw new Error(`Cash payment failed: ${JSON.stringify(pay1Res.data)}`);
    const receipt1Id = pay1Res.data.data.payment.id;
    const receipt1Number = pay1Res.data.data.payment.receipt_number;
    console.log(`[15] Record Cash Payment (₹20,000)... ✅ Receipt: ${receipt1Number}`);
    console.log(`      Balance Remaining: ₹${pay1Res.data.data.summary.balance_due}`);

    // Record cheque payment
    const pay2Res = await request('POST', '/fees/payments', {
      student_id: studentId,
      academic_year_id: academicYearId,
      amount_paid: 15000,
      payment_mode: 'cheque',
      payment_date: new Date().toISOString().split('T')[0],
      cheque_number: 'CHQ-001234',
      bank_name: 'State Bank of India',
      notes: 'Second instalment - cheque'
    }, staffToken);
    if (pay2Res.status !== 201) throw new Error(`Cheque payment failed: ${JSON.stringify(pay2Res.data)}`);
    const receipt2Number = pay2Res.data.data.payment.receipt_number;
    console.log(`[16] Record Cheque Payment (₹15,000)... ✅ Receipt: ${receipt2Number}`);
    console.log(`      Balance Remaining: ₹${pay2Res.data.data.summary.balance_due}`);

    // Cheque payment without cheque_number should fail
    const badCheque = await request('POST', '/fees/payments', {
      student_id: studentId, academic_year_id: academicYearId,
      amount_paid: 1000, payment_mode: 'cheque'  // missing cheque_number & bank_name
    }, staffToken);
    if (badCheque.status !== 400) throw new Error(`Expected 400 for missing cheque_number, got ${badCheque.status}`);
    console.log(`[17] Cheque Without Number Blocked... ✅ (400 validation error)`);

    // ─────────────────────────────────────────────────────────
    // ADVANCE PAYMENT
    // ─────────────────────────────────────────────────────────

    // Pay MORE than remaining balance (advance payment)
    const remainingBalance = pay2Res.data.data.summary.balance_due;
    const advanceExtra = 5000;
    const pay3Res = await request('POST', '/fees/payments', {
      student_id: studentId,
      academic_year_id: academicYearId,
      amount_paid: remainingBalance + advanceExtra,   // intentional overpayment
      payment_mode: 'cash',
      notes: 'Overpayment — advance for next term'
    }, staffToken);
    if (pay3Res.status !== 201) throw new Error(`Advance payment failed: ${JSON.stringify(pay3Res.data)}`);
    const receipt3Number = pay3Res.data.data.payment.receipt_number;
    const advanceCredit = pay3Res.data.data.summary.advance_credit;
    console.log(`[18] Advance Payment (₹${remainingBalance + advanceExtra})... ✅ Receipt: ${receipt3Number}`);
    console.log(`      Balance: ₹${pay3Res.data.data.summary.balance_due} | Advance Credit: ₹${advanceCredit}`);

    // ─────────────────────────────────────────────────────────
    // RECEIPTS
    // ─────────────────────────────────────────────────────────

    const receiptRes = await request('GET', `/fees/receipts/${receipt1Id}`, null, adminToken);
    if (receiptRes.status !== 200) throw new Error(`Get receipt failed: ${JSON.stringify(receiptRes.data)}`);
    console.log(`[19] Get Receipt Details... ✅ Receipt No: ${receiptRes.data.data.receipt.receipt_number}`);

    // ─────────────────────────────────────────────────────────
    // STUDENT FEE SUMMARY
    // ─────────────────────────────────────────────────────────

    const summaryRes = await request('GET', `/fees/student/${studentId}`, null, adminToken);
    if (summaryRes.status !== 200) throw new Error(`Get student fee summary failed: ${JSON.stringify(summaryRes.data)}`);
    const summary = summaryRes.data.data;
    console.log(`[20] Get Student Fee Summary (Admin)... ✅`);
    console.log(`      Status: ${summary.status} | Paid: ₹${summary.total_paid} | Credit: ₹${summary.advance_credit}`);

    // Student views own fee summary
    const selfSummary = await request('GET', `/fees/student/${studentId}`, null, studentToken);
    if (selfSummary.status !== 200) throw new Error(`Student self fee summary failed: ${JSON.stringify(selfSummary.data)}`);
    console.log(`[21] Student Views Own Fee Summary... ✅ (Status: ${selfSummary.data.data.status})`);

    // ─────────────────────────────────────────────────────────
    // DUES & OVERDUE
    // ─────────────────────────────────────────────────────────

    // Pending dues (student is fully paid, so pending list should be empty or 0 for this student)
    const pendingRes = await request('GET', `/fees/dues/pending?academic_year_id=${academicYearId}`, null, staffToken);
    if (pendingRes.status !== 200) throw new Error(`Pending dues failed: ${JSON.stringify(pendingRes.data)}`);
    console.log(`[22] Pending Dues List... ✅ (${pendingRes.data.data.count} students with pending fees)`);

    // Overdue dues
    const overdueRes = await request('GET', `/fees/dues/overdue?academic_year_id=${academicYearId}`, null, staffToken);
    if (overdueRes.status !== 200) throw new Error(`Overdue dues failed: ${JSON.stringify(overdueRes.data)}`);
    console.log(`[23] Overdue Dues List... ✅ (${overdueRes.data.data.count} overdue students)`);

    // ─────────────────────────────────────────────────────────
    // NOTIFICATIONS
    // ─────────────────────────────────────────────────────────

    const upcomingRes = await request('GET', `/fees/notifications/upcoming?days=60&academic_year_id=${academicYearId}`, null, staffToken);
    if (upcomingRes.status !== 200) throw new Error(`Upcoming reminders failed: ${JSON.stringify(upcomingRes.data)}`);
    console.log(`[24] Upcoming Due Reminders (next 60 days)... ✅ (${upcomingRes.data.data.count} students)`);

    const overdueRemRes = await request('GET', `/fees/notifications/overdue?academic_year_id=${academicYearId}`, null, staffToken);
    if (overdueRemRes.status !== 200) throw new Error(`Overdue reminders failed: ${JSON.stringify(overdueRemRes.data)}`);
    console.log(`[25] Overdue Reminders... ✅ (${overdueRemRes.data.data.count} students)`);

    // ─────────────────────────────────────────────────────────
    // ANALYTICS
    // ─────────────────────────────────────────────────────────

    const analyticsRes = await request('GET', `/fees/analytics/summary?academic_year_id=${academicYearId}`, null, adminToken);
    if (analyticsRes.status !== 200) throw new Error(`Analytics failed: ${JSON.stringify(analyticsRes.data)}`);
    const analytics = analyticsRes.data.data.summary;
    console.log(`[26] Analytics Summary... ✅`);
    console.log(`      Expected: ₹${analytics.total_fees_expected} | Collected: ₹${analytics.total_collected} | Rate: ${analytics.collection_rate_percent}%`);

    // ─────────────────────────────────────────────────────────
    // NEGATIVE: RBAC
    // ─────────────────────────────────────────────────────────

    // Student cannot record payments
    const negPay = await request('POST', '/fees/payments', {
      student_id: studentId, academic_year_id: academicYearId, amount_paid: 100, payment_mode: 'cash'
    }, studentToken);
    if (negPay.status !== 403) throw new Error(`Expected 403 for student recording payment, got ${negPay.status}`);
    console.log(`[27] Negative: Student blocked from recording payment... ✅ (403)`);

    // Student cannot view analytics
    const negAnalytics = await request('GET', `/fees/analytics/summary`, null, studentToken);
    if (negAnalytics.status !== 403) throw new Error(`Expected 403 for student analytics, got ${negAnalytics.status}`);
    console.log(`[28] Negative: Student blocked from analytics... ✅ (403)`);

    console.log('\n🎉 ALL FEE MANAGEMENT API TESTS PASSED SUCCESSFULLY! ✅\n');
  } catch (error: any) {
    console.error('\n❌ TEST RUN FAILED!', error.message || error);
    process.exit(1);
  }
}
runTests();
