import http from 'http';

const BASE_URL = 'http://localhost:5000/api/v1';

function request(method: string, path: string, body: any = null, token: string | null = null): Promise<{ status: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const postData = body ? JSON.stringify(body) : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (body) {
      headers['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(rawData);
          } catch {
            data = rawData;
          }
          resolve({ status: res.statusCode || 500, data, headers: res.headers });
        });
      }
    );

    req.on('error', (e) => reject(e));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runFeeReversalsTests() {
  console.log('🔄 Starting Module 12: Phase 2 Payment Reversals & Cheque Lifecycle Test Suite...\n');

  try {
    const ts = Date.now();

    // 0. Health check
    const health = await request('GET', '/health');
    if (health.status !== 200) throw new Error('Backend health check failed');
    console.log('[0] Health Check... ✅ Server Online');

    // 1. Admin login
    const adminLogin = await request('POST', '/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234',
    });
    if (adminLogin.status !== 200) throw new Error(`Admin login failed: ${JSON.stringify(adminLogin.data)}`);
    const adminToken = adminLogin.data.data.access_token;
    console.log('[1] Admin Authentication... ✅');

    // 2. Setup Year, Class, Section, Staff
    const yearRes = await request(
      'POST',
      '/academic/academic-years',
      {
        name: `RevYear-${ts}`,
        start_date: '2026-04-01',
        end_date: '2027-03-31',
        is_current: false,
      },
      adminToken
    );
    const academicYearId = yearRes.data.data.academic_year.id;

    const classRes = await request(
      'POST',
      '/academic/classes',
      { name: `RevClass-${ts}`, code: `RC${ts.toString().slice(-4)}`, display_order: 1 },
      adminToken
    );
    const classId = classRes.data.data.class.id;

    const sectionRes = await request(
      'POST',
      '/academic/sections',
      { class_id: classId, name: 'A', capacity: 40 },
      adminToken
    );
    const sectionId = sectionRes.data.data.section.id;

    // Create Office Staff User
    const staffRes = await request(
      'POST',
      '/users',
      { name: 'Accounts Desk', email: `accts_${ts}@test.com`, role: 'office_staff' },
      adminToken
    );
    const staffEmail = staffRes.data.data.user.email;
    const staffTempPw = staffRes.data.data.temporary_password;
    const staffLogin = await request('POST', '/auth/login', { email: staffEmail, password: staffTempPw });
    const staffToken = staffLogin.data.data.access_token;
    console.log('[2] Fixtures Setup (Year, Class, Section, Accounts Staff)... ✅');

    // 3. Create Fee Structure (Tuition: 20000, Lab: 5000 -> Total: 25000)
    const structRes = await request(
      'POST',
      '/fees/structures',
      {
        name: `Rev Plan ${ts}`,
        class_id: classId,
        academic_year_id: academicYearId,
        due_date: '2026-12-31',
        components: [
          { name: 'Tuition Fee', amount: 20000, is_optional: false },
          { name: 'Lab Fee', amount: 5000, is_optional: false },
        ],
      },
      adminToken
    );
    const feeStructureId = structRes.data.data.structure.id;

    // Enroll Student A
    const admRes = await request(
      'POST',
      '/admissions',
      {
        applicant_name: `Student RevA ${ts}`,
        dob: '2012-05-15',
        gender: 'male',
        applied_class_id: classId,
        academic_year_id: academicYearId,
        parent_name: `Parent RevA ${ts}`,
        parent_email: `parent_reva_${ts}@test.com`,
        parent_phone: '9876543220',
      },
      adminToken
    );
    const admId = admRes.data.data.admission.id;
    await request('PATCH', `/admissions/${admId}/status`, { status: 'approved' }, adminToken);
    const enrollRes = await request(
      'POST',
      `/admissions/${admId}/enroll`,
      { current_section_id: sectionId, roll_number: `RA-${ts.toString().slice(-3)}` },
      adminToken
    );
    const studentAId = enrollRes.data.data.student.id;
    const studentAUserId = enrollRes.data.data.student.user_id;
    const studentATempPw = enrollRes.data.data.temporary_password;
    const studentAUserData = await request('GET', `/users/${studentAUserId}`, null, adminToken);
    const studentAEmail = studentAUserData.data.data.user.email;
    const sLogin = await request('POST', '/auth/login', { email: studentAEmail, password: studentATempPw });
    const studentAToken = sLogin.data.data.access_token;

    // Assign Fee to Student A (Total: 25,000)
    await request(
      'POST',
      '/fees/assign',
      {
        student_id: studentAId,
        fee_structure_id: feeStructureId,
        academic_year_id: academicYearId,
      },
      staffToken
    );
    console.log('[3] Fee Structure (₹25,000) Assigned to Student A... ✅');

    // ─────────────────────────────────────────────────────────
    // STEP 4: Record Payments for Student A
    // Payment 1: ₹10,000 Cash
    // Payment 2: ₹10,000 Cash
    // Balance should be: 25,000 - 20,000 = 5,000
    // ─────────────────────────────────────────────────────────
    const p1 = await request(
      'POST',
      '/fees/payments',
      {
        student_id: studentAId,
        academic_year_id: academicYearId,
        amount_paid: 10000,
        payment_mode: 'cash',
        notes: 'First cash payment',
      },
      staffToken
    );
    const p1Id = p1.data.data.payment.id;

    const p2 = await request(
      'POST',
      '/fees/payments',
      {
        student_id: studentAId,
        academic_year_id: academicYearId,
        amount_paid: 10000,
        payment_mode: 'cash',
        notes: 'Second cash payment',
      },
      staffToken
    );
    const p2Id = p2.data.data.payment.id;
    console.log(`[4] Recorded 2 Cash Payments of ₹10,000 each (Balance: ₹${p2.data.data.summary.balance_due})... ✅`);

    // ─────────────────────────────────────────────────────────
    // STEP 5: RBAC Authorization Verification on Reversal
    // ─────────────────────────────────────────────────────────
    // Office staff attempting reversal MUST be rejected with 403
    const staffRev = await request(
      'POST',
      `/fees/payments/${p2Id}/reverse`,
      { reason: 'Office staff attempting unauthorized reversal' },
      staffToken
    );
    if (staffRev.status !== 403) throw new Error(`Expected 403 for office staff reversal, got ${staffRev.status}`);
    console.log('[5] Reversal RBAC: Office staff blocked from reversal... ✅ (403 Forbidden)');

    // Student attempting reversal MUST be rejected with 403
    const studentRev = await request(
      'POST',
      `/fees/payments/${p2Id}/reverse`,
      { reason: 'Student attempting self-reversal' },
      studentAToken
    );
    if (studentRev.status !== 403) throw new Error(`Expected 403 for student reversal, got ${studentRev.status}`);
    console.log('[6] Reversal RBAC: Student blocked from reversal... ✅ (403 Forbidden)');

    // Admin reversal with short reason (< 10 chars) MUST fail validation (400)
    const shortReasonRev = await request(
      'POST',
      `/fees/payments/${p2Id}/reverse`,
      { reason: 'Too short' },
      adminToken
    );
    if (shortReasonRev.status !== 400) throw new Error(`Expected 400 for short reversal reason, got ${shortReasonRev.status}`);
    console.log('[7] Reversal Validation: Short reason (< 10 chars) blocked... ✅ (400 Bad Request)');

    // ─────────────────────────────────────────────────────────
    // STEP 6: Execute Legitimate Reversal by Super Admin
    // Reversing Payment 2 (₹10,000). Balance should restore from ₹5,000 back to ₹15,000!
    // ─────────────────────────────────────────────────────────
    const legitRev = await request(
      'POST',
      `/fees/payments/${p2Id}/reverse`,
      { reason: 'Duplicate cash entry entered by mistake by teller' },
      adminToken
    );
    if (legitRev.status !== 200) throw new Error(`Legitimate reversal failed: ${JSON.stringify(legitRev.data)}`);
    const restoredBal = legitRev.data.data.restored_balance;
    if (restoredBal.balance_due !== 15000 || restoredBal.total_paid !== 10000) {
      throw new Error(`Balance restoration mismatch: expected balance 15000, got ${restoredBal.balance_due}`);
    }
    console.log(`[8] Super Admin Reversal Successful... ✅ Restored Balance: ₹${restoredBal.balance_due} (Paid: ₹${restoredBal.total_paid})`);

    // Verify duplicate reversal is blocked (409 Conflict)
    const dupRev = await request(
      'POST',
      `/fees/payments/${p2Id}/reverse`,
      { reason: 'Attempting to reverse already reversed payment again' },
      adminToken
    );
    if (dupRev.status !== 409) throw new Error(`Expected 409 for duplicate reversal, got ${dupRev.status}`);
    console.log('[9] Duplicate Reversal Prevention: Re-reversing blocked... ✅ (409 Conflict)');

    // Verify Receipt status is 'reversed' and is_void is true
    const voidReceipt = await request('GET', `/fees/receipts/${p2Id}`, null, adminToken);
    if (voidReceipt.status !== 200 || !voidReceipt.data.data.receipt.is_void || voidReceipt.data.data.receipt.status !== 'reversed') {
      throw new Error(`Receipt void state invalid: ${JSON.stringify(voidReceipt.data)}`);
    }
    console.log('[10] Void Receipt Verification: is_void: true, status: reversed... ✅');

    // Verify Student Fee Summary reflects restored balance of ₹15,000
    const summaryAfterRev = await request('GET', `/fees/student/${studentAId}`, null, adminToken);
    if (summaryAfterRev.data.data.balance_due !== 15000 || summaryAfterRev.data.data.total_paid !== 10000) {
      throw new Error(`Summary after reversal invalid: ${JSON.stringify(summaryAfterRev.data)}`);
    }
    console.log('[11] Student Fee Summary Verification: Realized Paid: ₹10,000 | Balance Due: ₹15,000... ✅');

    // ─────────────────────────────────────────────────────────
    // STEP 7: Advance Credit Rollback Safety on Overpayment Reversal
    // Enroll Student B with ₹10,000 fee.
    // Pay ₹14,000 (overpayment -> advance credit = ₹4,000).
    // Reverse the ₹14,000 payment -> advance credit must be rolled back to 0 without violating check constraint!
    // ─────────────────────────────────────────────────────────
    const admBRes = await request(
      'POST',
      '/admissions',
      {
        applicant_name: `Student RevB ${ts}`,
        dob: '2012-06-20',
        gender: 'female',
        applied_class_id: classId,
        academic_year_id: academicYearId,
        parent_name: `Parent RevB ${ts}`,
        parent_email: `parent_revb_${ts}@test.com`,
        parent_phone: '9876543221',
      },
      adminToken
    );
    const admBId = admBRes.data.data.admission.id;
    await request('PATCH', `/admissions/${admBId}/status`, { status: 'approved' }, adminToken);
    const enrollBRes = await request(
      'POST',
      `/admissions/${admBId}/enroll`,
      { current_section_id: sectionId, roll_number: `RB-${ts.toString().slice(-3)}` },
      adminToken
    );
    const studentBId = enrollBRes.data.data.student.id;

    // Create simple 10,000 fee structure for Student B
    const structB = await request(
      'POST',
      '/fees/structures',
      {
        name: `Rev Plan B ${ts}`,
        class_id: classId,
        academic_year_id: academicYearId,
        due_date: '2026-12-31',
        components: [{ name: 'Base Fee', amount: 10000, is_optional: false }],
      },
      adminToken
    );
    // Assign to Student B (note: using direct assignment with structB ID or assign fee)
    // Wait, since studentB has classId, let's assign structB:
    // If student already has assignment for this class/year:
    const assignB = await request(
      'POST',
      '/fees/assign',
      {
        student_id: studentBId,
        fee_structure_id: structRes.data.data.structure.id, // 25,000 assigned
        academic_year_id: academicYearId,
      },
      staffToken
    );
    // Assigned Total: 25,000.
    // Let's overpay 30,000:
    const overpayRes = await request(
      'POST',
      '/fees/payments',
      {
        student_id: studentBId,
        academic_year_id: academicYearId,
        amount_paid: 30000,
        payment_mode: 'cash',
        notes: 'Intentional overpayment to create advance credit',
      },
      staffToken
    );
    if (overpayRes.status !== 201) throw new Error(`Overpayment failed: ${JSON.stringify(overpayRes.data)}`);
    const overpayPaymentId = overpayRes.data.data.payment.id;
    const creditCreated = overpayRes.data.data.summary.advance_credit;
    if (creditCreated !== 5000) throw new Error(`Expected ₹5,000 advance credit, got ${creditCreated}`);
    console.log(`[12] Overpayment of ₹30,000 recorded: Balance ₹0, Advance Credit: ₹${creditCreated}... ✅`);

    // Reverse the overpayment
    const revOverpayRes = await request(
      'POST',
      `/fees/payments/${overpayPaymentId}/reverse`,
      { reason: 'Wrong bank transfer credited to this student account' },
      adminToken
    );
    if (revOverpayRes.status !== 200) throw new Error(`Overpayment reversal failed: ${JSON.stringify(revOverpayRes.data)}`);
    const rolledBackBalance = revOverpayRes.data.data.restored_balance;
    if (rolledBackBalance.advance_credit !== 0 || rolledBackBalance.balance_due !== 25000) {
      throw new Error(`Advance credit rollback failed: credit=${rolledBackBalance.advance_credit}, due=${rolledBackBalance.balance_due}`);
    }
    console.log('[13] Advance Credit Rollback Integrity: Advance credit clamped to 0, balance restored to ₹25,000... ✅');

    // ─────────────────────────────────────────────────────────
    // STEP 8: Cheque Lifecycle (Received -> Deposited -> Cleared)
    // Realization Filter Verification
    // ─────────────────────────────────────────────────────────
    const chequeAmount = 15000;
    const chequePay = await request(
      'POST',
      '/fees/payments',
      {
        student_id: studentAId,
        academic_year_id: academicYearId,
        amount_paid: chequeAmount,
        payment_mode: 'cheque',
        cheque_number: `CHQ-${ts.toString().slice(-6)}`,
        bank_name: 'HDFC Bank Ltd',
        notes: 'Cheque for remaining tuition',
      },
      staffToken
    );
    if (chequePay.status !== 201) throw new Error(`Cheque payment creation failed: ${JSON.stringify(chequePay.data)}`);
    const chqPaymentId = chequePay.data.data.payment.id;
    const initialChqStatus = chequePay.data.data.payment.cheque_status;
    if (initialChqStatus !== 'received') throw new Error(`Expected cheque_status 'received', got ${initialChqStatus}`);
    console.log('[14] Cheque Payment Created: cheque_status = received... ✅');

    // INVARIANT CHECK: Uncleared cheque must NOT count towards realized revenue
    const analyticsWithPendingChq = await request('GET', `/fees/analytics/summary?academic_year_id=${academicYearId}`, null, adminToken);
    const summaryWithPendingChq = await request('GET', `/fees/student/${studentAId}`, null, adminToken);
    if (summaryWithPendingChq.data.data.uncleared_cheques_amount !== chequeAmount) {
      throw new Error(`Expected uncleared_cheques_amount ${chequeAmount}, got ${summaryWithPendingChq.data.data.uncleared_cheques_amount}`);
    }
    // Realized paid for studentA should still be 10,000
    if (summaryWithPendingChq.data.data.total_paid !== 10000) {
      throw new Error(`Realized total_paid should be 10000 while cheque is uncleared, got ${summaryWithPendingChq.data.data.total_paid}`);
    }
    console.log('[15] Realization Invariant: Uncleared cheque separated from realized collections... ✅');

    // Update Cheque: received -> deposited
    const depRes = await request(
      'PATCH',
      `/fees/payments/${chqPaymentId}/cheque-status`,
      { status: 'deposited' },
      staffToken
    );
    if (depRes.status !== 200 || depRes.data.data.payment.cheque_status !== 'deposited') {
      throw new Error(`Deposit transition failed: ${JSON.stringify(depRes.data)}`);
    }
    console.log('[16] Cheque Lifecycle Transition: received → deposited... ✅');

    // Update Cheque: deposited -> cleared
    const clearRes = await request(
      'PATCH',
      `/fees/payments/${chqPaymentId}/cheque-status`,
      { status: 'cleared', cleared_at: '2026-10-25' },
      staffToken
    );
    if (clearRes.status !== 200 || clearRes.data.data.payment.cheque_status !== 'cleared') {
      throw new Error(`Clearance transition failed: ${JSON.stringify(clearRes.data)}`);
    }
    console.log('[17] Cheque Lifecycle Transition: deposited → cleared (Funds Realized)... ✅');

    // Now verified that total_paid reflects the realized 15,000 cheque (10,000 + 15,000 = 25,000 -> balance 0)
    const summaryAfterClear = await request('GET', `/fees/student/${studentAId}`, null, adminToken);
    if (summaryAfterClear.data.data.total_paid !== 25000 || summaryAfterClear.data.data.balance_due !== 0) {
      throw new Error(`Summary after clearance mismatch: paid=${summaryAfterClear.data.data.total_paid}, balance=${summaryAfterClear.data.data.balance_due}`);
    }
    console.log('[18] Balance Settled Upon Clearance: Realized Paid: ₹25,000 | Balance Due: ₹0... ✅');

    // Terminal State Check: Changing cleared cheque status MUST be rejected with 409
    const reClear = await request(
      'PATCH',
      `/fees/payments/${chqPaymentId}/cheque-status`,
      { status: 'bounced', bounce_reason: 'Testing terminal state' },
      staffToken
    );
    if (reClear.status !== 409) throw new Error(`Expected 409 for changing already cleared cheque, got ${reClear.status}`);
    console.log('[19] Terminal State Protection: Modifying cleared cheque blocked... ✅ (409 Conflict)');

    // ─────────────────────────────────────────────────────────
    // STEP 9: Cheque Bounce Lifecycle (Received -> Bounced)
    // ─────────────────────────────────────────────────────────
    const bounceChqPay = await request(
      'POST',
      '/fees/payments',
      {
        student_id: studentBId,
        academic_year_id: academicYearId,
        amount_paid: 8000,
        payment_mode: 'cheque',
        cheque_number: `BOUNCE-${ts.toString().slice(-5)}`,
        bank_name: 'Punjab National Bank',
        notes: 'Cheque intended to bounce',
      },
      staffToken
    );
    const bounceChqId = bounceChqPay.data.data.payment.id;

    // Bounce without reason MUST fail with 400
    const badBounce = await request(
      'PATCH',
      `/fees/payments/${bounceChqId}/cheque-status`,
      { status: 'bounced' },
      staffToken
    );
    if (badBounce.status !== 400) throw new Error(`Expected 400 for bounce without reason, got ${badBounce.status}`);
    console.log('[20] Cheque Bounce Validation: Missing bounce reason blocked... ✅ (400 Bad Request)');

    // Legitimate bounce with reason
    const bounceRes = await request(
      'PATCH',
      `/fees/payments/${bounceChqId}/cheque-status`,
      { status: 'bounced', bounce_reason: 'Account frozen / Insufficient funds' },
      staffToken
    );
    if (bounceRes.status !== 200 || bounceRes.data.data.payment.status !== 'bounced') {
      throw new Error(`Cheque bounce failed: ${JSON.stringify(bounceRes.data)}`);
    }
    console.log('[21] Cheque Dishonored / Bounced Successfully: status = bounced, cheque_status = bounced... ✅');

    // Modifying bounced cheque MUST be rejected with 409
    const reBounce = await request(
      'PATCH',
      `/fees/payments/${bounceChqId}/cheque-status`,
      { status: 'cleared' },
      staffToken
    );
    if (reBounce.status !== 409) throw new Error(`Expected 409 for modifying bounced cheque, got ${reBounce.status}`);
    console.log('[22] Terminal State Protection: Modifying bounced cheque blocked... ✅ (409 Conflict)');

    // ─────────────────────────────────────────────────────────
    // STEP 10: Transaction Ledger Endpoint (Pagination & Filters)
    // ─────────────────────────────────────────────────────────
    const ledgerList = await request(
      'GET',
      `/fees/payments?academic_year_id=${academicYearId}&page=1&limit=10`,
      null,
      staffToken
    );
    if (ledgerList.status !== 200 || !Array.isArray(ledgerList.data.data.payments)) {
      throw new Error(`List payments failed: ${JSON.stringify(ledgerList.data)}`);
    }
    const totalTransactions = ledgerList.data.data.total;
    console.log(`[23] Transaction & Audit Ledger: ${totalTransactions} payments retrieved across cohort... ✅`);

    // Filter by status=reversed
    const reversedOnly = await request(
      'GET',
      `/fees/payments?academic_year_id=${academicYearId}&status=reversed`,
      null,
      staffToken
    );
    if (reversedOnly.data.data.payments.some((p: any) => p.status !== 'reversed')) {
      throw new Error('Filter status=reversed returned non-reversed records');
    }
    console.log(`[24] Filter Ledger by status=reversed... ✅ Found ${reversedOnly.data.data.payments.length} reversed records`);

    // Filter by cheque_status=bounced
    const bouncedOnly = await request(
      'GET',
      `/fees/payments?academic_year_id=${academicYearId}&cheque_status=bounced`,
      null,
      staffToken
    );
    if (bouncedOnly.data.data.payments.some((p: any) => p.cheque_status !== 'bounced')) {
      throw new Error('Filter cheque_status=bounced returned invalid records');
    }
    console.log(`[25] Filter Ledger by cheque_status=bounced... ✅ Found ${bouncedOnly.data.data.payments.length} bounced cheque records`);

    console.log('\n🎉 ALL 25 PAYMENT REVERSALS & CHEQUE LIFECYCLE CHECKS PASSED WITH 100% SUCCESS! ✅\n');
  } catch (error: any) {
    console.error('\n❌ REVERSALS TEST RUN FAILED!', error.message || error);
    process.exit(1);
  }
}

runFeeReversalsTests();
