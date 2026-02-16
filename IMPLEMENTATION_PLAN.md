# Vibe Index — Phased Implementation Plan

## Current State Assessment

The codebase already has a solid MVP foundation:

| Area | Status | Notes |
|------|--------|-------|
| Project submission + discovery | **Done** | URL submit, search, categories, tags, full-text search |
| Authentication | **Done** | Clerk integration, DB sync, admin roles |
| AI Feedback (structured report) | **Done** | Scraper + repo analyzer + scoring engine |
| Anonymous visitor feedback | **Done** | Rating + Q&A, AI summarization |
| Credits + Stripe | **Done** | Listing credits, purchase flow, earned credits, ledger |
| Social share verification | **Done** | 24h gate, HEAD verification, auto-convert |
| Newsletter/digest | **Done** | Category subs, SMTP, scheduler, one-click unsub |
| A2A agent protocol | **Done** | JSON-RPC 2.0, 15+ skills, task store |
| Draft review workflow | **Done** | Scrape → edit → refine (text/voice) → approve |
| Tags/vocabulary | **Done** | Canonical tags, synonyms, normalization |
| Admin tools | **Partial** | Role system + seed + re-analyze only |

### Key Gaps vs PRD

1. **Human curated feedback** — PRD calls for authenticated, structured human feedback with credit earning. Current system only has anonymous visitor feedback (rating + Q&A). Need a separate "community review" system tied to user accounts.
2. **Feedback Inbox/History** — No dedicated screen for owners to view all feedback on their apps in one place.
3. **Credit earning caps** — PRD requires per-user-per-time-window caps on credit earning. Not enforced yet.
4. **Share event credit earning** — Exists for social shares but PRD also wants credit earning for providing human feedback.
5. **Landing page** — Exists but doesn't match PRD's hub vision (CTAs for all workflows, credits economy explanation).
6. **Admin console** — Only has a re-analyze endpoint. PRD requires full moderation dashboard (users, listings, feedback, credits oversight, abuse review, newsletter ops).
7. **Credits wallet UI** — Dashboard shows balance but no transaction history view, no "what can credits buy" breakdown.
8. **Newsletter preferences UI** — Subscribe page exists but may need refinement for topic/interest selection.
9. **Abuse detection** — No suspicious pattern detection, no admin corrective actions beyond basic role checks.
10. **Job queue** — In-process only (setInterval). PRD calls for background queue for crawling, AI feedback, newsletter.
11. **Multi-role project ownership** — Single `ownerId` doesn't support Developer vs Discoverer vs Registerer roles.
12. **Project link health checking** — No periodic validation that submitted URLs are still alive.
13. **Agent incentive infrastructure** — A2A protocol exists but nothing to motivate agents to discover and submit projects at scale.
14. **Admin-configurable system values** — Credit amounts, caps, and tier pricing are hardcoded or undefined.
15. **GDPR compliance** — No account deletion flow, no log anonymization.

---

## Architecture Principles

- **Agents work in parallel** — Each phase contains independent workstreams that can be assigned to separate agents
- **No breaking changes** — Each phase builds on top of existing code; existing APIs remain backward-compatible
- **A2A parity** — Per CLAUDE.md, every user-facing feature must also be exposed via A2A skills
- **Storage-first** — All new features go through `server/storage.ts` interface, never `db` directly in routes
- **Admin-configurable** — All credit amounts, caps, tier pricing, and rate limits stored in a `systemConfig` table, editable via admin console (no redeployment needed)
- **Multi-role ownership** — Projects support Developer, Registerer, and Discoverer roles via a `projectContributors` junction table
- **Agent-first design** — Every feature should consider: "How does an autonomous agent use this?"

---

## Resolved Design Decisions

### Credit Economy — Admin Configurable
All credit values stored in `systemConfig` table (key-value with JSON values). Defaults:
- Human feedback earn: 25 hundredths per review (admin adjustable)
- Social share earn: 20 hundredths per share (existing, now admin adjustable)
- Daily earning cap: 200 hundredths (2 listing credits/day, admin adjustable)
- Feedback tier pricing: Basic=0, Standard=50, Deep=100 credits (admin adjustable)

