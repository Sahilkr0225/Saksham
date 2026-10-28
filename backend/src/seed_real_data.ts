import pool from './config/db';
import bcrypt from 'bcryptjs';

async function seedRealData() {
  const client = await pool.connect();
  console.log('🚀 Starting Master Database Real-Data Revamp & Seeding...\n');

  try {
    await client.query('BEGIN');

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. CLEANUP SYNTHETIC / DUMMY TEST ARTIFACTS (PRESERVING SUPER_ADMIN)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('🧹 Purging synthetic test data across all module tables...');

    // Dependent tables
    await client.query('DELETE FROM ticket_replies');
    await client.query('DELETE FROM support_tickets');
    await client.query('DELETE FROM gallery_media');
    await client.query('DELETE FROM gallery_albums');
    await client.query('DELETE FROM documents');
    await client.query('DELETE FROM cms_inquiries');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM audit_logs');

    await client.query('DELETE FROM homework_submissions');
    await client.query('DELETE FROM homework_assignments');
    await client.query('DELETE FROM exam_marks');
    await client.query('DELETE FROM exam_subjects');
    await client.query('DELETE FROM exams');
    await client.query('DELETE FROM attendance_records');

    await client.query('DELETE FROM fee_payments');
    await client.query('DELETE FROM student_fee_ledger');
    await client.query('DELETE FROM student_fee_assignments');
    await client.query('DELETE FROM fee_components');
    await client.query('DELETE FROM fee_structures');

    await client.query('DELETE FROM admission_applications');
    await client.query('DELETE FROM students');
    await client.query('DELETE FROM teachers');
    await client.query('DELETE FROM class_subjects');
    await client.query('DELETE FROM sections');
    await client.query('DELETE FROM notices');
    await client.query('DELETE FROM events');

    // Reset school settings reference to academic year temporarily
    await client.query('UPDATE school_settings SET academic_year_id = NULL');

    await client.query('DELETE FROM classes');
    await client.query('DELETE FROM subjects');
    await client.query('DELETE FROM academic_years');

    // Remove users except admin@gmail.com
    await client.query(`
      DELETE FROM user_roles 
      WHERE user_id NOT IN (SELECT id FROM users WHERE LOWER(email) = 'admin@gmail.com')
    `);
    await client.query(`
      DELETE FROM refresh_tokens 
      WHERE user_id NOT IN (SELECT id FROM users WHERE LOWER(email) = 'admin@gmail.com')
    `);
    await client.query(`
      DELETE FROM users 
      WHERE LOWER(email) != 'admin@gmail.com'
    `);

    // Ensure super_admin user exists with correct credentials
    const adminEmail = 'admin@gmail.com';
    const adminPassHash = await bcrypt.hash('Saksham_developer@1234', 12);
    let adminUserRes = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [adminEmail]);
    let adminUserId: string;

    if (adminUserRes.rowCount === 0) {
      const insRes = await client.query(
        `INSERT INTO users (name, email, password_hash, is_active, must_change_password)
         VALUES ($1, $2, $3, TRUE, FALSE) RETURNING id`,
        ['School Administrator', adminEmail, adminPassHash]
      );
      adminUserId = insRes.rows[0].id;
    } else {
      adminUserId = adminUserRes.rows[0].id;
      await client.query(
        `UPDATE users SET name = 'School Administrator', password_hash = $1, is_active = TRUE WHERE id = $2`,
        [adminPassHash, adminUserId]
      );
    }

    // Ensure super_admin role
    const superAdminRoleRes = await client.query("SELECT id FROM roles WHERE name = 'super_admin'");
    if (superAdminRoleRes.rowCount! > 0) {
      const roleId = superAdminRoleRes.rows[0].id;
      const urCheck = await client.query('SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2', [adminUserId, roleId]);
      if (urCheck.rowCount === 0) {
        await client.query('INSERT INTO user_roles (user_id, role_id, is_active) VALUES ($1, $2, TRUE)', [adminUserId, roleId]);
      }
    }

    console.log('✅ Retained & verified Super Admin (admin@gmail.com).');

    // Fetch all role IDs for reference
    const rolesRes = await client.query('SELECT id, name FROM roles');
    const roleMap: Record<string, string> = {};
    rolesRes.rows.forEach(r => { roleMap[r.name] = r.id; });

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. ACADEMIC YEARS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('📅 Seeding authentic academic years...');
    const ayCurrentRes = await client.query(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES ('2026-2027', '2026-04-01', '2027-03-31', TRUE)
      RETURNING id, name
    `);
    const currentAYId = ayCurrentRes.rows[0].id;

    await client.query(`
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES ('2025-2026', '2025-04-01', '2026-03-31', FALSE)
    `);

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. CLASSES & SECTIONS (CBSE Standard)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('🏫 Seeding standard CBSE classes and sections...');
    const classData = [
      { name: 'Nursery', code: 'NUR', order: 1 },
      { name: 'LKG', code: 'LKG', order: 2 },
      { name: 'UKG', code: 'UKG', order: 3 },
      { name: 'Class 1', code: 'CLS-01', order: 4 },
      { name: 'Class 2', code: 'CLS-02', order: 5 },
      { name: 'Class 3', code: 'CLS-03', order: 6 },
      { name: 'Class 4', code: 'CLS-04', order: 7 },
      { name: 'Class 5', code: 'CLS-05', order: 8 },
      { name: 'Class 6', code: 'CLS-06', order: 9 },
      { name: 'Class 7', code: 'CLS-07', order: 10 },
      { name: 'Class 8', code: 'CLS-08', order: 11 },
      { name: 'Class 9', code: 'CLS-09', order: 12 },
      { name: 'Class 10', code: 'CLS-10', order: 13 },
      { name: 'Class 11 - Science', code: 'CLS-11-SCI', order: 14 },
      { name: 'Class 11 - Commerce', code: 'CLS-11-COMM', order: 15 },
      { name: 'Class 12 - Science', code: 'CLS-12-SCI', order: 16 },
      { name: 'Class 12 - Commerce', code: 'CLS-12-COMM', order: 17 }
    ];

    const classMap: Record<string, { id: string; name: string }> = {};
    const sectionMap: Record<string, { id: string; name: string; classId: string }> = {};

    let roomCounter = 101;
    for (const c of classData) {
      const cRes = await client.query(
        `INSERT INTO classes (name, code, display_order) VALUES ($1, $2, $3) RETURNING id, name`,
        [c.name, c.code, c.order]
      );
      const classId = cRes.rows[0].id;
      classMap[c.name] = { id: classId, name: c.name };

      // Create Section A and Section B
      const secARes = await client.query(
        `INSERT INTO sections (class_id, name, capacity, room_number)
         VALUES ($1, 'A', 40, $2) RETURNING id, name`,
        [classId, `Room-${roomCounter++}`]
      );
      sectionMap[`${c.name}-A`] = { id: secARes.rows[0].id, name: 'A', classId };

      const secBRes = await client.query(
        `INSERT INTO sections (class_id, name, capacity, room_number)
         VALUES ($1, 'B', 40, $2) RETURNING id, name`,
        [classId, `Room-${roomCounter++}`]
      );
      sectionMap[`${c.name}-B`] = { id: secBRes.rows[0].id, name: 'B', classId };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. SUBJECTS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('📚 Seeding official curriculum subjects...');
    const subjectData = [
      { name: 'Mathematics', code: 'MATH', type: 'core' },
      { name: 'Science & Technology', code: 'SCI', type: 'core' },
      { name: 'English Language & Literature', code: 'ENG', type: 'core' },
      { name: 'Hindi Course-A', code: 'HIN', type: 'core' },
      { name: 'Social Science', code: 'SST', type: 'core' },
      { name: 'Physics', code: 'PHY', type: 'core' },
      { name: 'Chemistry', code: 'CHEM', type: 'core' },
      { name: 'Biology', code: 'BIO', type: 'core' },
      { name: 'Computer Science & AI', code: 'CS', type: 'core' },
      { name: 'Accountancy', code: 'ACC', type: 'core' },
      { name: 'Business Studies', code: 'BST', type: 'core' },
      { name: 'Economics', code: 'ECO', type: 'core' },
      { name: 'Physical Education', code: 'PHE', type: 'elective' },
      { name: 'Fine Arts', code: 'ART', type: 'elective' }
    ];

    const subjectMap: Record<string, { id: string; name: string }> = {};
    for (const s of subjectData) {
      const sRes = await client.query(
        `INSERT INTO subjects (name, code, type) VALUES ($1, $2, $3) RETURNING id, name, code`,
        [s.name, s.code, s.type]
      );
      subjectMap[s.code] = { id: sRes.rows[0].id, name: s.name };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. TEACHERS (Realistic Indian Faculty)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('👨‍🏫 Seeding authentic Indian school faculty...');
    const defaultPasswordHash = await bcrypt.hash('Saksham_developer@1234', 12);

    const facultyData = [
      {
        name: 'Dr. Rajesh Sharma',
        email: 'rajesh.sharma@saksham.edu',
        phone: '+91 98112 34501',
        employeeId: 'EMP-101',
        specialization: 'Physics & Thermodynamics',
        qualification: 'Ph.D. in Physics, M.Sc., B.Ed.',
        joiningDate: '2019-07-01',
        address: 'B-42, Sector 15, Noida, Uttar Pradesh',
        primarySubjectCode: 'PHY'
      },
      {
        name: 'Sunita Verma',
        email: 'sunita.verma@saksham.edu',
        phone: '+91 98112 34502',
        employeeId: 'EMP-102',
        specialization: 'Advanced Calculus & Algebra (HOD Mathematics)',
        qualification: 'M.Sc. Mathematics, B.Ed., CTET Certified',
        joiningDate: '2018-04-10',
        address: 'C-108, Mayur Vihar Phase 1, Delhi',
        primarySubjectCode: 'MATH'
      },
      {
        name: 'Amit Trivedi',
        email: 'amit.trivedi@saksham.edu',
        phone: '+91 98112 34503',
        employeeId: 'EMP-103',
        specialization: 'English Literature & Debating',
        qualification: 'M.A. English Literature, B.Ed.',
        joiningDate: '2020-06-15',
        address: 'Flat 402, Prateek Fedora, Sector 61, Noida',
        primarySubjectCode: 'ENG'
      },
      {
        name: 'Priya Nair',
        email: 'priya.nair@saksham.edu',
        phone: '+91 98112 34504',
        employeeId: 'EMP-104',
        specialization: 'Cell Biology & Genetics',
        qualification: 'M.Sc. Biotechnology, B.Ed.',
        joiningDate: '2021-03-01',
        address: 'A-21, Indirapuram, Ghaziabad, UP',
        primarySubjectCode: 'BIO'
      },
      {
        name: 'Manoj Gupta',
        email: 'manoj.gupta@saksham.edu',
        phone: '+91 98112 34505',
        employeeId: 'EMP-105',
        specialization: 'Accountancy & Financial Management',
        qualification: 'M.Com, FCA (Inter), B.Ed.',
        joiningDate: '2019-11-12',
        address: 'D-56, Preet Vihar, Delhi',
        primarySubjectCode: 'ACC'
      },
      {
        name: 'Dr. Ananya Mukherjee',
        email: 'ananya.mukherjee@saksham.edu',
        phone: '+91 98112 34506',
        employeeId: 'EMP-106',
        specialization: 'Organic & Inorganic Chemistry',
        qualification: 'Ph.D. Chemistry, M.Sc., B.Ed.',
        joiningDate: '2020-01-20',
        address: 'Tower 3, Supertech Capetown, Sector 74, Noida',
        primarySubjectCode: 'CHEM'
      },
      {
        name: 'Vikram Rathore',
        email: 'vikram.rathore@saksham.edu',
        phone: '+91 98112 34507',
        employeeId: 'EMP-107',
        specialization: 'Computer Science, Python & AI',
        qualification: 'M.Tech Computer Science, B.Tech CSE',
        joiningDate: '2021-08-01',
        address: 'H-14, Sector 50, Noida',
        primarySubjectCode: 'CS'
      },
      {
        name: 'Sneha Kulkarni',
        email: 'sneha.kulkarni@saksham.edu',
        phone: '+91 98112 34508',
        employeeId: 'EMP-108',
        specialization: 'Hindi Literature & Sanskrit (HOD Indian Languages)',
        qualification: 'M.A. Hindi & Sanskrit, B.Ed.',
        joiningDate: '2017-07-15',
        address: 'Block E, Anand Vihar, Delhi',
        primarySubjectCode: 'HIN'
      },
      {
        name: 'Arvind Patel',
        email: 'arvind.patel@saksham.edu',
        phone: '+91 98112 34509',
        employeeId: 'EMP-109',
        specialization: 'Indian History & Political Science',
        qualification: 'M.A. History, B.Ed.',
        joiningDate: '2022-04-05',
        address: 'Plot 88, Vasundhara, Ghaziabad',
        primarySubjectCode: 'SST'
      },
      {
        name: 'Deepa Sundaram',
        email: 'deepa.sundaram@saksham.edu',
        phone: '+91 98112 34510',
        employeeId: 'EMP-110',
        specialization: 'Athletics & Physical Conditioning (Sports Director)',
        qualification: 'M.P.Ed., NIS Coach Certificate',
        joiningDate: '2018-09-01',
        address: 'Sector 45, Noida',
        primarySubjectCode: 'PHE'
      },
      {
        name: 'Kavita Rao',
        email: 'kavita.rao@saksham.edu',
        phone: '+91 98112 34511',
        employeeId: 'EMP-111',
        specialization: 'Macroeconomics & Statistics',
        qualification: 'M.A. Economics, B.Ed.',
        joiningDate: '2021-02-15',
        address: 'Sector 93A, Noida',
        primarySubjectCode: 'ECO'
      },
      {
        name: 'Ritu Saxena',
        email: 'ritu.saxena@saksham.edu',
        phone: '+91 98112 34512',
        employeeId: 'EMP-112',
        specialization: 'Fine Arts, Sculpture & Painting',
        qualification: 'M.F.A Fine Arts',
        joiningDate: '2022-08-10',
        address: 'Vaishali Sector 4, Ghaziabad',
        primarySubjectCode: 'ART'
      }
    ];

    const teacherMap: Record<string, { userId: string; teacherId: string; name: string }> = {};

    for (const f of facultyData) {
      const uRes = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, is_active, must_change_password)
         VALUES ($1, $2, $3, $4, TRUE, FALSE) RETURNING id`,
        [f.name, f.email, defaultPasswordHash, f.phone]
      );
      const userId = uRes.rows[0].id;

      // Assign teacher role
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, is_active) VALUES ($1, $2, TRUE)`,
        [userId, roleMap['teacher']]
      );

      // Insert teacher profile
      const tRes = await client.query(
        `INSERT INTO teachers (user_id, employee_id, specialization, qualification, joining_date, address, emergency_contact)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [userId, f.employeeId, f.specialization, f.qualification, f.joiningDate, f.address, '+91 98112 00000']
      );

      teacherMap[f.primarySubjectCode] = { userId, teacherId: tRes.rows[0].id, name: f.name };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 6. ALLOCATE SUBJECTS TO CLASSES (class_subjects)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('🔗 Allocating subjects and faculty to classes...');
    const allocations = [
      // Class 10
      { className: 'Class 10', subjectCode: 'MATH', teacherCode: 'MATH' },
      { className: 'Class 10', subjectCode: 'SCI', teacherCode: 'PHY' },
      { className: 'Class 10', subjectCode: 'ENG', teacherCode: 'ENG' },
      { className: 'Class 10', subjectCode: 'HIN', teacherCode: 'HIN' },
      { className: 'Class 10', subjectCode: 'SST', teacherCode: 'SST' },
      { className: 'Class 10', subjectCode: 'CS', teacherCode: 'CS' },
      // Class 9
      { className: 'Class 9', subjectCode: 'MATH', teacherCode: 'MATH' },
      { className: 'Class 9', subjectCode: 'SCI', teacherCode: 'CHEM' },
      { className: 'Class 9', subjectCode: 'ENG', teacherCode: 'ENG' },
      { className: 'Class 9', subjectCode: 'SST', teacherCode: 'SST' },
      // Class 11 & 12 Science
      { className: 'Class 11 - Science', subjectCode: 'PHY', teacherCode: 'PHY' },
      { className: 'Class 11 - Science', subjectCode: 'CHEM', teacherCode: 'CHEM' },
      { className: 'Class 11 - Science', subjectCode: 'MATH', teacherCode: 'MATH' },
      { className: 'Class 11 - Science', subjectCode: 'BIO', teacherCode: 'BIO' },
      { className: 'Class 11 - Science', subjectCode: 'CS', teacherCode: 'CS' },
      { className: 'Class 12 - Science', subjectCode: 'PHY', teacherCode: 'PHY' },
      { className: 'Class 12 - Science', subjectCode: 'CHEM', teacherCode: 'CHEM' },
      { className: 'Class 12 - Science', subjectCode: 'MATH', teacherCode: 'MATH' },
      { className: 'Class 12 - Science', subjectCode: 'CS', teacherCode: 'CS' },
      // Class 11 & 12 Commerce
      { className: 'Class 11 - Commerce', subjectCode: 'ACC', teacherCode: 'ACC' },
      { className: 'Class 11 - Commerce', subjectCode: 'BST', teacherCode: 'ACC' },
      { className: 'Class 11 - Commerce', subjectCode: 'ECO', teacherCode: 'ECO' },
      { className: 'Class 12 - Commerce', subjectCode: 'ACC', teacherCode: 'ACC' },
      { className: 'Class 12 - Commerce', subjectCode: 'BST', teacherCode: 'ACC' },
      { className: 'Class 12 - Commerce', subjectCode: 'ECO', teacherCode: 'ECO' }
    ];

    for (const alloc of allocations) {
      const cls = classMap[alloc.className];
      const sub = subjectMap[alloc.subjectCode];
      const tchr = teacherMap[alloc.teacherCode];
      if (cls && sub && tchr) {
        await client.query(
          `INSERT INTO class_subjects (class_id, subject_id, teacher_id, academic_year_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (class_id, subject_id, academic_year_id) DO NOTHING`,
          [cls.id, sub.id, tchr.userId, currentAYId]
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 7. REAL STUDENTS & PARENTS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('👨‍👩‍👧‍👦 Seeding realistic Indian students and parent profiles...');
    const studentsSeedList = [
      // Class 10 - Section A
      { name: 'Aarav Sharma', gender: 'male', dob: '2011-04-12', blood: 'O+', roll: '1', class: 'Class 10', sec: 'A', parentName: 'Ramesh Sharma', parentEmail: 'ramesh.sharma@gmail.com', phone: '+91 98710 11001' },
      { name: 'Diya Patel', gender: 'female', dob: '2011-06-25', blood: 'A+', roll: '2', class: 'Class 10', sec: 'A', parentName: 'Sanjeev Patel', parentEmail: 'sanjeev.patel@gmail.com', phone: '+91 98710 11002' },
      { name: 'Rohan Iyer', gender: 'male', dob: '2011-01-18', blood: 'B+', roll: '3', class: 'Class 10', sec: 'A', parentName: 'Venkat Iyer', parentEmail: 'venkat.iyer@gmail.com', phone: '+91 98710 11003' },
      { name: 'Ananya Verma', gender: 'female', dob: '2011-09-04', blood: 'AB+', roll: '4', class: 'Class 10', sec: 'A', parentName: 'Suresh Verma', parentEmail: 'suresh.verma@gmail.com', phone: '+91 98710 11004' },
      { name: 'Vihaan Gupta', gender: 'male', dob: '2011-11-30', blood: 'O+', roll: '5', class: 'Class 10', sec: 'A', parentName: 'Alok Gupta', parentEmail: 'alok.gupta@gmail.com', phone: '+91 98710 11005' },
      { name: 'Ishita Sen', gender: 'female', dob: '2011-03-15', blood: 'B+', roll: '6', class: 'Class 10', sec: 'A', parentName: 'Dr. Subhash Sen', parentEmail: 'subhash.sen@gmail.com', phone: '+91 98710 11006' },
      // Class 10 - Section B
      { name: 'Aryan Choudhury', gender: 'male', dob: '2011-07-22', blood: 'A-', roll: '1', class: 'Class 10', sec: 'B', parentName: 'Manish Choudhury', parentEmail: 'manish.choudhury@gmail.com', phone: '+91 98710 11007' },
      { name: 'Tanvi Joshi', gender: 'female', dob: '2011-05-19', blood: 'O+', roll: '2', class: 'Class 10', sec: 'B', parentName: 'Hemant Joshi', parentEmail: 'hemant.joshi@gmail.com', phone: '+91 98710 11008' },
      { name: 'Kabir Malhotra', gender: 'male', dob: '2011-10-10', blood: 'B+', roll: '3', class: 'Class 10', sec: 'B', parentName: 'Rajeev Malhotra', parentEmail: 'rajeev.malhotra@gmail.com', phone: '+91 98710 11009' },
      { name: 'Meera Nambiar', gender: 'female', dob: '2011-02-28', blood: 'O-', roll: '4', class: 'Class 10', sec: 'B', parentName: 'Girish Nambiar', parentEmail: 'girish.nambiar@gmail.com', phone: '+91 98710 11010' },

      // Class 9 - Section A
      { name: 'Aditya Deshmukh', gender: 'male', dob: '2012-08-14', blood: 'A+', roll: '1', class: 'Class 9', sec: 'A', parentName: 'Nitin Deshmukh', parentEmail: 'nitin.deshmukh@gmail.com', phone: '+91 98710 11011' },
      { name: 'Shreya Banerjee', gender: 'female', dob: '2012-03-11', blood: 'B+', roll: '2', class: 'Class 9', sec: 'A', parentName: 'Arun Banerjee', parentEmail: 'arun.banerjee@gmail.com', phone: '+91 98710 11012' },
      { name: 'Pranav Nair', gender: 'male', dob: '2012-12-05', blood: 'O+', roll: '3', class: 'Class 9', sec: 'A', parentName: 'Madhavan Nair', parentEmail: 'madhavan.nair@gmail.com', phone: '+91 98710 11013' },
      { name: 'Riya Agarwal', gender: 'female', dob: '2012-05-20', blood: 'AB+', roll: '4', class: 'Class 9', sec: 'A', parentName: 'Pradeep Agarwal', parentEmail: 'pradeep.agarwal@gmail.com', phone: '+91 98710 11014' },

      // Class 11 - Science - Section A
      { name: 'Devansh Kulkarni', gender: 'male', dob: '2010-09-17', blood: 'O+', roll: '1', class: 'Class 11 - Science', sec: 'A', parentName: 'Prakash Kulkarni', parentEmail: 'prakash.kulkarni@gmail.com', phone: '+91 98710 11015' },
      { name: 'Natasha Bose', gender: 'female', dob: '2010-04-03', blood: 'A+', roll: '2', class: 'Class 11 - Science', sec: 'A', parentName: 'Dr. Debabrata Bose', parentEmail: 'debabrata.bose@gmail.com', phone: '+91 98710 11016' },
      { name: 'Siddharth Reddy', gender: 'male', dob: '2010-11-25', blood: 'B+', roll: '3', class: 'Class 11 - Science', sec: 'A', parentName: 'Raghav Reddy', parentEmail: 'raghav.reddy@gmail.com', phone: '+91 98710 11017' },
      { name: 'Kriti Saxena', gender: 'female', dob: '2010-02-14', blood: 'O-', roll: '4', class: 'Class 11 - Science', sec: 'A', parentName: 'Pankaj Saxena', parentEmail: 'pankaj.saxena@gmail.com', phone: '+91 98710 11018' },

      // Class 11 - Commerce - Section A
      { name: 'Yashvardhan Singh', gender: 'male', dob: '2010-07-09', blood: 'B+', roll: '1', class: 'Class 11 - Commerce', sec: 'A', parentName: 'Digvijay Singh', parentEmail: 'digvijay.singh@gmail.com', phone: '+91 98710 11019' },
      { name: 'Pooja Hegde', gender: 'female', dob: '2010-01-31', blood: 'A+', roll: '2', class: 'Class 11 - Commerce', sec: 'A', parentName: 'Kishore Hegde', parentEmail: 'kishore.hegde@gmail.com', phone: '+91 98710 11020' },
      { name: 'Harsh Vardhan', gender: 'male', dob: '2010-10-18', blood: 'O+', roll: '3', class: 'Class 11 - Commerce', sec: 'A', parentName: 'Anil Vardhan', parentEmail: 'anil.vardhan@gmail.com', phone: '+91 98710 11021' },

      // Class 12 - Science - Section A
      { name: 'Sneha Paul', gender: 'female', dob: '2009-05-16', blood: 'AB+', roll: '1', class: 'Class 12 - Science', sec: 'A', parentName: 'Tapan Paul', parentEmail: 'tapan.paul@gmail.com', phone: '+91 98710 11022' },
      { name: 'Ritvik Bhatnagar', gender: 'male', dob: '2009-09-08', blood: 'O+', roll: '2', class: 'Class 12 - Science', sec: 'A', parentName: 'Sudhir Bhatnagar', parentEmail: 'sudhir.bhatnagar@gmail.com', phone: '+91 98710 11023' },
      { name: 'Shruti Mishra', gender: 'female', dob: '2009-12-22', blood: 'B+', roll: '3', class: 'Class 12 - Science', sec: 'A', parentName: 'Ravindra Mishra', parentEmail: 'ravindra.mishra@gmail.com', phone: '+91 98710 11024' },

      // Class 12 - Commerce - Section A
      { name: 'Karan Kapoor', gender: 'male', dob: '2009-03-14', blood: 'A+', roll: '1', class: 'Class 12 - Commerce', sec: 'A', parentName: 'Raman Kapoor', parentEmail: 'raman.kapoor@gmail.com', phone: '+91 98710 11025' },
      { name: 'Neha Singhania', gender: 'female', dob: '2009-08-30', blood: 'O+', roll: '2', class: 'Class 12 - Commerce', sec: 'A', parentName: 'Sanjay Singhania', parentEmail: 'sanjay.singhania@gmail.com', phone: '+91 98710 11026' },

      // Class 6 - Section A
      { name: 'Dhruv Pandey', gender: 'male', dob: '2015-06-10', blood: 'B+', roll: '1', class: 'Class 6', sec: 'A', parentName: 'Satish Pandey', parentEmail: 'satish.pandey@gmail.com', phone: '+91 98710 11027' },
      { name: 'Avani Rastogi', gender: 'female', dob: '2015-11-20', blood: 'O+', roll: '2', class: 'Class 6', sec: 'A', parentName: 'Deepak Rastogi', parentEmail: 'deepak.rastogi@gmail.com', phone: '+91 98710 11028' },
      { name: 'Arham Jain', gender: 'male', dob: '2015-02-17', blood: 'A+', roll: '3', class: 'Class 6', sec: 'A', parentName: 'Vikas Jain', parentEmail: 'vikas.jain@gmail.com', phone: '+91 98710 11029' },
      { name: 'Tara Chawla', gender: 'female', dob: '2015-09-05', blood: 'AB+', roll: '4', class: 'Class 6', sec: 'A', parentName: 'Gaurav Chawla', parentEmail: 'gaurav.chawla@gmail.com', phone: '+91 98710 11030' }
    ];

    const studentRecordList: any[] = [];
    let admCounter = 101;

    for (const s of studentsSeedList) {
      // 1. Create Parent User
      const pUserRes = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [s.parentName, s.parentEmail, defaultPasswordHash, s.phone]
      );
      const parentUserId = pUserRes.rows[0].id;
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, is_active)
         VALUES ($1, $2, TRUE)
         ON CONFLICT DO NOTHING`,
        [parentUserId, roleMap['parent']]
      );

      // 2. Create Student User
      const studentEmail = `${s.name.toLowerCase().replace(/[^a-z]/g, '')}${admCounter}@saksham.edu`;
      const sUserRes = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id`,
        [s.name, studentEmail, defaultPasswordHash, s.phone]
      );
      const studentUserId = sUserRes.rows[0].id;
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, is_active)
         VALUES ($1, $2, TRUE)`,
        [studentUserId, roleMap['student']]
      );

      // 3. Map Class & Section
      const classId = classMap[s.class]?.id;
      const secKey = `${s.class}-${s.sec}`;
      const sectionId = sectionMap[secKey]?.id;
      const admNum = `ADM-2026-0${admCounter++}`;

      const stRes = await client.query(
        `INSERT INTO students (
           user_id, admission_number, admission_date, dob, gender,
           current_class_id, current_section_id, roll_number, parent_user_id,
           blood_group, address, emergency_contact, status
         ) VALUES ($1, $2, '2026-04-01', $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
         RETURNING id, current_class_id, current_section_id, admission_number, roll_number`,
        [
          studentUserId, admNum, s.dob, s.gender,
          classId, sectionId, s.roll, parentUserId,
          s.blood, 'Sector 62, Institutional Area, Noida', s.phone
        ]
      );

      studentRecordList.push({
        ...stRes.rows[0],
        userId: studentUserId,
        name: s.name,
        className: s.class,
        sectionName: s.sec
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 8. REALISTIC FEE STRUCTURES & PAYMENTS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('💰 Setting up realistic fee structures, ledger balances, and payment history...');

    const feePlans = [
      {
        className: 'Class 10',
        title: 'Class 10 Annual Comprehensive Fee Structure 2026-27',
        dueDate: '2026-07-15',
        components: [
          { name: 'Tuition Fee (Annual)', amount: 18000, optional: false },
          { name: 'Annual Development Fund', amount: 5000, optional: false },
          { name: 'Science & Computer Lab Maintenance', amount: 3000, optional: false },
          { name: 'CBSE Examination & Internal Assessment Fee', amount: 2000, optional: false }
        ]
      },
      {
        className: 'Class 9',
        title: 'Class 9 Annual Fee Structure 2026-27',
        dueDate: '2026-07-15',
        components: [
          { name: 'Tuition Fee (Annual)', amount: 16000, optional: false },
          { name: 'Development & Infrastructure Fee', amount: 5000, optional: false },
          { name: 'Computer Science Lab Fee', amount: 2000, optional: false },
          { name: 'Annual Activity & Library Fee', amount: 1000, optional: false }
        ]
      },
      {
        className: 'Class 11 - Science',
        title: 'Class 11 Science Senior Secondary Fee 2026-27',
        dueDate: '2026-07-15',
        components: [
          { name: 'Tuition Fee (Annual)', amount: 22000, optional: false },
          { name: 'Annual Development Fund', amount: 6000, optional: false },
          { name: 'Physics, Chemistry & Bio Lab Practical Consumables', amount: 4000, optional: false },
          { name: 'AI & Robotics Lab Fee', amount: 2000, optional: false }
        ]
      },
      {
        className: 'Class 11 - Commerce',
        title: 'Class 11 Commerce Senior Secondary Fee 2026-27',
        dueDate: '2026-07-15',
        components: [
          { name: 'Tuition Fee (Annual)', amount: 20000, optional: false },
          { name: 'Annual Development Fund', amount: 6000, optional: false },
          { name: 'Computerised Accounting Lab Fee', amount: 2000, optional: false },
          { name: 'Business Case Study & Library Fee', amount: 2000, optional: false }
        ]
      },
      {
        className: 'Class 12 - Science',
        title: 'Class 12 Science Board Candidate Fee 2026-27',
        dueDate: '2026-07-15',
        components: [
          { name: 'Tuition Fee (Annual)', amount: 24000, optional: false },
          { name: 'Annual Development Fund', amount: 6000, optional: false },
          { name: 'Senior Science Practicals & Lab', amount: 4000, optional: false },
          { name: 'CBSE Board Registration & Practical Exams', amount: 3000, optional: false }
        ]
      },
      {
        className: 'Class 12 - Commerce',
        title: 'Class 12 Commerce Board Candidate Fee 2026-27',
        dueDate: '2026-07-15',
        components: [
          { name: 'Tuition Fee (Annual)', amount: 22000, optional: false },
          { name: 'Annual Development Fund', amount: 6000, optional: false },
          { name: 'Commerce & Economics Projects', amount: 2000, optional: false },
          { name: 'CBSE Board Registration & Examination', amount: 3000, optional: false }
        ]
      },
      {
        className: 'Class 6',
        title: 'Middle School Class 6 Fee Structure 2026-27',
        dueDate: '2026-07-15',
        components: [
          { name: 'Tuition Fee (Annual)', amount: 15000, optional: false },
          { name: 'Development Fee', amount: 4000, optional: false },
          { name: 'Activity, Sports & Arts Fee', amount: 3000, optional: false }
        ]
      }
    ];

    let receiptCounter = 1;

    for (const plan of feePlans) {
      const cls = classMap[plan.className];
      if (!cls) continue;

      const totalAmount = plan.components.reduce((sum, c) => sum + c.amount, 0);

      const fsRes = await client.query(
        `INSERT INTO fee_structures (name, class_id, academic_year_id, due_date, total_amount, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [plan.title, cls.id, currentAYId, plan.dueDate, totalAmount, 'Standard approved annual fee structure', adminUserId]
      );
      const fsId = fsRes.rows[0].id;

      for (const comp of plan.components) {
        await client.query(
          `INSERT INTO fee_components (fee_structure_id, name, amount, is_optional)
           VALUES ($1, $2, $3, $4)`,
          [fsId, comp.name, comp.amount, comp.optional]
        );
      }

      // Assign to students of this class
      const classStudents = studentRecordList.filter(st => st.className === plan.className);
      for (let idx = 0; idx < classStudents.length; idx++) {
        const student = classStudents[idx];

        // 1. Fee Assignment
        await client.query(
          `INSERT INTO student_fee_assignments (student_id, fee_structure_id, academic_year_id, total_amount, assigned_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [student.id, fsId, currentAYId, totalAmount, adminUserId]
        );

        // 2. Ledger record
        await client.query(
          `INSERT INTO student_fee_ledger (student_id, academic_year_id, advance_credit)
           VALUES ($1, $2, 0.00)`,
          [student.id, currentAYId]
        );

        // 3. Payments simulation:
        // Student 0: Fully Paid
        // Student 1: Partial Paid (50%)
        // Student 2: Pending (0%)
        // Student 3: Fully Paid via Cheque
        if (idx % 3 === 0) {
          // Fully paid
          const recNum = `FEE-2026-${String(receiptCounter++).padStart(4, '0')}`;
          await client.query(
            `INSERT INTO fee_payments (
               student_id, academic_year_id, receipt_number, amount_paid, payment_mode, payment_date,
               status, notes, collected_by
             ) VALUES ($1, $2, $3, $4, 'bank_transfer', '2026-05-10', 'completed', 'Annual fee paid online via NEFT/UPI', $5)`,
            [student.id, currentAYId, recNum, totalAmount, adminUserId]
          );
        } else if (idx % 3 === 1) {
          // Partial paid (Term 1 installment)
          const recNum = `FEE-2026-${String(receiptCounter++).padStart(4, '0')}`;
          const installment = Math.round(totalAmount / 2);
          await client.query(
            `INSERT INTO fee_payments (
               student_id, academic_year_id, receipt_number, amount_paid, payment_mode, payment_date,
               status, notes, collected_by
             ) VALUES ($1, $2, $3, $4, 'cash', '2026-05-12', 'completed', 'First installment paid at school accounts desk', $5)`,
            [student.id, currentAYId, recNum, installment, adminUserId]
          );
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 9. REALISTIC ATTENDANCE RECORDS (Past 10 Days)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('📋 Recording realistic daily attendance patterns...');
    const attendanceDates = [
      '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20',
      '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27'
    ];

    for (const d of attendanceDates) {
      for (let sIdx = 0; sIdx < studentRecordList.length; sIdx++) {
        const student = studentRecordList[sIdx];
        // 94% present rate, realistic absences
        const rand = (sIdx * 17 + d.charCodeAt(9)) % 100;
        let status = 'present';
        let remarks: string | null = null;

        if (rand < 4) {
          status = 'absent';
          remarks = 'Parent notified via SMS - unwell';
        } else if (rand < 7) {
          status = 'late';
          remarks = 'School bus delayed at traffic junction';
        }

        await client.query(
          `INSERT INTO attendance_records (
             student_id, academic_year_id, date, type, status, remarks, marked_by
           ) VALUES ($1, $2, $3, 'daily', $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [student.id, currentAYId, d, status, remarks, adminUserId]
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 10. REALISTIC HOMEWORK & SUBMISSIONS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('📖 Seeding authentic curriculum homework and student submissions...');
    const class10 = classMap['Class 10'];
    const class12Sci = classMap['Class 12 - Science'];
    const mathSub = subjectMap['MATH'];
    const sciSub = subjectMap['SCI'];
    const phySub = subjectMap['PHY'];
    const teacherMath = teacherMap['MATH'];
    const teacherPhy = teacherMap['PHY'];

    // Homework 1: Class 10 Math
    if (class10 && mathSub && teacherMath) {
      const hw1Res = await client.query(
        `INSERT INTO homework_assignments (
           title, description, class_id, subject_id, academic_year_id, assigned_by, due_date, status
         ) VALUES (
           'Quadratic Equations: NCERT Exercise 4.2 & 4.3 Problem Solutions',
           'Complete word problems on nature of roots and quadratic formula. Show step-by-step discriminant verification in your homework notebook.',
           $1, $2, $3, $4, '2026-10-31', 'active'
         ) RETURNING id`,
        [class10.id, mathSub.id, currentAYId, teacherMath.userId]
      );
      const hw1Id = hw1Res.rows[0].id;

      // Seed submissions for Class 10 students
      const class10Students = studentRecordList.filter(s => s.className === 'Class 10');
      for (let i = 0; i < Math.min(5, class10Students.length); i++) {
        await client.query(
          `INSERT INTO homework_submissions (
             homework_id, student_id, attempt_number, status, remarks, submitted_at
           ) VALUES ($1, $2, 1, 'graded', 'Good work! Calculations verified and neat presentation.', NOW() - INTERVAL '1 day')`,
          [hw1Id, class10Students[i].id]
        );
      }
    }

    // Homework 2: Class 10 Science
    if (class10 && sciSub && teacherPhy) {
      const hw2Res = await client.query(
        `INSERT INTO homework_assignments (
           title, description, class_id, subject_id, academic_year_id, assigned_by, due_date, status
         ) VALUES (
           'Light Reflection & Refraction: Ray Diagrams for Concave Mirrors',
           'Draw neat labelled ray diagrams for object positions at infinity, beyond C, at C, and between C & F. Include magnification formulas.',
           $1, $2, $3, $4, '2026-11-03', 'active'
         ) RETURNING id`,
        [class10.id, sciSub.id, currentAYId, teacherPhy.userId]
      );
      const hw2Id = hw2Res.rows[0].id;

      const class10Students = studentRecordList.filter(s => s.className === 'Class 10');
      for (let i = 0; i < Math.min(4, class10Students.length); i++) {
        await client.query(
          `INSERT INTO homework_submissions (
             homework_id, student_id, attempt_number, status, remarks, submitted_at
           ) VALUES ($1, $2, 1, 'submitted', 'Ray diagrams drawn with compass and ruler.', NOW() - INTERVAL '4 hours')`,
          [hw2Id, class10Students[i].id]
        );
      }
    }

    // Homework 3: Class 12 Science Physics
    if (class12Sci && phySub && teacherPhy) {
      await client.query(
        `INSERT INTO homework_assignments (
           title, description, class_id, subject_id, academic_year_id, assigned_by, due_date, status
         ) VALUES (
           'Electrostatics: Gauss Law Applications and Numerical Problem Sheet',
           'Solve numericals 1 to 15 from CBSE question bank on electric flux and field due to infinitely long wire and charged spherical shell.',
           $1, $2, $3, $4, '2026-11-05', 'active'
         )`,
        [class12Sci.id, phySub.id, currentAYId, teacherPhy.userId]
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 11. REAL EXAMS, SUBJECT SCHEDULES & MARKS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('📝 Seeding authentic school term examinations and marks...');
    if (class10) {
      // 1. Completed Exam: Periodic Assessment 1
      const exam1Res = await client.query(
        `INSERT INTO exams (title, type, academic_year_id, class_id, status, created_by)
         VALUES ('Periodic Assessment 1 (PA-1) - Term 1', 'unit_test', $1, $2, 'published', $3)
         RETURNING id`,
        [currentAYId, class10.id, adminUserId]
      );
      const exam1Id = exam1Res.rows[0].id;

      // Exam subjects
      const exSub1Res = await client.query(
        `INSERT INTO exam_subjects (exam_id, subject_id, exam_date, start_time, end_time, max_marks, pass_marks)
         VALUES ($1, $2, '2026-07-20', '09:00', '10:30', 40.00, 14.00) RETURNING id`,
        [exam1Id, mathSub.id]
      );
      const exMathSubId = exSub1Res.rows[0].id;

      const exSub2Res = await client.query(
        `INSERT INTO exam_subjects (exam_id, subject_id, exam_date, start_time, end_time, max_marks, pass_marks)
         VALUES ($1, $2, '2026-07-22', '09:00', '10:30', 40.00, 14.00) RETURNING id`,
        [exam1Id, sciSub.id]
      );
      const exSciSubId = exSub2Res.rows[0].id;

      // Grade Class 10 students
      const class10Students = studentRecordList.filter(s => s.className === 'Class 10');
      const sampleMarks = [38, 35, 39, 32, 28, 37, 34, 36, 31, 33];
      for (let i = 0; i < class10Students.length; i++) {
        const m = sampleMarks[i % sampleMarks.length];
        await client.query(
          `INSERT INTO exam_marks (exam_subject_id, student_id, marks_obtained, is_absent, remarks, graded_by)
           VALUES ($1, $2, $3, FALSE, 'Good understanding of core concepts', $4)`,
          [exMathSubId, class10Students[i].id, m, adminUserId]
        );
        await client.query(
          `INSERT INTO exam_marks (exam_subject_id, student_id, marks_obtained, is_absent, remarks, graded_by)
           VALUES ($1, $2, $3, FALSE, 'Well written structured answers', $4)`,
          [exSciSubId, class10Students[i].id, m - 2, adminUserId]
        );
      }

      // 2. Scheduled Exam: Mid-Term Examination 2026-27
      await client.query(
        `INSERT INTO exams (title, type, academic_year_id, class_id, status, created_by)
         VALUES ('Half-Yearly / Mid-Term Examination 2026', 'mid_term', $1, $2, 'scheduled', $3)`,
        [currentAYId, class10.id, adminUserId]
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 12. AUTHENTIC SCHOOL NOTICES & CIRCULARS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('📢 Publishing authentic institutional notices and circulars...');
    const noticesList = [
      {
        title: 'Circular: Term 1 Parent-Teacher Meeting (PTM) Schedule',
        content: 'Dear Parents, the Parent-Teacher Meeting to discuss your ward\'s academic progress and Periodic Assessment 1 performance is scheduled for Saturday, 14th November 2026, from 8:30 AM to 12:30 PM. Slot timings will be shared by respective class teachers.',
        type: 'academic',
        priority: 'high',
        targetAudience: 'role',
        targetRole: 'parent'
      },
      {
        title: 'Announcement: 15th Inter-School Science & Technology Exhibition 2026',
        content: 'Saksham International Academy is proud to host the Inter-School Science & AI Innovators Fair on 28th November 2026. Interested students from Grades 8 to 12 can submit their working model abstracts to the Science Department HOD by 10th November.',
        type: 'event',
        priority: 'high',
        targetAudience: 'all',
        targetRole: null
      },
      {
        title: 'CBSE Board Examination 2027: LOC Data Verification for Classes X & XII',
        content: 'All students of Class X and XII are advised to verify their candidate details, spelling of parents\' names, and subject combinations in the List of Candidates (LOC) available at the administrative office before 15th November 2026.',
        type: 'academic',
        priority: 'high',
        targetAudience: 'all',
        targetRole: null
      },
      {
        title: 'School Circular: Festive Autumn Vacation Schedule',
        content: 'The school will remain closed from 29th October to 3rd November 2026 on account of Diwali, Govardhan Puja, and Bhai Dooj. Regular classes will resume on Wednesday, 4th November 2026, on standard winter timings.',
        type: 'general',
        priority: 'normal',
        targetAudience: 'all',
        targetRole: null
      },
      {
        title: 'Sports Department: Selection Trials for Inter-School Cricket & Badminton Squads',
        content: 'Open trials for the Senior and Junior school cricket and badminton teams will be conducted on the main school sports ground from 3:30 PM to 5:00 PM on Thursday and Friday. Interested students must carry their own standard gear.',
        type: 'event',
        priority: 'normal',
        targetAudience: 'all',
        targetRole: null
      },
      {
        title: 'Health Advisory: Air Quality and Campus Wellness Guidelines',
        content: 'In view of seasonal changes in Delhi-NCR, all outdoor morning assembly activities will be conducted in the indoor auditorium until further notice. Air purifiers have been activated across all classrooms and learning labs.',
        type: 'urgent',
        priority: 'high',
        targetAudience: 'all',
        targetRole: null
      }
    ];

    for (const n of noticesList) {
      await client.query(
        `INSERT INTO notices (
           title, content, type, priority, target_audience, target_role,
           academic_year_id, published, published_at, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW() - INTERVAL '2 days', $8)`,
        [n.title, n.content, n.type, n.priority, n.targetAudience, n.targetRole, currentAYId, adminUserId]
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 13. AUTHENTIC SCHOOL CALENDAR EVENTS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('🗓️ Populating school event calendar...');
    const eventsList = [
      {
        title: 'Annual Sports Day & Athletics Meet 2026',
        description: 'Track and field events, inter-house march past, torch lighting ceremony, and cultural drills by primary students.',
        eventType: 'sports_day',
        startDate: '2026-11-20',
        endDate: '2026-11-21'
      },
      {
        title: 'Parent-Teacher Meeting (PTM) - Term 1 Evaluation',
        description: 'Comprehensive review of terminal assessment reports with subject faculty and class teachers.',
        eventType: 'ptm',
        startDate: '2026-11-14',
        endDate: '2026-11-14'
      },
      {
        title: 'Annual Day Cultural Fest - Udaan 2026',
        description: 'Showcasing musical theatre, classical dance ensembles, and art exhibitions at the Dr. Ambedkar Auditorium.',
        eventType: 'cultural',
        startDate: '2026-12-18',
        endDate: '2026-12-19'
      },
      {
        title: 'CBSE Pre-Board Examination Series 1',
        description: 'Full syllabus mock examinations for Class X and Class XII according to official CBSE marking schemes.',
        eventType: 'exam',
        startDate: '2026-12-01',
        endDate: '2026-12-12'
      },
      {
        title: 'Diwali & Chhath Puja Holidays',
        description: 'Campus closed for festive celebration.',
        eventType: 'holiday',
        startDate: '2026-10-29',
        endDate: '2026-11-03'
      }
    ];

    for (const ev of eventsList) {
      await client.query(
        `INSERT INTO events (
           title, description, event_type, start_date, end_date,
           target_audience, academic_year_id, created_by
         ) VALUES ($1, $2, $3, $4, $5, 'all', $6, $7)`,
        [ev.title, ev.description, ev.eventType, ev.startDate, ev.endDate, currentAYId, adminUserId]
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 14. REALISTIC ADMISSION APPLICATIONS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('📝 Seeding realistic candidate admission applications...');
    const admissionCandidates = [
      { applicant: 'Reyansh Singhal', dob: '2021-08-15', gender: 'male', className: 'Nursery', parent: 'Manish Singhal', email: 'manish.singhal@yahoo.co.in', phone: '+91 98100 23401', status: 'submitted' },
      { applicant: 'Myra Kapoor', dob: '2020-03-22', gender: 'female', className: 'LKG', parent: 'Varun Kapoor', email: 'varun.kapoor@gmail.com', phone: '+91 98100 23402', status: 'under_review' },
      { applicant: 'Samarth Khandelwal', dob: '2019-11-10', gender: 'male', className: 'Class 1', parent: 'Ritesh Khandelwal', email: 'ritesh.k@gmail.com', phone: '+91 98100 23403', status: 'approved' },
      { applicant: 'Anvi Saxena', dob: '2018-05-14', gender: 'female', className: 'Class 2', parent: 'Naveen Saxena', email: 'naveen.saxena@gmail.com', phone: '+91 98100 23404', status: 'enrolled' },
      { applicant: 'Atharv Tiwari', dob: '2014-09-02', gender: 'male', className: 'Class 6', parent: 'Shailendra Tiwari', email: 'shailendra.t@gmail.com', phone: '+91 98100 23405', status: 'under_review' },
      { applicant: 'Prisha Mehra', dob: '2012-07-29', gender: 'female', className: 'Class 8', parent: 'Ashok Mehra', email: 'ashok.mehra@gmail.com', phone: '+91 98100 23406', status: 'approved' },
      { applicant: 'Kavish Mathur', dob: '2011-04-18', gender: 'male', className: 'Class 9', parent: 'Dr. Vivek Mathur', email: 'vivek.mathur@aiims.edu', phone: '+91 98100 23407', status: 'submitted' },
      { applicant: 'Suhani Dixit', dob: '2010-06-30', gender: 'female', className: 'Class 11 - Science', parent: 'Alok Dixit', email: 'alok.dixit@ongc.co.in', phone: '+91 98100 23408', status: 'approved' }
    ];

    let appCounter = 501;
    for (const cand of admissionCandidates) {
      const cls = classMap[cand.className];
      if (!cls) continue;
      const appNum = `APP-2026-0${appCounter++}`;

      await client.query(
        `INSERT INTO admission_applications (
           application_number, applicant_name, dob, gender, applied_class_id, academic_year_id,
           parent_name, parent_email, parent_phone, address, status, remarks
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          appNum, cand.applicant, cand.dob, cand.gender, cls.id, currentAYId,
          cand.parent, cand.email, cand.phone, 'Sector 50, Noida, UP',
          cand.status, 'Documents verified against original certificates'
        ]
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 15. INSTITUTIONAL SCHOOL SETTINGS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('🏛️ Updating official institutional profile and school settings...');
    const settingsCheck = await client.query('SELECT id FROM school_settings LIMIT 1');
    if (settingsCheck.rowCount === 0) {
      await client.query(
        `INSERT INTO school_settings (
           school_name, affiliation_number, address, phone, email, website,
           motto, currency, academic_year_id, period_duration_minutes, attendance_cutoff_time
         ) VALUES (
           'Saksham International Academy',
           'CBSE/AFF/2130892/2026',
           'Plot 14, Knowledge Boulevard, Institutional Area, Sector 62, Noida, Delhi-NCR - 201309',
           '+91 120 4567890 / +91 98101 23456',
           'contact@sakshamschool.edu.in',
           'https://saksham.edu.in',
           'Vidya Dadati Vinayam (Excellence in Learning & Character)',
           'INR',
           $1, 45, '08:30'
         )`,
        [currentAYId]
      );
    } else {
      await client.query(
        `UPDATE school_settings
         SET school_name = 'Saksham International Academy',
             affiliation_number = 'CBSE/AFF/2130892/2026',
             address = 'Plot 14, Knowledge Boulevard, Institutional Area, Sector 62, Noida, Delhi-NCR - 201309',
             phone = '+91 120 4567890 / +91 98101 23456',
             email = 'contact@sakshamschool.edu.in',
             website = 'https://saksham.edu.in',
             motto = 'Vidya Dadati Vinayam (Excellence in Learning & Character)',
             currency = 'INR',
             academic_year_id = $1,
             attendance_cutoff_time = '08:30',
             updated_at = NOW()
         WHERE id = $2`,
        [currentAYId, settingsCheck.rows[0].id]
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 16. SUPPORT TICKETS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('🎫 Adding realistic parent support queries and tickets...');
    const sampleParent = await client.query("SELECT id FROM users WHERE email = 'ramesh.sharma@gmail.com'");
    if (sampleParent.rowCount! > 0) {
      const pId = sampleParent.rows[0].id;
      await client.query(
        `INSERT INTO support_tickets (
           ticket_number, user_id, subject, category, priority, status, description, assigned_to
         ) VALUES (
           'TIK-2026-0101', $1, 'Request for Duplicate Annual Fee Receipt Copy', 'fees', 'medium', 'resolved',
           'Need an official stamped receipt of the Term 1 fee payment for company reimbursement.', $2
         )`,
        [pId, adminUserId]
      );
      await client.query(
        `INSERT INTO support_tickets (
           ticket_number, user_id, subject, category, priority, status, description, assigned_to
         ) VALUES (
           'TIK-2026-0102', $1, 'Bus Route 14 Morning Stop Adjustment', 'general', 'low', 'in_progress',
           'Requesting the transport desk to consider shifting the pickup point 50 meters forward near gate 2.', $2
         )`,
        [pId, adminUserId]
      );
    }

    await client.query('COMMIT');
    console.log('\n=============================================================');
    console.log('🎉 REAL DATA SEEDING COMPLETE! ALL MODULES FULLY REVAMPED!');
    console.log('=============================================================');
    console.log(`Classes Seeded     : ${classData.length}`);
    console.log(`Faculty Members    : ${facultyData.length}`);
    console.log(`Students Enrolled  : ${studentsSeedList.length}`);
    console.log(`Curriculum Subjects: ${subjectData.length}`);
    console.log(`Active Year        : 2026-2027`);
    console.log(`Admin Demo Login   : admin@gmail.com / Saksham_developer@1234`);
    console.log('=============================================================\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ SEED ERROR: Transaction rolled back!', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedRealData().catch(console.error);
