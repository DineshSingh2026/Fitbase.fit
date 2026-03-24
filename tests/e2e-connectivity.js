/**
 * DB + API + optional Next.js reachability (no signup side effects).
 * Run: node tests/e2e-connectivity.js
 * Env: DATABASE_URL, API_BASE (default http://127.0.0.1:3000), NEXT_BASE (optional, e.g. http://127.0.0.1:3102)
 */
require('dotenv').config();
const http = require('http');
const { Pool } = require('pg');

const API_BASE = (process.env.API_BASE || process.env.E2E_API_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const NEXT_BASE = (process.env.NEXT_BASE || process.env.E2E_NEXT_URL || '').replace(/\/+$/, '');

function get(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: 'GET' },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: buf.slice(0, 500) }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const failures = [];

  console.log('=== Connectivity: PostgreSQL ===');
  if (!process.env.DATABASE_URL) {
    console.log('  SKIP (DATABASE_URL not set)');
  } else {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const r = await pool.query('SELECT 1 AS ok');
      if (r.rows[0]?.ok !== 1) failures.push('DB SELECT 1 unexpected');
      else console.log('  OK');
    } catch (e) {
      failures.push(`DB: ${e.message}`);
      console.log('  FAIL', e.message);
    } finally {
      await pool.end();
    }
  }

  console.log('=== Connectivity: Express API ===');
  try {
    const { status, body } = await get(`${API_BASE}/api/stats`);
    if (status !== 200) failures.push(`GET /api/stats -> ${status}`);
    else {
      try {
        const j = JSON.parse(body);
        if (!('pending_requests' in j)) failures.push('/api/stats missing pending_requests');
      } catch (_) {
        failures.push('/api/stats not JSON');
      }
    }
    console.log(status === 200 ? '  OK' : `  FAIL status ${status}`);
  } catch (e) {
    failures.push(`API: ${e.message}`);
    console.log('  FAIL', e.message);
  }

  console.log('=== Connectivity: Next.js (optional) ===');
  if (!NEXT_BASE) {
    console.log('  SKIP (set NEXT_BASE or E2E_NEXT_URL to test frontend)');
  } else {
    try {
      const { status } = await get(`${NEXT_BASE}/login`);
      if (status !== 200) failures.push(`GET ${NEXT_BASE}/login -> ${status}`);
      console.log(status === 200 ? '  OK /login' : `  FAIL ${status}`);
    } catch (e) {
      failures.push(`Next: ${e.message}`);
      console.log('  FAIL', e.message);
    }
  }

  if (failures.length) {
    console.log('\n--- FAILURES ---');
    failures.forEach((f) => console.log(' ', f));
    process.exit(1);
  }
  console.log('\n--- Connectivity checks passed ---');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
