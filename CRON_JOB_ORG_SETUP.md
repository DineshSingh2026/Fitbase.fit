# Scheduled Messages – Use cron-job.org (No Render Cron)

Render cron keeps failing. Use **cron-job.org** instead – it just pings your URL; no code runs on Render.

## 1. Add CRON_SECRET to Render web service (if not already set)

Render Dashboard → **bodybank-fit** (web service) → Environment → Add `CRON_SECRET` with a random value (e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Save.

## 2. Delete the failing cron/batch job from Render

Render Dashboard → **Bodybank batch job** (or bodybank-scheduled-messages) → Settings → **Delete Service**. This stops the errors.

## 3. Create cron job on cron-job.org

1. Go to https://cron-job.org (free signup)
2. Create Cronjob
3. **URL:** `https://bodybank-fit.onrender.com/api/cron/process-scheduled-messages?secret=YOUR_CRON_SECRET`  
   (Replace YOUR_CRON_SECRET with the value from step 1)
4. **Schedule:** Every 5 minutes
5. Save

Done. cron-job.org pings your URL every 5 min → server wakes → scheduled messages are sent.
