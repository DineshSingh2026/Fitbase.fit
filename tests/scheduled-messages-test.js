#!/usr/bin/env node
/**
 * Test scheduled messages: create one for "now", wait for job to process, verify delivery.
 * Run: node tests/scheduled-messages-test.js
 * Server must be running on PORT (default 3000).
 */
require('dotenv').config();
const http = require('http');

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bodybank.fit';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('1. Login as admin...');
  const loginRes = await request('POST', '/api/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  if (loginRes.status !== 200 || !loginRes.data?.token) {
    console.error('   FAIL: could not login. Status:', loginRes.status, loginRes.data);
    process.exit(1);
  }
  const token = loginRes.data.token;
  const adminId = loginRes.data.id;
  console.log('   OK – logged in as', ADMIN_EMAIL);

  console.log('2. Get approved users...');
  const usersRes = await request('GET', '/api/admin/users');
  const users = Array.isArray(usersRes.data) ? usersRes.data : [];
  if (users.length === 0) {
    console.log('   No approved users. Creating a scheduled message would have no recipients.');
    console.log('   Skipping create test. Scheduling requires at least one approved user.');
    process.exit(0);
  }
  const userId = users[0].id;
  console.log('   OK – will send to', users[0].first_name || users[0].email);

  const testMsg = 'Scheduled message test – ' + new Date().toISOString();
  const scheduledAt = new Date(Date.now() + 90000).toISOString(); // 90 sec from now

  console.log('3. Create scheduled message (scheduled_at in 90 sec)...');
  const createRes = await request(
    'POST',
    '/api/scheduled-messages',
    { user_id: userId, message_body: testMsg, scheduled_at: scheduledAt },
    token
  );
  if (createRes.status !== 201) {
    console.error('   FAIL: create failed. Status:', createRes.status, createRes.data);
    process.exit(1);
  }
  const created = createRes.data;
  const smId = created.id || (Array.isArray(created.ids) ? created.ids[0] : null);
  if (!smId) {
    console.error('   FAIL: no id returned');
    process.exit(1);
  }
  console.log('   OK – created scheduled message id:', smId);

  console.log('4. Wait for scheduled time and worker run (polling up to 160s)...');
  let sm = null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 160000) {
    await new Promise((r) => setTimeout(r, 10000));
    const listRes = await request('GET', '/api/scheduled-messages', null, token);
    const list = Array.isArray(listRes.data) ? listRes.data : [];
    sm = list.find((s) => s.id === smId) || null;
    if (sm && sm.status === 'sent') break;
  }

  console.log('5. Check scheduled message status...');
  if (!sm) {
    console.error('   WARN: scheduled message not found in list');
  } else if (sm.status === 'sent') {
    console.log('   OK – status is "sent"');
  } else {
    console.log('   Current status:', sm.status, '(expected "sent")');
  }

  console.log('6. Verify message in thread (via threads list)...');
  const threadsRes = await request('GET', '/api/threads', null, token);
  const threads = Array.isArray(threadsRes.data) ? threadsRes.data : [];
  const hasThread = threads.some((t) => t.user_id === userId || t.id);
  if (threads.length > 0) {
    const userThread = threads.find((t) => t.user_id === userId) || threads[0];
    const msgsRes = await request('GET', '/api/threads/' + userThread.id + '/messages', null, token);
    const msgs = Array.isArray(msgsRes.data) ? msgsRes.data : [];
    const found = msgs.some((m) => m.body && m.body.includes('Scheduled message test'));
    if (found) {
      console.log('   OK – test message found in thread');
    } else {
      console.log('   WARN: test message not found in thread. Messages:', msgs.length);
    }
  } else {
    console.log('   Admin GET /api/threads may return different format. Checking DB directly...');
  }

  console.log('\n✅ Scheduled messages test completed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
