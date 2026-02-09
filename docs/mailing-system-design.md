# Vibe Index — Mailing System Design

## 0. Key Architecture Decision: Users, Not Subscribers

**Completed**: The "subscriber" concept has been eliminated. All subscription and
digest preference data is now keyed on `users.id` (via Clerk authentication), not
on bare email strings. This means:

- `category_subscriptions` uses `user_id` FK (was `email`)
- `newsletter_preferences` uses `user_id` FK (was `email`)
- All subscribe endpoints (`POST/GET/DELETE /api/subscribe`) require authentication
- The frontend prompts sign-in before allowing digest configuration
- At compose time, one `user_id` joins: categories, frequency, interests,
  likes, follows, comments, and social shares — full personalization from a single key

The user's email for sending comes from `users.email` at send time — always fresh,
never a stale duplicate.

---

## 1. Current State: What Exists Today

### What IS implemented
- **Database tables** for subscriptions and preferences (`category_subscriptions`, `newsletter_preferences`) — both keyed on `user_id`
- **API endpoints**: `POST /api/subscribe` (auth required), `GET /api/subscribe` (fetch current prefs), `DELETE /api/subscribe` (auth required)
- **Full UI**: `/subscribe` page (requires login, loads existing prefs for editing) + inline `<SubscribeSection>` on the home page + sidebar widget
- **User preference capture**: frequency (daily/weekly/monthly), interests (keywords), pricing filter, max projects per digest
- **Project follows** (`project_follows` table) — authenticated users can follow specific projects
- **In-app notifications** — system notifications for share verification, credit events, etc.

### What is NOT implemented
- **No email service** — zero integration with any email provider (no Resend, SendGrid, Mailgun, SES, Nodemailer)
- **No digest composition** — no logic to select projects matching a user's preferences
- **No scheduler** — no cron/job system for sending periodic digests
- **No email templates** — no HTML email rendering
- **No unsubscribe tokens** — no way to generate one-click unsubscribe links (CAN-SPAM compliance)
- **No send tracking** — no record of what was sent to whom and when

In short: the front door (subscribe UI) and the filing cabinet (database) exist, but the mail room does not.

---

## 2. Data We Can Already Track Per User

Even without the email system, the existing schema captures useful personalization signals:

| Signal | Source Table | Description |
|--------|-------------|-------------|
| Subscribed categories | `category_subscriptions` | Which of the 12 categories a user cares about |
| Frequency preference | `newsletter_preferences` | daily / weekly / monthly |
| Interest keywords | `newsletter_preferences.interests` | JSON array of free-text keywords |
| Pricing filter | `newsletter_preferences.pricing_filter` | free / paid / all |
| Max projects per digest | `newsletter_preferences.max_projects` | 1–50 (default 10) |
| Followed projects | `project_follows` | Authenticated users following specific projects |
| Liked projects | `likes` | Projects the user endorsed |
| Commented projects | `comments` | Projects the user engaged with |
| Owned projects | `projects.owner_id` | Projects the user submitted |
| Social shares | `social_shares` | Projects the user promoted externally |

### What's Missing for Deep Personalization

| Missing Signal | Why It Matters |
|---------------|----------------|
| **Email open/click tracking** | Know which topics actually get engagement, not just what users said they want |
| **Project view history** | Which project detail pages a user visited |
| **Digest send log** | Which projects were already sent so we never repeat them |
| **Unsubscribe token per user** | CAN-SPAM / GDPR compliance — one-click unsubscribe |

---

## 3. Proposed Schema Additions

### 3a. `email_campaigns` — Track every campaign/digest batch

