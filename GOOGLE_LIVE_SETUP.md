# Google Sign-In — Live Setup Checklist

**Quick start:** Run `npm run setup:google` — it opens Google Console and guides you through local setup.  
You handle Render configuration.

---

## Step 1: Create OAuth Client in Google Cloud

1. Go to **[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)**
2. Create or select a project (e.g. "FitBase")
3. Click **Create Credentials** → **OAuth client ID**
4. If prompted, configure the OAuth consent screen:
   - User type: **External** (for public users)
   - App name: **FitBase**
   - Add your support email
   - Save
5. Back at **Create OAuth client ID**:
   - Application type: **Web application**
   - Name: e.g. "FitBase Web"
6. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (for local dev)
   - `https://your-app.onrender.com` (or your live URL, e.g. `https://fitbase.fit`)
7. Under **Authorized redirect URIs** (if shown): leave empty for Google Sign-In (One Tap)
8. Click **Create** and copy the **Client ID** (format: `xxxxx.apps.googleusercontent.com`)

---

## Step 2: Configure Local (.env)

1. In project root, copy `.env.example` to `.env` if you don't have one:
   ```bash
   copy .env.example .env
   ```
2. Open `.env` and set:
   ```env
   GOOGLE_CLIENT_ID=your_actual_client_id.apps.googleusercontent.com
   ```
3. Save the file
4. Restart the server: stop with `Ctrl+C`, then run `npm start`

---

## Step 3: Configure Production (Render) — *You do this*

1. In **Render Dashboard** → your **fitbase-fit** service → **Environment**
2. Add or edit:
   - `GOOGLE_CLIENT_ID` = your Client ID (same as local)
3. Ensure your **live URL** is in Google Console’s **Authorized JavaScript origins** (Step 1.6)
4. Save — Render will redeploy automatically

---

## Verify

- **Local:** Open signup modal → click "Sign-up with Google" → Google sign-in should open (no "Setup Required" popup)
- **Live:** Same flow on your production URL

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Setup Required" popup | `GOOGLE_CLIENT_ID` not set or still placeholder; restart server |
| "redirect_uri_mismatch" | Add your exact origin (e.g. `https://fitbase-fit.onrender.com`) to Authorized JavaScript origins |
| Button hidden on live | Remove localhost-only visibility; ensure `GOOGLE_CLIENT_ID` is set in Render env |
