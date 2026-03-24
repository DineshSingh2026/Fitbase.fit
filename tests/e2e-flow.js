/**
 * End-to-end test: Sign up → Admin approve → Login → User actions → Admin dashboard & DB check.
 * Run: node tests/e2e-flow.js (Express API on port 3000, DATABASE_URL set).
 * If public signup is disabled (default in server.js), uses POST /api/admin/create-client instead.
 */
require('dotenv').config();
const http = require('http');
const { Pool } = require('pg');

const BASE = 'http://localhost:3000';
const PORT = 3000;

const testUser = {
  email: `e2e.${Date.now()}@test.fitbase.fit`,
  password: 'TestPass123!',
  first_name: 'E2E',
  last_name: 'Tester',
  phone: '9998887770'
};
const TEST_PROFILE_PICTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sX0Xr0AAAAASUVORK5CYII=';

let createdIds = { userId: null, auditId: null, part2Id: null, meetingId: null, workoutId: null, contactId: null, checkinId: null, dailyCheckinId: null };
let failures = [];
/** When true, user was created approved via admin create-client (no pending signup / approve steps). */
let usedAdminCreateClient = false;

function request(method, path, body = null, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body ? JSON.stringify(body) : null;
    const headers = { ...(opts.headers || {}) };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (opts.auth && opts.auth.token) headers['Authorization'] = 'Bearer ' + opts.auth.token;
    const req = http.request({
      hostname: url.hostname,
      port: url.port || PORT,
      path: url.pathname + (opts.qs ? '?' + new URLSearchParams(opts.qs).toString() : ''),
      method,
      headers
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let json = null;
        try { json = buf ? JSON.parse(buf) : null; } catch (_) {}
        resolve({ status: res.statusCode, body: json, raw: buf });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(ok, msg) {
  if (!ok) failures.push(msg);
  return ok;
}

async function queryDb(sql, params = []) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let i = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++i}`);
    const res = await pool.query(pgSql, params);
    return res.rows;
  } finally {
    await pool.end();
  }
}

async function runTests() {
  const superadminEmail = process.env.SUPERADMIN_EMAIL || 'superadmin@fitbase.fit';
  const superadminPass = process.env.SUPERADMIN_PASS || 'superadmin123';

  console.log('=== E2E: Trainer/Admin login (JWT for protected admin routes) ===');
  const adminLoginFirst = await request('POST', '/api/auth/login', { email: superadminEmail, password: superadminPass });
  assert(adminLoginFirst.status === 200 && adminLoginFirst.body?.token, `Admin login failed: ${adminLoginFirst.status} ${JSON.stringify(adminLoginFirst.body)}`);
  const adminToken = adminLoginFirst.body.token;
  const isSuperadmin = adminLoginFirst.body?.role === 'superadmin';
  console.log(adminLoginFirst.status === 200 ? '  OK' : '  FAIL', adminLoginFirst.body?.email, adminLoginFirst.body?.role);

  console.log('=== E2E: Sign up (or admin create-client if public signup disabled) ===');
  const signup = await request('POST', '/api/auth/signup', {
    email: testUser.email,
    password: testUser.password,
    first_name: testUser.first_name,
    last_name: testUser.last_name,
    phone: testUser.phone
  });
  if (signup.status === 200 && signup.body?.pending_approval === true) {
    createdIds.userId = signup.body?.id || null;
    assert(!!createdIds.userId, 'Signup should return user id');
    console.log('  OK (pending approval)', signup.body?.email);
  } else if (signup.status === 403 && signup.body?.error === 'signup_disabled') {
    const create = await request('POST', '/api/admin/create-client', {
      email: testUser.email,
      password: testUser.password,
      first_name: testUser.first_name,
      last_name: testUser.last_name,
      phone: testUser.phone
    }, { auth: { token: adminToken } });
    assert(create.status === 200 && create.body?.id, `create-client failed ${create.status}: ${JSON.stringify(create.body)}`);
    createdIds.userId = create.body.id;
    usedAdminCreateClient = true;
    console.log('  OK (create-client, pre-approved)', create.body?.email);
  } else {
    assert(false, `Unexpected signup response ${signup.status}: ${JSON.stringify(signup.body)}`);
  }

  if (!usedAdminCreateClient) {
    console.log('=== E2E: Login before approve (should be pending) ===');
    const loginPending = await request('POST', '/api/auth/login', { email: testUser.email, password: testUser.password });
    assert(loginPending.status === 403 && loginPending.body?.error === 'pending_approval', 'Login before approve should be 403 pending_approval');
    console.log(loginPending.status === 403 ? '  OK' : '  FAIL');

    console.log('=== E2E: Admin – pending signups ===');
    const pending = await request('GET', '/api/admin/pending-signups', null, { auth: { token: adminToken } });
    assert(pending.status === 200 && Array.isArray(pending.body), 'Pending signups should be array');
    const found = pending.body?.find(u => u.email === testUser.email);
    assert(!!found, 'New user should appear in pending signups');
    console.log(found ? '  OK' : '  FAIL');

    console.log('=== E2E: Admin – approve user ===');
    const approve = await request('POST', `/api/admin/approve-user/${createdIds.userId}`, {}, { auth: { token: adminToken } });
    assert(approve.status === 200, `Approve status ${approve.status}`);
    console.log(approve.status === 200 ? '  OK' : '  FAIL');
  } else {
    console.log('=== E2E: Login before approve (should be pending) ===');
    console.log('  SKIP (user created approved via admin create-client)');
    console.log('=== E2E: Admin – pending signups ===');
    console.log('  SKIP');
    console.log('=== E2E: Admin – approve user ===');
    console.log('  SKIP');
  }

  console.log('=== E2E: Login after approve ===');
  const login = await request('POST', '/api/auth/login', { email: testUser.email, password: testUser.password });
  assert(login.status === 200 && login.body?.id, 'Login should return user');
  const userId = login.body?.id || createdIds.userId;
  const userToken = login.body?.token;
  console.log(login.status === 200 ? '  OK' : '  FAIL', login.body?.email);

  console.log('=== E2E: Forgot password – admin email (no reset, generic response) ===');
  const saEmail = process.env.SUPERADMIN_EMAIL || 'superadmin@fitbase.fit';
  const forgotAdmin = await request('POST', '/api/auth/forgot-password', { email: saEmail });
  if (forgotAdmin.status === 404) console.log('  (404 – restart server to load forgot-password routes)');
  assert(forgotAdmin.status === 200 && forgotAdmin.body?.ok === true, 'Forgot for admin returns ok');
  assert(!forgotAdmin.body?.resetLink, 'Admin should not get reset link');
  console.log(forgotAdmin.status === 200 && !forgotAdmin.body?.resetLink ? '  OK' : '  FAIL');

  console.log('=== E2E: Forgot password (user only) ===');
  const forgotResp = await request('POST', '/api/auth/forgot-password', { email: testUser.email });
  assert(forgotResp.status === 200 && forgotResp.body?.ok === true, 'Forgot password should return ok (restart server if 404)');
  let resetToken = null;
  if (forgotResp.body?.resetLink) {
    resetToken = new URL(forgotResp.body.resetLink).searchParams.get('token');
  }
  if (!resetToken) {
    const rows = await queryDb('SELECT token FROM password_resets WHERE user_id = ? AND used = 0 ORDER BY created_at DESC LIMIT 1', [userId]);
    assert(rows.length > 0, 'Reset token should exist in DB');
    resetToken = rows[0]?.token || null;
  }
  assert(resetToken, 'Reset token required for reset flow');
  console.log(forgotResp.status === 200 && resetToken ? '  OK' : '  FAIL');

  console.log('=== E2E: Verify reset token ===');
  const verifyResp = await request('GET', `/api/auth/verify-reset-token/${encodeURIComponent(resetToken)}`);
  assert(verifyResp.status === 200 && verifyResp.body?.valid === true, 'Verify reset token should return valid');
  console.log(verifyResp.status === 200 && verifyResp.body?.valid ? '  OK' : '  FAIL');

  console.log('=== E2E: Reset password ===');
  const newPassword = 'NewPassword789!';
  const resetResp = await request('POST', '/api/auth/reset-password', { token: resetToken, new_password: newPassword });
  assert(resetResp.status === 200 && resetResp.body?.ok === true, 'Reset password should succeed');
  console.log(resetResp.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Login with old password (should fail) ===');
  const loginOldPw = await request('POST', '/api/auth/login', { email: testUser.email, password: testUser.password });
  assert(loginOldPw.status === 401, 'Login with old password should fail');
  console.log(loginOldPw.status === 401 ? '  OK' : '  FAIL');

  console.log('=== E2E: Login with new password ===');
  const loginNewPw = await request('POST', '/api/auth/login', { email: testUser.email, password: newPassword });
  assert(loginNewPw.status === 200 && loginNewPw.body?.id, 'Login with new password should succeed');
  const userTokenAfterReset = loginNewPw.body?.token;
  console.log(loginNewPw.status === 200 ? '  OK' : '  FAIL');
  // Use new password for subsequent tests
  testUser.password = newPassword;

  console.log('=== E2E: Profile get & update ===');
  const profileGet = await request('GET', `/api/profile/${userId}`);
  assert(profileGet.status === 200 && profileGet.body?.email === testUser.email, 'Profile GET');
  const profilePut = await request('PUT', `/api/profile/${userId}`, {
    first_name: 'E2EUpdated',
    phone: '1112223334',
    profile_picture: TEST_PROFILE_PICTURE
  });
  assert(profilePut.status === 200, 'Profile PUT');
  const profileAfterPut = await request('GET', `/api/profile/${userId}`);
  assert(profileAfterPut.status === 200 && profileAfterPut.body?.profile_picture === TEST_PROFILE_PICTURE, 'Profile picture saved');
  console.log(profilePut.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Workout log ===');
  const workout = await request('POST', '/api/workouts', {
    user_id: userId,
    workout_name: 'E2E Run',
    duration_seconds: 600,
    feedback: 'Good'
  });
  assert(workout.status === 200 && workout.body?.id, 'Workout POST');
  createdIds.workoutId = workout.body?.id;
  console.log(workout.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Contact message ===');
  const contact = await request('POST', '/api/contact', {
    user_id: userId,
    name: 'E2E User',
    phone: '1112223334',
    email: testUser.email,
    message: 'E2E test message'
  });
  assert(contact.status === 200 && contact.body?.id, 'Contact POST');
  createdIds.contactId = contact.body?.id;
  console.log(contact.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Meeting (schedule call) ===');
  const meeting = await request('POST', '/api/meetings', {
    user_id: userId,
    user_name: 'E2E Tester',
    user_email: testUser.email,
    user_phone: testUser.phone,
    meeting_date: '2026-03-01',
    time_slot: '10:00-11:00',
    notes: 'E2E test'
  });
  assert(meeting.status === 200 && meeting.body?.id, 'Meeting POST');
  createdIds.meetingId = meeting.body?.id;
  console.log(meeting.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Sunday check-in ===');
  const checkin = await request('POST', '/api/sunday-checkin', {
    user_id: userId,
    full_name: 'E2E Tester',
    reply_email: testUser.email,
    plan: 'Phase 1',
    current_weight_waist_week: '70kg',
    achievements: 'E2E test'
  });
  assert(checkin.status === 200 && checkin.body?.id, 'Sunday check-in POST');
  createdIds.checkinId = checkin.body?.id;
  console.log(checkin.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Daily check-in ===');
  try {
    await queryDb('DELETE FROM daily_checkins WHERE user_id = ? AND checkin_date = CURRENT_DATE', [userId]);
  } catch (_) {
    /* allow first run or DB variance */
  }
  const dailyCheckin = await request('POST', '/api/daily-checkin', {
    steps: 10000,
    water_ml: 2500,
    protein_g: 180,
    sleep_hours: 7.5
  }, { auth: { token: userToken } });
  assert(dailyCheckin.status === 200 && dailyCheckin.body?.id, 'Daily check-in POST');
  createdIds.dailyCheckinId = dailyCheckin.body?.id;
  console.log(dailyCheckin.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Public audit form ===');
  const audit = await request('POST', '/api/audit', {
    first_name: 'Public',
    last_name: 'Audit',
    email: 'public.audit@e2e.test',
    city: 'Mumbai',
    goals: 'E2E audit'
  });
  assert(audit.status === 200 && audit.body?.id, 'Audit POST');
  createdIds.auditId = audit.body?.id;
  console.log(audit.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Public part2 form ===');
  const part2 = await request('POST', '/api/part2', {
    name: 'Part2 User',
    email: 'part2@e2e.test',
    mobile: '9990001111',
    activity_level: 'Moderate',
    goals: 'E2E part2'
  });
  assert(part2.status === 200 && part2.body?.id, 'Part2 POST');
  createdIds.part2Id = part2.body?.id;
  console.log(part2.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Admin dashboard – stats ===');
  const stats = await request('GET', '/api/stats');
  assert(stats.status === 200 && stats.body && Number.isFinite(Number(stats.body.pending_requests)), 'Stats');
  console.log(stats.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Admin – notifications ===');
  const notif = await request('GET', '/api/notifications', null, { auth: { token: adminToken } });
  assert(notif.status === 200 && Array.isArray(notif.body), 'Notifications');
  console.log(notif.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Admin – daily check-ins ===');
  const adminDailyList = await request('GET', '/api/admin/daily-checkins', null, { auth: { token: adminToken } });
  assert(adminDailyList.status === 200 && Array.isArray(adminDailyList.body) && adminDailyList.body.some(d => d.id === createdIds.dailyCheckinId), 'Admin daily check-ins list');
  const adminDailyDetail = await request('GET', `/api/admin/daily-checkins/${createdIds.dailyCheckinId}`, null, { auth: { token: adminToken } });
  assert(adminDailyDetail.status === 200 && adminDailyDetail.body?.steps === 10000, 'Admin daily check-in detail');
  console.log(adminDailyDetail.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Admin – db-view ===');
  const dbView = await request('GET', '/api/admin/db-view');
  assert(dbView.status === 200 && dbView.body?.tables, 'DB view');
  const tables = dbView.body?.tables || {};
  assert(Array.isArray(tables.workout_logs) && tables.workout_logs.some(w => w.id === createdIds.workoutId), 'Workout in db-view');
  assert(Array.isArray(tables.contact_messages) && tables.contact_messages.some(c => c.id === createdIds.contactId), 'Contact in db-view');
  assert(Array.isArray(tables.meetings) && tables.meetings.some(m => m.id === createdIds.meetingId), 'Meeting in db-view');
  assert(Array.isArray(tables.sunday_checkins) && tables.sunday_checkins.some(s => s.id === createdIds.checkinId), 'Sunday checkin in db-view');
  assert(Array.isArray(tables.audit_requests) && tables.audit_requests.some(a => a.id === createdIds.auditId), 'Audit in db-view');
  assert(Array.isArray(tables.part2_audit) && tables.part2_audit.some(p => p.id === createdIds.part2Id), 'Part2 in db-view');
  console.log(dbView.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Database direct check ===');
  const userRow = await queryDb('SELECT id, email, first_name, approval_status FROM users WHERE id = ?', [userId]);
  assert(userRow.length === 1 && userRow[0].approval_status === 'approved' && userRow[0].first_name === 'E2EUpdated', 'User in DB');
  const workoutRows = await queryDb('SELECT id FROM workout_logs WHERE id = ?', [createdIds.workoutId]);
  assert(workoutRows.length === 1, 'Workout in DB');
  const contactRows = await queryDb('SELECT id FROM contact_messages WHERE id = ?', [createdIds.contactId]);
  assert(contactRows.length === 1, 'Contact in DB');
  const meetingRows = await queryDb('SELECT id FROM meetings WHERE id = ?', [createdIds.meetingId]);
  assert(meetingRows.length === 1, 'Meeting in DB');
  const checkinRows = await queryDb('SELECT id FROM sunday_checkins WHERE id = ?', [createdIds.checkinId]);
  assert(checkinRows.length === 1, 'Sunday checkin in DB');
  const dailyCheckinRows = await queryDb('SELECT id FROM daily_checkins WHERE id = ?', [createdIds.dailyCheckinId]);
  assert(dailyCheckinRows.length === 1, 'Daily checkin in DB');
  const auditRows = await queryDb('SELECT id FROM audit_requests WHERE id = ?', [createdIds.auditId]);
  assert(auditRows.length === 1, 'Audit in DB');
  const part2Rows = await queryDb('SELECT id FROM part2_audit WHERE id = ?', [createdIds.part2Id]);
  assert(part2Rows.length === 1, 'Part2 in DB');
  console.log('  OK');

  console.log('=== E2E: Admin – list endpoints (data visible) ===');
  const workoutsList = await request('GET', '/api/workouts');
  assert(workoutsList.status === 200 && workoutsList.body?.some(w => w.id === createdIds.workoutId), 'GET /api/workouts');
  const contactList = await request('GET', '/api/contact');
  assert(contactList.status === 200 && contactList.body?.some(c => c.id === createdIds.contactId), 'GET /api/contact');
  const auditList = await request('GET', '/api/audit');
  assert(auditList.status === 200 && auditList.body?.some(a => a.id === createdIds.auditId), 'GET /api/audit');
  const part2List = await request('GET', '/api/part2');
  assert(part2List.status === 200 && part2List.body?.some(p => p.id === createdIds.part2Id), 'GET /api/part2');
  const checkinList = await request('GET', '/api/sunday-checkin');
  assert(checkinList.status === 200 && checkinList.body?.some(s => s.id === createdIds.checkinId), 'GET /api/sunday-checkin');
  const meetingsList = await request('GET', '/api/meetings');
  assert(meetingsList.status === 200 && meetingsList.body?.some(m => m.id === createdIds.meetingId), 'GET /api/meetings');
  const meetingsByUser = await request('GET', `/api/meetings/user/${userId}`);
  assert(meetingsByUser.status === 200 && meetingsByUser.body?.some(m => m.id === createdIds.meetingId), 'GET /api/meetings/user/:id');
  const workoutsByUser = await request('GET', `/api/workouts/${userId}`);
  assert(workoutsByUser.status === 200 && workoutsByUser.body?.some(w => w.id === createdIds.workoutId), 'GET /api/workouts/:userId');
  console.log('  OK');

  console.log('=== E2E: User dashboard APIs (member JWT) ===');
  const todayApi = await request('GET', '/api/today', null, { auth: { token: userTokenAfterReset } });
  assert(todayApi.status === 200 && todayApi.body && typeof todayApi.body === 'object', 'GET /api/today');
  const streakApi = await request('GET', '/api/daily-checkin/streak', null, { auth: { token: userTokenAfterReset } });
  assert(streakApi.status === 200 && streakApi.body && Number.isFinite(Number(streakApi.body.streak)), 'GET /api/daily-checkin/streak');
  const meProgramsApi = await request('GET', '/api/me/programs', null, { auth: { token: userTokenAfterReset } });
  assert(meProgramsApi.status === 200 && Array.isArray(meProgramsApi.body), 'GET /api/me/programs');
  const threadsMember = await request('GET', '/api/threads', null, { auth: { token: userTokenAfterReset } });
  assert(threadsMember.status === 200 && Array.isArray(threadsMember.body), 'User GET /api/threads');
  const meetingsUser = await request('GET', `/api/meetings/user/${encodeURIComponent(userId)}`, null, { auth: { token: userTokenAfterReset } });
  assert(meetingsUser.status === 200 && Array.isArray(meetingsUser.body), 'GET /api/meetings/user/:id (auth)');
  console.log('  OK');

  console.log('=== E2E: Trainer dashboard APIs (admin JWT) ===');
  const adminUsersList = await request('GET', '/api/admin/users', null, { auth: { token: adminToken } });
  assert(adminUsersList.status === 200 && Array.isArray(adminUsersList.body), 'GET /api/admin/users');
  const recentActivity = await request('GET', '/api/admin/recent-activity', null, { auth: { token: adminToken } });
  assert(recentActivity.status === 200 && Array.isArray(recentActivity.body), 'GET /api/admin/recent-activity');
  const adminThreads = await request('GET', '/api/threads', null, { auth: { token: adminToken } });
  assert(adminThreads.status === 200 && Array.isArray(adminThreads.body), 'Trainer GET /api/threads');
  console.log('  OK');

  console.log('=== E2E: Admin – performance insights ===');
  const perf = await request('GET', '/api/admin/performance-insights', null, { auth: { token: adminToken } });
  assert(perf.status === 200 && perf.body?.summary != null && Array.isArray(perf.body?.data), 'Performance insights');
  console.log(perf.status === 200 ? '  OK' : '  FAIL');

  console.log('=== E2E: Admin – audit update status ===');
  const auditUpdate = await request('PUT', `/api/audit/${createdIds.auditId}`, { status: 'approved' });
  assert(auditUpdate.status === 200, 'Audit PUT status');
  const auditGet = await request('GET', `/api/audit/${createdIds.auditId}`);
  assert(auditGet.status === 200 && auditGet.body?.status === 'approved', 'Audit status updated in DB');
  console.log('  OK');

  console.log('=== E2E: Admin – tribe add ===');
  const tribePost = await request('POST', '/api/tribe', {
    first_name: 'E2ETribe',
    last_name: 'Member',
    email: 'tribe@e2e.test',
    city: 'Delhi',
    phase: 1
  });
  assert(tribePost.status === 200 && tribePost.body?.id, 'Tribe POST');
  const tribeId = tribePost.body?.id;
  const tribeGet = await request('GET', `/api/tribe/${tribeId}`);
  assert(tribeGet.status === 200 && tribeGet.body?.first_name === 'E2ETribe', 'Tribe GET');
  console.log('  OK');

  console.log('=== E2E: Admin – tribe update ===');
  const tribePut = await request('PUT', `/api/tribe/${tribeId}`, { notes: 'E2E note', status: 'active' });
  assert(tribePut.status === 200, 'Tribe PUT');
  console.log('  OK');

  console.log('=== E2E: Superadmin-only routes (dashboard / share-link) ===');
  if (!isSuperadmin) {
    console.log('  SKIP – SUPERADMIN_EMAIL is not role=superadmin. Trainer admin flows above still validated.');
  } else {
    const saToken = adminToken;
    console.log('  OK', superadminEmail);

    console.log('=== E2E: Superadmin – dashboard ===');
    const saDashboard = await request('GET', '/api/superadmin/dashboard', null, { auth: { token: saToken } });
    assert(saDashboard.status === 200 && saDashboard.body?.stats != null && Array.isArray(saDashboard.body?.audit), 'Superadmin dashboard');
    console.log(saDashboard.status === 200 ? '  OK' : '  FAIL');

    console.log('=== E2E: Superadmin – dashboard with filters ===');
    const saFiltered = await request('GET', '/api/superadmin/dashboard', null, { auth: { token: saToken }, qs: { from: '2025-01-01', to: '2026-12-31' } });
    assert(saFiltered.status === 200 && saFiltered.body?.stats != null, 'Superadmin dashboard filtered');
    console.log(saFiltered.status === 200 ? '  OK' : '  FAIL');

    console.log('=== E2E: Superadmin – share link ===');
    const saShare = await request('POST', '/api/superadmin/share-link', { from: '2025-01-01', to: '2026-12-31' }, { auth: { token: saToken } });
    assert(saShare.status === 200 && saShare.body?.url && saShare.body?.token, 'Superadmin share link');
    const shareToken = saShare.body?.token;
    console.log(saShare.status === 200 ? '  OK' : '  FAIL');

    console.log('=== E2E: Superadmin – shared view (no auth) ===');
    const saShared = await request('GET', '/api/superadmin/shared', null, { qs: { t: shareToken } });
    assert(saShared.status === 200 && saShared.body?.stats != null && Array.isArray(saShared.body?.part2), 'Superadmin shared view');
    console.log(saShared.status === 200 ? '  OK' : '  FAIL');

    console.log('=== E2E: Superadmin – shared invalid token ===');
    const saSharedBad = await request('GET', '/api/superadmin/shared', null, { qs: { t: 'invalid-token' } });
    assert(saSharedBad.status === 401 && saSharedBad.body?.error, 'Shared view rejects invalid token');
    console.log(saSharedBad.status === 401 ? '  OK' : '  FAIL');
  }

  console.log('=== E2E: Rejected user can re-signup ===');
  if (usedAdminCreateClient) {
    console.log('  SKIP (public signup disabled; reject/re-signup flow requires POST /api/auth/signup)');
  } else {
    const reject = await request('POST', `/api/admin/reject-user/${userId}`, {}, { auth: { token: adminToken } });
    assert(reject.status === 200, 'Admin reject user');
    const signupAgain = await request('POST', '/api/auth/signup', {
      email: testUser.email,
      password: 'NewPass456!',
      first_name: 'E2E',
      last_name: 'ReSignup',
      phone: testUser.phone
    });
    assert(signupAgain.status === 200 && signupAgain.body?.pending_approval === true, 'Re-signup after reject');
    const reApprove = await request('POST', `/api/admin/approve-user/${userId}`, {}, { auth: { token: adminToken } });
    assert(reApprove.status === 200, 'Re-approve');
    const loginAgain = await request('POST', '/api/auth/login', { email: testUser.email, password: 'NewPass456!' });
    assert(loginAgain.status === 200, 'Login after re-signup');
    console.log('  OK');
  }

  if (failures.length > 0) {
    console.log('\n--- FAILURES ---');
    failures.forEach(f => console.log(' ', f));
    process.exit(1);
  }
  console.log('\n--- All E2E checks passed ---');
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
