# Exact Config: User Getting Scheduled Messages

**Timezone:** All scheduled messages use **IST (India)**. Admin sets date/time in IST; messages are sent at that IST time.

**Quick setup:** Run `node scripts/render-env-print.js` to print env vars and cron URLs for Render. Copy them to Render Dashboard → Environment, then add the two cron URLs to cron-job.org.

---

Users receive scheduled messages in **two ways**:
1. **In-app** – Message appears in the Messages tab (always works if cron runs)
2. **Push notification** – Notification when app is closed (requires setup below)

If users are **not getting messages at all**, follow this exact config.

---

## Part 1: VAPID Keys (Required for Push Notifications)

Without VAPID keys, **in-app messages still work** but users get **no push** when the app is closed.

### Step 1: Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

You'll get output like:
```
Public Key: BNxxx...
Private Key: yyy...
```

### Step 2: Add to Render (or .env locally)

**Render:** Dashboard → your Web Service → Environment

Add these variables:
- `VAPID_PUBLIC_KEY` = the Public Key (full string)
- `VAPID_PRIVATE_KEY` = the Private Key (full string)

Save and redeploy.

### Step 3: Verify

1. Open your app in a browser (HTTPS required for push)
2. Log in as a **user** (not admin)
3. Click **Enable notifications** (on the home screen or in settings)
4. If it says "Setup required" → VAPID keys are still missing or wrong
5. If it says "Enabled" → Push is configured

---

## Part 2: Cron Jobs (Required for Messages to Send)

On Render free tier, the server sleeps. cron-job.org pings your URLs to wake it and run the job.

### Step 1: Create CRON_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (e.g. `a1b2c3d4e5f6...`).

### Step 2: Add CRON_SECRET to Render

**Render:** Dashboard → Web Service → Environment

- `CRON_SECRET` = the hex string from Step 1

Save and redeploy.

### Step 3: Create cron jobs on cron-job.org

1. Go to https://cron-job.org and sign up / log in
2. **Create two cron jobs** with these exact settings:

#### Cron Job 1: Scheduled Messages

| Field | Value |
|-------|-------|
| **Title** | BodyBank – Scheduled messages |
| **URL** | `https://bodybank-fit.onrender.com/api/cron/process-scheduled-messages?secret=YOUR_CRON_SECRET` |
| **Replace** | `YOUR_CRON_SECRET` with the value from Part 2 Step 1 |
| **Schedule** | Every 5 minutes (or "*/5 * * * *") |
| **Request timeout** | 90 seconds (important: Render cold start can take 30–60 sec) |

#### Cron Job 2: Streak Reminders (optional)

| Field | Value |
|-------|-------|
| **Title** | BodyBank – Streak reminder |
| **URL** | `https://bodybank-fit.onrender.com/api/cron/streak-reminder?secret=YOUR_CRON_SECRET` |
| **Schedule** | Daily at 6:00 PM (or your preferred evening time) |
| **Request timeout** | 90 seconds |

4. Save both jobs.

---

## Part 3: User Must Enable Notifications

Each **user** must opt in to push:

1. User logs in on their device (phone or desktop)
2. Uses **HTTPS** (not http://localhost unless testing locally)
3. Clicks **Enable notifications** when prompted
4. Accepts the browser/permission prompt

Without this, the user has no row in `push_subscriptions` and will **not** receive push. They will still see messages in the Messages tab when they open the app.

---

## Part 4: How to Verify It Works

### Check cron is running

1. Go to cron-job.org → your job → **Last Events**
2. Click **Details** on the latest run
3. Response body should show: `{"ok":true,"processed":N,"failed":0}`

### Check Render logs

1. Render Dashboard → your Web Service → **Logs**
2. When cron runs you should see one of:
   - `[ScheduledMessages] Processing X due message(s)` – messages were sent
   - `[ScheduledMessages] No messages due yet. Pending: N` – no messages were due
3. If push fails, you'll see:
   - `[Push] No subscriptions for user X` → User hasn't enabled notifications
   - `[Push] Skipped: VAPID keys not configured` → Add VAPID keys
   - `[Push] Send failed for user X: ...` → Subscription may be expired

### Test end-to-end

1. As **admin**, create a scheduled message for a user, set time 2–3 minutes from now
2. As that **user**, make sure they've clicked **Enable notifications**
3. Wait for the scheduled time (cron runs every 5 min, so allow up to 5 min after scheduled time)
4. User should see the message in **Messages** tab, and get a push if app is in background

---

## Quick Checklist

- [ ] `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Render env
- [ ] `CRON_SECRET` in Render env
- [ ] Cron job 1: `process-scheduled-messages` every 5 min, 90s timeout
- [ ] Cron job 2 (optional): `streak-reminder` daily
- [ ] User has clicked **Enable notifications** in the app (HTTPS)
- [ ] App URL uses **HTTPS** (push requires secure context)
