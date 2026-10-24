const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('Applying migration: uk_students_active_section_roll');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uk_students_active_section_roll
    ON students (current_section_id, roll_number)
    WHERE status = 'active' AND current_section_id IS NOT NULL AND roll_number IS NOT NULL;
  `);
  console.log('Index created or verified successfully!');

  const res = await pool.query(`
    SELECT indexname, indexdef FROM pg_indexes 
    WHERE tablename = 'students' AND indexname = 'uk_students_active_section_roll';
  `);
  console.log('Applied index details:', res.rows[0]);
  await pool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  pool.end();
  process.exit(1);
});
