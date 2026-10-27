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

async function runCmsTests() {
  console.log('🌐 Starting Module 20 Public Website CMS & Inquiries Test Suite\n');
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
    const adminEmail = `admin_cms_${timestamp}@saksham.test`;
    const staffEmail = `staff_cms_${timestamp}@saksham.test`;
    const studentEmail = `student_cms_${timestamp}@saksham.test`;

    // Create test users
    const adminRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('CMS Admin', $1, 'hash', true) RETURNING id`,
      [adminEmail]
    );
    const adminId = adminRes.rows[0].id;

    const staffRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('CMS Staff', $1, 'hash', true) RETURNING id`,
      [staffEmail]
    );
    const staffId = staffRes.rows[0].id;

    const studentRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('CMS Student', $1, 'hash', true) RETURNING id`,
      [studentEmail]
    );
    const studentId = studentRes.rows[0].id;

    // Assign roles
    const superAdminRole = (await pool.query("SELECT id FROM roles WHERE name = 'super_admin'")).rows[0].id;
    const officeStaffRole = (await pool.query("SELECT id FROM roles WHERE name = 'office_staff'")).rows[0].id;
    const studentRole = (await pool.query("SELECT id FROM roles WHERE name = 'student'")).rows[0].id;

    await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [adminId, superAdminRole]);
    await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [staffId, officeStaffRole]);
    await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [studentId, studentRole]);

    const adminToken = generateAccessToken({ userId: adminId, role: 'super_admin' });
    const staffToken = generateAccessToken({ userId: staffId, role: 'office_staff' });
    const studentToken = generateAccessToken({ userId: studentId, role: 'student' });

    console.log('--- Test Group 1: Public CMS Pages & Seed Verification ---');

    // 1. Public list CMS pages (unauthenticated)
    const publicPagesRes = await request('GET', '/cms/pages');
    assert(publicPagesRes.status === 200, 'Public read of CMS pages returns 200');
    assert(Array.isArray(publicPagesRes.body?.data) && publicPagesRes.body.data.length >= 3, 'Returns default seeded CMS pages');

    // 2. Read specific seeded page
    const aboutUsRes = await request('GET', '/cms/pages/about-us');
    assert(aboutUsRes.status === 200, 'Public read of /about-us returns 200');
    assert(aboutUsRes.body?.data?.title?.includes('About Saksham'), 'About Us page has correct title');
    assert(aboutUsRes.body?.data?.content_json?.values?.length > 0, 'About Us content_json has core values');

    // 3. Read principal message
    const principalMsgRes = await request('GET', '/cms/pages/principal-message');
    assert(principalMsgRes.status === 200, 'Public read of /principal-message returns 200');
    assert(principalMsgRes.body?.data?.content_json?.author !== undefined, 'Principal message contains author');

    console.log('\n--- Test Group 2: Admin Page Authoring & Slug Integrity ---');

    // 4. Admin creates custom CMS page
    const newPagePayload = {
      slug: `stem-lab-${timestamp}`,
      title: 'State-of-the-Art STEM Innovation Labs',
      content_json: {
        facilities: ['Robotics Arena', '3D Prototyping Station', 'AI Computing Pods'],
        coordinator: 'Dr. Alan Turing'
      },
      is_public: true
    };
    const createPageRes = await request('POST', '/cms/pages', newPagePayload, adminToken);
    assert(createPageRes.status === 201, 'Super admin can create custom CMS page');
    assert(createPageRes.body?.data?.slug === newPagePayload.slug, 'Created page has matching slug');

    // 5. Prevent duplicate slug
    const duplicatePageRes = await request('POST', '/cms/pages', newPagePayload, adminToken);
    assert(duplicatePageRes.status === 409, 'Duplicate slug creation is rejected with 409 Conflict');

    // 6. Non-admin forbidden from creating page
    const studentCreateRes = await request('POST', '/cms/pages', newPagePayload, studentToken);
    assert(studentCreateRes.status === 403, 'Student is forbidden from creating CMS pages');

    // 7. Update custom page
    const updatePayload = {
      title: 'Updated STEM Innovation Labs',
      content_json: {
        facilities: ['Robotics Arena', 'Quantum Computing Simulator'],
        coordinator: 'Dr. Alan Turing'
      }
    };
    const updatePageRes = await request('PUT', `/cms/pages/${newPagePayload.slug}`, updatePayload, adminToken);
    assert(updatePageRes.status === 200, 'Super admin can update CMS page');
    assert(updatePageRes.body?.data?.title === updatePayload.title, 'Page title updated');

    console.log('\n--- Test Group 3: Public Inquiries & Staff Triage ---');

    // 8. Public website visitor submits admission inquiry (NO auth token)
    const inquiryPayload = {
      name: 'Rohan Sharma',
      email: 'rohan.parent@example.com',
      phone: '+91 98765 00000',
      subject: 'Inquiry regarding Grade 6 Admission & Fee Schedule',
      message: 'Hello, I would like to know the seat availability for Grade 6 in the upcoming term.'
    };
    const submitInquiryRes = await request('POST', '/cms/inquiries', inquiryPayload);
    assert(submitInquiryRes.status === 201, 'Public user can submit inquiry without authentication');
    const inquiryId = submitInquiryRes.body?.data?.id;
    assert(inquiryId !== undefined, 'Inquiry submission returns created ID');

    // 9. Staff lists incoming inquiries
    const staffInquiriesRes = await request('GET', '/cms/inquiries', undefined, staffToken);
    assert(staffInquiriesRes.status === 200, 'Office staff can list inquiries');
    const inquiriesList = staffInquiriesRes.body?.data || [];
    assert(inquiriesList.some((inq: any) => inq.id === inquiryId), 'Staff can see newly submitted inquiry');

    // 10. Student forbidden from viewing inquiries
    const studentInqRes = await request('GET', '/cms/inquiries', undefined, studentToken);
    assert(studentInqRes.status === 403, 'Student is forbidden from accessing inquiries');

    // 11. Staff updates inquiry status to contacted with notes
    const updateInqRes = await request(
      'PATCH',
      `/cms/inquiries/${inquiryId}`,
      { status: 'contacted', notes: 'Called parent on 28th Oct, sent admission prospectus via email.' },
      staffToken
    );
    assert(updateInqRes.status === 200, 'Office staff can update inquiry status');
    assert(updateInqRes.body?.data?.status === 'contacted', 'Inquiry status updated to contacted');
    assert(updateInqRes.body?.data?.notes?.includes('Called parent'), 'Inquiry notes saved');

    // 12. Admin deletes custom page
    const deletePageRes = await request('DELETE', `/cms/pages/${newPagePayload.slug}`, undefined, adminToken);
    assert(deletePageRes.status === 200, 'Admin can delete custom CMS page');

    // Cleanup
    await pool.query('DELETE FROM cms_inquiries WHERE id = $1', [inquiryId]);
    await pool.query('DELETE FROM user_roles WHERE user_id IN ($1, $2, $3)', [adminId, staffId, studentId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [adminId, staffId, studentId]);

  } catch (error) {
    console.error('Test suite execution error:', error);
    failed++;
  } finally {
    console.log(`\n========================================`);
    console.log(`Module 20 Public Website CMS Results: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runCmsTests();
