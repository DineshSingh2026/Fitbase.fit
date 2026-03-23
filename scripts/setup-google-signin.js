#!/usr/bin/env node
/**
 * Setup Google Sign-In: ensures .env exists, opens Google Console, optionally updates GOOGLE_CLIENT_ID.
 * Run: npm run setup:google
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');
const GOOGLE_CONSOLE_URL = 'https://console.cloud.google.com/apis/credentials';

function openUrl(url) {
  const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  require('child_process').exec(`${start} "${url}"`);
}

function ensureEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    if (fs.existsSync(ENV_EXAMPLE)) {
      fs.copyFileSync(ENV_EXAMPLE, ENV_PATH);
      console.log('Created .env from .env.example');
    } else {
      console.error('.env.example not found');
      process.exit(1);
    }
  }
}

function getGoogleClientId() {
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const m = content.match(/GOOGLE_CLIENT_ID=(.+)/);
  return m ? m[1].trim() : '';
}

function isPlaceholder(val) {
  return !val || val.startsWith('YOUR_') || val.includes('your_client_id') || val.includes('your_id');
}

function updateGoogleClientId(clientId) {
  let content = fs.readFileSync(ENV_PATH, 'utf8');
  content = content.replace(/GOOGLE_CLIENT_ID=.+/, `GOOGLE_CLIENT_ID=${clientId}`);
  fs.writeFileSync(ENV_PATH, content);
}

async function main() {
  console.log('\n=== Google Sign-In Setup ===\n');
  ensureEnv();

  const current = getGoogleClientId();
  if (!isPlaceholder(current)) {
    console.log('GOOGLE_CLIENT_ID is already set in .env');
    console.log('Restart the server (npm start) and test Sign-up with Google.\n');
    console.log('For production: add GOOGLE_CLIENT_ID to Render Environment (you\'ll do that).\n');
    return;
  }

  console.log('1. Opening Google Cloud Console...');
  openUrl(GOOGLE_CONSOLE_URL);

  console.log('\n2. In Google Console:');
  console.log('   - Create Credentials → OAuth client ID');
  console.log('   - Application type: Web application');
  console.log('   - Authorized JavaScript origins: http://localhost:3000 and your live URL (e.g. https://fitbase-fit.onrender.com)');
  console.log('   - Copy the Client ID (xxxxx.apps.googleusercontent.com)\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((r) => rl.question(q, r));

  const clientId = await ask('3. Paste your Client ID here (or press Enter to skip and edit .env manually): ');
  rl.close();

  if (clientId && clientId.trim()) {
    const trimmed = clientId.trim();
    if (trimmed.endsWith('.apps.googleusercontent.com')) {
      updateGoogleClientId(trimmed);
      console.log('\nUpdated .env with GOOGLE_CLIENT_ID');
    } else {
      console.log('\nInvalid format. Edit .env manually and set GOOGLE_CLIENT_ID=your_id.apps.googleusercontent.com');
    }
  } else {
    console.log('\nEdit .env and set GOOGLE_CLIENT_ID=your_id.apps.googleusercontent.com');
  }

  console.log('\n4. Restart the server: Ctrl+C, then npm start');
  console.log('5. Render: Add GOOGLE_CLIENT_ID to Environment (you\'ll do that)\n');
}

main().catch(console.error);
