#!/usr/bin/env node
/**
 * Seed scheduled messages for Indian clients (IST).
 * Weekly schedule: Sunday–Saturday at specified IST times.
 * Run: node scripts/seed-indian-client-messages.js [weeksAhead]
 * Default: schedules for the next 1 week. Use weeksAhead=2 to schedule 2 weeks, etc.
 */
require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/bodybank';

// Day 0=Sunday, 1=Monday, ... 6=Saturday. Time in "HH:MM" 24h IST. Message text.
const SCHEDULE = [
  { day: 0, time: '09:00', msg: 'Sunday CHECK-IN today' },
  { day: 0, time: '11:00', msg: 'Drink ORS / Hydrate well' },
  { day: 0, time: '16:00', msg: 'Eat good protein today' },
  { day: 0, time: '21:30', msg: "Let's win this week!" },
  { day: 1, time: '09:00', msg: "Let's win this week!" },
  { day: 1, time: '12:00', msg: 'Hydrate well!' },
  { day: 1, time: '16:30', msg: 'Chew snacks well!' },
  { day: 1, time: '21:00', msg: 'How many steps so far?' },
  { day: 2, time: '09:00', msg: 'Use time well and stay active.' },
  { day: 2, time: '12:00', msg: 'Chew food well!' },
  { day: 2, time: '20:00', msg: 'Hydration good so far?' },
  { day: 3, time: '09:00', msg: "I hope you're not skipping meals" },
  { day: 3, time: '12:00', msg: 'Take tiny breathing breaks!' },
  { day: 3, time: '20:00', msg: "How's it going so far?" },
  { day: 4, time: '10:00', msg: 'I hope digestion is going well!' },
  { day: 4, time: '13:00', msg: 'How have your energy levels been so far?' },
  { day: 4, time: '22:00', msg: 'Go to bed early.' },
  { day: 5, time: '11:00', msg: "How're you feeling mentally?" },
  { day: 5, time: '18:00', msg: "Take care of food, be careful as it's the weekend!" },
  { day: 6, time: '11:00', msg: 'Hydrate well, drink ORS!' },
  { day: 6, time: '16:00', msg: "Don't forget to carry your snack if you're heading out!" },
  { day: 6, time: '19:30', msg: 'Sunday CHECK-In tomorrow morning don\'t forget!' },
];

function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Build ISO timestamp for date (YYYY-MM-DD) + time (HH:MM) in IST. Returns ISO string for DB. */
function istToUTC(dateStr, timeHHMM) {
  const [hh, mm] = timeHHMM.split(':').map(Number);
  const d = new Date(dateStr + 'T' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00+05:30');
  return d.toISOString();
}

async function main() {
  const weeksAhead = parseInt(process.argv[2] || '1', 10) || 1;
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.error('PostgreSQL connection failed. Set DATABASE_URL in .env.');
    process.exit(1);
  }

  const run = async (sql, params) => pool.query(toPg(sql), params);
  const queryAll = async (sql, params) => (await pool.query(toPg(sql), params)).rows;
  const queryOne = async (sql, params) => {
    const rows = await queryAll(sql, params);
    return rows[0] || null;
  };

  const admin = await queryOne("SELECT id FROM users WHERE role IN ('admin','superadmin') ORDER BY role LIMIT 1");
  if (!admin) {
    console.error('No admin user found.');
    await pool.end();
    process.exit(1);
  }
  const adminId = admin.id;

  const users = await queryAll(
    "SELECT id FROM users WHERE role = 'user' AND (approval_status = 'approved' OR approval_status IS NULL)"
  );
  if (users.length === 0) {
    console.log('No approved users. Scheduling messages anyway (they will be created per-user when users exist).');
  }

  const userIds = users.map((u) => u.id);
  const today = new Date();
  const dayOfWeek = today.getUTCDay();
  const daysUntilNextSunday = dayOfWeek === 0 ? 7 : (7 - dayOfWeek) % 7;
  const nextSunday = new Date(today);
  nextSunday.setUTCDate(today.getUTCDate() + daysUntilNextSunday);
  nextSunday.setUTCHours(0, 0, 0, 0);
  let inserted = 0;

  for (let w = 0; w < weeksAhead; w++) {
    const weekStart = new Date(nextSunday);
    weekStart.setUTCDate(nextSunday.getUTCDate() + w * 7);

    for (const s of SCHEDULE) {
      const date = new Date(weekStart);
      date.setUTCDate(weekStart.getUTCDate() + s.day);
      const dateStr = date.toISOString().slice(0, 10);
      const scheduledAt = istToUTC(dateStr, s.time);

      for (const uid of userIds) {
        const id = uuidv4();
        await run(
          'INSERT INTO scheduled_messages (id, admin_id, user_id, message_body, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?)',
          [id, adminId, uid, s.msg, scheduledAt, 'pending']
        );
        inserted++;
      }
    }
  }

  console.log(`✅ Inserted ${inserted} scheduled messages for ${userIds.length} user(s) over ${weeksAhead} week(s).`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