### Project Ownership — Multi-Role Model
Replace single `ownerId` with `projectContributors` table:
- **Developer** — The person who built the project. Can claim via site verification (meta tag or file). Full edit rights.
- **Registered by** — The user or agent who submitted the project to Vibe Index. Gets discovery credit.
- **Discovered by** — A third party who found and surfaced the project. Gets discovery credit.
- A project can have one Developer and multiple Discoverers/Registerers.
- Claiming flow: real developer signs up → proves ownership (adds `<meta name="vibe-index-verify" content="USER_ID">` or `/.well-known/vibe-index.json`) → promoted to Developer role.
- `ownerId` kept on projects table for backward compatibility but `projectContributors` is the source of truth for role-based access.

### GDPR & Data Retention
- **Account deletion:** User can request deletion. Projects stay as "inactive/anonymous" (contributor association removed, user record anonymized). Audit logs and credit ledger entries anonymized (userId replaced with `deleted-{hash}`).
- **Link health checking:** Background job runs daily, HEAD-requests all active project URLs. After 3 consecutive failures over 7 days, project marked as `inactive` with notification to contributors. Re-activates automatically if link comes back.
- **Data retention:** Audit logs: 1 year. Email sends: 6 months. Expired A2A tasks: 24h (already implemented).

### Human Feedback Structure (Confirmed)
Structured sections: `usability`, `marketFit`, `strengths`, `improvements`, `overallRating` (1-10). Plus optional free-text `additionalNotes`.

---

## Phase 0: Foundation & Infrastructure (Prerequisite)

> **Purpose:** Set up the scaffolding that all other phases depend on. Run first, before parallelizing.

### 0A — System Config Table + Admin Config API
**Files:** `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`
- Add `systemConfig` table: `{ key (unique), value (JSON), description, updatedAt, updatedBy }`
- Seed defaults: credit earn amounts, caps, tier pricing, rate limits, agent quotas
- Storage methods: `getConfig(key)`, `setConfig(key, value, updatedBy)`, `getAllConfig()`
- Admin routes: `GET /api/admin/config`, `PATCH /api/admin/config/:key`
- All credit/cap logic reads from this table (cached in-memory, invalidate on update)

### 0B — Rate Limiting & Security Hardening
**Files:** `server/middleware/rateLimit.ts` (new), `server/index.ts`
- Add `express-rate-limit` middleware for API routes
- Configure per-IP and per-user limits for critical endpoints (`/api/projects`, `/api/feedback`, `/a2a`)
- Limits configurable via `systemConfig` table
- Add `helmet` for security headers (CSP, HSTS, X-Frame-Options)
- Add CORS configuration (explicit allowed origins)

### 0C — Credit Earning Cap Infrastructure
**Files:** `shared/schema.ts`, `server/storage.ts`
- Add `creditEarningWindows` table: `{ userId, windowStart, windowEnd, earnedInWindow }`
- Cap amount read from `systemConfig` (default: 200 hundredths per 24h)
- Storage methods: `checkCreditCap(userId)`, `incrementCreditEarning(userId, amount)`
- Enforce cap in existing social share verification flow
- Return remaining cap in `GET /api/balance` response

### 0D — Project Contributors Model (Multi-Role Ownership)
**Files:** `shared/schema.ts`, `server/storage.ts`, migration
- Add `projectContributors` table: `{ id, projectId, userId, role (developer|registerer|discoverer), verifiedAt, createdAt }`
- Unique constraint on `(projectId, userId, role)`
- Migration: backfill existing `ownerId` → `projectContributors` with role=`registerer`
- Storage methods: `addProjectContributor()`, `getProjectContributors()`, `removeProjectContributor()`, `transferDeveloperRole()`
- Update project creation flow to create contributor record
- Keep `ownerId` on projects table for backward compat (points to primary contributor)

### 0E — Testing Infrastructure
**Files:** `vitest.config.ts` (new), `server/__tests__/` (new), `client/__tests__/` (new)
- Set up Vitest for server + client
- Add test utilities (mock storage, mock auth)
- Write smoke tests for critical paths: project submission, credit spend, feedback creation
- Add `npm test` script to `package.json`

