require('dotenv').config();
const express = require('express');
const compression = require('compression');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const webPush = require('web-push');
const { signToken, verifyToken, requireAdmin, requireSuperadmin, requireAdminOrSuperadmin, signProgressReportToken, verifyProgressReportToken, signShareToken, verifyShareToken } = require('./middleware/auth');
const progressRoutes = require('./routes/progress');
const { getUserProgress: getAdminUserProgress } = require('./controllers/adminProgressController');
const progressService = require('./services/progressService');
const { inferTimezoneFromCountry, getUserTimezone, extractLocalDateTimeParts, localDateTimeToUtcIso } = require('./utils/timezone');

// ============ CONFIG ============
const PORT = process.argv[2] || process.env.PORT || 3000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bodybank.fit';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@bodybank.fit';
const SUPERADMIN_PASS = process.env.SUPERADMIN_PASS || 'superadmin123';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/bodybank';
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ''; // e.g. https://yoursite.com (production)
const VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim();
const CRON_SECRET = (process.env.CRON_SECRET || '').trim();

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webPush.setVapidDetails('mailto:support@bodybank.fit', VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) {
    console.warn('VAPID keys invalid or malformed - push notifications disabled. Error:', e.message);
  }
}

async function sendPushToUser(userId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    const rows = await queryAll('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]);
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const sent = new Set();
    for (const sub of rows) {
      if (!sub.endpoint || sent.has(sub.endpoint)) continue;
      sent.add(sub.endpoint);
      try {
        await webPush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, body, { TTL: 86400 });
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await run('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]);
        }
      }
    }
  } catch (e) { /* ignore */ }
}

async function sendPushToAdmins(payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    const admins = await queryAll("SELECT id FROM users WHERE role IN ('admin', 'superadmin')");
    for (const a of admins) {
      await sendPushToUser(a.id, payload);
    }
  } catch (e) { /* ignore */ }
}

const app = express();

// Trust proxy (Render, Nginx, etc.) so req.protocol and req.get('host') are correct for share links
app.set('trust proxy', 1);

// ============ MIDDLEWARE ============
app.use(compression());
app.use(cors({
  origin: NODE_ENV === 'production' && ALLOWED_ORIGIN ? ALLOWED_ORIGIN.split(',').map(s => s.trim()) : true,
  credentials: true
}));
app.use(express.json({ limit: '8mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Simple rate limiter (in-memory)
const rateLimit = {};
function rateLimiter(limit, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    if (!rateLimit[key]) rateLimit[key] = [];
    rateLimit[key] = rateLimit[key].filter(t => now - t < windowMs);
    if (rateLimit[key].length >= limit) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    rateLimit[key].push(now);
    next();
  };
}

// Request logging (dev only)
if (NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });
}

let pool;

/** Convert SQL with ? placeholders to PostgreSQL $1, $2, ... */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function run(sql, params = []) {
  const res = await pool.query(toPg(sql), params);
  return res;
}

