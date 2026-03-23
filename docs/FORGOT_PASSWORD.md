# Forgot Password (User-Only)

Password reset is available **only for users** (role `user`). Admins and superadmins cannot use this flow.

## Flow

1. User clicks **Forgot password?** on the login modal
2. Enters email → receives reset link (or sees it in dev)
3. Clicks link → **Set New Password** modal opens
4. Enters new password → can log in with the new password

## Local / Development

- Reset link is included in the API response (`resetLink`) so you can copy it for testing
- Run `node scripts/ensure-password-resets-table.js` if the table doesn't exist (or `npm test` does this automatically)
- **Important:** Restart the server (`Ctrl+C`, then `npm start`) after pulling changes so forgot-password routes load. Startup log shows `🔐 Forgot password: /api/auth/forgot-password` when available.

## Production (Nodemailer + SMTP)

1. Choose an SMTP provider: Gmail, Mailgun, AWS SES, Postmark, SendGrid SMTP, etc.
2. In Render, add these environment variables:
   - `SMTP_HOST` – SMTP server (e.g. `smtp.gmail.com`, `smtp.mailgun.org`)
   - `SMTP_PORT` – optional, default `587` (use `465` for secure)
   - `SMTP_SECURE` – optional, `true` for port 465
   - `SMTP_USER` – SMTP username
   - `SMTP_PASS` – SMTP password / app password
   - `SMTP_FROM` – optional, e.g. `FitBase <noreply@fitbase.fit>`
   - `RESET_BASE_URL` – optional. On Render, `RENDER_EXTERNAL_URL` is used automatically. Set `RESET_BASE_URL` for custom domains, e.g. `https://fitbase.fit`
3. Users receive the reset link by email within seconds

### Gmail

- Use **App Password**, not your regular Gmail password (Google Account → Security → 2-Step Verification → App passwords)
- Set `SMTP_HOST` = `smtp.gmail.com` (or `gmail`) – the server auto-detects and uses Gmail config
- Do **not** set `SMTP_FROM` to a custom domain when using Gmail – the From address must be your Gmail account
- Check Render logs for `[ForgotPassword] Reset email sent to` (success) or `[ForgotPassword] SMTP failed:` (error details)

### Troubleshooting

- **No email received:** Check Render logs. If you see `SMTP failed:` with `535` or `Invalid login`, use an App Password (Gmail) or verify SMTP credentials.
- **Emails in spam:** Add SPF/DKIM for your domain if using a custom SMTP_FROM.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/auth/forgot-password` | Request reset (body: `{ email }`). Returns generic success. In dev, `resetLink` is included. |
| GET    | `/api/auth/verify-reset-token/:token` | Verify token; returns `{ valid: true/false }` |
| POST   | `/api/auth/reset-password` | Set new password (body: `{ token, new_password }`) |