**Dependencies:** None — can start immediately
**Agents:** 5 (one per sub-task, all parallel except 0C depends on 0A for config reads)
**Outputs:** Config table, rate limiter, cap enforcement, multi-role ownership, test harness

---

## Phase 1: Human Feedback System + Credit Earning (Core PRD Gap)

> **Purpose:** The biggest missing feature per PRD. Authenticated users leave structured feedback on other people's apps and earn credits for it.

### 1A — Data Model & Storage
**Files:** `shared/schema.ts`, `server/storage.ts`, new migration
- Add `humanFeedback` table:
  ```
  id, projectId, authorUserId, sections (JSON — structured review fields),
  overallRating (1-10), status (published|flagged|removed),
  creditAwarded (boolean), createdAt, updatedAt
  ```
- Zod schema for sections: `{ usability: string, marketFit: string, strengths: string, improvements: string, additionalNotes?: string }`
- Storage methods: `createHumanFeedback()`, `getHumanFeedbackByProject()`, `getHumanFeedbackByAuthor()`, `flagHumanFeedback()`, `removeHumanFeedback()`
- Credit integration: on creation, check cap via Phase 0C, award credits (amount from `systemConfig`), record in `creditLedger`

### 1B — API Routes
**Files:** `server/routes.ts`
- `POST /api/projects/:id/human-feedback` (auth) — Submit structured feedback, check cap, award credits
- `GET /api/projects/:id/human-feedback` — List human feedback for a project (public)
- `GET /api/my-feedback` (auth) — List feedback authored by current user
- `DELETE /api/human-feedback/:id` (auth, admin) — Remove feedback (admin moderation)
- Validation: Can't review own project (check `projectContributors`), can't review same project twice, must be authenticated

### 1C — Frontend Components
**Files:** `client/src/components/HumanFeedbackForm.tsx` (new), `client/src/components/HumanFeedbackList.tsx` (new), update `ProjectDetail.tsx`
- Structured feedback form (usability, market fit, strengths, improvements, overall rating)
- Display human feedback entries on project detail page (separate section from anonymous feedback)
- Credit earning indicator ("You'll earn X credits for this review" — amount from config)
- Show contributor roles on project detail (Developer badge, Discovered by badge, etc.)
- "My Reviews" section on Dashboard

### 1D — A2A Skill
**Files:** `server/a2a/skills.ts`, `server/a2a/agentCard.ts`
- Add `submit-human-feedback` skill — agents can submit structured reviews
- Add `get-human-feedback` skill — agents can retrieve reviews for a project
- Update Agent Card with new skill declarations

**Dependencies:** Phase 0A (config), 0C (credit caps), 0D (multi-role ownership)
**Agents:** 4 (one per sub-task, 1A must complete before 1B-1D)
**Outputs:** Full human feedback loop with credit earning

---

## Phase 2: Landing Page + Credits Wallet + Feedback Inbox (UI/UX)

> **Purpose:** Match the PRD's UI requirements — hub landing page, wallet with transactions, feedback management.

### 2A — Landing Page Redesign
**Files:** `client/src/pages/Home.tsx`, new components
- Hero section: positioning statement ("founder-to-founder ecosystem for humans and agents alike")
- Primary CTAs: Browse Index, Submit App, Request Feedback, Subscribe Newsletter
- Credits economy explainer section (earn/spend loop visual)
- Featured/trending projects section
- Social proof (project count, feedback count, community stats)
- Agent registration CTA ("Are you an AI agent? Discover our A2A API")

### 2B — Credits Wallet Page
**Files:** `client/src/pages/Wallet.tsx` (new), `server/routes.ts`
- Current balance display (free + paid listing credits, earned credits progress bar)
- Transaction history table with pagination (purchases, spends, earns with timestamps and reason codes)
- "What credits buy" breakdown with current pricing (pulled from `systemConfig`)
- Daily earning cap progress bar ("X of Y earned today")
- Buy credits CTA (links to Stripe checkout)
- `GET /api/balance` enhancement: add ledger pagination, cap remaining

