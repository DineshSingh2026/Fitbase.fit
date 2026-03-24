require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const email = 'admin@fitbase.fit';
  const hash = bcrypt.hashSync('admin123', 10);
  const upsertSql = `
    INSERT INTO users (id, email, password, first_name, last_name, role, approval_status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (email)
    DO UPDATE SET
      password = EXCLUDED.password,
      role = EXCLUDED.role,
      approval_status = EXCLUDED.approval_status,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name
  `;
  const id = crypto.randomUUID();
  await pool.query(upsertSql, [id, email, hash, 'Admin', 'User', 'admin', 'approved']);
  const verify = await pool.query('SELECT id, email, role, approval_status FROM users WHERE email = $1 LIMIT 1', [email]);
  console.log(`admin_ready=${verify.rowCount === 1}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
