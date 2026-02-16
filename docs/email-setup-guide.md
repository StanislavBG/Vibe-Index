# Email System Setup Guide (for Replit)

## What is this?

Vibe Index has a built-in email digest system. When users subscribe to categories,
the system sends them personalized emails with new projects matching their interests.

The system needs an SMTP server to actually deliver emails. SMTP is the standard
protocol that all email providers use — think of it as the "postal service" for email.
You configure credentials for an email account, and the app sends through it.

## Environment Variables

Add these to **Replit Secrets** (Tools → Secrets in the Replit sidebar).

### Required (all 4 must be set for email to work)

| Secret | What it is | Example |
|--------|-----------|---------|
| `SMTP_HOST` | The mail server address of your email provider | `smtp.gmail.com` |
| `SMTP_PORT` | The port the mail server listens on. Use `587` (standard TLS) | `587` |
| `SMTP_USER` | The email account username (usually your full email address) | `vibeindex.digest@gmail.com` |
| `SMTP_PASS` | The password or app-specific password for that account | `abcd efgh ijkl mnop` |

### Optional

| Secret | What it is | Default if not set |
|--------|-----------|-------------------|
| `SMTP_FROM` | The "From" name and address shown to recipients | Falls back to `SMTP_USER` |
| `APP_URL` | Base URL for links in emails (project links, unsubscribe) | Auto-detected from `REPLIT_DOMAINS` |

## Provider-specific instructions

### Option A: Gmail (easiest, 500 emails/day)

1. Use or create a Gmail account (e.g. `vibeindex.digest@gmail.com`)
2. Go to https://myaccount.google.com/security
3. Enable **2-Step Verification** (required for app passwords)
4. Go to https://myaccount.google.com/apppasswords
5. Create an app password — select "Mail" and "Other (custom name)", type "Vibe Index"
6. Google gives you a 16-character password like `abcd efgh ijkl mnop`

Set these secrets in Replit:
```
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
SMTP_USER = vibeindex.digest@gmail.com
SMTP_PASS = abcd efgh ijkl mnop
SMTP_FROM = Vibe Index <vibeindex.digest@gmail.com>
```

**Important:** Use the app password, NOT your regular Gmail password. Regular passwords
are blocked by Google for SMTP access.

### Option B: Brevo / Sendinblue (300 emails/day free, no personal email needed)

1. Sign up at https://www.brevo.com (free)
2. Go to SMTP & API → SMTP settings
3. Your SMTP login and master password are shown there

```
SMTP_HOST = smtp-relay.brevo.com
SMTP_PORT = 587
SMTP_USER = (your Brevo login email)
SMTP_PASS = (your Brevo SMTP key, found in settings)
SMTP_FROM = Vibe Index <digest@vibeindex.com>
```

### Option C: Outlook / Hotmail (300 emails/day)

```
SMTP_HOST = smtp-mail.outlook.com
SMTP_PORT = 587
SMTP_USER = your-outlook@outlook.com
SMTP_PASS = your-outlook-password
SMTP_FROM = Vibe Index <your-outlook@outlook.com>
```

## How to verify it works

After setting the secrets and restarting the app:

1. **Check status:**
   ```
   GET /api/digest/status
   ```
   Should return `{ "smtpConfigured": true, "smtpHost": "smtp.gmail.com", ... }`

2. **Send a test digest:**
   Make sure at least one user has subscribed to categories (via the /subscribe page),
   and at least one active project exists. Then:
   ```
   POST /api/digest/trigger
   Body: { "frequency": "weekly" }
   ```
   This sends the weekly digest to all weekly subscribers immediately.

## What happens automatically

Once configured, the system runs on its own:

- **Daily digests** — sent every day at 8:00 AM UTC
- **Weekly digests** — sent every Monday at 8:00 AM UTC
- **Monthly digests** — sent on the 1st of each month at 8:00 AM UTC

The scheduler checks every hour. If SMTP is not configured, it silently skips
(no errors, no crashes — the rest of the app works fine without email).

## What if I don't set these?

The app works perfectly without email configured. Users can still subscribe and
set preferences — their choices are saved. Emails just won't be sent until SMTP
secrets are added. No errors, no broken pages.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `smtpConfigured: false` | One or more of SMTP_HOST, SMTP_USER, SMTP_PASS is missing from Replit Secrets |
| Gmail says "less secure app" | You need an App Password, not your regular password. Enable 2FA first. |
| Emails land in spam | Set `SMTP_FROM` to match the actual sending address. For Gmail, use the Gmail address. |
| "Connection timeout" | Check SMTP_PORT is correct (587 for TLS, 465 for SSL). Most providers use 587. |
| Digest trigger returns 0 sent | Either no users are subscribed, or no new projects match their categories |
