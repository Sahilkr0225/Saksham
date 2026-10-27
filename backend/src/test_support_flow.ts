import pool from './config/db';
import { generateAccessToken } from './utils/auth';
import { initDb } from './config/initDb';

const API_BASE = 'http://localhost:5000/api/v1';

async function request(
  method: string,
  endpoint: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any; headers?: Headers; text?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  let responseBody: any = null;
  let text = '';

  if (contentType.includes('application/json')) {
    responseBody = await res.json();
  } else {
    text = await res.text();
  }

  return { status: res.status, body: responseBody, headers: res.headers, text };
}

async function runSupportTests() {
  console.log('🆘 Starting Module 18 Help & Support Test Suite\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  try {
    await initDb();

    const timestamp = Date.now();
    const adminEmail = `admin_sup_${timestamp}@saksham.test`;
    const teacherEmail = `teacher_sup_${timestamp}@saksham.test`;
    const studentEmail = `student_sup_${timestamp}@saksham.test`;

    // 1. Create test users
    const adminRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Support Admin', $1, 'hash', true) RETURNING id`,
      [adminEmail]
    );
    const adminId = adminRes.rows[0].id;

    const teacherRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Support Teacher', $1, 'hash', true) RETURNING id`,
      [teacherEmail]
    );
    const teacherId = teacherRes.rows[0].id;

    const studentRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Support Student', $1, 'hash', true) RETURNING id`,
      [studentEmail]
    );
    const studentId = studentRes.rows[0].id;

    // Assign roles
    const superAdminRole = (await pool.query("SELECT id FROM roles WHERE name = 'super_admin'")).rows[0].id;
    const teacherRole = (await pool.query("SELECT id FROM roles WHERE name = 'teacher'")).rows[0].id;
    const studentRole = (await pool.query("SELECT id FROM roles WHERE name = 'student'")).rows[0].id;

    await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [adminId, superAdminRole]);
    await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [teacherId, teacherRole]);
    await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [studentId, studentRole]);

    const adminToken = generateAccessToken({ userId: adminId, role: 'super_admin' });
    const teacherToken = generateAccessToken({ userId: teacherId, role: 'teacher' });
    const studentToken = generateAccessToken({ userId: studentId, role: 'student' });

    console.log('--- Test Group 1: FAQs ---');

    // 1. Read default FAQs
    const faqsRes = await request('GET', '/support/faqs');
    assert(faqsRes.status === 200, 'Public FAQ retrieval returns 200');
    assert(Array.isArray(faqsRes.body?.data) && faqsRes.body.data.length > 0, 'Returns seeded default FAQs');

    // 2. Filter FAQ by category
    const feeFaqRes = await request('GET', '/support/faqs?category=fees');
    assert(feeFaqRes.status === 200, 'FAQ retrieval with category filter returns 200');
    assert(
      feeFaqRes.body?.data.every((f: any) => f.category === 'fees'),
      'All returned FAQs match the requested category'
    );

    // 3. Admin create FAQ
    const newFaq = {
      category: 'admissions',
      question: `What are the documents needed for Grade 1 admission? [${timestamp}]`,
      answer: 'Birth certificate, previous report card, and two passport-sized photographs.',
      display_order: 10
    };
    const createFaqRes = await request('POST', '/support/faqs', newFaq, adminToken);
    assert(createFaqRes.status === 201, 'Super admin can create new FAQ item');
    assert(createFaqRes.body?.data?.question === newFaq.question, 'Created FAQ has matching question');

    // 4. Non-admin cannot create FAQ
    const nonAdminFaqRes = await request('POST', '/support/faqs', newFaq, studentToken);
    assert(nonAdminFaqRes.status === 403, 'Student is forbidden from creating FAQ');

    console.log('\n--- Test Group 2: System Status ---');

    // 5. System status check
    const statusRes = await request('GET', '/support/system-status', undefined, teacherToken);
    assert(statusRes.status === 200, 'System status check returns 200');
    assert(statusRes.body?.data?.status === 'operational', 'Status report shows operational');
    assert(statusRes.body?.data?.database?.status === 'connected', 'Database reported as connected');
    assert(Array.isArray(statusRes.body?.data?.services), 'Services list reported');

    console.log('\n--- Test Group 3: Support Tickets & RBAC Isolation ---');

    // 6. Student submits a support ticket
    const ticketPayload = {
      subject: `Login issue on mobile portal [${timestamp}]`,
      category: 'technical',
      priority: 'high',
      description: 'I cannot log in from my mobile browser, getting a timeout error.'
    };
    const studentTicketRes = await request('POST', '/support/tickets', ticketPayload, studentToken);
    assert(studentTicketRes.status === 201, 'Student successfully submits a support ticket');
    const ticketId = studentTicketRes.body?.data?.id;
    const ticketNumber = studentTicketRes.body?.data?.ticket_number;
    assert(ticketNumber && ticketNumber.startsWith('TIK-'), 'Ticket number generated with TIK- sequence');

    // 7. Teacher submits another ticket
    const teacherTicketPayload = {
      subject: `Timetable conflict on Tuesday [${timestamp}]`,
      category: 'academic',
      priority: 'medium',
      description: 'Period 3 overlaps with science laboratory session.'
    };
    const teacherTicketRes = await request('POST', '/support/tickets', teacherTicketPayload, teacherToken);
    assert(teacherTicketRes.status === 201, 'Teacher successfully submits a support ticket');
    const teacherTicketId = teacherTicketRes.body?.data?.id;

    // 8. Student gets ticket list (should ONLY see student's ticket)
    const studentListRes = await request('GET', '/support/tickets', undefined, studentToken);
    assert(studentListRes.status === 200, 'Student can list their tickets');
    assert(
      studentListRes.body?.data?.every((t: any) => t.user_id === studentId),
      'Student ticket list is strictly isolated to own tickets'
    );
    assert(
      studentListRes.body?.data?.some((t: any) => t.id === ticketId),
      'Student can see their newly created ticket'
    );
    assert(
      !studentListRes.body?.data?.some((t: any) => t.id === teacherTicketId),
      'Student CANNOT see teacher ticket'
    );

    // 9. Super admin gets ticket list (should see both)
    const adminListRes = await request('GET', '/support/tickets', undefined, adminToken);
    assert(adminListRes.status === 200, 'Admin can list all support tickets');
    const adminTicketIds = adminListRes.body?.data?.map((t: any) => t.id) || [];
    assert(
      adminTicketIds.includes(ticketId) && adminTicketIds.includes(teacherTicketId),
      'Admin ticket list contains both student and teacher tickets'
    );

    console.log('\n--- Test Group 4: Ticket Detail & Thread Replies ---');

    // 10. Student reads their own ticket
    const getTicketRes = await request('GET', `/support/tickets/${ticketId}`, undefined, studentToken);
    assert(getTicketRes.status === 200, 'Student can view details of own ticket');
    assert(getTicketRes.body?.data?.id === ticketId, 'Retrieved ticket matches ticketId');

    // 11. Teacher attempts to read student's ticket (forbidden)
    const forbiddenRes = await request('GET', `/support/tickets/${ticketId}`, undefined, teacherToken);
    assert(forbiddenRes.status === 403, 'Teacher cannot view another user ticket');

    // 12. Admin replies to student ticket
    const reply1 = { message: 'We are investigating your mobile browser connection issue.' };
    const adminReplyRes = await request('POST', `/support/tickets/${ticketId}/reply`, reply1, adminToken);
    assert(adminReplyRes.status === 201, 'Admin posts a reply to student ticket');

    // 13. Student replies back
    const reply2 = { message: 'Thank you! It occurs specifically on Safari iOS.' };
    const studentReplyRes = await request('POST', `/support/tickets/${ticketId}/reply`, reply2, studentToken);
    assert(studentReplyRes.status === 201, 'Student can reply to their own ticket');

    // 14. Check ticket details thread
    const threadRes = await request('GET', `/support/tickets/${ticketId}`, undefined, studentToken);
    assert(threadRes.body?.data?.replies?.length === 2, 'Ticket thread reflects both replies');

    console.log('\n--- Test Group 5: Ticket Lifecycle & Status ---');

    // 15. Admin updates status to in_progress
    const inProgressRes = await request(
      'PATCH',
      `/support/tickets/${ticketId}/status`,
      { status: 'in_progress' },
      adminToken
    );
    assert(inProgressRes.status === 200, 'Admin can update status to in_progress');
    assert(inProgressRes.body?.data?.status === 'in_progress', 'Ticket status updated to in_progress');

    // 16. Admin resolves ticket
    const resolveRes = await request(
      'PATCH',
      `/support/tickets/${ticketId}/status`,
      { status: 'resolved' },
      adminToken
    );
    assert(resolveRes.status === 200, 'Admin can update status to resolved');
    assert(resolveRes.body?.data?.status === 'resolved', 'Status is resolved');
    assert(resolveRes.body?.data?.resolved_at !== null, 'resolved_at timestamp is populated');

    // 17. Close ticket
    const closeRes = await request(
      'PATCH',
      `/support/tickets/${ticketId}/status`,
      { status: 'closed' },
      adminToken
    );
    assert(closeRes.status === 200, 'Admin closes ticket');

    // 18. Cannot reply to closed ticket
    const closedReplyRes = await request(
      'POST',
      `/support/tickets/${ticketId}/reply`,
      { message: 'This should fail on closed ticket' },
      studentToken
    );
    assert(closedReplyRes.status === 400, 'Replying to closed ticket is rejected with 400');

    // Cleanup test users & records
    await pool.query('DELETE FROM ticket_replies WHERE ticket_id = $1', [ticketId]);
    await pool.query('DELETE FROM support_tickets WHERE id IN ($1, $2)', [ticketId, teacherTicketId]);
    await pool.query('DELETE FROM faqs WHERE question = $1', [newFaq.question]);
    await pool.query('DELETE FROM user_roles WHERE user_id IN ($1, $2, $3)', [adminId, teacherId, studentId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [adminId, teacherId, studentId]);

  } catch (error) {
    console.error('Test suite execution error:', error);
    failed++;
  } finally {
    console.log(`\n========================================`);
    console.log(`Module 18 Help & Support Results: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSupportTests();
