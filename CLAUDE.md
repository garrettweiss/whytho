# WhyTho — Claude Code Instructions

**What:** Civic accountability platform. Public submits/upvotes questions for US politicians. Questions reset weekly. Politicians can claim profiles and answer. Response rate always public.
**Tagline:** Silence is its own answer.
**Entity:** Quinnivations LLC | **Status:** Sprint 1 (Foundation) — pre-launch

> Full context in: `CLAUDE_CONTEXT.md` (read this every session) | `REQUIREMENTS.md` | `PROJECT_PLAN.md` | `STRATEGY.md`

---

## Non-Negotiable Product Rules

1. Platform works without politician participation — non-response IS the product
2. Seeded questions ALWAYS labeled: `📋 Suggested Question — AI-generated from public record`
3. AI analysis NEVER labeled as from politician: `🤖 AI Analysis of Public Record. This is NOT a statement from [Politician]`
4. Participation rate denominator = questions with `net_upvotes ≥ 10` (configurable via admin)
5. Weekly reset = Monday 12:00 AM Eastern / 05:00 UTC via pg_cron
6. Slugs are permanent — never change even if politician changes office
7. ALL Supabase tables must have RLS enabled — check before every schema change
8. Optimistic UI on votes — increment immediately, roll back on 409
9. Week number format: `YYYY * 100 + ISO_WEEK` (week 11 of 2026 = `202611`)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15+ App Router, TypeScript strict |
| Auth | Supabase Auth (anonymous + Google OAuth + magic link) |
| Database | Supabase PostgreSQL + pg_cron + pg_trgm |
| Real-time | Supabase Broadcast |
| Hosting | Vercel |
| UI | shadcn/ui + Tailwind CSS |
| Bot prevention | Cloudflare Turnstile |
| ID verification | Stripe Identity ($1.50/verification) |
| Email | Resend |
| AI | claude-haiku-4-5 (classify) / claude-sonnet-4-6 (generate) |
| Analytics | Vercel Analytics + PostHog |
| Errors | Sentry |

---

## Database Tables

| Table | Key Fields |
|---|---|
| `politicians` | `slug` (permanent), `aliases[]`, `social_handles` jsonb, `verification_tier` (0-3) |
| `questions` | `week_number`, `is_seeded`, `net_upvotes` (denormalized), `status` |
| `votes` | UNIQUE(`user_id`, `question_id`, `week_number`) |
| `answers` | `answer_type`, `is_ai_generated`, `confidence_level` |
| `politician_team` | Roles: admin / editor / responder |
| `weekly_snapshots` | Permanent historical record per politician per week |
| `politician_aliases` | `alias_type`: nickname/title/informal/misspelling/former_title |

**Participation rate formula:**
```sql
answered_qualifying / NULLIF(total_qualifying, 0) * 100
WHERE qualifying = net_upvotes >= 10
```

---

## AI Guardrails

- `claude-haiku-4-5` for: duplicate detection, question classification, content moderation
- `claude-sonnet-4-6` for: seeded question generation, AI analysis of public record
- AI analysis confidence levels: High (3+ sources) / Medium (1-2) / Low (inference) / Insufficient
- If confidence = Insufficient → show "Insufficient public record" — never generate a guess
- Every AI answer: cite specific sources with dates
- Full audit log retained indefinitely (never purge AI-generated content logs)
- Politicians can dispute → flag as `⚠️ Disputed` pending admin review within 48h

---

## Verification Tiers

| Tier | Label | Requirement |
|---|---|---|
| 0 | UNCLAIMED | Auto-created from public data |
| 1 | SELF-CLAIMED | Account created, identity declared |
| 2 | VERIFIED ✓ | Any 2 of: govt email / FEC ID / social code post / Stripe Identity / meta tag |
| 3 | FULLY VERIFIED ✓✓ | Tier 2 + physical letter OR vouching |

---

## Sprint Plan

| Sprint | Name | Focus |
|---|---|---|
| S1 | Foundation | Auth + DB schema + dev env |
| S2 | Politician Profiles | Data ingestion + profile pages |
| S3 | Questions & Votes | Core Q&A loop + real-time |
| S4 | Weekly Reset + AI | Reset mechanic + seeded Qs + AI analysis |
| S5 | Verification + Dashboard | Politician claim + answer flow |
| S6 | Launch Prep | SEO + moderation + pilot launch |

Track task-level progress in `PROJECT_PLAN.md` checkboxes.

---

## File Structure

```
/app/[slug]            → Politician profile (SSR)
/app/leaderboard       → Response rate rankings
/app/verify            → Verification wizard
/app/dashboard         → Politician dashboard (auth required)
/app/admin             → Admin panel
/app/api/questions     /app/api/votes     /app/api/answers
/app/api/verify        /app/api/ai-analysis    /app/api/admin
/components/politician/   /components/questions/   /components/votes/
/components/answers/      /components/auth/
/lib/supabase/         → Server + client Supabase instances
/lib/ai/               → AI generation + seeded question logic
/lib/verification/     → Verification method implementations
/lib/social/           → SocialPublisher interface (Phase 2 stub)
/lib/name-resolution/  → Fuzzy matching
/types/                → TypeScript type definitions
/scripts/              → Data seeding + admin scripts
```

---

## Engineering Conventions

- TypeScript strict mode — no `any`
- Commits: `[S1] feat: description` / `[S2] fix: description`
- Branches: `feature/[sprint]-[feature-name]`
- `main` → production | `staging` → staging | PRs: 1 review → staging; 2 → main
- RLS check: run `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` before every release
- Optimistic UI pattern for all user interactions (votes, question submit)
- Supabase Broadcast for real-time (not polling)

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY         ANTHROPIC_API_KEY
STRIPE_SECRET_KEY                 STRIPE_IDENTITY_WEBHOOK_SECRET
NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY
CLOUDFLARE_TURNSTILE_SECRET_KEY   RESEND_API_KEY
FEC_API_KEY                       OPENSTATES_API_KEY
VOTESMART_API_KEY                 CONGRESS_API_KEY
```

---

## Subagents Available

- **WT (WhyTho Tech Lead)** — Deep technical research, architecture decisions, spike investigations
  Spawn via: `~/.claude/assistants/WT/CLAUDE.md`

*Last updated: March 2026 | Owner: Quinnivations LLC*
