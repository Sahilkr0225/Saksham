const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('🚀 Applying migration: Fee Management Backend Hardening...');

  // 1. Create atomic sequence for concurrency-safe receipt numbering
  console.log('1. Creating sequence fee_receipt_seq...');
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS fee_receipt_seq START WITH 1 INCREMENT BY 1;
  `);

  // Sync sequence with max existing numeric suffix in receipt_number to prevent any collisions
  await pool.query(`
    DO $$
    DECLARE
      max_seq bigint;
    BEGIN
      SELECT MAX(NULLIF(regexp_replace(receipt_number, '^FEE-[0-9]{4}-', ''), '')::bigint)
      INTO max_seq
      FROM fee_payments
      WHERE receipt_number ~ '^FEE-[0-9]{4}-[0-9]+$';

      IF max_seq IS NOT NULL AND max_seq > 0 THEN
        PERFORM setval('fee_receipt_seq', max_seq, true);
        RAISE NOTICE 'Synchronized fee_receipt_seq to existing max: %', max_seq;
      ELSE
        RAISE NOTICE 'fee_receipt_seq initialized at default start.';
      END IF;
    END $$;
  `);

  // 2. Add idempotency_key column to fee_payments
  console.log('2. Adding column idempotency_key to fee_payments...');
  await pool.query(`
    ALTER TABLE fee_payments
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
  `);

  // 3. Create unique index on idempotency_key (partial index: only when non-null)
  console.log('3. Creating unique index uk_fee_payments_idempotency...');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uk_fee_payments_idempotency
    ON fee_payments (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  `);

  // Verification
  const indexCheck = await pool.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'fee_payments' AND indexname = 'uk_fee_payments_idempotency';
  `);
  console.log('✅ Applied index details:', indexCheck.rows[0]);

  const seqCheck = await pool.query(`
    SELECT last_value, is_called FROM fee_receipt_seq;
  `);
  console.log('✅ Sequence details:', seqCheck.rows[0]);

  console.log('🎉 Migration add_fee_hardening completed successfully!');
  await pool.end();
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  pool.end();
  process.exit(1);
});