### 2C — Feedback Inbox Page
**Files:** `client/src/pages/FeedbackInbox.tsx` (new)
- Lists all feedback (AI + human) across all projects where user is a contributor
- Filter by project, feedback type (AI/human), date
- Unread/read status tracking
- Navigate to project detail from feedback entry
- New route: `GET /api/my-feedback-inbox` (auth) — aggregates all feedback for contributed projects

### 2D — Listing Slot Management + Contributor Display
**Files:** Update `client/src/pages/Dashboard.tsx`, `client/src/pages/Submit.tsx`, `ProjectDetail.tsx`
- Show slot counter: "X of 3 free slots used" + paid slots
- Upgrade path: "Unlock more slots with credits" CTA
- Project detail: show contributor badges (Developer, Registered by, Discovered by)
- Claim project CTA for unclaimed projects ("I built this — claim as Developer")

**Dependencies:** Phase 1 (for human feedback display in inbox), Phase 0D (contributor model)
**Agents:** 4 (fully parallel — each page is independent)
**Outputs:** PRD-compliant UI for all core user journeys

---

## Phase 3: Admin Console (Moderation + Operations)

> **Purpose:** PRD requires full admin oversight. Currently only has role system + one re-analyze endpoint.

### 3A — Admin Dashboard Page
**Files:** `client/src/pages/Admin.tsx` (new), `client/src/components/admin/` (new directory)
- Overview dashboard: total users, projects, feedback, revenue stats
- Navigation to sub-sections (users, projects, feedback, credits, newsletter, system config)

### 3B — User Management
**Files:** `server/routes.ts` (admin routes), `server/storage.ts`, admin components
- `GET /api/admin/users?search=&role=&sort=` — List users with search
- `PATCH /api/admin/users/:id` — Update role, disable earning, suspend account, adjust credits
- `GET /api/admin/users/:id/activity` — View user's submissions, feedback, shares, credits
- `DELETE /api/admin/users/:id` — GDPR deletion (anonymize user, disassociate projects, anonymize logs)
- Admin UI: user table with search, role badges, action dropdowns

### 3C — Content Moderation
**Files:** `server/routes.ts`, `server/storage.ts`, admin components
- `GET /api/admin/projects?status=&flagged=` — List projects with moderation filters
- `PATCH /api/admin/projects/:id/status` — Change status (active/archived/flagged/inactive)
- `GET /api/admin/feedback?flagged=` — List flagged/reported feedback
- `PATCH /api/admin/feedback/:id/status` — Approve/remove feedback
- Admin UI: moderation queue with flag reasons, quick actions

### 3D — Credits, Abuse Oversight & System Config UI
**Files:** `server/routes.ts`, `server/storage.ts`, admin components
- `GET /api/admin/credits/overview` — Aggregate credit stats (total purchased, earned, spent)
- `GET /api/admin/credits/suspicious` — Flag suspicious patterns (high earn velocity, repeated share/feedback patterns)
- `POST /api/admin/credits/adjust` — Manual credit adjustment with reason
- `GET /api/admin/shares?status=` — Review social share proofs
- **System Config editor** — UI for `systemConfig` table: adjust credit amounts, caps, tier pricing, agent quotas live
- Admin UI: credit overview dashboard, suspicious activity alerts, manual adjustment form, config editor

### 3E — Newsletter Operations
**Files:** `server/routes.ts`, `server/storage.ts`, admin components
- `GET /api/admin/newsletter/stats` — Subscriber count, send history, failure rates
- `POST /api/admin/newsletter/send` — Manual digest trigger with preview
- `GET /api/admin/newsletter/sends` — Send history with status
- Admin UI: newsletter stats, manual send trigger, send log

**Dependencies:** Phase 0A (system config), Phase 1 (human feedback moderation)
**Agents:** 5 (3A first, then 3B-3E in parallel)
**Outputs:** Full admin console with configurable credit economy

---

## Phase 4: Enhanced Feedback Engine (VC-Style Reports)

> **Purpose:** PRD specifies VC-style feedback with specific sections. Current engine scores 5 dimensions but doesn't produce the full report format the PRD describes.

