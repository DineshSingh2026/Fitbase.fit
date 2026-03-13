/**
 * Print env values needed for Render. Run: node scripts/render-env-print.js
 * Copy the output and add to Render Dashboard → Environment.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim();

console.log('\n=== Add these to Render → Environment ===\n');
if (VAPID_PUBLIC) console.log('VAPID_PUBLIC_KEY=' + VAPID_PUBLIC);
else console.log('# VAPID_PUBLIC_KEY=(run: npx web-push generate-vapid-keys)');
if (VAPID_PRIVATE) console.log('VAPID_PRIVATE_KEY=' + VAPID_PRIVATE);
else console.log('# VAPID_PRIVATE_KEY=(run: npx web-push generate-vapid-keys)');
console.log('');
