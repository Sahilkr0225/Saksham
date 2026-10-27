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

async function runGalleryTests() {
  console.log('🖼️ Starting Module 19 Gallery & Media Test Suite\n');
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
    const adminEmail = `admin_gal_${timestamp}@saksham.test`;
    const teacherEmail = `teacher_gal_${timestamp}@saksham.test`;
    const studentEmail = `student_gal_${timestamp}@saksham.test`;

    // Create test users
    const adminRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Gallery Admin', $1, 'hash', true) RETURNING id`,
      [adminEmail]
    );
    const adminId = adminRes.rows[0].id;

    const teacherRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Gallery Teacher', $1, 'hash', true) RETURNING id`,
      [teacherEmail]
    );
    const teacherId = teacherRes.rows[0].id;

    const studentRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ('Gallery Student', $1, 'hash', true) RETURNING id`,
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

    console.log('--- Test Group 1: Album Creation & RBAC ---');

    // 1. Teacher creates album
    const albumPayload = {
      title: `Annual Sports Meet ${timestamp}`,
      description: 'Photos and highlights from the track and field events.',
      category: 'sports',
      is_public: true
    };
    const createAlbumRes = await request('POST', '/gallery/albums', albumPayload, teacherToken);
    assert(createAlbumRes.status === 201, 'Teacher can successfully create a new album');
    const albumId = createAlbumRes.body?.data?.id;
    assert(albumId !== undefined, 'Created album has a valid UUID');
    assert(createAlbumRes.body?.data?.title === albumPayload.title, 'Album title matches');

    // 2. Student cannot create album
    const studentAlbumRes = await request('POST', '/gallery/albums', albumPayload, studentToken);
    assert(studentAlbumRes.status === 403, 'Student is forbidden from creating albums');

    // 3. Create a second private album by admin
    const privateAlbumPayload = {
      title: `Staff Development Workshop ${timestamp}`,
      description: 'Internal pedagogical training photos.',
      category: 'campus',
      is_public: false
    };
    const privateAlbumRes = await request('POST', '/gallery/albums', privateAlbumPayload, adminToken);
    assert(privateAlbumRes.status === 201, 'Admin can create private album');
    const privateAlbumId = privateAlbumRes.body?.data?.id;

    console.log('\n--- Test Group 2: Album Listing & Privacy Isolation ---');

    // 4. Admin lists albums (sees both public and private)
    const adminAlbumsRes = await request('GET', '/gallery/albums', undefined, adminToken);
    assert(adminAlbumsRes.status === 200, 'Admin can list albums');
    const adminAlbumIds = adminAlbumsRes.body?.data?.map((a: any) => a.id) || [];
    assert(
      adminAlbumIds.includes(albumId) && adminAlbumIds.includes(privateAlbumId),
      'Admin sees both public and private albums'
    );

    // 5. Student lists albums (sees only public)
    const studentAlbumsRes = await request('GET', '/gallery/albums', undefined, studentToken);
    assert(studentAlbumsRes.status === 200, 'Student can list albums');
    const studentAlbumIds = studentAlbumsRes.body?.data?.map((a: any) => a.id) || [];
    assert(studentAlbumIds.includes(albumId), 'Student sees public album');
    assert(!studentAlbumIds.includes(privateAlbumId), 'Student CANNOT see private album');

    // 6. Filter by category
    const categoryFilterRes = await request('GET', '/gallery/albums?category=sports', undefined, studentToken);
    assert(categoryFilterRes.status === 200, 'Category filtering returns 200');
    assert(
      categoryFilterRes.body?.data?.every((a: any) => a.category === 'sports'),
      'All returned albums have category sports'
    );

    console.log('\n--- Test Group 3: Media Upload & Auto-Cover Update ---');

    // 7. Teacher uploads a photo to sports album
    // 1x1 transparent GIF base64
    const sampleBase64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const mediaPayload = {
      album_id: albumId,
      title: '100m Sprint Final',
      caption: 'Exciting finish at the annual sports meet',
      file_name: 'sprint_final.gif',
      mime_type: 'image/gif',
      file_data: sampleBase64
    };
    const uploadRes = await request('POST', '/gallery/media', mediaPayload, teacherToken);
    assert(uploadRes.status === 201, 'Teacher can upload photo to album');
    const mediaId = uploadRes.body?.data?.id;
    assert(mediaId !== undefined, 'Uploaded media returns UUID');

    // 8. Check that album cover was automatically set
    const albumDetailRes = await request('GET', `/gallery/albums/${albumId}`, undefined, studentToken);
    assert(albumDetailRes.status === 200, 'Can retrieve album details');
    assert(
      albumDetailRes.body?.data?.cover_image_url?.includes(mediaId),
      'Album cover was automatically populated with uploaded photo'
    );
    assert(albumDetailRes.body?.data?.media?.length === 1, 'Album contains 1 photo in media array');

    // 9. Stream media file
    const streamRes = await request('GET', `/gallery/media/${mediaId}/file`);
    assert(streamRes.status === 200, 'Media file streaming endpoint returns 200');
    assert(
      Boolean(streamRes.headers?.get('content-type')?.includes('image/gif')),
      'Streamed response has correct mime-type image/gif'
    );

    console.log('\n--- Test Group 4: Album Updates & Deletions ---');

    // 10. Update album title
    const updateRes = await request(
      'PATCH',
      `/gallery/albums/${albumId}`,
      { title: `Updated Sports Meet ${timestamp}` },
      teacherToken
    );
    assert(updateRes.status === 200, 'Teacher can update album title');
    assert(updateRes.body?.data?.title === `Updated Sports Meet ${timestamp}`, 'Title was updated');

    // 11. Delete media
    const deleteMediaRes = await request('DELETE', `/gallery/media/${mediaId}`, undefined, teacherToken);
    assert(deleteMediaRes.status === 200, 'Teacher can delete photo from album');

    // 12. Delete album
    const deleteAlbumRes = await request('DELETE', `/gallery/albums/${albumId}`, undefined, teacherToken);
    assert(deleteAlbumRes.status === 200, 'Teacher can delete album');

    const checkDeletedRes = await request('GET', `/gallery/albums/${albumId}`, undefined, adminToken);
    assert(checkDeletedRes.status === 404, 'Deleted album returns 404');

    // Cleanup private album and test users
    await pool.query('DELETE FROM gallery_albums WHERE id = $1', [privateAlbumId]);
    await pool.query('DELETE FROM user_roles WHERE user_id IN ($1, $2, $3)', [adminId, teacherId, studentId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [adminId, teacherId, studentId]);

  } catch (error) {
    console.error('Test suite execution error:', error);
    failed++;
  } finally {
    console.log(`\n========================================`);
    console.log(`Module 19 Gallery & Media Results: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runGalleryTests();
