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
};
export default initDb;
