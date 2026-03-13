/**
 * Ensures password_resets table exists. Run once if the table was added after server init.
 * Usage: node scripts/ensure-password-resets-table.js
 */
require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at)`).catch(() => {});
    console.log('✅ password_resets table ready');
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
main();
