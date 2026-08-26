import pool from './db';

const tablesSql = `
  CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      avatar_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      last_login_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP WITH TIME ZONE
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

  CREATE TABLE IF NOT EXISTS teachers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      employee_id VARCHAR(50) UNIQUE,
      specialization VARCHAR(100),
      qualification VARCHAR(255),
      joining_date DATE,
      address TEXT,
      emergency_contact VARCHAR(20),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);


  CREATE TABLE IF NOT EXISTS roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(50) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL UNIQUE,
      resource VARCHAR(50) NOT NULL,
      action VARCHAR(20) NOT NULL,
      description TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);

  CREATE TABLE IF NOT EXISTS role_permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(role_id, permission_id)
  );

  CREATE TABLE IF NOT EXISTS user_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      assigned_by UUID, -- Can be null initially (for the first super_admin user created by setup)
      assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMP WITH TIME ZONE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
  );

  CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(user_id, is_active);

  CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      ip_address VARCHAR(45),
      user_agent TEXT,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

  CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(20) NOT NULL,
      resource VARCHAR(50) NOT NULL,
      resource_id VARCHAR(36),
      old_value JSONB,
      new_value JSONB,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

  CREATE TABLE IF NOT EXISTS academic_years (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(50) NOT NULL UNIQUE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_current BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS classes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(50) NOT NULL UNIQUE,
      code VARCHAR(20) UNIQUE,
      display_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name VARCHAR(50) NOT NULL,
      capacity INT DEFAULT 40,
      room_number VARCHAR(20),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(class_id, name)
  );

  CREATE TABLE IF NOT EXISTS subjects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      code VARCHAR(20) NOT NULL UNIQUE,
      type VARCHAR(20) NOT NULL DEFAULT 'core',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS class_subjects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
      academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(class_id, subject_id, academic_year_id)
  );

  CREATE TABLE IF NOT EXISTS admission_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      application_number VARCHAR(50) NOT NULL UNIQUE,
      applicant_name VARCHAR(100) NOT NULL,
      dob DATE NOT NULL,
      gender VARCHAR(10) NOT NULL,
      applied_class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      parent_name VARCHAR(100) NOT NULL,
      parent_email VARCHAR(255) NOT NULL,
      parent_phone VARCHAR(20) NOT NULL,
      address TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'submitted', -- 'submitted', 'under_review', 'approved', 'rejected', 'enrolled'
      remarks TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_admissions_status ON admission_applications(status);
  CREATE INDEX IF NOT EXISTS idx_admissions_class ON admission_applications(applied_class_id);

  CREATE TABLE IF NOT EXISTS students (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      admission_number VARCHAR(50) NOT NULL UNIQUE,
      admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
      dob DATE NOT NULL,
      gender VARCHAR(10) NOT NULL,
      current_class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
      current_section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
      roll_number VARCHAR(20),
      parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      blood_group VARCHAR(5),
      address TEXT,
      emergency_contact VARCHAR(20),
      status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'transferred', 'graduated', 'suspended'
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
  CREATE INDEX IF NOT EXISTS idx_students_class_section ON students(current_class_id, current_section_id);
  CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

  CREATE TABLE IF NOT EXISTS attendance_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      type VARCHAR(20) NOT NULL, -- 'daily', 'subject'
      subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL, -- 'present', 'absent', 'late', 'half_day'
      remarks TEXT,
      marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uk_attendance_daily ON attendance_records (student_id, date) WHERE type = 'daily';
  CREATE UNIQUE INDEX IF NOT EXISTS uk_attendance_subject ON attendance_records (student_id, date, subject_id) WHERE type = 'subject';
  
  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);
  CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);

  CREATE TABLE IF NOT EXISTS homework_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
      academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
      due_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'archived'
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_homework_class ON homework_assignments(class_id);
  CREATE INDEX IF NOT EXISTS idx_homework_due ON homework_assignments(due_date);
  CREATE INDEX IF NOT EXISTS idx_homework_status ON homework_assignments(status);

  CREATE TABLE IF NOT EXISTS homework_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      homework_id UUID NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attempt_number INT NOT NULL CHECK (attempt_number IN (1, 2)),
      status VARCHAR(20) NOT NULL DEFAULT 'submitted', -- 'submitted', 'late', 'graded'
      remarks TEXT,
      submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(homework_id, student_id, attempt_number)
  );

  CREATE INDEX IF NOT EXISTS idx_hw_submissions_homework ON homework_submissions(homework_id);
  CREATE INDEX IF NOT EXISTS idx_hw_submissions_student ON homework_submissions(student_id);

  CREATE TABLE IF NOT EXISTS exams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL, -- 'unit_test', 'mid_term', 'final', 'quiz'
      academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'ongoing', 'completed', 'published'
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_exams_class_ay ON exams(class_id, academic_year_id);
  CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);

  CREATE TABLE IF NOT EXISTS exam_subjects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      exam_date DATE NOT NULL,
      start_time VARCHAR(10),
      end_time VARCHAR(10),
      max_marks DECIMAL(5,2) NOT NULL DEFAULT 100.00,
      pass_marks DECIMAL(5,2) NOT NULL DEFAULT 40.00,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(exam_id, subject_id)
  );

  CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam ON exam_subjects(exam_id);

  CREATE TABLE IF NOT EXISTS exam_marks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exam_subject_id UUID NOT NULL REFERENCES exam_subjects(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      marks_obtained DECIMAL(5,2),
      is_absent BOOLEAN NOT NULL DEFAULT FALSE,
      remarks TEXT,
      graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(exam_subject_id, student_id)
  );

  CREATE INDEX IF NOT EXISTS idx_exam_marks_subject ON exam_marks(exam_subject_id);
  CREATE INDEX IF NOT EXISTS idx_exam_marks_student ON exam_marks(student_id);
`;