### 4A — Enhanced AI Feedback Report
**Files:** `server/feedbackEngine.ts`, `server/scraper.ts`
- Extend FeedbackReport to include PRD sections:
  - **Primary user/persona identification** — Who is this product for?
  - **Primary use cases** — What problems does it solve?
  - **Monetization evaluation** — Is the pricing strategy viable?
  - **"Cold" market-fit assessment** — Would this survive market scrutiny?
  - **Actionable recommendations** — Specific next steps ranked by impact
- Use OpenAI (GPT-4) to generate narrative sections from scraped data + repo analysis
- Keep existing scoring as a complement, not replacement

### 4B — Feedback Depth Tiers
**Files:** `shared/schema.ts`, `server/routes.ts`, `server/storage.ts`
- Define feedback tiers (pricing from `systemConfig`):
  - **Basic** (free with submission) — Current 5-dimension scores + brief summary
  - **Standard** (credit spend) — Full VC-style report with all sections
  - **Deep** (higher credit spend) — Standard + competitive landscape analysis + growth suggestions
- Add `feedbackTier` field to jobs table
- Route modification: `POST /api/feedback-request` accepts `tier` param, validates credit balance

### 4C — Multi-Page Crawling
**Files:** `server/scraper.ts`
- Currently scrapes single URL only
- Add configurable crawl depth (follow internal links, max N pages)
- Aggregate content across pages for richer AI analysis
- Respect robots.txt
- Add crawl scope to FeedbackReport metadata

### 4D — A2A Skill Update
**Files:** `server/a2a/skills.ts`, `server/a2a/agentCard.ts`
- Update `get-feedback` skill to support tier parameter
- Return tier-appropriate report via A2A
- Update Agent Card schemas

**Dependencies:** Phase 0A (config for tier pricing)
**Agents:** 4 (parallel, 4A and 4B have a light dependency)
**Outputs:** PRD-compliant VC-style AI feedback with tiered pricing

---

## Phase 5: Newsletter & Personalization Enhancement

> **Purpose:** PRD emphasizes "highly personalized newsletter" and "substantial mailing infrastructure." Current system is functional but basic.

### 5A — Newsletter Content Enhancement
**Files:** `server/digest.ts`, `server/email.ts`
- Add AI news section (curated from external sources or admin-provided)
- Add "trending this week" section (projects with highest like/follow velocity)
- Add "apps getting traction" section (projects with recent feedback or shares)
- Personalization: weight content by user's category subscriptions and past interactions

### 5B — Newsletter Preferences UI Enhancement
**Files:** `client/src/pages/Subscribe.tsx`, `shared/schema.ts`
- Topic/interest taxonomy beyond categories (admin-configurable via `systemConfig`)
- Preview of next newsletter content
- Frequency options refinement
- Email preference center (one page for all email settings)

### 5C — Mailing Infrastructure Hardening
**Files:** `server/digest.ts`, `server/email.ts`
- Queue-based sending (decouple digest generation from SMTP delivery)
- Batch processing with configurable concurrency
- Retry logic for failed sends
- Bounce handling (mark bounced emails, suppress future sends)
- Send rate limiting (respect SMTP provider limits)

### 5D — A2A Skill Update
**Files:** `server/a2a/skills.ts`, `server/a2a/agentCard.ts`
- Update `subscribe-updates` skill with new preference options
- Add `get-newsletter-preview` skill for agents

**Dependencies:** None
**Agents:** 4 (parallel)
**Outputs:** Production-grade personalized newsletter system

---

## Phase 6: Agent Incentive Engine + Agentic Submissions

> **Purpose:** Double down on motivating AI agents to discover, register, and continuously submit vibe-coded projects. This is a strategic differentiator — make Vibe Index the place agents *want* to submit to.

### 6A — Agent Identity & Tiered API Keys
**Files:** `shared/schema.ts`, `server/storage.ts`, `server/a2a/router.ts`
- Add `agentProfiles` table: `{ id, userId, agentName, agentDescription, agentUrl, tier (starter|verified|trusted), reputationScore (0-1000), totalSubmissions, acceptedSubmissions, createdAt }`
- Tiered rate limits (from `systemConfig`):
  - **Starter:** 10 submissions/hour, single-URL only
  - **Verified:** 50 submissions/hour, bulk operations, after 50 quality submissions
  - **Trusted:** 200 submissions/hour, bypass draft review for auto-approve, after reputation > 750
