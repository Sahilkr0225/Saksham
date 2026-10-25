import http from 'http';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = 'http://127.0.0.1:5000/api/v1';

// HTTP Request helper
const request = (
  method: string,
  urlPath: string,
  body?: any,
  token?: string,
  headersExtra?: Record<string, string>
): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> => {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${urlPath}`);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headersExtra,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const payload = body ? JSON.stringify(body) : '';
    if (body) headers['Content-Length'] = Buffer.byteLength(payload).toString();

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
        res.on('data', (d) => (rawData += d));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode || 0,
              data: rawData ? JSON.parse(rawData) : null,
              headers: res.headers,
            });
          } catch {
            resolve({
              status: res.statusCode || 0,
              data: rawData,
              headers: res.headers,
            });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(payload);
    req.end();
  });
};

async function runHardeningTests() {
  console.log('🛡️ Starting Module 12: Phase 1 Financial Backend Hardening Test Suite...\n');
  const ts = Date.now();

  try {
    // ─────────────────────────────────────────────────────────
    // STEP 0: Verify Server & Login Admin
    // ─────────────────────────────────────────────────────────
    const ping = await request('GET', '/health');
    if (ping.status !== 200 || !ping.data?.success) {
      throw new Error(`Server is offline at ${BASE_URL}`);
    }
    console.log('[0] Health Check... ✅ Server Online');

    const adminLogin = await request('POST', '/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234',
    });
    if (adminLogin.status !== 200) throw new Error('Admin login failed');
    const adminToken = adminLogin.data.data.access_token;
    console.log('[1] Admin Authentication... ✅');

    // ─────────────────────────────────────────────────────────
    // STEP 1: Fixtures Setup
    // Create Academic Year, Class, Section
    // ─────────────────────────────────────────────────────────
    const yearRes = await request(
      'POST',
      '/academic/academic-years',
      { name: `HARDEN-AY-${ts}`, start_date: '2026-04-01', end_date: '2027-03-31', is_current: true },
      adminToken
    );
    const academicYearId = yearRes.data.data.academic_year.id;

    const classRes = await request(
      'POST',
      '/academic/classes',
      { name: `HARDEN-Class-${ts}`, code: `HC${ts.toString().slice(-4)}`, display_order: 1 },
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
      { name: 'Finance Staff', email: `fin_staff_${ts}@test.com`, role: 'office_staff' },
      adminToken
    );
    const staffEmail = staffRes.data.data.user.email;
    const staffTempPw = staffRes.data.data.temporary_password;
    const staffLogin = await request('POST', '/auth/login', { email: staffEmail, password: staffTempPw });
    const staffToken = staffLogin.data.data.access_token;
    console.log('[2] Fixtures Setup (Year, Class, Section, Finance Staff)... ✅');

    // ─────────────────────────────────────────────────────────
    // STEP 2: Enroll Student 1 (with linked Parent 1) and Student 2 (with linked Parent 2)
    // ─────────────────────────────────────────────────────────
    // Student 1
    const adm1Res = await request(
      'POST',
      '/admissions',
      {
        applicant_name: `Student One ${ts}`,
        dob: '2012-04-10',
        gender: 'male',
        applied_class_id: classId,
        academic_year_id: academicYearId,
        parent_name: `Parent One ${ts}`,
        parent_email: `parent1_${ts}@test.com`,
        parent_phone: '9876543210',
      },
      adminToken
    );
    const adm1Id = adm1Res.data.data.admission.id;
    await request('PATCH', `/admissions/${adm1Id}/status`, { status: 'approved' }, adminToken);
    const enroll1Res = await request(
      'POST',
      `/admissions/${adm1Id}/enroll`,
      { current_section_id: sectionId, roll_number: `R1-${ts.toString().slice(-3)}` },
      adminToken
    );
    const student1Id = enroll1Res.data.data.student.id;
    const student1UserId = enroll1Res.data.data.student.user_id;
    const student1TempPw = enroll1Res.data.data.temporary_password;
    const student1UserData = await request('GET', `/users/${student1UserId}`, null, adminToken);
    const student1Email = student1UserData.data.data.user.email;

    // Login Student 1
    const s1Login = await request('POST', '/auth/login', { email: student1Email, password: student1TempPw });
    const student1Token = s1Login.data.data.access_token;

    // Fetch and Login Parent 1
    const parent1Email = enroll1Res.data.data.parent_account.email;
    const parent1Pw = enroll1Res.data.data.parent_account.temporary_password;
    const p1Login = await request('POST', '/auth/login', { email: parent1Email, password: parent1Pw });
    if (p1Login.status !== 200) throw new Error(`Parent 1 login failed: ${JSON.stringify(p1Login.data)}`);
    const parent1Token = p1Login.data.data.access_token;

    // Student 2 (Unrelated to Parent 1 / Student 1)
    const adm2Res = await request(
      'POST',
      '/admissions',
      {
        applicant_name: `Student Two ${ts}`,
        dob: '2012-08-15',
        gender: 'female',
        applied_class_id: classId,
        academic_year_id: academicYearId,
        parent_name: `Parent Two ${ts}`,
        parent_email: `parent2_${ts}@test.com`,
        parent_phone: '9876543211',
      },
      adminToken
    );
    const adm2Id = adm2Res.data.data.admission.id;
    await request('PATCH', `/admissions/${adm2Id}/status`, { status: 'approved' }, adminToken);
    const enroll2Res = await request(
      'POST',
      `/admissions/${adm2Id}/enroll`,
      { current_section_id: sectionId, roll_number: `R2-${ts.toString().slice(-3)}` },
      adminToken
    );
    const student2Id = enroll2Res.data.data.student.id;
    const student2UserId = enroll2Res.data.data.student.user_id;
    const student2TempPw = enroll2Res.data.data.temporary_password;
    const student2UserData = await request('GET', `/users/${student2UserId}`, null, adminToken);
    const student2Email = student2UserData.data.data.user.email;

    // Login Student 2
    const s2Login = await request('POST', '/auth/login', { email: student2Email, password: student2TempPw });
    if (s2Login.status !== 200) throw new Error(`Student 2 login failed: ${JSON.stringify(s2Login.data)}`);
    const student2Token = s2Login.data.data.access_token;

    // Fetch and Login Parent 2
    const parent2Email = enroll2Res.data.data.parent_account.email;
    const parent2Pw = enroll2Res.data.data.parent_account.temporary_password;
    const p2Login = await request('POST', '/auth/login', { email: parent2Email, password: parent2Pw });
    if (p2Login.status !== 200) throw new Error(`Parent 2 login failed: ${JSON.stringify(p2Login.data)}`);
    const parent2Token = p2Login.data.data.access_token;

    console.log('[3] Student & Parent Onboarding & Auth Verification... ✅');

    // ─────────────────────────────────────────────────────────
    // STEP 3: Setup Fee Structure and Student Fee Assignments
    // ─────────────────────────────────────────────────────────
    const structRes = await request(
      'POST',
      '/fees/structures',
      {
        name: `Plan ${ts}`,
        class_id: classId,
        academic_year_id: academicYearId,
        due_date: '2026-10-30',
        components: [
          { name: 'Tuition Fee', amount: 20000, is_optional: false },
          { name: 'Activity Fee', amount: 5000, is_optional: false },
        ],
      },
      adminToken
    );
    const feeStructureId = structRes.data.data.structure.id;

    // Assign to Student 1 & Student 2 (₹25,000 total each)
    await request('POST', '/fees/assign', { student_id: student1Id, fee_structure_id: feeStructureId, academic_year_id: academicYearId }, staffToken);
    await request('POST', '/fees/assign', { student_id: student2Id, fee_structure_id: feeStructureId, academic_year_id: academicYearId }, staffToken);
    console.log('[4] Fee Structure Created & Assigned to Cohort... ✅');

    // ─────────────────────────────────────────────────────────
    // STEP 4: Record Baseline Payment for Student 1
    // ─────────────────────────────────────────────────────────
    const pay1 = await request(
      'POST',
      '/fees/payments',
      {
        student_id: student1Id,
        academic_year_id: academicYearId,
        amount_paid: 10000,
        payment_mode: 'cash',
        notes: 'Initial installment',
      },
      staffToken
    );
    if (pay1.status !== 201) throw new Error(`Baseline payment failed: ${JSON.stringify(pay1.data)}`);
    const s1PaymentId = pay1.data.data.payment.id;
    const s1ReceiptNumber = pay1.data.data.payment.receipt_number;
    console.log(`[5] Baseline Payment Recorded for Student 1... ✅ Receipt: ${s1ReceiptNumber}`);

    // ─────────────────────────────────────────────────────────
    // VERIFICATION 1: Student 1 accessing own receipt
    // ─────────────────────────────────────────────────────────
    const s1OwnReceipt = await request('GET', `/fees/receipts/${s1PaymentId}`, null, student1Token);
    if (s1OwnReceipt.status !== 200 || s1OwnReceipt.data.data?.receipt?.receipt_number !== s1ReceiptNumber) {
      throw new Error(`Student accessing own receipt failed: ${JSON.stringify(s1OwnReceipt.data)}`);
    }
    console.log('[6] Priority 1: Student accessing own receipt... ✅ (200 OK)');

    // ─────────────────────────────────────────────────────────
    // VERIFICATION 2: Student 2 attempting to access Student 1's receipt
    // MUST return privacy-preserving 404 (does NOT disclose receipt existence)
    // ─────────────────────────────────────────────────────────
    const s2HackerReceipt = await request('GET', `/fees/receipts/${s1PaymentId}`, null, student2Token);
    if (s2HackerReceipt.status !== 404) {
      throw new Error(`Expected 404 for student cross-access, got ${s2HackerReceipt.status}`);
    }
    console.log('[7] Priority 1: Student blocked from another student receipt... ✅ (404 Not Disclosed)');

    // ─────────────────────────────────────────────────────────
    // VERIFICATION 3: Parent 1 accessing linked Student 1's receipt
    // ─────────────────────────────────────────────────────────
    const p1OwnReceipt = await request('GET', `/fees/receipts/${s1PaymentId}`, null, parent1Token);
    if (p1OwnReceipt.status !== 200 || p1OwnReceipt.data.data?.receipt?.receipt_number !== s1ReceiptNumber) {
      throw new Error(`Parent accessing linked student receipt failed: ${JSON.stringify(p1OwnReceipt.data)}`);
    }
    console.log('[8] Priority 1: Parent accessing linked student receipt... ✅ (200 OK)');

    // ─────────────────────────────────────────────────────────
    // VERIFICATION 4: Parent 2 attempting to access unrelated Student 1's receipt
    // MUST return privacy-preserving 404
    // ─────────────────────────────────────────────────────────
    const p2HackerReceipt = await request('GET', `/fees/receipts/${s1PaymentId}`, null, parent2Token);
    if (p2HackerReceipt.status !== 404) {
      throw new Error(`Expected 404 for parent cross-access, got ${p2HackerReceipt.status}`);
    }
    console.log('[9] Priority 1: Parent blocked from unrelated student receipt... ✅ (404 Not Disclosed)');

    // ─────────────────────────────────────────────────────────
    // VERIFICATION 5: Concurrent Receipt Number Generation
    // Issue 5 simultaneous payment requests across different students and verify all get unique sequential receipts
    // ─────────────────────────────────────────────────────────
    console.log('[10] Priority 2: Testing Concurrency-Safe Receipt Number Generation...');
    const concurrentPayments = await Promise.all([
      request('POST', '/fees/payments', { student_id: student2Id, academic_year_id: academicYearId, amount_paid: 1000, payment_mode: 'cash' }, staffToken),
      request('POST', '/fees/payments', { student_id: student2Id, academic_year_id: academicYearId, amount_paid: 1500, payment_mode: 'cash' }, staffToken),
      request('POST', '/fees/payments', { student_id: student2Id, academic_year_id: academicYearId, amount_paid: 2000, payment_mode: 'cash' }, staffToken),
      request('POST', '/fees/payments', { student_id: student2Id, academic_year_id: academicYearId, amount_paid: 2500, payment_mode: 'cash' }, staffToken),
      request('POST', '/fees/payments', { student_id: student2Id, academic_year_id: academicYearId, amount_paid: 3000, payment_mode: 'cash' }, staffToken),
    ]);

    const receiptNumbers = concurrentPayments.map((p) => p.data?.data?.payment?.receipt_number);
    const uniqueReceipts = new Set(receiptNumbers);
    if (uniqueReceipts.size !== 5 || receiptNumbers.includes(undefined)) {
      throw new Error(`Duplicate or undefined receipt numbers generated under concurrency: ${JSON.stringify(receiptNumbers)}`);
    }
    console.log(`     Concurrent Receipts Generated: ${Array.from(uniqueReceipts).join(', ')}`);
    console.log('[10] Priority 2: Concurrency-Safe Receipt Numbers... ✅ (5/5 Unique)');

    // ─────────────────────────────────────────────────────────
    // VERIFICATION 6: Repeated Identical Payment Requests (Idempotency)
    // ─────────────────────────────────────────────────────────
    const testIdempotencyKey = `IDEMP-${ts}-UNIQUE-KEY`;
    console.log(`[11] Priority 3: Testing Idempotency Key: ${testIdempotencyKey}...`);

    // First request
    const firstIdempRes = await request(
      'POST',
      '/fees/payments',
      {
        student_id: student1Id,
        academic_year_id: academicYearId,
        amount_paid: 5000,
        payment_mode: 'cash',
        notes: 'Idempotent test payment',
        idempotency_key: testIdempotencyKey,
      },
      staffToken
    );
    if (firstIdempRes.status !== 201) {
      throw new Error(`First idempotent payment failed: ${JSON.stringify(firstIdempRes.data)}`);
    }
    const originalPaymentId = firstIdempRes.data.data.payment.id;
    const balanceAfterFirst = firstIdempRes.data.data.summary.balance_due;

    // Second request (Repeat identical request with SAME key via Header)
    const secondIdempRes = await request(
      'POST',
      '/fees/payments',
      {
        student_id: student1Id,
        academic_year_id: academicYearId,
        amount_paid: 5000,
        payment_mode: 'cash',
        notes: 'Idempotent test payment retry',
      },
      staffToken,
      { 'Idempotency-Key': testIdempotencyKey }
    );

    if (secondIdempRes.status !== 200) {
      throw new Error(`Expected 200 for idempotent replay, got ${secondIdempRes.status}`);
    }
    if (secondIdempRes.headers['idempotent-replay'] !== 'true') {
      throw new Error('Missing Idempotent-Replay response header');
    }
    if (secondIdempRes.data.data.payment.id !== originalPaymentId) {
      throw new Error('Idempotent replay returned different payment ID');
    }
    if (secondIdempRes.data.data.summary.balance_due !== balanceAfterFirst) {
      throw new Error('Balance was incorrectly deducted a second time on idempotent replay!');
    }
    console.log('[11] Priority 3: Repeated identical payment replayed safely... ✅ (Idempotent replay, zero duplicate deduction)');

    // ─────────────────────────────────────────────────────────
    // VERIFICATION 7: Two Distinct Legitimate Payments
    // ─────────────────────────────────────────────────────────
    const distinctKey1 = `DISTINCT-${ts}-A`;
    const distinctKey2 = `DISTINCT-${ts}-B`;

    const distinctPay1 = await request(
      'POST',
      '/fees/payments',
      {
        student_id: student1Id,
        academic_year_id: academicYearId,
        amount_paid: 2000,
        payment_mode: 'cash',
        notes: 'Distinct payment A',
        idempotency_key: distinctKey1,
      },
      staffToken
    );
    if (distinctPay1.status !== 201) throw new Error(`Distinct pay 1 failed: ${JSON.stringify(distinctPay1.data)}`);
    const balanceAfterDist1 = distinctPay1.data.data.summary.balance_due;

    const distinctPay2 = await request(
      'POST',
      '/fees/payments',
      {
        student_id: student1Id,
        academic_year_id: academicYearId,
        amount_paid: 3000,
        payment_mode: 'cash',
        notes: 'Distinct payment B',
        idempotency_key: distinctKey2,
      },
      staffToken
    );
    if (distinctPay2.status !== 201) throw new Error(`Distinct pay 2 failed: ${JSON.stringify(distinctPay2.data)}`);
    const balanceAfterDist2 = distinctPay2.data.data.summary.balance_due;

    if (balanceAfterDist2 !== balanceAfterDist1 - 3000) {
      throw new Error(`Balance due deduction mismatch: expected ${balanceAfterDist1 - 3000}, got ${balanceAfterDist2}`);
    }
    console.log('[12] Priority 3: Two distinct legitimate payments processed... ✅ (Balances updated accurately)');

    // ─────────────────────────────────────────────────────────
    // VERIFICATION 8: Transaction Rollback Behavior
    // Attempt invalid payment (e.g. cheque with missing cheque_number)
    // Verify no payment inserted and ledger untouched
    // ─────────────────────────────────────────────────────────
    const preRollbackPaymentsCountRes = await pool.query(
      `SELECT COUNT(*) FROM fee_payments WHERE student_id = $1`,
      [student1Id]
    );
    const preRollbackCount = parseInt(preRollbackPaymentsCountRes.rows[0].count);

    const badPayment = await request(
      'POST',
      '/fees/payments',
      {
        student_id: student1Id,
        academic_year_id: academicYearId,
        amount_paid: 5000,
        payment_mode: 'cheque',
        // Missing cheque_number & bank_name -> triggers 400 validation error before commit
      },
      staffToken
    );
    if (badPayment.status !== 400) {
      throw new Error(`Expected 400 for bad payment, got ${badPayment.status}`);
    }

    const postRollbackPaymentsCountRes = await pool.query(
      `SELECT COUNT(*) FROM fee_payments WHERE student_id = $1`,
      [student1Id]
    );
    const postRollbackCount = parseInt(postRollbackPaymentsCountRes.rows[0].count);

    if (preRollbackCount !== postRollbackCount) {
      throw new Error('Database transaction leaked partial payment record on validation failure!');
    }
    console.log('[13] Priority 4: Transaction Rollback Integrity... ✅ (Zero partial records left)');

    // ─────────────────────────────────────────────────────────
    // VERIFICATION 9: Ledger Balance Integrity & Overpayment Handling
    // Record payment exceeding remaining balance -> verify advance credit
    // ─────────────────────────────────────────────────────────
    const s1SummaryBefore = await request('GET', `/fees/student/${student1Id}`, null, adminToken);
    const remainingBalance = s1SummaryBefore.data.data.balance_due;
    const overpaymentAmount = remainingBalance + 4000;

    const overpayRes = await request(
      'POST',
      '/fees/payments',
      {
        student_id: student1Id,
        academic_year_id: academicYearId,
        amount_paid: overpaymentAmount,
        payment_mode: 'cash',
        notes: 'Overpayment test',
      },
      staffToken
    );
    if (overpayRes.status !== 201) throw new Error(`Overpayment failed: ${JSON.stringify(overpayRes.data)}`);

    const summaryAfterOverpay = overpayRes.data.data.summary;
    if (summaryAfterOverpay.balance_due !== 0) {
      throw new Error(`Expected balance 0 after overpayment, got ${summaryAfterOverpay.balance_due}`);
    }
    if (summaryAfterOverpay.advance_credit !== 4000) {
      throw new Error(`Expected advance credit 4000, got ${summaryAfterOverpay.advance_credit}`);
    }

    // Verify DB ledger table matches API summary
    const dbLedger = await pool.query(
      `SELECT advance_credit FROM student_fee_ledger WHERE student_id = $1 AND academic_year_id = $2`,
      [student1Id, academicYearId]
    );
    if (parseFloat(dbLedger.rows[0].advance_credit) !== 4000) {
      throw new Error(`DB advance_credit mismatch: expected 4000, got ${dbLedger.rows[0].advance_credit}`);
    }
    console.log('[14] Priority 4: Ledger Advance Credit & Balance Invariant Integrity... ✅ (Balance: 0, Advance: ₹4,000)');

    console.log('\n🎉 ALL 14 FINANCIAL BACKEND HARDENING CHECKS PASSED WITH 100% SUCCESS! ✅\n');
  } catch (error: any) {
    console.error('\n❌ TEST RUN FAILED!', error.message || error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runHardeningTests();
