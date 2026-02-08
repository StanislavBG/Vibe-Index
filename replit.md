# Vibe Index

## Overview

Vibe Index is a project discovery and sharing platform — a directory where users can submit, browse, like, and categorize software projects. Think of it as a Product Hunt-style listing site. Users can register accounts, submit projects (with free listing credits and paid credits), browse by category, search, like projects, and subscribe to category notifications via email. The app supports both authenticated and anonymous project submissions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework:** React 18 with TypeScript, built with Vite
- **Routing:** Wouter (lightweight client-side router)
- **State/Data Fetching:** TanStack React Query for server state management
- **UI Components:** shadcn/ui (new-york style) built on Radix UI primitives
- **Styling:** Tailwind CSS with CSS custom properties for theming (violet/indigo palette with light/dark mode support)
- **Animations:** Framer Motion for page transitions and interactive effects
- **Path Aliases:** `@/` maps to `client/src/`, `@shared/` maps to `shared/`

**Key pages:**
- Home (discover/browse projects with search, filtering, sorting)
- Submit (project submission form)
- ProjectDetail (individual project view with likes)
- Dashboard (user's own projects, credits management)
- Auth (login/register pages)

### Backend
- **Framework:** Express 5 on Node.js with TypeScript (run via `tsx`)
- **API Pattern:** RESTful JSON API under `/api/` prefix
- **Authentication:** Clerk (`@clerk/express` middleware on backend, `@clerk/clerk-react` on frontend). Users are synced to a local `users` table via `clerkId` column.
- **Validation:** Zod schemas (shared between client and server via `shared/schema.ts`)
- **Build:** Custom build script using esbuild for server bundling + Vite for client, outputs to `dist/`

### Data Storage
- **Database:** PostgreSQL via `node-postgres` (`pg` pool)
- **ORM:** Drizzle ORM with PostgreSQL dialect
- **Schema Location:** `shared/schema.ts` — shared between frontend and backend
- **Migrations:** Drizzle Kit with `db:push` command (push-based, no migration files needed for dev)
- **Session Storage:** Managed by Clerk (JWT-based, no server-side sessions)

**Core database tables:**
- `users` — accounts with clerkId (links to Clerk user), username, email, free listing credits (default 3), paid credits, likes remaining (default 10)
- `projects` — submitted projects with URL, metadata, pricing model, likes count, owner reference, status, anonymous token support
- `categories` — predefined project categories (seeded on startup with 12 defaults like AI/ML, Web Apps, Games, etc.)
- `project_categories` — many-to-many join table
- `likes` — user-to-project likes
- `category_subscriptions` — email subscriptions per category
- `anonymous_submissions` — tracks anonymous submissions by fingerprint

### Storage Layer
- `server/storage.ts` defines an `IStorage` interface with all CRUD operations
- Uses Drizzle query builder with `eq`, `and`, `ilike`, `sql` helpers
- Storage is injected/imported as a singleton

### Dev vs Production
- **Dev:** Vite dev server with HMR proxied through Express (`server/vite.ts`), includes Replit-specific plugins (cartographer, dev-banner, error overlay)
- **Production:** Static files served from `dist/public` via Express, server bundled to `dist/index.cjs`

### Shared Code
- `shared/schema.ts` — Drizzle table definitions + Zod validation schemas (via `drizzle-zod`)
- `shared/routes.ts` — URL builder helper and error schema definitions

### Stripe Integration (Payments)
- **Purpose:** Users can purchase listing credits via Stripe Checkout (one-time payments)
- **Products:**
  - $1 → 1 listing credit (Price ID: `price_1SyevyJNQ49zVK9WlFpLkg0m`)
  - $5 → 10 listing credits (Price ID: `price_1SyewIJNQ49zVK9W1zUjHvTW`)
- **Integration:** Replit Stripe connector (`stripe-replit-sync`) for managed webhooks & data sync
- **Flow:** User clicks "Buy Now" → backend creates Checkout Session → user pays on Stripe → redirected back to `/dashboard?purchase=success&session_id=...` → backend fulfills by adding credits
- **Files:**
  - `server/stripeClient.ts` — Stripe client with credentials from Replit connection API
  - `server/webhookHandlers.ts` — Webhook processing via stripe-replit-sync
  - Stripe routes in `server/routes.ts`: `POST /api/stripe/checkout`, `POST /api/stripe/fulfill`, `GET /api/stripe/products`, `GET /api/stripe/publishable-key`
  - Webhook route in `server/index.ts`: `POST /api/stripe/webhook` (registered BEFORE `express.json()`)
- **Idempotency:** Fulfillment checks credit ledger to prevent duplicate credit grants

## External Dependencies

### Required Services
- **PostgreSQL Database** — Required. Connection via `DATABASE_URL` environment variable. Used for all data storage and session management.
- **Stripe** — Required for credit purchases. Managed via Replit Stripe connector (credentials fetched from Replit connection API, not env vars).

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required, will throw on startup if missing)
- `CLERK_SECRET_KEY` — Clerk secret key for backend API (required)
- `CLERK_PUBLISHABLE_KEY` — Clerk publishable key for backend middleware (required)
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key for frontend (required)

### Key NPM Packages
- `drizzle-orm` + `drizzle-kit` + `drizzle-zod` — ORM, migrations, schema validation
- `express` v5 — HTTP server
- `@clerk/clerk-react` — Frontend authentication (ClerkProvider, SignIn, SignUp, UserButton, hooks)
- `@clerk/express` — Backend authentication middleware (clerkMiddleware, getAuth, requireAuth)
- `@tanstack/react-query` — Client-side data fetching
- `stripe` + `stripe-replit-sync` — Stripe payments and webhook sync
- `framer-motion` — Animations
- `wouter` — Client-side routing
- `zod` — Schema validation (shared)
- `shadcn/ui` components via Radix UI primitives
- `recharts` — Charts (available via shadcn chart component)
- `react-day-picker` — Calendar component
- `vaul` — Drawer component