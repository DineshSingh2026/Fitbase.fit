/**
 * Connects to the postgres maintenance DB and creates the database named in DATABASE_URL if missing.
 * Usage: node scripts/ensure-postgres-db.js
 */
require('dotenv').config();
const { Client } = require('pg');

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('No DATABASE_URL');
  process.exit(1);
}

const u = new URL(raw.replace(/^postgresql:/i, 'http:'));
const dbName = decodeURIComponent(u.pathname.slice(1).split('/')[0] || '');
if (!dbName) {
  console.error('No database name in DATABASE_URL pathname');
  process.exit(1);
}

u.pathname = '/postgres';
const adminUrl = u.toString().replace(/^http:/, 'postgresql:');

(async () => {
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    const ident = '"' + dbName.replace(/"/g, '""') + '"';
    await c.query('CREATE DATABASE ' + ident);
    console.log('Created database:', dbName);
  } catch (e) {
    if (e.code === '42P04') {
      console.log('Database already exists:', dbName);
    } else {
      throw e;
    }
  }
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
