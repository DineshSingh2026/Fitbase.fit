# Final Steps — What You Need to Configure

Everything in the codebase is ready. You only need to do these **2 things**:

---

## 1. Google Cloud Console (browser should have opened)

1. **Create OAuth client**
   - Click **Create Credentials** → **OAuth client ID**
   - If asked, configure OAuth consent screen first (External, app name: FitBase, support email)
   - Application type: **Web application**
   - Name: e.g. "FitBase Web"

2. **Add Authorized JavaScript origins**
   - `http://localhost:3000`
   - `https://fitbase-fit.onrender.com` (or your actual live URL)

3. **Copy the Client ID** (looks like `123456-abc.apps.googleusercontent.com`)

4. **Add it to your project**
   - Open `.env` in the project root
   - Set: `GOOGLE_CLIENT_ID=paste_your_client_id_here.apps.googleusercontent.com`
   - Save

5. **Restart the server:** `Ctrl+C`, then `npm start`

---

## 2. Render (when you deploy)

1. Go to **Render Dashboard** → your **fitbase-fit** service → **Environment**
2. Add: `GOOGLE_CLIENT_ID` = (same Client ID as above)
3. Save — Render will redeploy

---

**That’s it.** After that, Sign-up with Google will work locally and in production.
