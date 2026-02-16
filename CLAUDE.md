# CLAUDE.md

## Project: Vibe Index

A project discovery platform where developers submit, browse, and discuss vibe-coded software projects.

## A2A Agent Communication — Mandatory Integration Rule

**Every feature or change that adds, modifies, or removes user-facing functionality MUST also evolve the A2A (Agent-to-Agent) experience.**

The A2A service lives at `server/a2a/` and implements the A2A protocol (JSON-RPC 2.0 over HTTP). It is a first-class interface to Vibe-Index — external AI agents use it to discover, search, publish, and subscribe to projects.

### When to update A2A

- **New API endpoint or feature** → Add or extend a skill in `server/a2a/skills.ts` and declare it in `server/a2a/agentCard.ts`
- **Changed data model** → Update the relevant skill executor's output to include new fields
- **New entity or resource** → Consider whether agents should be able to query it; if yes, add a new skill
- **Removed or renamed endpoint** → Update or remove the corresponding skill so the Agent Card stays accurate
- **Auth changes** → Ensure the A2A router in `server/a2a/router.ts` reflects new auth requirements

### A2A file map

| File | Purpose |
|------|---------|
| `server/a2a/types.ts` | A2A protocol types (Agent Card, Tasks, Messages, Parts, JSON-RPC) |
| `server/a2a/agentCard.ts` | Agent Card generator — declares skills with input/output schemas |
| `server/a2a/skills.ts` | Skill executors — bridges A2A requests to storage/service layer |
| `server/a2a/taskStore.ts` | In-memory task lifecycle (create, update, cancel, prune) |
| `server/a2a/router.ts` | Express router: `GET /.well-known/agent.json` + `POST /a2a` |
| `server/a2a/index.ts` | Barrel exports and usage examples |

### Current skills

- `discover-projects` — Search/browse projects by keyword, category, pricing, tags
- `get-project` — Get full project details by ID
- `list-categories` — List all 12 project categories
- `publish-project` — Submit a project URL for analysis and listing
- `subscribe-updates` — Subscribe a user to category digest emails

### How an external agent interacts

1. `GET /.well-known/agent.json` — Discover capabilities
2. `POST /a2a` with JSON-RPC `tasks/send` — Invoke a skill
3. `POST /a2a` with JSON-RPC `tasks/get` — Check task result

### Checklist for any PR

- [ ] If a new API route was added, was a corresponding A2A skill considered?
- [ ] If project data shape changed, were skill executor outputs updated?
- [ ] Does the Agent Card (`agentCard.ts`) still accurately describe all capabilities?
- [ ] Do skill input/output schemas match the actual data contracts?

## Code Conventions

- TypeScript throughout (server + client + shared)
- Express 5 backend, React 18 frontend, Drizzle ORM, PostgreSQL
- Zod for validation (shared schemas in `shared/schema.ts`)
- Clerk for authentication
- Storage accessed via `server/storage.ts` singleton — never import `db` directly in route handlers
- A2A skill executors reuse existing storage methods — no duplicated business logic
