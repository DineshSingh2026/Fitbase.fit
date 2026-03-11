#!/usr/bin/env node
/**
 * Pings the scheduled-messages cron endpoint to wake the server and process any due messages.
 * Used by Render Cron Job. Requires CRON_SECRET and APP_URL (default: bodybank-fit.onrender.com) in env.
 */
const secret = process.env.CRON_SECRET || '';
const baseUrl = process.env.APP_URL || 'bodybank-fit.onrender.com';
const url = `https://${baseUrl.replace(/^https?:\/\//, '')}/api/cron/process-scheduled-messages?secret=${encodeURIComponent(secret)}`;

require('https').get(url, (res) => {
  const ok = res.statusCode >= 200 && res.statusCode < 300;
  if (!ok) console.error('Cron ping failed:', res.statusCode);
  process.exit(ok ? 0 : 1);
}).on('error', (err) => {
  console.error('Cron ping error:', err.message);
  process.exit(1);
});
