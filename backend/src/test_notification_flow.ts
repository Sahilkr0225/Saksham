import pool from './config/db';
import { generateAccessToken } from './utils/auth';
import { initDb } from './config/initDb';
import { createNotification, broadcastNotification, broadcastRoleNotification } from './utils/notification';

const API_BASE = 'http://localhost:5000/api/v1';

async function request(
  method: string,
  endpoint: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any }> {
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

  let responseBody: any = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    responseBody = await res.json();
  }

  return { status: res.status, body: responseBody };
}

async function runNotificationTests() {
  console.log('🔔 Starting Module 14 Notification Engine Test Suite\n');
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
    // 1. Ensure table exists
    await initDb();

    // 2. Setup test fixture accounts
    const timestamp = Date.now();
    const adminEmail = `admin_notif_${timestamp}@saksham.test`;
    const teacherEmail = `teacher_notif_${timestamp}@saksham.test`;
    const studentEmail = `student_notif_${timestamp}@saksham.test`;

    const adminUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Admin Notif', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [adminEmail]
    );
    const adminId = adminUser.rows[0].id;

    const teacherUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Teacher Notif', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [teacherEmail]
    );
    const teacherId = teacherUser.rows[0].id;

    const studentUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Student Notif', $1, 'hashed_test_password', TRUE) RETURNING id`,
      [studentEmail]
    );
    const studentId = studentUser.rows[0].id;

    // Assign roles in user_roles
    const adminRole = await pool.query(`SELECT id FROM roles WHERE name = 'super_admin'`);
    const teacherRole = await pool.query(`SELECT id FROM roles WHERE name = 'teacher'`);
    const studentRole = await pool.query(`SELECT id FROM roles WHERE name = 'student'`);

    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [adminId, adminRole.rows[0].id]);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [teacherId, teacherRole.rows[0].id]);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [studentId, studentRole.rows[0].id]);

    const adminToken = generateAccessToken({ userId: adminId, role: 'super_admin' });
    const teacherToken = generateAccessToken({ userId: teacherId, role: 'teacher' });
    const studentToken = generateAccessToken({ userId: studentId, role: 'student' });

    console.log('--- Testing Authorization on Manual Notification Dispatch ---');

    // Test: Student cannot dispatch notifications (403)
    const studentDispatchRes = await request(
      'POST',
      '/notifications',
      { userId: teacherId, title: 'Unauthorized', message: 'Hello' },
      studentToken
    );
    assert(studentDispatchRes.status === 403, 'Student cannot dispatch notifications (returns 403)');

    // Test: Teacher cannot dispatch notifications (403)
    const teacherDispatchRes = await request(
      'POST',
      '/notifications',
      { userId: studentId, title: 'Unauthorized', message: 'Hello' },
      teacherToken
    );
    assert(teacherDispatchRes.status === 403, 'Teacher cannot dispatch notifications (returns 403)');

    // Test: Admin can dispatch notification to specific user
    const adminDispatchRes = await request(
      'POST',
      '/notifications',
      {
        userId: studentId,
        title: 'Fee Reminder',
        message: 'Your term tuition fee is due on Friday.',
        type: 'fee',
        link: '/fees'
      },
      adminToken
    );
    assert(adminDispatchRes.status === 201, 'Super Admin can dispatch notification to student (returns 201)');
    assert(adminDispatchRes.body?.data?.dispatched_count === 1, 'Dispatched count is 1');

    console.log('\n--- Testing In-App Notification Retrieval & Unread Counts ---');

    // Test: Student unread count is 1
    const studentUnreadRes1 = await request('GET', '/notifications/unread-count', null, studentToken);
    assert(studentUnreadRes1.status === 200, 'Student can query unread notification count');
    assert(studentUnreadRes1.body?.data?.unread_count === 1, 'Student unread count is exactly 1');

    // Test: Teacher unread count is 0 (user isolation)
    const teacherUnreadRes1 = await request('GET', '/notifications/unread-count', null, teacherToken);
    assert(teacherUnreadRes1.body?.data?.unread_count === 0, 'Teacher unread count is 0 (user isolation preserved)');

    // Test: Student retrieves paginated notifications
    const studentListRes = await request('GET', '/notifications', null, studentToken);
    assert(studentListRes.status === 200, 'Student can list their notifications');
    assert(studentListRes.body?.data?.length === 1, 'Student receives exactly 1 notification');
    const studentNotifId = studentListRes.body?.data?.[0]?.id;
    assert(studentListRes.body?.data?.[0]?.title === 'Fee Reminder', 'Notification title matches');
    assert(studentListRes.body?.data?.[0]?.type === 'fee', 'Notification type matches');
    assert(studentListRes.body?.data?.[0]?.is_read === false, 'Notification is initially unread');

    console.log('\n--- Testing Read States & User Isolation ---');

    // Test: Teacher cannot mark student's notification as read (returns 404)
    const teacherMarkRes = await request('PATCH', `/notifications/${studentNotifId}/read`, null, teacherToken);
    assert(teacherMarkRes.status === 404, 'Teacher cannot mark student notification as read (returns 404)');

    // Test: Student can mark their notification as read
    const studentMarkRes = await request('PATCH', `/notifications/${studentNotifId}/read`, null, studentToken);
    assert(studentMarkRes.status === 200, 'Student can mark their notification as read');
    assert(studentMarkRes.body?.data?.is_read === true, 'Notification state is now is_read = true');

    // Test: Student unread count is now 0
    const studentUnreadRes2 = await request('GET', '/notifications/unread-count', null, studentToken);
    assert(studentUnreadRes2.body?.data?.unread_count === 0, 'Student unread count is now 0 after reading');

    console.log('\n--- Testing Utility Functions & Batch Broadcast ---');

    // Test: Direct utility creation
    const utilNotifId = await createNotification({
      userId: teacherId,
      title: 'New Assignment Submitted',
      message: 'Student John submitted Math Assignment 3',
      type: 'homework',
      link: '/homework'
    });
    assert(typeof utilNotifId === 'string', 'createNotification utility returns created UUID');

    const teacherListRes = await request('GET', '/notifications', null, teacherToken);
    assert(teacherListRes.body?.data?.length === 1, 'Teacher received utility-dispatched notification');

    // Test: Batch broadcast utility to multiple users
    const broadcastCount = await broadcastNotification({
      userIds: [studentId, teacherId],
      title: 'School Closed Tomorrow',
      message: 'School is closed due to heavy rain forecast.',
      type: 'notice',
      link: '/notices'
    });
    assert(broadcastCount === 2, 'broadcastNotification delivered notification to 2 distinct users');

    // Test: Mark all as read
    const studentMarkAllRes = await request('PATCH', '/notifications/mark-all-read', null, studentToken);
    assert(studentMarkAllRes.status === 200, 'Student can execute markAllAsRead');
    assert(studentMarkAllRes.body?.data?.updated_count >= 1, 'Mark all as read updated at least 1 notification');

    const studentUnreadRes3 = await request('GET', '/notifications/unread-count', null, studentToken);
    assert(studentUnreadRes3.body?.data?.unread_count === 0, 'Student unread count remains 0 after mark-all-read');

    console.log('\n--- Testing Deletion & Cleanup ---');

    // Test: Teacher cannot delete student's notification (returns 404)
    const teacherDeleteRes = await request('DELETE', `/notifications/${studentNotifId}`, null, teacherToken);
    assert(teacherDeleteRes.status === 404, 'Teacher cannot delete student notification (returns 404)');

    // Test: Student can delete their notification
    const studentDeleteRes = await request('DELETE', `/notifications/${studentNotifId}`, null, studentToken);
    assert(studentDeleteRes.status === 200, 'Student can delete their notification');

    // Cleanup test records
    await pool.query(`DELETE FROM notifications WHERE user_id IN ($1, $2, $3)`, [adminId, teacherId, studentId]);
    await pool.query(`DELETE FROM user_roles WHERE user_id IN ($1, $2, $3)`, [adminId, teacherId, studentId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [adminId, teacherId, studentId]);

    console.log(`\n═════════════════════════════════════════════════════════════════`);
    console.log(`🎉 MODULE 14 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`═════════════════════════════════════════════════════════════════\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Unexpected test error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runNotificationTests();