const seedRolesSql = `
  INSERT INTO roles (name, description) VALUES
      ('super_admin', 'Full system access'),
      ('principal', 'School-wide read + workflow approvals'),
      ('office_staff', 'Admissions, fees, documents'),
      ('teacher', 'Own classes: attendance, homework, marks'),
      ('parent', 'Their child data only'),
      ('student', 'Own profile, results, notices')
  ON CONFLICT (name) DO NOTHING;
`;

// Seeds the first super admin user — only runs if email doesn't exist yet
const seedSuperAdmin = async () => {
  const bcrypt = await import('bcryptjs');

  const name     = 'Sahil Kumar';
  const email    = 'sahil@gmail.com';
  const password = 'Password@1234';

  // Check if super admin already exists
  const existing = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if ((existing.rowCount ?? 0) > 0) {
    console.log('👤 Super admin already exists — skipping seed.');
    return;
  }

  // Hash password at runtime (never store plain text)
  const passwordHash = await bcrypt.default.hash(password, 12);

  // Insert user
  const userResult = await pool.query(
    `INSERT INTO users (name, email, password_hash, is_active, must_change_password)
     VALUES ($1, $2, $3, TRUE, FALSE)
     RETURNING id`,
    [name, email, passwordHash]
  );
  const userId = userResult.rows[0].id;

  // Fetch super_admin role id
  const roleResult = await pool.query(
    `SELECT id FROM roles WHERE name = 'super_admin'`
  );
  const roleId = roleResult.rows[0].id;

  // Assign super_admin role to user
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, is_active)
     VALUES ($1, $2, TRUE)`,
    [userId, roleId]
  );

  console.log(`👑 Super admin seeded → ${email}`);
};

export const initDb = async () => {
  const client = await pool.connect();
  try {
    console.log('🔄 Checking / Creating database tables...');
    await client.query('BEGIN');
    
    // Create extensions
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    
    // Create tables
    await client.query(tablesSql);
    console.log('✅ Structure tables created or verified.');
    
    // Seed default roles
    await client.query(seedRolesSql);
    console.log('🌱 Roles seeded successfully.');
    
    await client.query('COMMIT');
    console.log('🎉 Database initialization complete!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during database schema initialization:', error);
    throw error;
  } finally {
    client.release();
  }

  // Seed super admin outside the transaction (has its own checks)
  await seedSuperAdmin();
};
export default initDb;