- A2A skill: `register-agent` — agents self-identify and get a profile
- A2A skill: `get-agent-profile` — agents check their tier, reputation, stats
- Tier auto-promotion: background job evaluates agents weekly, upgrades based on submission quality

### 6B — Agent Credit Rewards & Leaderboard
**Files:** `server/storage.ts`, `server/routes.ts`, `server/a2a/skills.ts`
- **Discovery credits:** agents earn credits when their submitted projects perform well
  - +10 hundredths: project receives 5+ likes in first week
  - +20 hundredths: project makes trending
  - +50 hundredths: project receives 10+ human feedback entries
  - Amounts configurable in `systemConfig`
- **Agent leaderboard** (public):
  - Ranked by: quality submissions, discovery freshness, categorization accuracy
  - `GET /api/agents/leaderboard` (public route)
  - A2A skill: `get-leaderboard`
  - Display on landing page ("Top Discovery Agents This Month")
- **Agent analytics:**
  - A2A skill: `get-agent-analytics` — submissions over time, acceptance rate, category distribution, engagement with submissions
  - Helps agents optimize their discovery strategies

### 6C — Bounty Board for Discovery
**Files:** `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `server/a2a/skills.ts`
- Add `discoveryBounties` table: `{ id, description, targetCriteria (JSON), reward (hundredths), maxClaims, claimedCount, postedBy (admin/user), status (active|fulfilled|expired), expiresAt, createdAt }`
- Admins or users post bounties: "Find AI agents built with LangChain", "Discover new vibe-coded games from this week"
- A2A skill: `get-bounties` — agents browse active bounties
- A2A skill: `claim-bounty` — agent submits a matching project, gets 2x credits on verification
- Bounty dashboard on frontend for humans to browse/post too

### 6D — Bulk Operations & Discovery Feed
**Files:** `server/a2a/skills.ts`, `server/a2a/agentCard.ts`, `server/storage.ts`
- **Bulk publish:** A2A skill `publish-projects-bulk` — submit up to 50 URLs in one request (verified/trusted tier only)
  - Returns batch job ID, agents poll `get-bulk-job-status`
  - Each URL goes through normal analysis pipeline
- **Discovery feed:** A2A skill `get-discovery-opportunities`
  - Returns URLs that haven't been submitted yet but are candidates
  - Sources: admin-curated lists, trending on external platforms (HN, ProductHunt, GitHub trending)
  - Filtered by agent's historical submission patterns
  - Requires `discoveryOpportunities` table for caching external sources

### 6E — Webhook Subscriptions for Agents
**Files:** `shared/schema.ts`, `server/storage.ts`, `server/webhookDelivery.ts` (new)
- Add `agentWebhooks` table: `{ id, userId, eventType, webhookUrl, secret, active, failCount, createdAt }`
- Event types: `bounty.posted`, `project.trending`, `project.needs_review`, `category.new_projects`
- A2A skill: `subscribe-webhook` — agents register webhook URLs
- Webhook delivery: queue-based with retry (3 attempts, exponential backoff)
- Agents react to events in real-time instead of polling

**Dependencies:** Phase 0A (config), 0D (contributor model for Discoverer role)
**Agents:** 5 (6A first for identity model, then 6B-6E parallel)
**Outputs:** Complete agent incentive ecosystem driving autonomous project discovery

---

## Phase 7: Anti-Abuse, GDPR & Observability

> **Purpose:** PRD repeatedly calls for anti-abuse controls. Plus GDPR compliance and production observability.

### 7A — Abuse Detection System
**Files:** `server/abuseDetection.ts` (new), `server/storage.ts`
- Heuristic rules engine:
  - High feedback submission velocity (>N reviews per hour)
  - Repetitive/template feedback content (similarity scoring)
  - Share-and-delete pattern (share verified then post removed)
  - Self-promotion patterns (always reviewing same projects)
  - Agent spam: submission acceptance rate < 30% triggers auto-demotion
- Flag suspicious activity, create admin notifications
- Auto-disable earning for flagged users/agents (reversible by admin)

### 7B — Link Health Checker + Project Lifecycle
**Files:** `server/linkHealthChecker.ts` (new), `shared/schema.ts`, `server/storage.ts`
- Background job: daily HEAD request to all active project URLs
- Track consecutive failures in `projectHealthChecks` table: `{ projectId, lastCheckAt, consecutiveFailures, lastSuccessAt }`
- After 3 failures over 7 days: mark project as `inactive`, notify contributors
- Auto-reactivate if link recovers
- Admin dashboard shows health status across all projects

### 7C — GDPR: Account Deletion & Log Anonymization
**Files:** `server/routes.ts`, `server/storage.ts`, `server/gdpr.ts` (new)
- `DELETE /api/account` (auth) — User requests account deletion
- Deletion flow:
  1. Anonymize user record (replace email, username with `deleted-{hash}`)
  2. Remove from `projectContributors` (projects become "community-submitted")
  3. Anonymize `creditLedger`, `auditLog`, `humanFeedback` entries (userId → `deleted-{hash}`)
  4. Delete `newsletterPreferences`, `categorySubscriptions`, `notifications`
  5. Revoke Clerk account
- Projects remain active (community resource) but show "Anonymous" for deleted contributors
- Admin can trigger deletion on behalf of user

### 7D — Event Tracking & Audit Log
**Files:** `shared/schema.ts`, `server/storage.ts`, `server/middleware/audit.ts` (new)
- Add `auditLog` table: `{ id, userId, action, entityType, entityId, metadata (JSON), ip, createdAt }`
- Middleware to log significant actions (submit, review, share, purchase, admin actions, account deletion)
- Storage methods for querying audit logs (admin use)
- Retention: auto-prune entries older than 1 year

### 7E — Structured Logging & Health Monitoring
**Files:** `server/logger.ts` (new), `server/health.ts` (new), update all server files
- Replace `console.log` with structured logger (pino)
- JSON log format with request IDs, user IDs, timing
- Error tracking integration point (Sentry-compatible)
- Enhanced health endpoint: DB connectivity, SMTP status, Stripe status, job queue depth
- Metrics endpoint (Prometheus-compatible): request counts, error rates, job processing times

**Dependencies:** Phase 0A (config), Phase 3 (admin console for abuse review UI)
**Agents:** 5 (fully parallel)
**Outputs:** GDPR compliance, abuse prevention, production observability

---

## Phase 8: Polish & Production Hardening

> **Purpose:** Final quality pass before scaling.

### 8A — Job Queue Migration
**Files:** `server/jobQueue.ts` (new), update `server/routes.ts`, `server/scraper.ts`
- Replace in-process setInterval with proper job queue (Bull + Redis or pg-boss for PostgreSQL)
- Separate worker processes for: crawling, AI feedback, newsletter, share verification, link health, webhook delivery
- Job retry with exponential backoff
- Dead letter queue for failed jobs
- Admin visibility into queue depth and processing times

### 8B — Caching Layer
**Files:** `server/cache.ts` (new), update `server/storage.ts`
- Add caching for hot paths:
  - Project search results (short TTL, invalidate on new submission)
  - Category list (long TTL)
  - Tag suggestions (medium TTL)
  - User credit balance (short TTL, invalidate on transaction)
  - System config (long TTL, invalidate on admin update)
  - Agent leaderboard (1h TTL)
- Implementation: in-memory LRU (lru-cache) initially, Redis-ready interface

### 8C — Frontend Polish
**Files:** `client/src/` (various)
- Responsive design audit (mobile, tablet, desktop)
- Loading states and skeleton screens for all async operations
- Error boundary components with retry
- Accessibility pass (ARIA labels, keyboard navigation, color contrast)
- Dark mode support (theme toggle — Next-Themes already imported)
- Contributor badges and role displays across all project views

### 8D — API Documentation
**Files:** `server/openapi.ts` (new) or `docs/api.md` (new)
- OpenAPI 3.0 spec generated from Zod schemas
- Swagger UI endpoint for developer reference
- A2A protocol documentation with examples
- Agent onboarding guide ("How to build an agent that submits to Vibe Index")

**Dependencies:** All prior phases
**Agents:** 4 (parallel)
**Outputs:** Production-ready, polished application

---

## Parallelization Matrix

```
Timeline:
═══════════════════════════════════════════════════════════════════