async function queryAll(sql, params = []) {
  const res = await pool.query(toPg(sql), params);
  return res.rows || [];
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function normalizeGeoFields(country, timezone) {
  const cleanCountry = String(country || '').trim();
  const cleanTimezone = String(timezone || '').trim() || inferTimezoneFromCountry(cleanCountry);
  return { country: cleanCountry, timezone: cleanTimezone };
}

function getDataUrlBytes(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) return null;
  const base64 = match[2];
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function validateProfilePicture(profilePicture) {
  if (profilePicture === undefined) return null;
  const value = String(profilePicture || '').trim();
  if (!value) return null;
  if (!/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(value)) {
    return 'Please upload a valid image file.';
  }
  const bytes = getDataUrlBytes(value);
  if (!bytes) return 'Could not process this image.';
  if (bytes > 5 * 1024 * 1024) return 'Profile photo must be 5 MB or smaller.';
  return null;
}

async function syncUserCountryAndTimezone(userId, email) {
  if (!userId || !email) return;
  try {
    const audit = await queryOne(
      "SELECT country FROM audit_requests WHERE LOWER(email) = ? AND COALESCE(TRIM(country), '') <> '' ORDER BY created_at DESC LIMIT 1",
      [String(email).trim().toLowerCase()]
    );
    if (!audit || !audit.country) return;
    const inferredTimezone = inferTimezoneFromCountry(audit.country);
    await run(
      "UPDATE users SET country = COALESCE(NULLIF(country, ''), ?), timezone = COALESCE(NULLIF(timezone, ''), ?) WHERE id = ?",
      [audit.country, inferredTimezone || '', userId]
    );
  } catch (e) {
    console.warn('Failed to sync user country/timezone:', e.message);
  }
}

// ============ DATABASE ============
async function initDB() {
  pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
  } catch (e) {
    console.error('❌ PostgreSQL connection failed:', e.message);
    throw e;
  }

  // Create tables (PostgreSQL types: TEXT, INTEGER, REAL, TIMESTAMP)
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    country TEXT DEFAULT '',
    timezone TEXT DEFAULT '',
    profile_picture TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    approval_status TEXT DEFAULT 'approved',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  try { await pool.query(`ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'approved'`); } catch (e) { /* column may exist */ }
  try { await pool.query(`ALTER TABLE users ADD COLUMN country TEXT DEFAULT ''`); } catch (e) { /* column may exist */ }
  try { await pool.query(`ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT ''`); } catch (e) { /* column may exist */ }
  await pool.query("UPDATE users SET approval_status = 'approved' WHERE approval_status IS NULL").catch(() => {});

  await pool.query(`CREATE TABLE IF NOT EXISTS audit_requests (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT DEFAULT '',
    age INTEGER,
    sex TEXT DEFAULT '',
    email TEXT NOT NULL,
    phone TEXT DEFAULT '',
    country TEXT DEFAULT '',
    city TEXT DEFAULT '',
    occupation TEXT DEFAULT '',
    work_intensity TEXT DEFAULT '',
    fitness_experience TEXT DEFAULT '',
    goals TEXT DEFAULT '',
    motivation TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`
    UPDATE users u
    SET country = src.country
    FROM (
      SELECT DISTINCT ON (LOWER(email)) LOWER(email) AS email_norm, country
      FROM audit_requests
      WHERE COALESCE(TRIM(country), '') <> ''
      ORDER BY LOWER(email), created_at DESC
    ) src
    WHERE LOWER(u.email) = src.email_norm AND COALESCE(TRIM(u.country), '') = ''
  `).catch(() => {});
  try {
    const geoUsers = await queryAll("SELECT id, country, timezone FROM users WHERE COALESCE(TRIM(timezone), '') = ''");
    for (const user of geoUsers) {
      const inferredTimezone = inferTimezoneFromCountry(user.country);
      if (inferredTimezone) {
        await run("UPDATE users SET timezone = ? WHERE id = ?", [inferredTimezone, user.id]);
      }
    }
  } catch (e) {
    console.warn('User timezone backfill skipped:', e.message);
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS tribe_members (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    city TEXT DEFAULT '',
    phase INTEGER DEFAULT 1,
    start_date TEXT,
    activity_per_week INTEGER DEFAULT 0,
    starting_weight REAL,
    current_weight REAL,
    target_weight REAL,
    next_checkin TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS workout_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workout_name TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    feedback TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS contact_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    message TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS message_threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS thread_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id ON thread_messages(thread_id)`); } catch (e) { /* ignore */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_threads_user_id ON message_threads(user_id)`); } catch (e) { /* ignore */ }

  await pool.query(`CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT DEFAULT '',
    user_email TEXT DEFAULT '',
    user_phone TEXT DEFAULT '',
    meeting_date TEXT NOT NULL,
    time_slot TEXT NOT NULL,
    status TEXT DEFAULT 'scheduled',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS part2_audit (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    mobile TEXT DEFAULT '',
    sports_history TEXT DEFAULT '',
    injuries TEXT DEFAULT '',
    mental_health TEXT DEFAULT '',
    gym_experience TEXT DEFAULT '',
    food_choices TEXT DEFAULT '',
    vices_addictions TEXT DEFAULT '',
    goals TEXT DEFAULT '',
    what_compelled TEXT DEFAULT '',
    activity_level TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS hydration_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount_ml INTEGER DEFAULT 0,
    glasses INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS weight_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS sunday_checkins (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    full_name TEXT NOT NULL,
    reply_email TEXT NOT NULL,
    plan TEXT DEFAULT '',
    current_weight_waist_week TEXT DEFAULT '',
    last_week_weight_waist TEXT DEFAULT '',
    total_weight_loss TEXT DEFAULT '',
    training_go TEXT DEFAULT '',
    nutrition_go TEXT DEFAULT '',
    sleep TEXT DEFAULT '',
    occupation_stress TEXT DEFAULT '',
    other_stress TEXT DEFAULT '',
    differences_felt TEXT DEFAULT '',
    achievements TEXT DEFAULT '',
    improve_next_week TEXT DEFAULT '',
    questions TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Client Progress Analytics: user_goals, progress_logs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_goals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_weight NUMERIC,
      target_body_fat NUMERIC,
      weekly_workout_target INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS progress_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weight NUMERIC(5,2),
      body_fat NUMERIC(5,2),
      calories_intake INTEGER,
      protein_intake INTEGER,
      workout_completed BOOLEAN DEFAULT false,
      workout_type VARCHAR(100),
      strength_bench NUMERIC(6,2),
      strength_squat NUMERIC(6,2),
      strength_deadlift NUMERIC(6,2),
      sleep_hours NUMERIC(3,1),
      water_intake NUMERIC(4,1),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_progress_logs_user_id ON progress_logs(user_id)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_progress_logs_created_at ON progress_logs(created_at)`).catch(() => {});

  // Daily check-ins (micro-goals: steps, water, protein, sleep)
  await pool.query(`CREATE TABLE IF NOT EXISTS daily_checkins (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    checkin_date DATE NOT NULL,
    steps INTEGER,
    water_ml INTEGER,
    protein_g INTEGER,
    sleep_hours REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  try { await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins(user_id, checkin_date)`); } catch (e) { /* ignore */ }

  // Push notification subscriptions
  await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT,
    auth TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)`); } catch (e) { /* ignore */ }

  // Scheduled messages (admin can schedule messages to send at specific times)
  await pool.query(`CREATE TABLE IF NOT EXISTS scheduled_messages (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    user_id TEXT,
    message_body TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending',
    thread_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  try {
    await pool.query(`ALTER TABLE scheduled_messages ALTER COLUMN scheduled_at TYPE TIMESTAMPTZ USING scheduled_at AT TIME ZONE 'UTC'`);
  } catch (e) { /* column may already be correct */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status_at ON scheduled_messages(status, scheduled_at)`); } catch (e) { /* ignore */ }

  // Create admin (in production, require ADMIN_PASS to be set and not default)
  if (NODE_ENV === 'production' && (!process.env.ADMIN_PASS || ADMIN_PASS === 'admin123')) {
    console.warn('⚠️ Production: set ADMIN_PASS in .env to a strong password. Default admin password is not allowed.');
  }
  const adminRow = await queryOne("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (!adminRow) {
    if (NODE_ENV === 'production' && ADMIN_PASS === 'admin123') {
      console.error('❌ Refusing to create admin with default password in production. Set ADMIN_PASS in .env and restart.');
    } else {
      const hash = bcrypt.hashSync(ADMIN_PASS, 10);
      const adminEmailNorm = String(ADMIN_EMAIL).trim().toLowerCase();
      await run("INSERT INTO users (id, email, password, first_name, last_name, role, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [uuidv4(), adminEmailNorm, hash, 'Body', 'Bank', 'admin', 'approved']);
      console.log(`✅ Admin created: ${ADMIN_EMAIL}`);
    }
  }

  if (NODE_ENV === 'production' && (!process.env.SUPERADMIN_PASS || SUPERADMIN_PASS === 'superadmin123')) {
    console.warn('⚠️ Production: set SUPERADMIN_PASS in .env to a strong password. Default superadmin password is not allowed.');
  }
  const superadminEmailNorm = String(SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const superadminPassTrimmed = String(SUPERADMIN_PASS || '').trim();
  const canSyncSuperadmin = superadminEmailNorm && superadminPassTrimmed && (NODE_ENV !== 'production' || superadminPassTrimmed !== 'superadmin123');
  // Sync uses trimmed password so Render env vars with accidental newlines/spaces still work
  if (canSyncSuperadmin) {
    const hash = bcrypt.hashSync(superadminPassTrimmed, 10);
    const byEmail = await queryOne("SELECT id, role FROM users WHERE LOWER(email) = ?", [superadminEmailNorm]);
    if (byEmail) {
      await run("UPDATE users SET role = 'superadmin', password = ?, first_name = 'Super', last_name = 'Admin', approval_status = 'approved' WHERE id = ?", [hash, byEmail.id]);
      await run("UPDATE users SET role = 'user' WHERE role = 'superadmin' AND id != ?", [byEmail.id]);
      console.log(`✅ Superadmin synced (existing email): ${SUPERADMIN_EMAIL}`);
    } else {
      const superadminRow = await queryOne("SELECT id FROM users WHERE role='superadmin' LIMIT 1");
      if (superadminRow) {
        await run("UPDATE users SET email = ?, password = ?, first_name = 'Super', last_name = 'Admin', approval_status = 'approved' WHERE role = 'superadmin'", [superadminEmailNorm, hash]);
        console.log(`✅ Superadmin synced (updated): ${SUPERADMIN_EMAIL}`);
      } else {
        await run("INSERT INTO users (id, email, password, first_name, last_name, role, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [uuidv4(), superadminEmailNorm, hash, 'Super', 'Admin', 'superadmin', 'approved']);
        console.log(`✅ Superadmin created: ${SUPERADMIN_EMAIL}`);
      }
    }
  } else {
    const existingSa = await queryOne("SELECT id FROM users WHERE role='superadmin' LIMIT 1");
    if (!existingSa && NODE_ENV === 'production' && (!process.env.SUPERADMIN_PASS || SUPERADMIN_PASS === 'superadmin123')) {
      console.error('❌ Refusing to create superadmin with default password in production. Set SUPERADMIN_EMAIL and SUPERADMIN_PASS in Render and redeploy.');
    } else if (!existingSa && (!process.env.SUPERADMIN_EMAIL || !superadminEmailNorm)) {
      console.warn('⚠️ Superadmin not created: set SUPERADMIN_EMAIL and SUPERADMIN_PASS in env.');
    }
  }

  // Seed sample data if empty
  try {
    const tribeRow = await queryOne("SELECT COUNT(*) as c FROM tribe_members");
    const tribeCount = parseInt(tribeRow?.c ?? 0, 10);
    if (tribeCount === 0) {
      await seedData();
      console.log('✅ Sample data seeded');
    }
  } catch (e) {
    console.error('Seed check error:', e.message);
  }
}

function shutdown() {
  console.log('\nShutting down...');
  if (pool) pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function seedData() {
  const members = [
    ['Arjun', 'Sharma', 'arjun.s@gmail.com', '9876543210', 'Mumbai', 2, '2024-12-20', 5, 78, 72, 68, '2026-02-16', 'Strong progress'],
    ['Neha', 'Kapoor', 'neha.k@gmail.com', '9876543211', 'Delhi', 1, '2026-01-30', 4, 65, 64, 58, '2026-02-18', 'Just started'],
    ['Vikram', 'Rao', 'vikram.r@gmail.com', '9876543212', 'Hyderabad', 3, '2024-11-08', 6, 90, 76, 74, '2026-02-15', 'Almost done'],
    ['Sneha', 'Pillai', 'sneha.p@gmail.com', '9876543213', 'Bangalore', 2, '2025-01-03', 4, 58, 54, 52, '2026-02-17', 'Great commitment'],
    ['Rohan', 'Joshi', 'rohan.j@gmail.com', '9876543214', 'Pune', 1, '2026-02-06', 3, 85, 85, 75, '2026-02-20', 'Week 1'],
  ];
  for (const m of members) {
    await run(`INSERT INTO tribe_members (id, first_name, last_name, email, phone, city, phase, start_date, activity_per_week, starting_weight, current_weight, target_weight, next_checkin, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), ...m]);
  }
  const requests = [
    ['Priya', 'Sharma', 28, 'Female', 'priya.s@gmail.com', '9876543220', 'India', 'Mumbai', 'Marketing Manager', 'Sedentary', 'Some experience', 'Fat loss & toning', 'Want to feel confident'],
    ['Rahul', 'Mehra', 32, 'Male', 'rahul.m@outlook.com', '9876543221', 'India', 'Delhi', 'Software Engineer', 'Sedentary', 'Regular gym-goer', 'Muscle gain', 'Health scare from doctor'],
    ['Ananya', 'Reddy', 25, 'Female', 'ananya.r@yahoo.com', '9876543222', 'India', 'Hyderabad', 'Student', 'Light', 'Complete beginner', 'Overall wellness', 'Tired of feeling tired'],
    ['Karan', 'Singh', 29, 'Male', 'karan.s@gmail.com', '9876543223', 'India', 'Bangalore', 'Consultant', 'Moderate', 'Some experience', 'Body recomposition', 'Getting married soon'],
    ['Meera', 'Patel', 34, 'Female', 'meera.p@gmail.com', '9876543224', 'India', 'Pune', 'Business Owner', 'Heavy', 'Complete beginner', 'Lifestyle change', 'Burnout from work'],
  ];
  for (const r of requests) {
    await run(`INSERT INTO audit_requests (id, first_name, last_name, age, sex, email, phone, country, city, occupation, work_intensity, fitness_experience, goals, motivation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), ...r]);
  }
}

// ============ CONFIG ============
app.get('/api/config', (req, res) => {
  res.json({
    google_client_id: process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
  });
});

// Health check: API + DB connection test
app.get('/api/health', async (req, res) => {
  try {
    const adminCheck = await queryOne("SELECT email FROM users WHERE role='admin' LIMIT 1");
    const superadminCheck = await queryOne("SELECT email FROM users WHERE role='superadmin' LIMIT 1");
    res.json({
      ok: true,
      db: 'connected',
      admin_email: ADMIN_EMAIL,
      admin_exists: !!adminCheck,
      superadmin_email: SUPERADMIN_EMAIL,
      superadmin_exists: !!superadminCheck
    });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'error', error: e.message });
  }
});

// Shared: sync superadmin user from env (create or update). Used by startup, bootstrap, and login self-heal.
async function runSuperadminSync() {
  const superadminEmailNorm = String(SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const superadminPassTrimmed = String(SUPERADMIN_PASS || '').trim();
  if (!superadminEmailNorm || !superadminPassTrimmed) return;
  const hash = bcrypt.hashSync(superadminPassTrimmed, 10);
  const byEmail = await queryOne("SELECT id, role FROM users WHERE LOWER(email) = ?", [superadminEmailNorm]);
  if (byEmail) {
    await run("UPDATE users SET role = 'superadmin', password = ?, first_name = 'Super', last_name = 'Admin', approval_status = 'approved' WHERE id = ?", [hash, byEmail.id]);
    await run("UPDATE users SET role = 'user' WHERE role = 'superadmin' AND id != ?", [byEmail.id]);
  } else {
    const existingSa = await queryOne("SELECT id FROM users WHERE role='superadmin' LIMIT 1");
    if (existingSa) {
      await run("UPDATE users SET email = ?, password = ?, first_name = 'Super', last_name = 'Admin', approval_status = 'approved' WHERE role = 'superadmin'", [superadminEmailNorm, hash]);
    } else {
      await run("INSERT INTO users (id, email, password, first_name, last_name, role, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [uuidv4(), superadminEmailNorm, hash, 'Super', 'Admin', 'superadmin', 'approved']);
    }
  }
}

// ============ AUTH ROUTES ============
app.post('/api/auth/login', rateLimiter(20, 60000), async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const emailNorm = String(email).trim().toLowerCase();
    const pwTrimmed = String(password).trim();

    // Fallback: if login is with Superadmin@gmail.com / Bodybank@2026, ensure superadmin exists and log in (works even if env vars are wrong or missing on Render)
    const FALLBACK_SA_EMAIL = 'superadmin@gmail.com';
    const FALLBACK_SA_PASS = 'Bodybank@2026';
    const isFallbackCreds = emailNorm === FALLBACK_SA_EMAIL && pwTrimmed === FALLBACK_SA_PASS;

    let user = await queryOne("SELECT * FROM users WHERE LOWER(email) = ?", [emailNorm]);
    if (!user) {
      if (isFallbackCreds) {
        const hash = bcrypt.hashSync(FALLBACK_SA_PASS, 10);
        const existingSa = await queryOne("SELECT id FROM users WHERE role='superadmin' LIMIT 1");
        if (existingSa) {
          await run("UPDATE users SET email = ?, password = ?, first_name = 'Super', last_name = 'Admin', approval_status = 'approved' WHERE role = 'superadmin'", [FALLBACK_SA_EMAIL, hash]);
        } else {
          await run("INSERT INTO users (id, email, password, first_name, last_name, role, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [uuidv4(), FALLBACK_SA_EMAIL, hash, 'Super', 'Admin', 'superadmin', 'approved']);
        }
        user = await queryOne("SELECT * FROM users WHERE LOWER(email) = ?", [emailNorm]);
      } else {
        const superadminEmailNorm = String(SUPERADMIN_EMAIL || '').trim().toLowerCase();
        const superadminPassTrimmed = String(SUPERADMIN_PASS || '').trim();
        if (superadminEmailNorm && superadminPassTrimmed && emailNorm === superadminEmailNorm && pwTrimmed === superadminPassTrimmed) {
          await runSuperadminSync();
          user = await queryOne("SELECT * FROM users WHERE LOWER(email) = ?", [emailNorm]);
        }
      }
      if (!user) {
        if (NODE_ENV !== 'production') console.log('[Login] User not found:', emailNorm);
        return res.status(401).json({ error: 'Invalid email or password' });
      }
    }
    const status = user.approval_status || 'approved';
    if (status === 'rejected') {
      return res.status(403).json({ error: 'rejected', message: 'Your request was rejected. Please sign up again to submit a new request.' });
    }
    if (status !== 'approved') {
      return res.status(403).json({ error: 'pending_approval', message: 'Your account is pending admin approval. You will be able to log in once approved.' });
    }
    if (!user.password || !bcrypt.compareSync(pwTrimmed, user.password)) {
      if (isFallbackCreds) {
        const hash = bcrypt.hashSync(FALLBACK_SA_PASS, 10);
        await run("UPDATE users SET role = 'superadmin', password = ?, first_name = 'Super', last_name = 'Admin', approval_status = 'approved' WHERE LOWER(email) = ?", [hash, emailNorm]);
        await run("UPDATE users SET role = 'user' WHERE role = 'superadmin' AND LOWER(email) != ?", [emailNorm]);
        user = await queryOne("SELECT * FROM users WHERE LOWER(email) = ?", [emailNorm]);
      } else {
        const superadminEmailNorm = String(SUPERADMIN_EMAIL || '').trim().toLowerCase();
        const superadminPassTrimmed = String(SUPERADMIN_PASS || '').trim();
        if (superadminEmailNorm && superadminPassTrimmed && emailNorm === superadminEmailNorm && pwTrimmed === superadminPassTrimmed) {
          await runSuperadminSync();
          user = await queryOne("SELECT * FROM users WHERE LOWER(email) = ?", [emailNorm]);
        }
      }
      if (!user || !bcrypt.compareSync(pwTrimmed, user.password)) {
        if (NODE_ENV !== 'production') console.log('[Login] Password mismatch for:', emailNorm);
        return res.status(401).json({ error: 'Invalid email or password' });
      }
    }

    await syncUserCountryAndTimezone(user.id, user.email);
    user = await queryOne("SELECT * FROM users WHERE id = ?", [user.id]);
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.json({ id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, profile_picture: user.profile_picture || '', role: user.role, country: user.country || '', timezone: user.timezone || '', token });
  } catch (e) {
    console.error('[Login] Error:', e.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// Google Auth (auto sign-up/login)
app.post('/api/auth/google', async (req, res) => {
  try {
    const { id_token } = req.body || {};
    if (!id_token) return res.status(400).json({ error: 'ID token required' });

    // Decode JWT (in production, verify signature with Google's public keys)
    const parts = id_token.split('.');
    if (parts.length !== 3) return res.status(400).json({ error: 'Invalid token' });
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const { email, given_name, family_name, sub: google_id, picture } = payload;
    
    if (!email) return res.status(400).json({ error: 'Email required' });

    const emailNorm = String(email).trim().toLowerCase();
    let user = await queryOne("SELECT * FROM users WHERE LOWER(email) = ?", [emailNorm]);
    if (!user) {
      // Auto-create account (pending approval)
      const id = uuidv4();
      const hash = bcrypt.hashSync('google_' + google_id, 10);
      await run("INSERT INTO users (id, email, password, first_name, last_name, profile_picture, country, timezone, role, approval_status) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [id, emailNorm, hash, given_name || '', family_name || '', picture || '', '', '', 'user', 'pending']);
      return res.status(403).json({ error: 'pending_approval', message: 'Your account is pending admin approval. You will be able to log in once approved.' });
    }
    const status = user.approval_status || 'approved';
    if (status === 'rejected') {
      return res.status(403).json({ error: 'rejected', message: 'Your request was rejected. Please sign up again to submit a new request.' });
    }
    if (status !== 'approved') {
      return res.status(403).json({ error: 'pending_approval', message: 'Your account is pending admin approval. You will be able to log in once approved.' });
    }
    if (picture && !user.profile_picture) {
      await run("UPDATE users SET profile_picture = ? WHERE id = ?", [picture, user.id]);
      user.profile_picture = picture;
    }
    await syncUserCountryAndTimezone(user.id, user.email);
    user = await queryOne("SELECT * FROM users WHERE id = ?", [user.id]);
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.json({ id: user.id, email: user.email, first_name: user.first_name || '', last_name: user.last_name || '', profile_picture: user.profile_picture || '', role: user.role, country: user.country || '', timezone: user.timezone || '', token });
  } catch (e) {
    console.error('Google auth error:', e);
    res.status(500).json({ error: 'Google auth failed' });
  }
});

app.post('/api/auth/signup', rateLimiter(5, 60000), async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, country, timezone } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const geo = normalizeGeoFields(country, timezone);

    const emailNorm = String(email).trim().toLowerCase();
    const existing = await queryOne("SELECT id, approval_status FROM users WHERE LOWER(email) = ?", [emailNorm]);
    if (existing && existing.approval_status === 'rejected') {
      const hash = bcrypt.hashSync(password, 10);
      await run("UPDATE users SET password = ?, first_name = ?, last_name = ?, phone = ?, country = ?, timezone = ?, approval_status = 'pending' WHERE id = ?",
        [hash, first_name || '', last_name || '', phone || '', geo.country, geo.timezone, existing.id]);
      return res.json({ id: existing.id, email: emailNorm, first_name: first_name || '', last_name: last_name || '', role: 'user', country: geo.country, timezone: geo.timezone, pending_approval: true });
    }
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    await run("INSERT INTO users (id, email, password, first_name, last_name, phone, country, timezone, approval_status) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, emailNorm, hash, first_name || '', last_name || '', phone || '', geo.country, geo.timezone, 'pending']);
    sendPushToAdmins(JSON.stringify({ title: 'New sign-up', body: `${first_name || ''} ${last_name || ''} (${emailNorm}) requested access` })).catch(() => {});
    res.json({ id, email: emailNorm, first_name: first_name || '', last_name: last_name || '', role: 'user', country: geo.country, timezone: geo.timezone, pending_approval: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ AUDIT REQUESTS ============
app.post('/api/audit', rateLimiter(5, 60000), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.first_name || !b.email) return res.status(400).json({ error: 'Name and email required' });

    const id = uuidv4();
    await run(`INSERT INTO audit_requests (id,first_name,last_name,age,sex,email,phone,country,city,occupation,work_intensity,fitness_experience,goals,motivation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, b.first_name, b.last_name||'', b.age||null, b.sex||'', b.email, b.phone||'', b.country||'', b.city||'', b.occupation||'', b.work_intensity||'', b.fitness_experience||'', b.goals||'', b.motivation||'']);
    sendPushToAdmins(JSON.stringify({ title: 'New audit form', body: `${b.first_name || ''} ${b.last_name || ''} submitted a Body Audit` })).catch(() => {});
    res.json({ id, message: 'Request submitted successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Submission failed' });
  }
});

app.get('/api/audit', async (req, res) => {
  const rows = await queryAll("SELECT * FROM audit_requests ORDER BY created_at DESC");
  res.json(rows);
});

app.get('/api/audit/:id', async (req, res) => {
  const row = await queryOne("SELECT * FROM audit_requests WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.put('/api/audit/:id', async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await run("UPDATE audit_requests SET status = ? WHERE id = ?", [status, req.params.id]);
  res.json({ message: 'Updated' });
});

app.delete('/api/audit/:id', async (req, res) => {
  await run("DELETE FROM audit_requests WHERE id = ?", [req.params.id]);
  res.json({ message: 'Deleted' });
});

// ============ PART-2 BODY AUDIT FORM (Shareable) ============
app.post('/api/part2', rateLimiter(5, 60000), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.email) return res.status(400).json({ error: 'Name and email required' });

    const id = uuidv4();
    await run(`INSERT INTO part2_audit (id, name, email, mobile, sports_history, injuries, mental_health, gym_experience, food_choices, vices_addictions, goals, what_compelled, activity_level) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, b.name || '', b.email || '', b.mobile || '', b.sports_history || '', b.injuries || '', b.mental_health || '', b.gym_experience || '', b.food_choices || '', b.vices_addictions || '', b.goals || '', b.what_compelled || '', b.activity_level || '']);
    sendPushToAdmins(JSON.stringify({ title: 'New Part-2 form', body: `${b.name || ''} (${b.email || ''}) submitted Part-2 audit` })).catch(() => {});
    res.json({ id, message: 'Form submitted successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Submission failed' });
  }
});

app.get('/api/part2', async (req, res) => {
  const rows = await queryAll("SELECT * FROM part2_audit ORDER BY created_at DESC");
  res.json(rows);
});

app.get('/api/part2/:id', async (req, res) => {
  const row = await queryOne("SELECT * FROM part2_audit WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// ============ MEETINGS (Schedule a Call) ============
app.post('/api/meetings', rateLimiter(10, 60000), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.user_id || !b.meeting_date || !b.time_slot) {
      return res.status(400).json({ error: 'User, date and time slot required' });
    }

    const id = uuidv4();
    await run(`INSERT INTO meetings (id, user_id, user_name, user_email, user_phone, meeting_date, time_slot, status, notes) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, b.user_id, b.user_name||'', b.user_email||'', b.user_phone||'', b.meeting_date, b.time_slot, 'scheduled', b.notes||'']);
    res.json({ id, message: 'Call scheduled successfully' });
  } catch (e) {
    console.error('[meetings] POST error:', e.message);
    res.status(500).json({ error: e.message || 'Failed to schedule call' });
  }
});

app.get('/api/meetings', async (req, res) => {
  const rows = await queryAll("SELECT * FROM meetings WHERE status='scheduled' ORDER BY meeting_date ASC, time_slot ASC");
  res.json(rows);
});

app.get('/api/meetings/user/:userId', async (req, res) => {
  const rows = await queryAll("SELECT * FROM meetings WHERE user_id = ? ORDER BY meeting_date DESC, created_at DESC", [req.params.userId]);
  res.json(rows);
});

app.put('/api/meetings/:id', async (req, res) => {
  const { meeting_date, time_slot, status } = req.body || {};
  const row = await queryOne("SELECT * FROM meetings WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const updates = [];
  const values = [];
  if (meeting_date !== undefined) { updates.push('meeting_date=?'); values.push(meeting_date); }
  if (time_slot !== undefined) { updates.push('time_slot=?'); values.push(time_slot); }
  if (status !== undefined) { updates.push('status=?'); values.push(status); }
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields' });

  values.push(req.params.id);
  await run(`UPDATE meetings SET ${updates.join(',')} WHERE id=?`, values);
  res.json({ message: 'Updated' });
});

// ============ TRIBE MEMBERS ============
app.get('/api/tribe', async (req, res) => {
  const rows = await queryAll("SELECT * FROM tribe_members WHERE status='active' ORDER BY phase DESC, start_date ASC");
  res.json(rows);
});

app.get('/api/tribe/:id', async (req, res) => {
  const row = await queryOne("SELECT * FROM tribe_members WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.post('/api/tribe', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.first_name) return res.status(400).json({ error: 'Name required' });

    const id = uuidv4();
    await run(`INSERT INTO tribe_members (id,first_name,last_name,email,phone,city,phase,start_date,activity_per_week,starting_weight,current_weight,target_weight,next_checkin,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, b.first_name, b.last_name||'', b.email||'', b.phone||'', b.city||'', b.phase||1, b.start_date||new Date().toISOString().split('T')[0], b.activity_per_week||0, b.starting_weight||null, b.current_weight||null, b.target_weight||null, b.next_checkin||'', b.notes||'']);
    res.json({ id, message: 'Member added' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

app.put('/api/tribe/:id', async (req, res) => {
  const allowed = ['first_name','last_name','email','phone','city','phase','activity_per_week','starting_weight','current_weight','target_weight','next_checkin','notes','status'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) { updates.push(`${k}=?`); values.push(v); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields' });
  values.push(req.params.id);
  await run(`UPDATE tribe_members SET ${updates.join(',')} WHERE id=?`, values);
  res.json({ message: 'Updated' });
});

app.delete('/api/tribe/:id', async (req, res) => {
  await run("DELETE FROM tribe_members WHERE id = ?", [req.params.id]);
  res.json({ message: 'Deleted' });
});

// ============ USER PROFILE ============
app.get('/api/profile/:id', async (req, res) => {
  const user = await queryOne("SELECT id,email,first_name,last_name,phone,country,timezone,profile_picture,role,created_at FROM users WHERE id=?", [req.params.id]);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});

app.put('/api/profile/:id', async (req, res) => {
  const { first_name, last_name, phone, email, profile_picture, country, timezone } = req.body || {};
  const updates = [], values = [];
  if (first_name !== undefined) { updates.push('first_name=?'); values.push(first_name); }
  if (last_name !== undefined) { updates.push('last_name=?'); values.push(last_name); }
  if (phone !== undefined) { updates.push('phone=?'); values.push(phone); }
  if (country !== undefined) { updates.push('country=?'); values.push(String(country || '').trim()); }
  if (timezone !== undefined) {
    const tzValue = String(timezone || '').trim() || inferTimezoneFromCountry(country);
    updates.push('timezone=?');
    values.push(tzValue || '');
  }
  if (email !== undefined) {
    const emailNorm = String(email).trim().toLowerCase();
    const other = await queryOne("SELECT id FROM users WHERE LOWER(email) = ? AND id != ?", [emailNorm, req.params.id]);
    if (other) return res.status(409).json({ error: 'Email already in use' });
    updates.push('email=?');
    values.push(emailNorm);
  }
  if (profile_picture !== undefined) {
    const profilePictureError = validateProfilePicture(profile_picture);
    if (profilePictureError) return res.status(400).json({ error: profilePictureError });
    updates.push('profile_picture=?');
    values.push(String(profile_picture || '').trim());
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.id);
  try {
    await run(`UPDATE users SET ${updates.join(',')} WHERE id=?`, values);
    res.json({ message: 'Profile updated' });
  } catch (e) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// ============ WORKOUT LOGS ============
app.post('/api/workouts', async (req, res) => {
  try {
    const { user_id, workout_name, duration_seconds, feedback } = req.body || {};
    if (!user_id || !workout_name) return res.status(400).json({ error: 'User and workout name required' });
    const id = uuidv4();
    await run("INSERT INTO workout_logs (id,user_id,workout_name,duration_seconds,feedback) VALUES (?,?,?,?,?)",
      [id, user_id, workout_name, duration_seconds || 0, feedback || '']);
    res.json({ id, message: 'Workout logged' });
  } catch (e) {
    console.error('Workout error:', e.message);
    res.status(500).json({ error: 'Failed to log workout' });
  }
});

// Admin: get all workouts (must be before :userId to avoid conflict)
app.get('/api/workouts', async (req, res) => {
  const rows = await queryAll(`SELECT w.*, u.first_name, u.last_name, u.email 
    FROM workout_logs w JOIN users u ON w.user_id = u.id 
    ORDER BY w.created_at DESC LIMIT 100`);
  res.json(rows);
});

app.get('/api/workouts/:userId', async (req, res) => {
  const rows = await queryAll("SELECT * FROM workout_logs WHERE user_id=? ORDER BY created_at DESC", [req.params.userId]);
  res.json(rows);
});

// ============ CONTACT MESSAGES ============
app.post('/api/contact', rateLimiter(5, 60000), async (req, res) => {
  try {
    const { user_id, name, phone, email, message } = req.body || {};
    if (!name || !message) return res.status(400).json({ error: 'Name and message required' });
    const id = uuidv4();
    await run("INSERT INTO contact_messages (id,user_id,name,phone,email,message) VALUES (?,?,?,?,?,?)",
      [id, user_id || null, name, phone || '', email || '', message]);
    sendPushToAdmins(JSON.stringify({ title: 'New contact message', body: `${name || 'Someone'}: ${String(message || '').slice(0, 80)}` })).catch(() => {});
    res.json({ id, message: 'Message sent' });
  } catch (e) {
    console.error('Contact error:', e.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.get('/api/contact', async (req, res) => {
  const rows = await queryAll("SELECT * FROM contact_messages ORDER BY created_at DESC");
  res.json(rows);
});

// ============ MESSAGE THREADS (2-way user ↔ admin) ============
// All messages are persisted in DB: message_threads (one per user) and thread_messages (every message).
// No in-memory or alternate storage — create/read/send all use the database.
// One chat per user (no subject). User: single thread or none. Admin: one row per user, new users below.
app.get('/api/threads', verifyToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    let rows;
    if (isAdmin) {
      rows = await queryAll(
        `SELECT * FROM (
          SELECT DISTINCT ON (t.user_id) t.id, t.user_id, t.subject, t.created_at, t.updated_at,
            u.first_name, u.last_name, u.email,
            (SELECT body FROM thread_messages WHERE thread_id = t.id AND sender_role = 'user' ORDER BY created_at DESC LIMIT 1) AS last_message
          FROM message_threads t
          LEFT JOIN users u ON u.id = t.user_id
          ORDER BY t.user_id, t.updated_at DESC
        ) sub
        ORDER BY created_at ASC`
      );
    } else {
      rows = await queryAll(
        `SELECT t.id, t.user_id, t.subject, t.created_at, t.updated_at,
         (SELECT body FROM thread_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message
         FROM message_threads t
         WHERE t.user_id = ?
         ORDER BY t.updated_at DESC
         LIMIT 1`,
        [req.user.id]
      );
    }
    res.json(rows);
  } catch (e) {
    console.error('Threads list error:', e.message);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// Get-or-create single thread for user (no subject). Optional first_message.
app.post('/api/threads', verifyToken, rateLimiter(10, 60000), async (req, res) => {
  try {
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Only users can start conversations' });
    const { first_message } = req.body || {};
    let thread = await queryOne('SELECT id, user_id, subject, created_at, updated_at FROM message_threads WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1', [req.user.id]);
    if (thread) {
      if (first_message && String(first_message).trim()) {
        const msgId = uuidv4();
        await run(
          'INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body) VALUES (?, ?, ?, ?, ?)',
          [msgId, thread.id, req.user.id, 'user', String(first_message).trim().slice(0, 5000)]
        );
        await run('UPDATE message_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [thread.id]);
        thread = await queryOne('SELECT id, user_id, subject, created_at, updated_at FROM message_threads WHERE id = ?', [thread.id]);
      }
      return res.json(thread);
    }
    const threadId = uuidv4();
    await run(
      'INSERT INTO message_threads (id, user_id, subject) VALUES (?, ?, ?)',
      [threadId, req.user.id, '']
    );
    if (first_message && String(first_message).trim()) {
      const msgId = uuidv4();
      await run(
        'INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body) VALUES (?, ?, ?, ?, ?)',
        [msgId, threadId, req.user.id, 'user', String(first_message).trim().slice(0, 5000)]
      );
      await run('UPDATE message_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [threadId]);
    }
    thread = await queryOne('SELECT id, user_id, subject, created_at, updated_at FROM message_threads WHERE id = ?', [threadId]);
    res.status(201).json(thread);
  } catch (e) {
    console.error('Create thread error:', e.message);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get one thread (user: own only, admin: any)
app.get('/api/threads/:id', verifyToken, async (req, res) => {
  try {
    const thread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [req.params.id]);
    if (!thread) return res.status(404).json({ error: 'Conversation not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && thread.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    if (isAdmin) {
      const user = await queryOne('SELECT id, first_name, last_name, email FROM users WHERE id = ?', [thread.user_id]);
      thread.user = user || null;
    }
    res.json(thread);
  } catch (e) {
    console.error('Get thread error:', e.message);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

// Get messages in thread
app.get('/api/threads/:id/messages', verifyToken, async (req, res) => {
  try {
    const thread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [req.params.id]);
    if (!thread) return res.status(404).json({ error: 'Conversation not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && thread.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const rows = await queryAll(
      'SELECT id, thread_id, sender_id, sender_role, body, created_at FROM thread_messages WHERE thread_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    console.error('Get messages error:', e.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send message in thread
app.post('/api/threads/:id/messages', verifyToken, rateLimiter(30, 60000), async (req, res) => {
  try {
    const { body } = req.body || {};
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'Message body required' });
    const thread = await queryOne('SELECT * FROM message_threads WHERE id = ?', [req.params.id]);
    if (!thread) return res.status(404).json({ error: 'Conversation not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isAdmin && thread.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const senderRole = isAdmin ? 'admin' : 'user';
    const msgId = uuidv4();
    await run(
      'INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body) VALUES (?, ?, ?, ?, ?)',
      [msgId, req.params.id, req.user.id, senderRole, String(body).trim().slice(0, 5000)]
    );
    await run('UPDATE message_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    const msg = await queryOne('SELECT id, thread_id, sender_id, sender_role, body, created_at FROM thread_messages WHERE id = ?', [msgId]);
    if (isAdmin && thread.user_id) {
      sendPushToUser(thread.user_id, JSON.stringify({ type: 'coach_reply', title: 'Lifestyle Manager replied', body: String(body).trim().slice(0, 100) })).catch(() => {});
    }
    if (!isAdmin) {
      const u = await queryOne('SELECT first_name, last_name, email FROM users WHERE id = ?', [thread.user_id]);
      const userName = u ? [(u.first_name || '').trim(), (u.last_name || '').trim()].filter(Boolean).join(' ') || u.email : 'A client';
      sendPushToAdmins(JSON.stringify({ title: 'New message', body: `${userName}: ${String(body).trim().slice(0, 80)}` })).catch(() => {});
    }
    res.status(201).json(msg);
  } catch (e) {
    console.error('Send message error:', e.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ============ SCHEDULED MESSAGES (Admin) ============
// Create scheduled message
app.post('/api/scheduled-messages', verifyToken, requireAdminOrSuperadmin, rateLimiter(20, 60000), async (req, res) => {
  try {
    const { user_id, message_body, scheduled_at, broadcast } = req.body || {};
    if (!message_body || !String(message_body).trim()) return res.status(400).json({ error: 'Message body is required' });
    const requestedSchedule = extractLocalDateTimeParts(scheduled_at);
    const parsedAt = scheduled_at ? new Date(scheduled_at) : null;
    if ((!requestedSchedule && (!parsedAt || isNaN(parsedAt.getTime())))) return res.status(400).json({ error: 'Valid scheduled date/time is required' });
    const adminId = req.user.id;

    const targets = broadcast === true
      ? await queryAll("SELECT id, country, timezone FROM users WHERE role = 'user' AND (approval_status = 'approved' OR approval_status IS NULL)")
      : (user_id ? await queryAll("SELECT id, country, timezone FROM users WHERE id = ?", [user_id]) : []);

    if (targets.length === 0) return res.status(400).json({ error: 'Select at least one user or use broadcast to send to all' });

    const ids = [];
    for (const target of targets) {
      const targetTimezone = getUserTimezone(target);
      const scheduledAtIso = requestedSchedule && !requestedSchedule.hasExplicitTimezone
        ? localDateTimeToUtcIso(requestedSchedule.date, requestedSchedule.time, targetTimezone)
        : parsedAt.toISOString();
      if (new Date(scheduledAtIso) <= new Date()) {
        return res.status(400).json({ error: `Scheduled time must be in the future for ${targetTimezone}` });
      }
      const id = uuidv4();
      await run(
        'INSERT INTO scheduled_messages (id, admin_id, user_id, message_body, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?)',
        [id, adminId, target.id, String(message_body).trim().slice(0, 5000), scheduledAtIso, 'pending']
      );
      ids.push(id);
    }
    const created = await queryAll('SELECT * FROM scheduled_messages WHERE id = ANY($1)', [ids]);
    res.status(201).json(created.length === 1 ? created[0] : { created: ids.length, ids });
  } catch (e) {
    console.error('Create scheduled message error:', e.message);
    res.status(500).json({ error: 'Failed to create scheduled message' });
  }
});

// List scheduled messages
app.get('/api/scheduled-messages', verifyToken, requireAdminOrSuperadmin, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT sm.id, sm.admin_id, sm.user_id, sm.message_body, sm.scheduled_at, sm.status, sm.thread_id, sm.created_at,
       u.first_name, u.last_name, u.email
       FROM scheduled_messages sm
       LEFT JOIN users u ON u.id = sm.user_id
       ORDER BY sm.scheduled_at DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    console.error('List scheduled messages error:', e.message);
    res.status(500).json({ error: 'Failed to load scheduled messages' });
  }
});

// Cancel scheduled message
app.delete('/api/scheduled-messages/:id', verifyToken, requireAdminOrSuperadmin, async (req, res) => {
  try {
    const r = await run('UPDATE scheduled_messages SET status = ? WHERE id = ? AND status = ?', ['cancelled', req.params.id, 'pending']);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Scheduled message not found or already sent/cancelled' });
    res.json({ message: 'Scheduled message cancelled' });
  } catch (e) {
    console.error('Cancel scheduled message error:', e.message);
    res.status(500).json({ error: 'Failed to cancel' });
  }
});

// ============ SUNDAY CHECK-IN (User submit) ============
app.post('/api/sunday-checkin', rateLimiter(10, 60000), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.full_name) return res.status(400).json({ error: 'Full name is required' });
    const id = uuidv4();
    await run(`INSERT INTO sunday_checkins (id, user_id, full_name, reply_email, plan, current_weight_waist_week, last_week_weight_waist, total_weight_loss, training_go, nutrition_go, sleep, occupation_stress, other_stress, differences_felt, achievements, improve_next_week, questions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, b.user_id || null, b.full_name || '', b.reply_email || '', b.plan || '', b.current_weight_waist_week || '', b.last_week_weight_waist || '', b.total_weight_loss || '', b.training_go || '', b.nutrition_go || '', b.sleep || '', b.occupation_stress || '', b.other_stress || '', b.differences_felt || '', b.achievements || '', b.improve_next_week || '', b.questions || '']);
    res.json({ id, message: 'Sunday check-in submitted successfully' });
  } catch (e) {
    console.error('Sunday check-in error:', e.message);
    res.status(500).json({ error: 'Failed to submit check-in' });
  }
});

app.get('/api/sunday-checkin', async (req, res) => {
  const rows = await queryAll("SELECT id, full_name, reply_email, created_at FROM sunday_checkins ORDER BY created_at DESC");
  res.json(rows);
});

app.get('/api/sunday-checkin/last-weight/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ error: 'Missing user id' });
    const rows = await queryAll(
      'SELECT current_weight_waist_week FROM sunday_checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    if (!rows.length) return res.json({ last_week_weight_waist: '' });
    const value = (rows[0].current_weight_waist_week || '').trim();
    res.json({ last_week_weight_waist: value });
  } catch (e) {
    console.error('Failed to get last sunday weight', e.message);
    res.status(500).json({ error: 'Failed to load last week weight' });
  }
});

app.get('/api/sunday-checkin/:id', async (req, res) => {
  const row = await queryOne("SELECT * FROM sunday_checkins WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// ============ DAILY CHECK-IN (micro-goals: steps, water, protein, sleep) ============
// User can fill only once per day for streak
app.post('/api/daily-checkin', verifyToken, rateLimiter(20, 60000), async (req, res) => {
  try {
    const userId = req.user.id;
    const { steps, water_ml, protein_g, sleep_hours } = req.body || {};
    const today = new Date().toISOString().slice(0, 10);
    const existing = await queryOne('SELECT id FROM daily_checkins WHERE user_id = ? AND checkin_date = ?::date', [userId, today]);
    if (existing) {
      return res.status(400).json({ error: 'You can only fill the daily check-in once per day.' });
    }
    const id = uuidv4();
    await run(
      `INSERT INTO daily_checkins (id, user_id, checkin_date, steps, water_ml, protein_g, sleep_hours)
       VALUES (?, ?, ?::date, ?, ?, ?, ?)`,
      [id, userId, today, steps != null ? steps : null, water_ml != null ? water_ml : null, protein_g != null ? protein_g : null, sleep_hours != null ? sleep_hours : null]
    );
    const row = await queryOne('SELECT * FROM daily_checkins WHERE user_id = ? AND checkin_date = ?::date', [userId, today]);
    res.json(row || { id, user_id: userId, checkin_date: today, steps, water_ml, protein_g, sleep_hours });
  } catch (e) {
    console.error('Daily check-in error:', e.message);
    res.status(500).json({ error: 'Failed to save check-in' });
  }
});

app.get('/api/daily-checkin/today', verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const row = await queryOne('SELECT * FROM daily_checkins WHERE user_id = ? AND checkin_date = ?::date', [req.user.id, today]);
    res.json(row || { checkin_date: today });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load check-in' });
  }
});

app.get('/api/daily-checkin/streak', verifyToken, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT checkin_date, steps, water_ml, protein_g, sleep_hours FROM daily_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 14`,
      [req.user.id]
    );
    const toDateStr = (val) => {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      return String(val).slice(0, 10);
    };
    const today = toDateStr(new Date());
    const dates = new Set(rows.map(r => toDateStr(r.checkin_date)).filter(Boolean));
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const ds = toDateStr(d);
      if (!dates.has(ds)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekData = rows.filter(r => new Date(r.checkin_date) >= weekStart);
    const avgSteps = weekData.length ? Math.round(weekData.reduce((s, r) => s + (r.steps || 0), 0) / weekData.length) : null;
    const avgWater = weekData.length ? Math.round(weekData.reduce((s, r) => s + (r.water_ml || 0), 0) / weekData.length) : null;
    const avgProtein = weekData.length ? Math.round(weekData.reduce((s, r) => s + (r.protein_g || 0), 0) / weekData.length) : null;
    const avgSleep = weekData.length ? (weekData.reduce((s, r) => s + (r.sleep_hours || 0), 0) / weekData.length).toFixed(1) : null;
    res.json({ streak, weekly: { avgSteps, avgWater, avgProtein, avgSleep }, days: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load streak' });
  }
});

app.get('/api/admin/daily-checkins', verifyToken, requireAdminOrSuperadmin, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT dc.id, dc.user_id, dc.checkin_date, dc.steps, dc.water_ml, dc.protein_g, dc.sleep_hours, dc.created_at,
              u.first_name, u.last_name, u.email
       FROM daily_checkins dc
       LEFT JOIN users u ON u.id = dc.user_id
       ORDER BY dc.checkin_date DESC, dc.created_at DESC
       LIMIT 250`
    );
    res.json(rows);
  } catch (e) {
    console.error('Admin daily check-ins list error:', e.message);
    res.status(500).json({ error: 'Failed to load daily check-ins' });
  }
});

app.get('/api/admin/daily-checkins/:id', verifyToken, requireAdminOrSuperadmin, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT dc.*, u.first_name, u.last_name, u.email, u.phone
       FROM daily_checkins dc
       LEFT JOIN users u ON u.id = dc.user_id
       WHERE dc.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    console.error('Admin daily check-in detail error:', e.message);
    res.status(500).json({ error: 'Failed to load daily check-in' });
  }
});

// ============ TODAY DASHBOARD ============
app.get('/api/today', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);
    const [checkin, meetings, workouts, lastMessageRow] = await Promise.all([
      queryOne('SELECT * FROM daily_checkins WHERE user_id = ? AND checkin_date = ?::date', [userId, today]),
      queryAll("SELECT * FROM meetings WHERE user_id = ? AND status != 'cancelled' ORDER BY meeting_date ASC, time_slot ASC", [userId]),
      queryAll('SELECT * FROM workout_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]),
      queryOne('SELECT tm.body, tm.created_at, tm.sender_role, mt.id as thread_id FROM thread_messages tm JOIN message_threads mt ON mt.id = tm.thread_id WHERE mt.user_id = ? ORDER BY tm.created_at DESC LIMIT 1', [userId])
    ]);
    const lastMessage = lastMessageRow ? { body: lastMessageRow.body, created_at: lastMessageRow.created_at, sender_role: lastMessageRow.sender_role, thread_id: lastMessageRow.thread_id } : null;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString();
    const sundayRows = await queryAll("SELECT id, created_at FROM sunday_checkins WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1", [userId, weekStartStr]);
    const pendingCheckin = sundayRows.length === 0;
    const upcomingMeetings = (meetings || []).filter(m => new Date(m.meeting_date + 'T12:00:00') >= new Date()).slice(0, 1);
    res.json({
      checkin: checkin || null,
      nextMeeting: upcomingMeetings[0] || null,
      lastWorkout: workouts && workouts[0] ? workouts[0] : null,
      lastMessage: lastMessage || null,
      pendingSundayCheckin: pendingCheckin
    });
  } catch (e) {
    console.error('Today API error:', e.message);
    res.status(500).json({ error: 'Failed to load today data' });
  }
});

// ============ PUSH NOTIFICATIONS (opt-in) ============
app.post('/api/push/subscribe', verifyToken, rateLimiter(5, 60000), async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys) return res.status(400).json({ error: 'Subscription required' });
    const existing = await queryOne('SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [req.user.id, endpoint]);
    if (existing) {
      await run('UPDATE push_subscriptions SET p256dh = ?, auth = ? WHERE user_id = ? AND endpoint = ?',
        [keys.p256dh || null, keys.auth || null, req.user.id, endpoint]);
    } else {
      const id = uuidv4();
      await run('INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)',
        [id, req.user.id, endpoint, keys.p256dh || null, keys.auth || null]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

app.delete('/api/push/subscribe', verifyToken, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) {
      await run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [req.user.id, endpoint]);
    } else {
      await run('DELETE FROM push_subscriptions WHERE user_id = ?', [req.user.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

app.get('/api/push/vapid-public', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC || null });
});

// ============ ADMIN: PENDING SIGNUPS & APPROVE ============
app.get('/api/admin/pending-signups', async (req, res) => {
  try {
    const list = await queryAll("SELECT id, email, first_name, last_name, created_at FROM users WHERE role = 'user' AND (approval_status IS NULL OR approval_status = 'pending') ORDER BY created_at DESC");
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch pending sign-ups' });
  }
});

app.post('/api/admin/approve-user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await queryOne("SELECT id, role, email FROM users WHERE id = ?", [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot change admin approval' });
    await run("UPDATE users SET approval_status = 'approved' WHERE id = ?", [id]);
    await syncUserCountryAndTimezone(user.id, user.email);
    res.json({ message: 'User approved' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

app.post('/api/admin/reject-user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await queryOne("SELECT id, role FROM users WHERE id = ?", [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot change admin approval' });
    await run("UPDATE users SET approval_status = 'rejected' WHERE id = ?", [id]);
    res.json({ message: 'User rejected' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reject user' });
  }
});

app.get('/api/admin/pending-signup/:id', async (req, res) => {
  try {
    const user = await queryOne("SELECT id, email, first_name, last_name, phone, country, timezone, created_at FROM users WHERE id = ? AND role = 'user' AND (approval_status IS NULL OR approval_status = 'pending')", [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch sign-up request' });
  }
});

// ============ NOTIFICATIONS (Admin + User; role-based) ============
app.get('/api/notifications', verifyToken, async (req, res) => {
  try {
    const notifications = [];
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

    if (isAdmin) {
      const pending = await queryAll("SELECT id, first_name, last_name, email, created_at FROM audit_requests WHERE status='pending' ORDER BY created_at DESC LIMIT 10");
      pending.forEach(r => {
        notifications.push({
          id: 'audit-' + r.id,
          type: 'audit',
          title: 'New Body Audit Request',
          desc: `${r.first_name} ${r.last_name} (${r.email})`,
          time: r.created_at,
          link: 'requests'
        });
      });
      const messages = await queryAll("SELECT id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 10");
      messages.forEach(m => {
        const msg = (m.message || '').substring(0, 50);
        notifications.push({
          id: 'message-' + m.id,
          type: 'message',
          title: 'New Contact Message',
          desc: `${m.name}: ${msg}${(m.message || '').length > 50 ? '...' : ''}`,
          time: m.created_at,
          link: 'messages'
        });
      });
      const chatMessages = await queryAll(
        `SELECT m.id, m.thread_id, m.body, m.created_at, u.first_name, u.last_name, u.email
         FROM thread_messages m
         JOIN message_threads t ON t.id = m.thread_id
         LEFT JOIN users u ON u.id = t.user_id
         WHERE m.sender_role = 'user'
         ORDER BY m.created_at DESC LIMIT 15`
      );
      chatMessages.forEach(m => {
        const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || 'User';
        const preview = (m.body || '').substring(0, 60) + ((m.body || '').length > 60 ? '...' : '');
        notifications.push({
          id: 'chat-' + m.id,
          type: 'chat',
          title: 'New message from ' + name,
          desc: preview,
          time: m.created_at,
          link: 'messages-meetings'
        });
      });
      const tribe = await queryAll("SELECT id, first_name, last_name, created_at FROM tribe_members WHERE status='active' ORDER BY created_at DESC LIMIT 5");
      tribe.forEach(t => {
        notifications.push({
          id: 'tribe-' + t.id,
          type: 'user',
          title: 'New Tribe Member',
          desc: `${t.first_name} ${t.last_name} joined`,
          time: t.created_at,
          link: 'tribe'
        });
      });
      const workouts = await queryAll("SELECT w.id, w.workout_name, w.duration_seconds, w.created_at, u.first_name, u.last_name FROM workout_logs w LEFT JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 5");
      workouts.forEach(w => {
        const m = Math.floor((w.duration_seconds || 0) / 60);
        notifications.push({
          id: 'workout-' + w.id,
          type: 'workout',
          title: 'Workout Logged',
          desc: `${w.first_name || ''} ${w.last_name || ''} - ${w.workout_name} (${m} min)`,
          time: w.created_at,
          link: 'workouts'
        });
      });
      const pendingSignups = await queryAll("SELECT id, email, first_name, last_name, created_at FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status = 'pending') ORDER BY created_at DESC LIMIT 10");
      pendingSignups.forEach(u => {
        notifications.push({
          id: 'signup-' + u.id,
          type: 'user',
          title: 'New User Sign-up (Pending Approval)',
          desc: `${u.first_name || ''} ${u.last_name || ''} (${u.email})`,
          time: u.created_at,
          link: 'signups'
        });
      });
      const part2Subs = await queryAll("SELECT id, name, email, created_at FROM part2_audit ORDER BY created_at DESC LIMIT 5");
      part2Subs.forEach(p => {
        notifications.push({
          id: 'part2-' + p.id,
          type: 'audit',
          title: 'Part-2 Form Submitted',
          desc: `${p.name} (${p.email})`,
          time: p.created_at,
          link: 'part2'
        });
      });
      const meetReqs = await queryAll("SELECT id, user_name, user_email, meeting_date, time_slot, created_at FROM meetings WHERE status='scheduled' ORDER BY created_at DESC LIMIT 5");
      meetReqs.forEach(m => {
        notifications.push({
          id: 'meeting-' + m.id,
          type: 'audit',
          title: 'Call Scheduled',
          desc: `${m.user_name || m.user_email} — ${m.meeting_date} ${m.time_slot}`,
          time: m.created_at,
          link: 'meetings'
        });
      });
    } else {
      const thread = await queryOne('SELECT id FROM message_threads WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1', [req.user.id]);
      if (thread) {
        const adminMsgs = await queryAll(
          "SELECT id, body, created_at FROM thread_messages WHERE thread_id = ? AND sender_role = 'admin' ORDER BY created_at DESC LIMIT 10",
          [thread.id]
        );
        adminMsgs.forEach(m => {
          const preview = (m.body || '').substring(0, 60) + ((m.body || '').length > 60 ? '...' : '');
          notifications.push({
            id: 'chat-' + m.id,
            type: 'chat',
            title: 'New message from coach',
            desc: preview,
            time: m.created_at,
            link: 'messages'
          });
        });
      }
    }

    notifications.sort((a, b) => new Date(b.time) - new Date(a.time));
    res.json(notifications.slice(0, 30));
  } catch (e) {
    res.status(500).json([]);
  }
});

// ============ STATS ============
app.get('/api/stats', async (req, res) => {
  const pending = await queryAll("SELECT COUNT(*) as c FROM audit_requests WHERE status='pending'");
  const active = await queryAll("SELECT COUNT(*) as c FROM tribe_members WHERE status='active'");
  const completed = await queryAll("SELECT COUNT(*) as c FROM tribe_members WHERE status='completed'");
  const total = await queryAll("SELECT COUNT(*) as c FROM tribe_members");
  const [workouts] = await queryAll("SELECT COUNT(*) as c FROM workout_logs");
  const [formsTotal] = await queryAll("SELECT COUNT(*) as c FROM audit_requests");
  const [sundayCheckins] = await queryAll("SELECT COUNT(*) as c FROM sunday_checkins");
  const [dailyCheckins] = await queryAll("SELECT COUNT(*) as c FROM daily_checkins");
  const [pendingSignups] = await queryAll("SELECT COUNT(*) as c FROM users WHERE role='user' AND approval_status='pending'");
  const [contactMsgs] = await queryAll("SELECT COUNT(*) as c FROM contact_messages");
  const [unreadThreads] = await queryAll(
    "SELECT COUNT(*) as c FROM message_threads t WHERE (SELECT sender_role FROM thread_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) = 'user'"
  );

  const num = (v) => (v === undefined || v === null ? 0 : parseInt(String(v), 10) || 0);
  res.json({
    pending_requests: num(pending[0]?.c),
    active_members: num(active[0]?.c),
    completed: num(completed[0]?.c),
    total_members: num(total[0]?.c),
    success_rate: 92,
    workouts: num(workouts?.c),
    forms: num(formsTotal?.c),
    check_ins: num(sundayCheckins[0]?.c),
    daily_checkins: num(dailyCheckins?.c),
    pending_signups: num(pendingSignups[0]?.c),
    messages: num(unreadThreads?.c)
  });
});

// ============ ADMIN: RECENT ACTIVITY (for dashboard live activity) ============
app.get('/api/admin/recent-activity', verifyToken, requireAdminOrSuperadmin, async (req, res) => {
  try {
    const limit = 10;
    const activities = [];
    const sc = await queryAll('SELECT full_name, created_at FROM sunday_checkins ORDER BY created_at DESC LIMIT ?', [limit]);
    (sc || []).forEach(r => activities.push({ name: r.full_name || 'Unknown', type: 'Check-in', status: 'NEW', created_at: r.created_at }));
    const wl = await queryAll(
      `SELECT u.first_name, u.last_name, w.created_at FROM workout_logs w LEFT JOIN users u ON u.id = w.user_id ORDER BY w.created_at DESC LIMIT ?`,
      [limit]
    );
    (wl || []).forEach(r => activities.push({ name: ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || 'User', type: 'Workout logged', status: 'DONE', created_at: r.created_at }));
    const cm = await queryAll('SELECT name, created_at FROM contact_messages ORDER BY created_at DESC LIMIT ?', [limit]);
    (cm || []).forEach(r => activities.push({ name: r.name || 'Unknown', type: 'Message', status: 'UNREAD', created_at: r.created_at }));
    const ps = await queryAll(
      "SELECT first_name, last_name, created_at FROM users WHERE role='user' AND approval_status='pending' ORDER BY created_at DESC LIMIT ?",
      [limit]
    );
    (ps || []).forEach(r => activities.push({ name: ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || 'New user', type: 'Sign-up', status: 'PENDING', created_at: r.created_at }));
    activities.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    res.json(activities.slice(0, limit));
  } catch (e) {
    console.error('[recent-activity]', e.message);
    res.status(500).json([]);
  }
});

// ============ ADMIN: USERS LIST (for insights filter; exclude E2E test users) ============
app.get('/api/admin/users', async (req, res) => {
  try {
    const list = await queryAll(
      "SELECT id, first_name, last_name, email, country, timezone FROM users WHERE role = 'user' AND (approval_status IS NULL OR approval_status = 'approved') AND (email NOT LIKE '%@test.bodybank.fit') AND (LOWER(first_name) NOT LIKE '%e2e%') ORDER BY first_name, last_name"
    );
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/users/:id', verifyToken, requireAdminOrSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (NODE_ENV !== 'production') console.log('[DELETE /api/admin/users/:id] id=', id);
    const user = await queryOne("SELECT id, role, email FROM users WHERE id = ?", [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'user') return res.status(400).json({ error: 'Can only remove client users' });
    const threads = await queryAll('SELECT id FROM message_threads WHERE user_id = ?', [id]);
    const threadIds = (threads || []).map(t => t.id).filter(Boolean);
    if (threadIds.length > 0) {
      for (const tid of threadIds) {
        await run('DELETE FROM thread_messages WHERE thread_id = ?', [tid]);
      }
    }
    await run('DELETE FROM message_threads WHERE user_id = ?', [id]);
    await run('DELETE FROM scheduled_messages WHERE user_id = ?', [id]);
    await run('DELETE FROM workout_logs WHERE user_id = ?', [id]);
    await run('DELETE FROM contact_messages WHERE user_id = ?', [id]);
    await run('DELETE FROM meetings WHERE user_id = ?', [id]);
    await run('DELETE FROM sunday_checkins WHERE user_id = ?', [id]);
    await run('DELETE FROM hydration_logs WHERE user_id = ?', [id]);
    await run('DELETE FROM weight_logs WHERE user_id = ?', [id]);
    await run('DELETE FROM daily_checkins WHERE user_id = ?', [id]);
    await run('DELETE FROM push_subscriptions WHERE user_id = ?', [id]);
    await run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User removed' });
  } catch (e) {
    console.error('Delete user error:', e.message);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

// ============ ADMIN: PERFORMANCE INSIGHTS ============
app.get('/api/admin/performance-insights', async (req, res) => {
  try {
    const { source = 'all', from: dateFrom, to: dateTo, user_id: filterUserId } = req.query || {};
    const hasDate = dateFrom || dateTo;
    const dateParams = [dateFrom, dateTo].filter(Boolean);

    const summary = {};
    const tables = [
      { key: 'workouts', table: 'workout_logs', countSql: 'SELECT COUNT(*) as c FROM workout_logs w', dateCol: 'w.created_at', userCol: 'w.user_id' },
      { key: 'sunday_checkin', table: 'sunday_checkins', countSql: 'SELECT COUNT(*) as c FROM sunday_checkins', dateCol: 'created_at', userCol: 'user_id' },
      { key: 'audit', table: 'audit_requests', countSql: 'SELECT COUNT(*) as c FROM audit_requests', dateCol: 'created_at', userCol: null },
      { key: 'part2', table: 'part2_audit', countSql: 'SELECT COUNT(*) as c FROM part2_audit', dateCol: 'created_at', userCol: null },
      { key: 'meetings', table: 'meetings', countSql: "SELECT COUNT(*) as c FROM meetings WHERE status='scheduled'", dateCol: 'created_at', userCol: 'user_id' },
      { key: 'messages', table: 'contact_messages', countSql: 'SELECT COUNT(*) as c FROM contact_messages', dateCol: 'created_at', userCol: 'user_id' }
    ];
    const usersApproved = await queryOne("SELECT COUNT(*) as c FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status = 'approved')");
    summary.users_approved = usersApproved?.c ?? 0;

    for (const { key, countSql, dateCol, userCol } of tables) {
      let sql = countSql;
      const params = [];
      const conditions = [];
      if (hasDate && dateCol) {
        if (dateFrom) conditions.push(`date(${dateCol}) >= date(?)`);
        if (dateTo) conditions.push(`date(${dateCol}) <= date(?)`);
        params.push(...dateParams);
      }
      if (filterUserId && userCol) {
        conditions.push(`${userCol} = ?`);
        params.push(filterUserId);
      }
      if (conditions.length) sql += (countSql.toLowerCase().includes(' where ') ? ' AND ' : ' WHERE ') + conditions.join(' AND ');
      const row = await queryOne(sql, params);
      summary[key] = row?.c ?? 0;
    }

    let data = [];
    const pickSource = source.toLowerCase();

    async function runQuery(sql, params = []) {
      return queryAll(sql, params);
    }

    if (pickSource === 'all' || pickSource === 'overview') {
      const limit = 80;
      const w = (await runQuery(`SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.created_at, u.first_name, u.last_name FROM workout_logs w LEFT JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 200`)).map(r => ({ ...r, _source: 'workouts', _date: r.created_at }));
      const sc = (await runQuery('SELECT id, user_id, full_name, reply_email, created_at FROM sunday_checkins ORDER BY created_at DESC LIMIT 200')).map(r => ({ ...r, _source: 'sunday_checkin', _date: r.created_at }));
      const ar = (await runQuery('SELECT id, first_name, last_name, email, created_at FROM audit_requests ORDER BY created_at DESC LIMIT 200')).map(r => ({ ...r, _source: 'audit', _date: r.created_at }));
      const p2 = (await runQuery('SELECT id, name, email, created_at FROM part2_audit ORDER BY created_at DESC LIMIT 200')).map(r => ({ ...r, _source: 'part2', _date: r.created_at }));
      const meet = (await runQuery("SELECT id, user_id, user_name, user_email, meeting_date, time_slot, created_at FROM meetings ORDER BY created_at DESC LIMIT 200")).map(r => ({ ...r, _source: 'meetings', _date: r.created_at }));
      const msg = (await runQuery('SELECT id, user_id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 200')).map(r => ({ ...r, _source: 'messages', _date: r.created_at }));
      data = [...w, ...sc, ...ar, ...p2, ...meet, ...msg];
      if (hasDate) data = data.filter(r => { const d = (r._date || r.created_at || '').toString().slice(0, 10); return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo); });
      if (filterUserId) data = data.filter(r => r.user_id === filterUserId);
      data.sort((a, b) => new Date(b._date || b.created_at) - new Date(a._date || a.created_at));
      data = data.slice(0, limit);
    } else {
      const limit = 500;
      let sql, params = [];
      const uidCol = { workouts: 'w.user_id', sunday_checkin: 'user_id', meetings: 'user_id' }[pickSource];
      if (pickSource === 'workouts') {
        sql = `SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.feedback, w.created_at, u.first_name, u.last_name, u.email FROM workout_logs w LEFT JOIN users u ON w.user_id = u.id`;
        if (hasDate || filterUserId) { sql += ' WHERE '; const c = []; if (dateFrom) { c.push('date(w.created_at) >= date(?)'); params.push(dateFrom); } if (dateTo) { c.push('date(w.created_at) <= date(?)'); params.push(dateTo); } if (filterUserId) { c.push('w.user_id = ?'); params.push(filterUserId); } sql += c.join(' AND '); }
        sql += ' ORDER BY w.created_at DESC LIMIT ' + limit;
        data = await runQuery(sql, params);
      } else if (pickSource === 'sunday_checkin') {
        sql = `SELECT id, user_id, full_name, reply_email, plan, total_weight_loss, created_at FROM sunday_checkins`;
        if (hasDate || filterUserId) { sql += ' WHERE '; const c = []; if (dateFrom) { c.push('date(created_at) >= date(?)'); params.push(dateFrom); } if (dateTo) { c.push('date(created_at) <= date(?)'); params.push(dateTo); } if (filterUserId) { c.push('user_id = ?'); params.push(filterUserId); } sql += c.join(' AND '); }
        sql += ' ORDER BY created_at DESC LIMIT ' + limit;
        data = await runQuery(sql, params);
      } else if (pickSource === 'audit') {
        sql = `SELECT id, first_name, last_name, email, city, goals, status, created_at FROM audit_requests`;
        if (hasDate) { sql += ' WHERE '; const c = []; if (dateFrom) { c.push('date(created_at) >= date(?)'); params.push(dateFrom); } if (dateTo) { c.push('date(created_at) <= date(?)'); params.push(dateTo); } sql += c.join(' AND '); }
        sql += ' ORDER BY created_at DESC LIMIT ' + limit;
        data = await runQuery(sql, params);
      } else if (pickSource === 'part2') {
        sql = `SELECT id, name, email, mobile, activity_level, created_at FROM part2_audit`;
        if (hasDate) { sql += ' WHERE '; const c = []; if (dateFrom) { c.push('date(created_at) >= date(?)'); params.push(dateFrom); } if (dateTo) { c.push('date(created_at) <= date(?)'); params.push(dateTo); } sql += c.join(' AND '); }
        sql += ' ORDER BY created_at DESC LIMIT ' + limit;
        data = await runQuery(sql, params);
      } else if (pickSource === 'meetings') {
        sql = `SELECT id, user_id, user_name, user_email, user_phone, meeting_date, time_slot, status, created_at FROM meetings`;
        if (hasDate || filterUserId) { sql += ' WHERE '; const c = []; if (dateFrom) { c.push('date(created_at) >= date(?)'); params.push(dateFrom); } if (dateTo) { c.push('date(created_at) <= date(?)'); params.push(dateTo); } if (filterUserId) { c.push('user_id = ?'); params.push(filterUserId); } sql += c.join(' AND '); }
        sql += ' ORDER BY created_at DESC LIMIT ' + limit;
        data = await runQuery(sql, params);
      } else if (pickSource === 'messages') {
        sql = `SELECT id, user_id, name, email, phone, message, created_at FROM contact_messages`;
        if (hasDate || filterUserId) { sql += ' WHERE '; const c = []; if (dateFrom) { c.push('date(created_at) >= date(?)'); params.push(dateFrom); } if (dateTo) { c.push('date(created_at) <= date(?)'); params.push(dateTo); } if (filterUserId) { c.push('user_id = ?'); params.push(filterUserId); } sql += c.join(' AND '); }
        sql += ' ORDER BY created_at DESC LIMIT ' + limit;
        data = await runQuery(sql, params);
      }
    }

    res.json({ summary, data, filters: { source: pickSource, dateFrom: dateFrom || null, dateTo: dateTo || null, user_id: filterUserId || null } });
  } catch (e) {
    console.error('Performance insights error:', e.message);
    res.status(500).json({ error: e.message, summary: {}, data: [] });
  }
});

// ============ ADMIN: VIEW DATABASE ============
app.get('/api/admin/db-view', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const tables = ['users', 'audit_requests', 'tribe_members', 'workout_logs', 'contact_messages', 'meetings', 'part2_audit', 'hydration_logs', 'weight_logs', 'sunday_checkins'];
    const result = {};
    
    for (const table of tables) {
      try {
        const rows = await queryAll(`SELECT * FROM ${table}`);
        result[table] = rows;
      } catch (e) {
        result[table] = { error: e.message };
      }
    }
    
    res.json({
      db: 'postgresql',
      tables: result,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('DB view error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ ADMIN: AI ASSIST (context from DB, optional OpenAI) ============
function num(v) { return (v === undefined || v === null ? 0 : parseInt(String(v), 10) || 0); }

async function getAdminAIContext() {
  const lines = [];
  const now = new Date().toISOString();
  lines.push('LIVE DATA — BodyBank database. Fetched just now (' + now + '). Use this to answer the admin.\n');

  try {
    const [pendingReq] = await queryAll("SELECT COUNT(*) as c FROM audit_requests WHERE status='pending'");
    const [approvedReq] = await queryAll("SELECT COUNT(*) as c FROM audit_requests WHERE status='approved'");
    const [rejectedReq] = await queryAll("SELECT COUNT(*) as c FROM audit_requests WHERE status='rejected'");
    const [auditTotal] = await queryAll("SELECT COUNT(*) as c FROM audit_requests");
    const [tribeTotal] = await queryAll("SELECT COUNT(*) as c FROM tribe_members");
    const [tribeActive] = await queryAll("SELECT COUNT(*) as c FROM tribe_members WHERE status='active'");
    const [tribeCompleted] = await queryAll("SELECT COUNT(*) as c FROM tribe_members WHERE status='completed'");
    const [workouts] = await queryAll("SELECT COUNT(*) as c FROM workout_logs");
    const [messages] = await queryAll("SELECT COUNT(*) as c FROM contact_messages");
    const [meetings] = await queryAll("SELECT COUNT(*) as c FROM meetings");
    const [meetingsScheduled] = await queryAll("SELECT COUNT(*) as c FROM meetings WHERE status='scheduled'");
    const [part2] = await queryAll("SELECT COUNT(*) as c FROM part2_audit");
    const [sundayCheck] = await queryAll("SELECT COUNT(*) as c FROM sunday_checkins");
    const [signups] = await queryAll("SELECT COUNT(*) as c FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status = 'pending')");
    const [approvedUsers] = await queryAll("SELECT COUNT(*) as c FROM users WHERE role='user' AND (approval_status = 'approved' OR approval_status IS NULL)");

    const p = num(pendingReq?.c), a = num(approvedReq?.c), r = num(rejectedReq?.c), totAudit = num(auditTotal?.c);
    const totTribe = num(tribeTotal?.c), act = num(tribeActive?.c), comp = num(tribeCompleted?.c);
    const w = num(workouts?.c), msg = num(messages?.c), meet = num(meetings?.c), sched = num(meetingsScheduled?.c);
    const p2 = num(part2?.c), sc = num(sundayCheck?.c), pendSign = num(signups?.c), appUsers = num(approvedUsers?.c);

    lines.push('--- COUNTS (use these for "how many" questions) ---');
    lines.push('Audit forms: ' + totAudit + ' total. Pending: ' + p + ', Approved: ' + a + ', Rejected: ' + r + '.');
    if (totAudit === 0) lines.push('(No audit form submissions in the database yet.)');
    lines.push('Tribe members: ' + totTribe + ' total. Active: ' + act + ', Completed: ' + comp + '.');
    if (totTribe === 0) lines.push('(No tribe members yet.)');
    lines.push('Workout logs: ' + w + '.');
    if (w === 0) lines.push('(No workout logs yet.)');
    lines.push('Contact messages: ' + msg + '.');
    if (msg === 0) lines.push('(No contact messages yet.)');
    lines.push('Meetings: ' + meet + ' total, ' + sched + ' scheduled.');
    if (meet === 0) lines.push('(No meetings yet.)');
    lines.push('Part-2 form submissions: ' + p2 + '.');
    if (p2 === 0) lines.push('(No Part-2 submissions yet.)');
    lines.push('Sunday check-ins: ' + sc + '.');
    if (sc === 0) lines.push('(No Sunday check-ins yet.)');
    lines.push('Pending sign-ups (awaiting approval): ' + pendSign + '.');
    lines.push('Approved users (can log in): ' + appUsers + '.');
    const [dailyCheckCount] = await queryAll("SELECT COUNT(*) as c FROM daily_checkins");
    const dcCount = num(dailyCheckCount?.c);
    lines.push('Daily check-ins (steps, water, protein, sleep): ' + dcCount + '.');

    const recentAudit = await queryAll("SELECT first_name, last_name, email, city, goals, status, created_at FROM audit_requests ORDER BY created_at DESC LIMIT 20");
    lines.push('\n--- RECENT AUDIT REQUESTS (latest first) ---');
    if (recentAudit && recentAudit.length > 0) {
      recentAudit.forEach(r => {
        lines.push(`  ${(r.first_name || '')} ${(r.last_name || '')} | ${r.email || ''} | ${r.city || ''} | status: ${r.status || 'pending'} | ${(r.goals || '').slice(0, 50)} | ${r.created_at || ''}`);
      });
    } else lines.push('  (None.)');

    const recentTribe = await queryAll("SELECT first_name, last_name, email, city, phase, start_date, activity_per_week, status FROM tribe_members ORDER BY start_date DESC LIMIT 20");
    lines.push('\n--- TRIBE MEMBERS ---');
    if (recentTribe && recentTribe.length > 0) {
      recentTribe.forEach(r => {
        lines.push(`  ${(r.first_name || '')} ${(r.last_name || '')} | ${r.email || ''} | ${r.city || ''} | Phase ${r.phase} | ${r.activity_per_week}x/week | ${r.status || 'active'} | start ${r.start_date || ''}`);
      });
    } else lines.push('  (None.)');

    const recentWorkouts = await queryAll("SELECT w.workout_name, w.duration_seconds, w.feedback, w.created_at, u.first_name, u.last_name FROM workout_logs w LEFT JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 15");
    lines.push('\n--- RECENT WORKOUT LOGS ---');
    if (recentWorkouts && recentWorkouts.length > 0) {
      recentWorkouts.forEach(r => {
        lines.push(`  ${(r.first_name || '')} ${(r.last_name || '')} | ${r.workout_name || ''} | ${r.duration_seconds || 0}s | ${(r.feedback || '').slice(0, 40)} | ${r.created_at || ''}`);
      });
    } else lines.push('  (None.)');

    const recentMessages = await queryAll("SELECT name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 12");
    lines.push('\n--- RECENT CONTACT MESSAGES ---');
    if (recentMessages && recentMessages.length > 0) {
      recentMessages.forEach(r => {
        const msgSnippet = (r.message || '').replace(/\s+/g, ' ').slice(0, 80);
        lines.push(`  ${r.name || ''} (${r.email || ''}): "${msgSnippet}" | ${r.created_at || ''}`);
      });
    } else lines.push('  (None.)');

    const recentMeetings = await queryAll("SELECT user_name, user_email, meeting_date, time_slot, status, created_at FROM meetings ORDER BY created_at DESC LIMIT 10");
    lines.push('\n--- MEETINGS ---');
    if (recentMeetings && recentMeetings.length > 0) {
      recentMeetings.forEach(r => {
        lines.push(`  ${r.user_name || ''} | ${r.user_email || ''} | ${r.meeting_date || ''} ${r.time_slot || ''} | ${r.status || ''} | ${r.created_at || ''}`);
      });
    } else lines.push('  (None.)');

    const recentPart2 = await queryAll("SELECT name, email, created_at FROM part2_audit ORDER BY created_at DESC LIMIT 10");
    lines.push('\n--- PART-2 SUBMISSIONS ---');
    if (recentPart2 && recentPart2.length > 0) {
      recentPart2.forEach(r => {
        lines.push(`  ${r.name || ''} | ${r.email || ''} | ${r.created_at || ''}`);
      });
    } else lines.push('  (None.)');

    const recentCheckins = await queryAll("SELECT full_name, reply_email, total_weight_loss, achievements, improve_next_week, created_at FROM sunday_checkins ORDER BY created_at DESC LIMIT 10");
    lines.push('\n--- SUNDAY CHECK-INS ---');
    if (recentCheckins && recentCheckins.length > 0) {
      recentCheckins.forEach(r => {
        lines.push(`  ${r.full_name || ''} | ${r.reply_email || ''} | weight: ${r.total_weight_loss || '-'} | ${(r.achievements || '').slice(0, 40)} | ${r.created_at || ''}`);
      });
    } else lines.push('  (None.)');

    const recentDailyCheckins = await queryAll("SELECT dc.checkin_date, dc.steps, dc.water_ml, dc.protein_g, dc.sleep_hours, dc.created_at, u.first_name, u.last_name, u.email FROM daily_checkins dc LEFT JOIN users u ON u.id = dc.user_id ORDER BY dc.checkin_date DESC, dc.created_at DESC LIMIT 15");
    lines.push('\n--- DAILY CHECK-INS (steps, water, protein, sleep) ---');
    if (recentDailyCheckins && recentDailyCheckins.length > 0) {
      recentDailyCheckins.forEach(r => {
        lines.push(`  ${(r.first_name || '')} ${(r.last_name || '')} | ${r.checkin_date || ''} | steps: ${r.steps ?? '-'} | water: ${r.water_ml ?? '-'} ml | protein: ${r.protein_g ?? '-'} g | sleep: ${r.sleep_hours ?? '-'} hrs | ${r.created_at || ''}`);
      });
    } else lines.push('  (None.)');

    const pendingSignupList = await queryAll("SELECT first_name, last_name, email, created_at FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status = 'pending') ORDER BY created_at DESC LIMIT 10");
    lines.push('\n--- PENDING SIGN-UPS (awaiting approval) ---');
    if (pendingSignupList && pendingSignupList.length > 0) {
      pendingSignupList.forEach(r => {
        lines.push(`  ${(r.first_name || '')} ${(r.last_name || '')} | ${r.email || ''} | ${r.created_at || ''}`);
      });
    } else lines.push('  (None.)');
  } catch (e) {
    lines.push('\n(Data fetch issue: ' + e.message + '. Still answer politely from the counts above if any.)');
  }
  lines.push('\n--- ADMIN ACTIONS (suggest these when relevant) ---');
  lines.push('The admin can: Approve or reject audit forms (Audit forms tab); Approve pending sign-ups (Pending Sign-ups tab); View and manage Tribe, Workouts, Messages & Meetings, Part-2 Form, Sunday Check-in; View Client Progress and share a progress report link with a client; Use Performance Insights for filters and CSV export. When data suggests follow-up (e.g. pending items, new messages, inactive users), suggest 1–3 concrete actions the admin can take in the dashboard.');

  return lines.join('\n');
}

const AI_SYSTEM_PROMPT = `You are the BodyBank Intelligence Engine - the coach's right hand. An elite, data-fluent AI that turns raw numbers into strategic insights. Your answers make admins sit up and take notice. No question goes unanswered.

PERSONALITY:
- Executive-level clarity. Lead with the headline, then back it up.
- Surprise the admin with insights they might have missed: trends, patterns, urgency, standout performers.
- Confident and decisive. Use specifics (names, numbers, dates) from the data.
- No fluff. Every sentence earns its place.

DATA SOURCES (all in LIVE DATABASE CONTEXT below):
- Audit Forms: Body audit submissions (fitness level, nutrition, lifestyle).
- Tribe Members: Active client profiles, goals, progress, sign-up dates.
- Sunday Check-ins: Weekly progress (weight, waist, training, nutrition, sleep, stress).
- Daily Check-ins: Steps, water, protein, sleep logs per client.
- Workouts: Logged sessions, duration, feedback.
- Part-2 Forms: Client questionnaire data.
- Messages & Meetings: Conversations and scheduled calls.
- Progress Reports: Weight, body fat %, strength, calories, macros over time.
- Pending sign-ups: Users awaiting approval.
Use this data ONLY. Never invent. Never say "I don't know" - always pull from the context or state exactly what is missing and which tab to check.

HOW TO ANSWER:
1. Answer the exact question first - direct, quantified, no hedging.
2. Always cite client name and date when referring to specific data.
3. Add one sharp insight or pattern. Flag issues: missed check-ins, declining metrics, low engagement.
4. Summaries: give key numbers plus one insight.
5. End with 1-3 concrete actions: which tab, what to do, and why it matters.
6. When data is zero or missing: state it clearly, explain the implication, and suggest the next step.

TONE:
- Professional and commanding. No "I think" or "maybe."
- Specific beats generic. "12 tribe members, 8 active" beats "You have some tribe members."
- Surface what matters: bottlenecks, wins, outliers, risks.

RULES:
1. All facts, numbers, and names must come from the context. Never fabricate.
2. Never return errors, raw JSON, or technical jargon to the admin.
3. Each question gets a distinct, tailored answer - never a generic copy-paste.
4. If the question is outside BodyBank data, steer back: suggest the relevant tab and invite questions about clients, sign-ups, check-ins, or activity.`;

async function callOpenAIChat(systemContext, userMessage) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey.trim()
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: 2000,
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT + '\n\n--- LIVE DATABASE CONTEXT ---\n' + systemContext },
        { role: 'user', content: userMessage }
      ]
    })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error('OpenAI: ' + (err || response.statusText));
  }
  const data = await response.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return content ? content.trim() : null;
}

function buildPoliteFallbackReply(context, question) {
  const q = (question || '').toLowerCase();
  let answer = '';
  const getCount = (regex) => { const m = context.match(regex); return m ? parseInt(m[1], 10) : 0; };
  const pendingAudit = getCount(/Pending:\s*(\d+)/);
  const pendingSignups = getCount(/Pending sign-ups[^:]*:\s*(\d+)/);
  const contactMsg = getCount(/Contact messages:\s*(\d+)/);
  const tribeTotal = getCount(/Tribe members:\s*(\d+)\s+total/);
  const workouts = getCount(/Workout logs:\s*(\d+)/);
  const sundayCheck = getCount(/Sunday check-ins:\s*(\d+)/);
  const act = getCount(/Active:\s*(\d+)/);
  const suggestActions = () => {
    const actions = [];
    if (pendingAudit > 0) actions.push('• Go to **Audit forms** and approve or reject the ' + pendingAudit + ' pending request(s).');
    if (pendingSignups > 0) actions.push('• Go to **Pending Sign-ups** and approve the ' + pendingSignups + ' user(s) so they can log in.');
    if (contactMsg > 0) actions.push('• Check **Messages & Meetings** for contact messages and follow up if needed.');
    if (actions.length === 0) actions.push('• Use the dashboard tabs to explore Tribe, Workouts, Client Progress, and Performance Insights.');
    return '\n\n**Suggested actions:**\n' + actions.join('\n');
  };
  if (/\bhow many\b.*pending|pending.*(audit|form)/.test(q)) {
    answer = pendingAudit === 0 ? 'There are no pending audit forms at the moment.' : 'You have ' + pendingAudit + ' pending audit form' + (pendingAudit === 1 ? '' : 's') + ' right now.';
    answer += suggestActions();
  } else if (/\bhow many\b.*tribe|tribe.*(member|active)/.test(q)) {
    answer = tribeTotal === 0 ? 'There are no tribe members yet.' : 'You have ' + tribeTotal + ' tribe member' + (tribeTotal === 1 ? '' : 's') + ' in total, ' + act + ' active.';
    answer += suggestActions();
  } else if (/\bhow many\b.*workout|workout.*log/.test(q)) {
    answer = workouts === 0 ? 'There are no workout logs yet.' : 'There are ' + workouts + ' workout log' + (workouts === 1 ? '' : 's') + ' in the database.';
    answer += suggestActions();
  } else if (/\bhow many\b.*(message|contact)/.test(q)) {
    answer = contactMsg === 0 ? 'There are no contact messages yet.' : 'You have ' + contactMsg + ' contact message' + (contactMsg === 1 ? '' : 's') + '.';
    answer += suggestActions();
  } else if (/\bhow many\b.*(sunday|check-in|checkin)/.test(q)) {
    answer = sundayCheck === 0 ? 'There are no Sunday check-ins yet.' : 'There are ' + sundayCheck + ' Sunday check-in' + (sundayCheck === 1 ? '' : 's') + '.';
    answer += suggestActions();
  } else if (/\bhow many\b.*(sign-up|signup|pending.*approval)/.test(q)) {
    answer = pendingSignups === 0 ? 'There are no pending sign-ups awaiting approval.' : 'There are ' + pendingSignups + ' pending sign-up' + (pendingSignups === 1 ? '' : 's') + ' awaiting approval.';
    answer += suggestActions();
  } else if (/\b(what should i do|what can i do|suggest|recommend|what to do)\b/.test(q) && !/\b(list|summarize|how many|who|recent|latest)\b/.test(q)) {
    answer = 'Based on your current data:' + suggestActions();
  } else if (/\bpart-?2|part2\b/.test(q)) {
    const p2 = getCount(/Part-2 form submissions:\s*(\d+)/);
    answer = p2 === 0 ? 'There are no Part-2 form submissions yet.' : 'There are ' + p2 + ' Part-2 form submission' + (p2 === 1 ? '' : 's') + '. See the Part-2 Form tab for details.';
    answer += suggestActions();
  } else if (/\bmeeting\b/.test(q)) {
    const meet = getCount(/Meetings:\s*(\d+)\s+total/);
    answer = meet === 0 ? 'There are no meetings yet.' : 'There are ' + meet + ' meeting' + (meet === 1 ? '' : 's') + ' in total. See Messages & Meetings tab for details.';
    answer += suggestActions();
  } else if (/\b(summarize|list|who|recent|latest)\b.*\b(tribe|member)\b|\b(tribe|member)\b.*\b(summarize|list|who|recent)\b/.test(q)) {
    answer = tribeTotal === 0 ? 'There are no tribe members yet.' : 'You have ' + tribeTotal + ' tribe member' + (tribeTotal === 1 ? '' : 's') + ' (' + act + ' active). Check the Tribe tab for names and details.';
    answer += suggestActions();
  } else if (/\b(summarize|list|recent)\b.*\b(audit|request|form)\b|\b(audit|request)\b.*\b(summarize|list|recent)\b/.test(q)) {
    answer = pendingAudit > 0 ? 'You have ' + pendingAudit + ' pending audit form' + (pendingAudit === 1 ? '' : 's') + '. Open the Audit forms tab to review and approve or reject.' : 'No pending audit forms right now. Total audit forms are in the Audit forms tab.';
    answer += suggestActions();
  } else if (/\b(summarize|list|recent)\b.*\b(workout|exercise)\b|\b(workout|exercise)\b.*\b(summarize|list|recent)\b/.test(q)) {
    answer = workouts === 0 ? 'There are no workout logs yet.' : 'There are ' + workouts + ' workout log' + (workouts === 1 ? '' : 's') + '. See the Workouts tab for details.';
    answer += suggestActions();
  } else if (/\b(summarize|list|recent)\b.*\b(message|contact)\b|\b(message|contact)\b.*\b(summarize|list|recent)\b/.test(q)) {
    answer = contactMsg === 0 ? 'There are no contact messages yet.' : 'You have ' + contactMsg + ' contact message' + (contactMsg === 1 ? '' : 's') + '. See Messages & Meetings tab to read them.';
    answer += suggestActions();
  } else if (/\bwho\b.*\b(pending|sign-up|signup)\b|\b(pending|sign-up)\b.*\bwho\b/.test(q)) {
    answer = pendingSignups === 0 ? 'No one is pending approval right now.' : 'There are ' + pendingSignups + ' pending sign-up' + (pendingSignups === 1 ? '' : 's') + ' awaiting approval. Open the Pending Sign-ups tab to see names and approve them.';
    answer += suggestActions();
  } else {
    answer = 'Here’s a snapshot of your current data:\n\n' + context.split('---').slice(0, 3).join('---').trim() + '\n\nIf you’d like answers to specific questions (e.g. “How many pending forms?”). For AI answers to any question, set OPENAI_API_KEY in .env and restart.';
  }
  return answer;
}

app.post('/api/admin/ai-assist', verifyToken, requireAdmin, async (req, res) => {
  let reply = '';
  try {
    const { message } = req.body || {};
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) {
      reply = 'Please ask a question about your BodyBank data (e.g. “How many pending audit forms?” or “Summarize tribe members”).';
      return res.json({ reply });
    }

    const context = await getAdminAIContext();
    const hasOpenAI = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());

    if (hasOpenAI) {
      reply = await callOpenAIChat(context, text);
    }
    if (reply == null || reply === '') {
      reply = hasOpenAI ? 'I could not generate an answer right now. Please try again in a moment.' : 'To get answers to your questions (like ChatGPT, using your live data), add OPENAI_API_KEY to the server .env file and restart. Until then I cannot answer questions.';
    }
    return res.json({ reply });
  } catch (e) {
    console.error('[admin ai-assist]', e.message);
    reply = 'I couldn’t look up the data right now. Please try again in a moment, or check the dashboard directly.';
    return res.json({ reply });
  }
});

// ============ CLIENT PROGRESS ANALYTICS (JWT-protected) ============
app.use('/api/progress', progressRoutes);
app.get('/api/admin/user-progress/:userId', (req, res, next) => {
  if (NODE_ENV === 'development' && (!req.headers.authorization || !String(req.headers.authorization).startsWith('Bearer '))) {
    return progressService.getAdminUserProgress(req.params.userId)
      .then((data) => res.json(data))
      .catch((e) => { console.error('[admin user-progress]', e.message); res.status(500).json({ error: e.message }); });
  }
  next();
}, verifyToken, requireAdmin, (req, res) => {
  getAdminUserProgress(req, res).catch((e) => {
    console.error('[admin user-progress]', e.message);
    res.status(500).json({ error: e.message });
  });
});

// Progress report: shareable link (token in query – no login required)
app.get('/api/progress-report', async (req, res) => {
  try {
    const token = req.query.token || req.query.t;
    const userId = verifyProgressReportToken(token);
    if (!userId) return res.status(401).json({ error: 'Invalid or expired link' });
    const data = await progressService.getAdminUserProgress(userId);
    res.json(data);
  } catch (e) {
    console.error('[progress-report]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Admin: get shareable progress report link for a user
app.get('/api/admin/progress-report-link/:userId', verifyToken, requireAdmin, (req, res) => {
  try {
    const userId = req.params.userId;
    const token = signProgressReportToken(userId);
    const baseUrl = (req.protocol + '://' + req.get('host')).replace(/\/$/, '');
    const url = baseUrl + '/progress-report.html?t=' + encodeURIComponent(token);
    res.json({ url, token });
  } catch (e) {
    console.error('[progress-report-link]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ SUPERADMIN: DASHBOARD DATA (single payload with filters) ============
async function getSuperadminDashboardData(filters = {}) {
  const { from: dateFrom, to: dateTo, user_id: filterUserId } = filters;
  const hasDate = dateFrom || dateTo;
  const dateParams = [dateFrom, dateTo].filter(Boolean);
  const num = (v) => (v === undefined || v === null ? 0 : parseInt(String(v), 10) || 0);

  const addDateAndUser = (sql, dateCol, userCol) => {
    const conditions = [];
    const params = [];
    if (dateFrom && dateCol) { conditions.push(`date(${dateCol}) >= date(?)`); params.push(dateFrom); }
    if (dateTo && dateCol) { conditions.push(`date(${dateCol}) <= date(?)`); params.push(dateTo); }
    if (filterUserId && userCol) { conditions.push(`${userCol} = ?`); params.push(filterUserId); }
    if (conditions.length === 0) return { sql, params: [] };
    const where = sql.toLowerCase().includes(' where ') ? ' AND ' : ' WHERE ';
    return { sql: sql + where + conditions.join(' AND '), params };
  };

  const [pendingReq] = await queryAll("SELECT COUNT(*) as c FROM audit_requests WHERE status='pending'");
  const [auditTotal] = await queryAll("SELECT COUNT(*) as c FROM audit_requests");
  const [tribeTotal] = await queryAll("SELECT COUNT(*) as c FROM tribe_members");
  const [tribeActive] = await queryAll("SELECT COUNT(*) as c FROM tribe_members WHERE status='active'");
  const [workoutsCount] = await queryAll("SELECT COUNT(*) as c FROM workout_logs");
  const [part2Count] = await queryAll("SELECT COUNT(*) as c FROM part2_audit");
  const [sundayCount] = await queryAll("SELECT COUNT(*) as c FROM sunday_checkins");
  const [messagesCount] = await queryAll("SELECT COUNT(*) as c FROM contact_messages");
  const [meetingsCount] = await queryAll("SELECT COUNT(*) as c FROM meetings");
  const [signupsPending] = await queryAll("SELECT COUNT(*) as c FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status = 'pending')");
  const [usersApproved] = await queryAll("SELECT COUNT(*) as c FROM users WHERE role='user' AND (approval_status = 'approved' OR approval_status IS NULL)");

  const stats = {
    pending_requests: num(pendingReq?.c),
    audit_total: num(auditTotal?.c),
    tribe_total: num(tribeTotal?.c),
    tribe_active: num(tribeActive?.c),
    workouts: num(workoutsCount?.c),
    part2: num(part2Count?.c),
    sunday_checkins: num(sundayCount?.c),
    messages: num(messagesCount?.c),
    meetings: num(meetingsCount?.c),
    pending_signups: num(signupsPending?.c),
    approved_users: num(usersApproved?.c)
  };

  let audit = await queryAll("SELECT id, first_name, last_name, email, city, goals, status, created_at FROM audit_requests ORDER BY created_at DESC LIMIT 200");
  let part2 = await queryAll("SELECT id, name, email, mobile, activity_level, created_at FROM part2_audit ORDER BY created_at DESC LIMIT 200");
  let sunday_checkins = await queryAll("SELECT id, full_name, reply_email, total_weight_loss, achievements, created_at FROM sunday_checkins ORDER BY created_at DESC LIMIT 200");
  let users = await queryAll("SELECT id, first_name, last_name, email, approval_status, created_at FROM users WHERE role='user' ORDER BY created_at DESC LIMIT 300");
  let workouts = await queryAll("SELECT w.id, w.user_id, w.workout_name, w.duration_seconds, w.feedback, w.created_at, u.first_name, u.last_name FROM workout_logs w LEFT JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 200");
  let tribe = await queryAll("SELECT id, first_name, last_name, email, city, phase, start_date, activity_per_week, status FROM tribe_members ORDER BY start_date DESC LIMIT 200");
  let meetings = await queryAll("SELECT id, user_id, user_name, user_email, meeting_date, time_slot, status, created_at FROM meetings ORDER BY created_at DESC LIMIT 200");
  let messages = await queryAll("SELECT id, user_id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 200");

  if (hasDate || filterUserId) {
    const filterByDate = (rows, dateKey) => {
      if (!hasDate) return filterUserId ? rows.filter(r => r.user_id === filterUserId) : rows;
      return rows.filter(r => {
        const d = (r[dateKey] || r.created_at || '').toString().slice(0, 10);
        const okDate = (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
        const okUser = !filterUserId || r.user_id === filterUserId;
        return okDate && okUser;
      });
    };
    audit = filterByDate(audit, 'created_at');
    part2 = filterByDate(part2, 'created_at');
    sunday_checkins = filterByDate(sunday_checkins, 'created_at');
    workouts = filterByDate(workouts, 'created_at');
    meetings = filterByDate(meetings, 'created_at');
    messages = filterByDate(messages, 'created_at');
    if (filterUserId) users = users.filter(r => r.id === filterUserId);
  }

  const performance = { ...stats };

  return {
    stats,
    performance,
    audit,
    part2,
    sunday_checkins,
    users,
    workouts,
    tribe,
    meetings,
    messages,
    filters: { from: dateFrom || null, to: dateTo || null, user_id: filterUserId || null }
  };
}

app.get('/api/superadmin/dashboard', verifyToken, requireSuperadmin, async (req, res) => {
  try {
    const from = req.query.from || null;
    const to = req.query.to || null;
    const user_id = req.query.user_id || null;
    const data = await getSuperadminDashboardData({ from, to, user_id });
    res.json(data);
  } catch (e) {
    console.error('[superadmin dashboard]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/superadmin/share-link', verifyToken, requireSuperadmin, async (req, res) => {
  try {
    const { from, to, user_id } = req.body || {};
    const token = signShareToken({ from: from || null, to: to || null, user_id: user_id || null });
    const baseUrl = (process.env.PUBLIC_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    const url = baseUrl + '/index.html?superadmin_share=' + encodeURIComponent(token);
    res.json({ url, token });
  } catch (e) {
    console.error('[superadmin share-link]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// One-time bootstrap: sync superadmin from env. Call once after deploy, then remove SUPERADMIN_BOOTSTRAP_SECRET from env.
app.get('/api/superadmin/bootstrap', async (req, res) => {
  try {
    const secret = req.query.secret || req.headers['x-bootstrap-secret'] || '';
    const expected = process.env.SUPERADMIN_BOOTSTRAP_SECRET || '';
    if (!expected || secret !== expected) {
      return res.status(404).json({ error: 'Not found' });
    }
    const superadminEmailNorm = String(SUPERADMIN_EMAIL || '').trim().toLowerCase();
    const superadminPassTrimmed = String(SUPERADMIN_PASS || '').trim();
    if (!superadminEmailNorm || !superadminPassTrimmed) {
      return res.status(400).json({ error: 'Set SUPERADMIN_EMAIL and SUPERADMIN_PASS in environment' });
    }
    await runSuperadminSync();
    return res.json({ ok: true, message: 'Superadmin synced. You can now log in with ' + SUPERADMIN_EMAIL });
  } catch (e) {
    console.error('[superadmin bootstrap]', e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/superadmin/shared', async (req, res) => {
  try {
    const token = req.query.t || req.query.token || null;
    const decoded = verifyShareToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid or expired share link' });
    const data = await getSuperadminDashboardData({
      from: decoded.from || null,
      to: decoded.to || null,
      user_id: decoded.user_id || null
    });
    res.json(data);
  } catch (e) {
    console.error('[superadmin shared]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ CRON ENDPOINT (must be before catch-all) ============
// External services (cron-job.org, UptimeRobot) call this to wake server and process scheduled messages.
app.get('/api/cron/process-scheduled-messages', async (req, res) => {
  const secret = (req.query.secret || req.headers['x-cron-secret'] || '').trim();
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const result = await processScheduledMessages();
    res.json({ ok: true, message: 'Scheduled messages job completed', processed: result.processed, failed: result.failed });
  } catch (e) {
    console.error('Cron process-scheduled-messages error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ SERVE FRONTEND ============
// PWA: serve service worker and manifest with no-cache so updates apply quickly
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});
app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});
// Serve index.html with no-cache so users get latest UI after deploys
app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: NODE_ENV === 'production' ? '7d' : 0
}));
app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  if (err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ============ SCHEDULED MESSAGES BACKGROUND JOB ============
async function processScheduledMessages() {
  const result = { processed: 0, failed: 0 };
  try {
    // Use DB NOW() to avoid Node/DB clock skew; include 2-min buffer for cron drift
    const rows = await queryAll(
      "SELECT id, admin_id, user_id, message_body, thread_id FROM scheduled_messages WHERE status = 'pending' AND scheduled_at <= (NOW() + INTERVAL '2 minutes') ORDER BY scheduled_at ASC LIMIT 50"
    );
    if (rows.length === 0) {
      const pending = await queryAll("SELECT COUNT(*) as n FROM scheduled_messages WHERE status = 'pending'");
      const n = (pending[0] && Number(pending[0].n)) || 0;
      if (n > 0) {
        const next = await queryAll("SELECT id, user_id, scheduled_at FROM scheduled_messages WHERE status = 'pending' ORDER BY scheduled_at ASC LIMIT 3");
        console.log(`[ScheduledMessages] No messages due yet. Pending: ${n}. Next:`, next.map(r => ({ id: r.id, user_id: r.user_id, at: r.scheduled_at })));
      }
    } else {
      console.log(`[ScheduledMessages] Processing ${rows.length} due message(s)`);
    }
    for (const row of rows) {
      try {
        let threadId = row.thread_id;
        if (!threadId) {
          const thread = await queryOne('SELECT id FROM message_threads WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1', [row.user_id]);
          if (!thread) {
            threadId = uuidv4();
            await run('INSERT INTO message_threads (id, user_id, subject) VALUES (?, ?, ?)', [threadId, row.user_id, '']);
          } else {
            threadId = thread.id;
          }
          await run('UPDATE scheduled_messages SET thread_id = ? WHERE id = ?', [threadId, row.id]);
        }
        const msgId = uuidv4();
        await run(
          'INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body) VALUES (?, ?, ?, ?, ?)',
          [msgId, threadId, row.admin_id, 'admin', (row.message_body || '').slice(0, 5000)]
        );
        await run('UPDATE message_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [threadId]);
        await run('UPDATE scheduled_messages SET status = ? WHERE id = ?', ['sent', row.id]);
        sendPushToUser(row.user_id, JSON.stringify({ type: 'coach_reply', title: 'Lifestyle Manager', body: (row.message_body || '').slice(0, 100) })).catch(() => {});
        console.log(`[ScheduledMessages] Sent message ${row.id} to user ${row.user_id}`);
        result.processed++;
      } catch (err) {
        console.error('[ScheduledMessages] Send error:', row?.id, err.message);
        await run('UPDATE scheduled_messages SET status = ? WHERE id = ?', ['failed', row.id]).catch(() => {});
        result.failed++;
      }
    }
  } catch (e) {
    console.error('processScheduledMessages error:', e.message);
  }
  return result;
}

// ============ START ============
initDB().then(() => {
  setInterval(processScheduledMessages, 30 * 1000); // every 30 sec
  processScheduledMessages();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🏋️ BodyBank Server running on port ${PORT}`);
    console.log(`📧 Admin: ${ADMIN_EMAIL}`);
    console.log(`👔 Superadmin: ${SUPERADMIN_EMAIL}`);
    console.log(`🌍 Environment: ${NODE_ENV}\n`);
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
