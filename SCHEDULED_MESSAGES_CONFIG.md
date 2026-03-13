# Scheduled Messages Config

**Timezone:** All scheduled messages use **IST (India)**. Admin sets date/time in IST; messages are sent at that IST time.

**Sending:** Scheduled messages are sent by the server every 30 seconds when it is running. Use the admin dashboard to create and schedule messages.

---

## Part 1: VAPID Keys (Required for Push Notifications)

Without VAPID keys, **in-app messages still work** but users get **no push** when the app is closed.

### Step 1: Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

### Step 2: Add to Render (or .env locally)

**Render:** Dashboard → your Web Service → Environment

- `VAPID_PUBLIC_KEY` = the Public Key
- `VAPID_PRIVATE_KEY` = the Private Key

Save and redeploy.

### Step 3: Verify

1. Log in as a **user** (not admin)
2. Click **Enable notifications**
3. If it says "Enabled" → Push is configured

---

## Part 2: User Must Enable Notifications

Each **user** must opt in to push:

1. User logs in on their device (HTTPS required)
2. Clicks **Enable notifications**
3. Accepts the browser permission prompt

Without this, the user will **not** receive push notifications. They will still see messages in the Messages tab when they open the app.

---

## Quick Checklist

- [ ] `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Render env (for push)
- [ ] User has clicked **Enable notifications** in the app (HTTPS)
- [ ] Admin creates scheduled messages from dashboard; server sends them every 30 sec when running