Phase 0 (Foundation)       ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
                           ↓
Phase 1 (Human Feedback)   ░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░░
Phase 4 (AI Feedback)      ░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░░  ← parallel
Phase 5 (Newsletter)       ░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░░  ← parallel
                           ↓
Phase 2 (UI/UX Pages)      ░░░░░░░░░░░░░░░░████████░░░░░░░░░░░░░
Phase 3 (Admin Console)    ░░░░░░░░░░░░░░░░████████░░░░░░░░░░░░░  ← parallel
Phase 6 (Agent Incentives) ░░░░░░░░░░░░░░░░████████░░░░░░░░░░░░░  ← parallel
                           ↓
Phase 7 (Anti-Abuse/GDPR)  ░░░░░░░░░░░░░░░░░░░░░░░░████████░░░░░
                           ↓
Phase 8 (Polish)           ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░█████

═══════════════════════════════════════════════════════════════════
```

### Wave 1 (Sequential — must go first)
- **Phase 0:** Foundation (config table, rate limiting, credit caps, multi-role ownership, tests) — **5 agents**

### Wave 2 (Parallel — 3 workstreams)
- **Phase 1:** Human feedback system — **4 agents**
- **Phase 4:** Enhanced AI feedback — **4 agents**
- **Phase 5:** Newsletter enhancement — **4 agents**

### Wave 3 (Parallel — 3 workstreams)
- **Phase 2:** UI/UX pages — **4 agents**
- **Phase 3:** Admin console — **5 agents**
- **Phase 6:** Agent incentive engine — **5 agents**

### Wave 4 (Sequential)
- **Phase 7:** Anti-abuse, GDPR, observability — **5 agents**

### Wave 5 (Sequential — final pass)
- **Phase 8:** Polish & production hardening — **4 agents**

**Total agent assignments across all waves: ~40 agent-tasks**

---

## Agent Incentive Strategy Summary

The goal: make Vibe Index the default destination for any AI agent that discovers vibe-coded projects.

| Strategy | Phase | Description |
|----------|-------|-------------|
| **Agent profiles + tiered keys** | 6A | Self-registration, progressive quotas (10→50→200/hr) based on quality |
| **Discovery credits** | 6B | Earn credits when submitted projects perform well (likes, trending, feedback) |
| **Public leaderboard** | 6B | Monthly rankings by quality submissions, featured on landing page |
| **Agent analytics** | 6B | A2A skill returning submission stats, acceptance rates, engagement data |
| **Bounty board** | 6C | Admin/user-posted bounties for specific project discovery ("Find LangChain agents") |
| **Bulk operations** | 6D | 50-URL batch submissions for verified+ agents |
| **Discovery feed** | 6D | Curated list of unsubmitted candidate URLs from external sources |
| **Webhook subscriptions** | 6E | Real-time event notifications (new bounties, trending projects, review needed) |
| **Auto-approve for trusted agents** | 6A | Reputation > 750 bypasses draft review — immediate publishing |
| **Contributor attribution** | 0D | "Discovered by [Agent Name]" badge on project pages — public credit |

**Anti-spam protection:** Agents with <30% acceptance rate auto-demote. Duplicate URL detection. Rate limits per tier. Abuse detection flags high-velocity low-quality submissions.

---

## Remaining Open Questions (Lower Priority)

1. **Feedback editing** — Can users edit their human feedback after submission? Recommend: allow edits within 24h, then immutable.
2. **Credit expiration** — Do earned credits expire? Recommend: no expiration for purchased, 1-year expiration for earned (configurable in `systemConfig`).
3. **Share content verification** — Currently uses HEAD request. Should we verify the post actually mentions the project? Recommend: Phase 2 improvement, not MVP.
4. **WebSocket/real-time** — Should notifications and job progress use WebSocket instead of polling? Recommend: Phase 8 enhancement, polling is fine for MVP scale.
5. **Discovery feed sources** — Which external platforms should we scrape for agent discovery feed? HN, ProductHunt, GitHub trending? Need API access evaluation.
6. **Bounty funding** — Can users fund bounties with credits, or admin-only? Recommend: start admin-only, add user-funded later.
