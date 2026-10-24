import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon serverless postgres SSL connections
  }
});

// Test db connection
pool.on('connect', () => {
  console.log('📦 Database pool connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.warn('⚠️ Notice on idle database client (pool will reconnect on next query):', err.message);
});

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};
export default pool;