```sql
CREATE TABLE email_campaigns (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,              -- e.g. "Weekly Digest 2026-02-09"
  type          TEXT NOT NULL DEFAULT 'digest', -- digest | announcement | transactional
  status        TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | sending | sent | failed
  frequency     TEXT,                       -- daily | weekly | monthly (for digest campaigns)
  scheduled_at  TIMESTAMP,                 -- when to send
  sent_at       TIMESTAMP,                 -- when actually sent
  total_recipients INTEGER DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 3b. `email_sends` — Per-recipient send log

```sql
CREATE TABLE email_sends (
  id            SERIAL PRIMARY KEY,
  campaign_id   INTEGER NOT NULL REFERENCES email_campaigns(id),
  email         TEXT NOT NULL,
  subject       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued', -- queued | sent | delivered | bounced | failed
  provider_id   TEXT,                          -- message ID from email provider
  opened_at     TIMESTAMP,
  clicked_at    TIMESTAMP,
  project_ids   TEXT,                          -- JSON array of project IDs included in this digest
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_sends_email ON email_sends(email);
CREATE INDEX idx_email_sends_campaign ON email_sends(campaign_id);
```

### 3c. `unsubscribe_tokens` — One-click unsubscribe

```sql
CREATE TABLE unsubscribe_tokens (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,  -- crypto random, used in unsubscribe URL
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_unsub_email ON unsubscribe_tokens(email);
```

### 3d. ~~Alter `category_subscriptions`~~ (DONE)

Both `category_subscriptions` and `newsletter_preferences` now use `user_id` as the
primary key instead of `email`. No migration needed — this was a schema redesign.

---

## 4. Architecture: How the Email System Should Work

### Overview

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  Scheduler   │────▶│  Composer     │────▶│  Email Service │────▶│  Recipient   │
│  (cron job)  │     │  (per-user    │     │  (Resend API)  │     │  inbox       │
│              │     │   project     │     │                │     │              │
│  daily/weekly│     │   selection)  │     │  batch send    │     │              │
│  /monthly    │     │              │     │  via API       │     │              │
└─────────────┘     └──────────────┘     └────────────────┘     └──────────────┘
       │                    │                     │
       │                    │                     │
       ▼                    ▼                     ▼
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│ email_       │     │ Personalization│    │ email_sends    │
│ campaigns    │     │ Engine        │     │ (tracking)     │
│ table        │     │              │     │                │
└─────────────┘     └──────────────┘     └────────────────┘
```

### Step-by-step flow

1. **Scheduler triggers** — A cron-like mechanism fires at appropriate intervals. For early stage, a simple `setInterval` in the server process (like the existing `verifySocialShares` pattern) is sufficient. At scale, move to a proper job queue.

2. **Determine eligible subscribers** — Query `newsletter_preferences` for subscribers whose `frequency` matches the current trigger interval (daily subscribers get daily runs, etc.).

3. **Compose per-subscriber digest** — For each subscriber:
   - Get their `category_subscriptions` → list of category IDs
   - Get their `interests` keywords, `pricing_filter`, `max_projects`
   - Query `projects` that are `active`, match those categories, match pricing filter
   - Exclude projects already sent to this email (join against `email_sends.project_ids`)
   - If the subscriber is also an authenticated user (`user_id` linked), boost projects similar to ones they liked/followed/commented on
   - Sort by relevance: new projects first, then by likes count, then by keyword match
   - Limit to `max_projects`

4. **Render email** — Use a template engine (React Email, MJML, or plain HTML template) to produce the email body with the curated project list, personalized greeting, and unsubscribe link.

5. **Send via provider** — Call Resend (or alternative) API with the rendered HTML. Log the send in `email_sends` with the project IDs included.

6. **Track engagement** — Use provider webhooks to update `email_sends` with open/click/bounce events.

---

## 5. Email Service Provider Recommendation

### Recommended: **Resend**

| Factor | Resend | SendGrid | AWS SES |
|--------|--------|----------|---------|
| Free tier | 3,000 emails/mo | 100/day | 62,000/mo (from EC2) |
| Pricing at scale | $20/mo for 50k | $20/mo for 40k | ~$0.10/1000 |
| DX / TypeScript SDK | Excellent (`resend` npm) | Good | Verbose |
| React Email support | Native (same team) | No | No |
| Webhook support | Yes (open, click, bounce) | Yes | Yes (via SNS) |
| Setup complexity | Minimal | Moderate | High (SES sandbox, IAM) |

**Why Resend**: The TypeScript SDK is clean, the free tier covers early users, React Email integration means templates are just React components (matching the existing frontend stack), and webhooks for tracking are straightforward.

### Alternative for zero-cost: **Nodemailer + SMTP relay**
If cost is the concern, a free SMTP relay (e.g., Brevo free tier at 300 emails/day) with Nodemailer works. But you lose easy open/click tracking.

---

## 6. Personalization Engine Design

The core of personalized digests is a **scoring function** that ranks projects for each subscriber.

### Scoring formula per project per subscriber

```
score = base_score
      + category_match_weight     (project is in a category they subscribed to)
      + interest_keyword_weight   (project tags/description match their interest keywords)
      + recency_weight            (newer projects score higher)
      + social_proof_weight       (high likes/follows count)
      + behavioral_boost          (authenticated users: similar to projects they liked/followed)
      - already_sent_penalty      (∞ penalty — never repeat a project)
```

### Concrete weights (tunable)

```typescript
interface ScoringConfig {
  categoryMatch: 10,       // project is in a subscribed category
  interestKeyword: 5,      // each matching keyword
  recencyDays: (days: number) => Math.max(0, 10 - days), // 10 pts for today, 0 after 10 days
  socialProof: (likes: number) => Math.min(likes, 10),    // cap at 10
  followedProjectBonus: 15, // project the user follows (they explicitly want updates)
  likedSimilar: 3,          // project shares a category with one the user liked
}
```

### For authenticated subscribers (deeper personalization)

When `category_subscriptions.user_id` is linked to an actual user, we can:

1. **Followed projects section** — Dedicated "Updates on projects you follow" at the top of the email
2. **"Because you liked X"** — Projects in the same categories as their liked projects
3. **Exclude own projects** — Don't send them their own submissions
4. **Shared projects** — "Projects you helped promote" section with any stats updates

---

## 7. Campaign Composer Flow (Admin-Facing)

The "new flow" for composing a mass email campaign:

### Flow steps

1. **Select campaign type**
   - `digest` — Automated, per-subscriber personalized project selections
   - `announcement` — Same content to all subscribers (e.g., new feature, platform update)

2. **Configure audience**
   - By frequency tier: daily / weekly / monthly subscribers
   - By category: only subscribers to specific categories
   - By engagement: only subscribers who opened the last N emails (requires tracking data)

3. **Compose content**
   - For `digest`: configure scoring weights, preview what top subscribers would receive
   - For `announcement`: write subject + body in a rich editor, preview rendering

4. **Schedule or send**
   - Send immediately
   - Schedule for a specific date/time
   - For digests: just trigger the next scheduled run now

5. **Monitor**
   - Dashboard showing: total sent, delivery rate, open rate, click rate, bounces
   - Per-project click-through counts (which projects got the most engagement)

### API endpoints needed

```
POST   /api/admin/campaigns              — create campaign
GET    /api/admin/campaigns              — list campaigns
GET    /api/admin/campaigns/:id          — campaign detail + stats
POST   /api/admin/campaigns/:id/send     — trigger send
POST   /api/admin/campaigns/:id/preview  — preview email for a sample subscriber
GET    /api/admin/subscribers             — list all subscribers with stats
GET    /api/admin/subscribers/:email      — subscriber detail (preferences, send history)
POST   /api/webhooks/email               — receive Resend webhooks (open/click/bounce)
GET    /api/unsubscribe/:token           — one-click unsubscribe
```

---

## 8. Implementation Phases

### Phase 1: Foundation (unblock email sending)
- [x] Consolidate identity: subscriptions and preferences keyed on `user_id`, not email
- [x] Require auth for all subscribe endpoints; frontend prompts sign-in
- [x] Add `GET /api/subscribe` to load existing preferences for editing
- [ ] Add `resend` npm package
- [ ] Create `email_campaigns`, `email_sends`, `unsubscribe_tokens` tables in schema
- [ ] Build unsubscribe token generation and the `GET /api/unsubscribe/:token` endpoint
- [ ] Create a single HTML email template for project digests (React Email or inline HTML)
- [ ] Build the digest composer: query projects → score → select → render → send
- [ ] Wire up a `setInterval` scheduler (reusing the existing background job pattern)

### Phase 2: Personalization & tracking
- [ ] Implement the scoring engine with configurable weights
- [ ] Add behavioral signals: boost projects similar to liked/followed ones
- [ ] Add "followed project updates" section in digest emails
- [ ] Set up Resend webhook endpoint to track opens, clicks, bounces
- [ ] Build deduplication: never send the same project to the same user twice

### Phase 3: Admin campaign tools
- [ ] Admin campaign CRUD API
- [ ] Campaign preview endpoint
- [ ] Audience segmentation (by category, frequency, engagement)
- [ ] Announcement email type (non-digest, same content for all)
- [ ] Campaign analytics dashboard (sent/opened/clicked/bounced)

### Phase 4: Scale
- [ ] Move scheduler from `setInterval` to a proper job queue (BullMQ + Redis, or pg-boss)
- [ ] Batch sends in chunks (Resend batch API supports up to 100 recipients per call)
- [ ] Rate limiting to stay within provider quotas
- [ ] Bounce/complaint handling: auto-unsubscribe hard bounces

---

## 9. Key Files to Modify

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `emailCampaigns`, `emailSends`, `unsubscribeTokens` tables; add `userId` to `categorySubscriptions` |
| `server/storage.ts` | Add CRUD methods for new tables; add digest query (scored project selection) |
| `server/routes.ts` | Add admin campaign endpoints, unsubscribe endpoint, webhook endpoint |
| `server/email.ts` | **New file** — Resend client setup, send functions, template rendering |
| `server/digest.ts` | **New file** — Digest composition logic (scoring, project selection, per-subscriber rendering) |
| `server/scheduler.ts` | **New file** — Background scheduler for triggering digest sends |
| `package.json` | Add `resend` dependency |

---

## 10. Environment Variables Needed

```env
RESEND_API_KEY=re_...           # Resend API key
RESEND_FROM_EMAIL=digest@vibeindex.com  # Verified sender address
RESEND_WEBHOOK_SECRET=whsec_... # For verifying webhook signatures
APP_URL=https://vibeindex.com   # For unsubscribe links and project URLs in emails
```
