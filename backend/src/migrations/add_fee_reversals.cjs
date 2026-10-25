const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('🚀 Applying migration: Fee Management Phase 2 (Reversals & Cheque Lifecycle)...');

  // 1. Add payment status column with check constraint
  console.log('1. Adding status column to fee_payments...');
  await pool.query(`
    ALTER TABLE fee_payments
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed';
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_fee_payments_status'
      ) THEN
        ALTER TABLE fee_payments
        ADD CONSTRAINT chk_fee_payments_status
        CHECK (status IN ('completed', 'reversed', 'bounced'));
      END IF;
    END $$;
  `);

  // 2. Add reversal metadata columns
  console.log('2. Adding reversal audit columns to fee_payments...');
  await pool.query(`
    ALTER TABLE fee_payments
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reversal_reason TEXT;
  `);

  // 3. Add cheque lifecycle metadata columns
  console.log('3. Adding cheque lifecycle columns to fee_payments...');
  await pool.query(`
    ALTER TABLE fee_payments
    ADD COLUMN IF NOT EXISTS cheque_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS cheque_cleared_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS cheque_bounce_reason TEXT;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_fee_payments_cheque_status'
      ) THEN
        ALTER TABLE fee_payments
        ADD CONSTRAINT chk_fee_payments_cheque_status
        CHECK (cheque_status IS NULL OR cheque_status IN ('received', 'deposited', 'cleared', 'bounced'));
      END IF;
    END $$;
  `);

  // 4. Backfill historical cheque records:
  // Pre-existing cheques in the database were accepted as cleared; backfill them to 'cleared'
  console.log('4. Backfilling historical cheque records...');
  const backfillRes = await pool.query(`
    UPDATE fee_payments
    SET cheque_status = 'cleared', cheque_cleared_at = created_at
    WHERE payment_mode = 'cheque' AND cheque_status IS NULL;
  `);
  console.log(`✅ Backfilled ${backfillRes.rowCount} historical cheque record(s) to 'cleared'.`);

  // 5. Create performance partial indexes for active/realized payments
  console.log('5. Creating partial indexes for active payments...');
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fee_payments_realized
    ON fee_payments (student_id, academic_year_id)
    WHERE status = 'completed' AND (payment_mode != 'cheque' OR cheque_status = 'cleared');
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fee_payments_status
    ON fee_payments (status);
  `);

  // Verification
  const cols = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'fee_payments' AND column_name IN ('status', 'reversed_at', 'reversed_by', 'reversal_reason', 'cheque_status', 'cheque_cleared_at', 'cheque_bounce_reason')
    ORDER BY column_name;
  `);
  console.log('✅ Added columns in fee_payments:', cols.rows);

  console.log('🎉 Migration add_fee_reversals completed successfully!');
  await pool.end();
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  pool.end();
  process.exit(1);
});
