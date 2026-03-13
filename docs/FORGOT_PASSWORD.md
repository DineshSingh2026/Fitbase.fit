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

## Production

- Reset link base URL: uses `RESET_BASE_URL` or `APP_BASE_URL` if set; otherwise derives from request (`https://your-domain.com` on Render).
- Set `RESET_BASE_URL` in Render env (e.g. `https://bodybank.fit`) if your canonical domain differs from the request host.
- In production the link is not returned in the API response; add email (nodemailer, Resend, etc.) to send it to users.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/auth/forgot-password` | Request reset (body: `{ email }`). Returns generic success. In dev, `resetLink` is included. |
| GET    | `/api/auth/verify-reset-token/:token` | Verify token; returns `{ valid: true/false }` |
| POST   | `/api/auth/reset-password` | Set new password (body: `{ token, new_password }`) |
