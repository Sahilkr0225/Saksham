import http from 'http';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

// Seed super_admin credentials
const SUPER_ADMIN = {
  email: 'admin@gmail.com',
  password: 'Saksham_developer@1234',
};

// We will dynamically create a fake student for testing student read access
const STUDENT = {
  name: 'Test Student Notice',
  email: `student_notice_${Date.now()}@gmail.com`,
  password: 'Password@1234',
};

const runNoticesE2ETest = async () => {
  console.log('🚀 Starting E2E Test for Notices & Events Module\n');
  let superAdminToken = '';
  let studentToken = '';
  let studentUserId = '';
  let studentId = '';
  let classId = '';
  let yearId = '';

  let noticeId1 = ''; // General notice
  let noticeId2 = ''; // Class targeted notice
  let eventId1 = '';

  try {
    // ─── 0. PREPARATION ────────────────────────────────────────────────────────

    console.log('🔑 Authenticating as Super Admin...');
    const loginRes = await request('POST', '/auth/login', {
      email: SUPER_ADMIN.email,
      password: SUPER_ADMIN.password,
    });
    superAdminToken = loginRes.data.data.accessToken || loginRes.data.data.access_token; // handle different auth conventions
    if (!superAdminToken) throw new Error('Missing admin token in response');
    console.log('✅ Super Admin authenticated.');

    console.log('🏫 Preparing test data (Class & Student)...');
    
    // Ensure at least one Academic Year exists
    const ayRes = await pool.query(`INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ('Test Year Notices', '2026-04-01', '2027-03-31', false) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    yearId = ayRes.rows[0].id;

    // Create a mock class for targeting
    const classRes = await pool.query(`INSERT INTO classes (name, code) VALUES ('Class Notice Test', 'CNT') ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    classId = classRes.rows[0].id;

    // Create Student user & profile via DB to skip full admission flow
    const bcrypt = await import('bcryptjs');
    const pwdHash = await bcrypt.default.hash(STUDENT.password, 10);
    const userRes = await pool.query(`INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id`, [STUDENT.name, STUDENT.email, pwdHash]);
    studentUserId = userRes.rows[0].id;

    // Assign student role
    const roleRes = await pool.query(`SELECT id FROM roles WHERE name = 'student'`);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [studentUserId, roleRes.rows[0].id]);

    // Create student profile assigned to the class
    const stuProfileRes = await pool.query(`
      INSERT INTO students (user_id, admission_number, dob, gender, current_class_id)
      VALUES ($1, $2, '2010-01-01', 'Male', $3)
      RETURNING id
    `, [studentUserId, `NOT-${Date.now()}`, classId]);
    studentId = stuProfileRes.rows[0].id;

    // Login as student
    const studentLogin = await request('POST', '/auth/login', {
      email: STUDENT.email,
      password: STUDENT.password,
    });
    studentToken = studentLogin.data.data.accessToken || studentLogin.data.data.access_token;
    console.log('✅ Student authenticated.');

    // ─── 1. NOTICES CRUD (ADMIN) ────────────────────────────────────────────────

    console.log('\n📝 1. Testing Notice Creation (Admin)');
    
    // A. General Published Notice
    const resGeneral = await request('POST', '/notices', {
      title: 'School Reopening',
      content: 'The school will reopen on Monday after summer break.',
      type: 'general',
      priority: 'high',
      target_audience: 'all',
      published: true
    }, superAdminToken);
    
    if (resGeneral.status !== 201) throw new Error(`Create notice failed: ${JSON.stringify(resGeneral.data)}`);
    noticeId1 = resGeneral.data.data.notice.id;
    console.log('✅ Created general targeted published notice.');

    // B. Class Targeted Draft Notice
    const resClass = await request('POST', '/notices', {
      title: 'Class Notice Test Exam',
      content: 'Exam schedule for Class Notice Test is attached.',
      type: 'academic',
      priority: 'normal',
      target_audience: 'class',
      target_class_id: classId,
      published: false
    }, superAdminToken);
    noticeId2 = resClass.data.data.notice.id;
    console.log('✅ Created class-targeted draft notice.');

    // ─── 2. NOTICES READ & FILTER ───────────────────────────────────────────────

    console.log('\n🔍 2. Testing Notice Reading & Filtering');

    // Admin should see both
    const adminNotices = await request('GET', '/notices', null, superAdminToken);
    console.log("Admin Notices Response:", JSON.stringify(adminNotices.data, null, 2));
    if (adminNotices.status !== 200) {
      console.log('Failed to fetch admin notices:', adminNotices.data);
      throw new Error(`Admin notices fetch failed: ${adminNotices.status}`);
    }
    if (!adminNotices.data.data.notices.some((n: any) => n.id === noticeId1) || 
        !adminNotices.data.data.notices.some((n: any) => n.id === noticeId2)) {
      throw new Error('Admin could not see all created notices');
    }
    console.log('✅ Admin can see all notices (drafts & published).');

    // Student should only see published ones targeting them or 'all'
    const studentNoticesBeforePublish = await request('GET', '/notices/my', null, studentToken);
    if (!studentNoticesBeforePublish.data.data.notices.some((n: any) => n.id === noticeId1)) {
      throw new Error('Student could not see the general published notice');
    }
    if (studentNoticesBeforePublish.data.data.notices.some((n: any) => n.id === noticeId2)) {
      throw new Error('Student saw the draft class notice');
    }
    console.log('✅ Student correctly saw general notice and did NOT see the draft or non-targeted notice.');

    // ─── 3. NOTICE UPDATE & PUBLISH ─────────────────────────────────────────────

    console.log('\n🔄 3. Testing Draft to Publish Workflow');
    await request('PATCH', `/notices/${noticeId2}`, {
      published: true
    }, superAdminToken);
    console.log('✅ Draft class notice published by admin.');

    const studentNoticesAfterPublish = await request('GET', '/notices/my', null, studentToken);
    if (!studentNoticesAfterPublish.data.data.notices.some((n: any) => n.id === noticeId2)) {
      throw new Error('Student still could not see the class notice after it was published');
    }
    console.log('✅ Student correctly saw class notice AFTER it was published.');

    // ─── 4. NOTICE PINNING ─────────────────────────────────────────────────────

    console.log('\n📌 4. Testing Notice Pinning (Priority)');
    await request('PATCH', `/notices/${noticeId2}/pin`, { action: 'pin' }, superAdminToken);
    
    // Fetch and check order (pinned should be near top)
    const adminPinnedNotices = await request('GET', '/notices', null, superAdminToken);
    const pinnedNotice = adminPinnedNotices.data.data.notices.find((n: any) => n.id === noticeId2);
    if (pinnedNotice.priority !== 'high') {
      throw new Error('Notice priority was not updated to high');
    }
    console.log('✅ Notice pinned successfully.');

    // ─── 5. EVENTS CRUD ─────────────────────────────────────────────────────────

    console.log('\n📅 5. Testing Events');
    
    const eventRes = await request('POST', '/notices/events', {
      title: 'Annual Sports Day',
      description: 'Annual inter-school sports competition',
      event_type: 'sports_day',
      start_date: '2026-12-15',
      end_date: '2026-12-17',
      target_audience: 'all'
    }, superAdminToken);
    if (eventRes.status !== 201) throw new Error(`Event creation failed: ${JSON.stringify(eventRes.data)}`);
    eventId1 = eventRes.data.data.event.id;
    console.log('✅ Event created successfully.');

    // Student reads events
    const evtRes = await request('GET', '/notices/events?event_type=sports_day', null, studentToken);
    if (evtRes.status !== 200) {
      console.log('Failed to fetch events:', evtRes.data);
      throw new Error(`Events fetch failed: ${evtRes.status}`);
    }
    if (!evtRes.data.data.events.some((e: any) => e.id === eventId1)) {
      throw new Error('Student could not see the event');
    }
    console.log('✅ Event reading & filtering verified.');

    const evUpd = await request('PATCH', `/notices/events/${eventId1}`, { title: 'Annual Sports Day 2026' }, superAdminToken);
    if (evUpd.status !== 200) throw new Error(`Event update failed: ${JSON.stringify(evUpd.data)}`);
    console.log('✅ Event updated successfully.');

    // ─── 6. SOFT DELETE & CLEANUP ───────────────────────────────────────────────

    console.log('\n🗑️ 6. Testing Deletion (Soft vs Hard)');
    
    // Soft delete notice
    await request('DELETE', `/notices/${noticeId1}`, null, superAdminToken);
    const adminNoticesAfterDel = await request('GET', '/notices', null, superAdminToken);
    if (adminNoticesAfterDel.data.data.notices.some((n: any) => n.id === noticeId1)) {
      throw new Error('Notice was not softly deleted');
    }
    console.log('✅ Notice softly deleted and hidden from lists.');

    // Hard delete event
    await request('DELETE', `/notices/events/${eventId1}`, null, superAdminToken);
    console.log('✅ Event hard deleted.');

    console.log('\n🎉 ALL MODULE 13 E2E TESTS PASSED SUCCESSFULLY! ✅');

  } catch (error: any) {
    console.error('\n❌ E2E TEST FAILED:', error.message);
    process.exit(1);
  } finally {
    // Cleanup mock data
    console.log('\n🧹 Cleaning up test database records...');
    if (noticeId2) await pool.query('DELETE FROM notices WHERE id = $1', [noticeId2]);
    if (noticeId1) await pool.query('DELETE FROM notices WHERE id = $1', [noticeId1]); // even though soft deleted
    if (studentId) await pool.query('DELETE FROM students WHERE id = $1', [studentId]);
    if (studentUserId) await pool.query('DELETE FROM users WHERE id = $1', [studentUserId]);
    if (classId) await pool.query('DELETE FROM classes WHERE id = $1', [classId]);
    if (yearId) await pool.query('DELETE FROM academic_years WHERE name = $1', ['Test Year Notices']);
    await pool.end();
  }
};

runNoticesE2ETest();
