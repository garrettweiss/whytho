# WhyTho — Claude Code Context File

> **This file is the quick-reference memory for AI-assisted development.**
> Read this before working on any part of the WhyTho codebase.
> Full details in: STRATEGY.md, REQUIREMENTS.md, PROJECT_PLAN.md

---

## What is WhyTho?

A civic accountability platform where:
- The **public submits and upvotes questions** for any US politician
- **Questions reset every Monday** — fresh questions, fresh pressure
- **Politicians can claim profiles** and answer in any format (text, video, social post)
- **Response rate is always public** — silence is its own answer
- Platform generates value whether or not politicians participate

**Tagline:** Silence is its own answer.
**Entity:** Quinnivations LLC
**Status:** Pre-launch prototype phase

---

## Core Product Rules (Never Violate)

1. **Platform works without politician participation.** Non-response IS the product.
2. **Seeded questions are ALWAYS clearly labeled** as AI-generated. Label: "📋 Suggested Question — AI-generated from public record."
3. **AI analysis answers are NEVER labeled as from the politician.** Always: "🤖 AI Analysis of Public Record. This is NOT a statement from [Politician]."
4. **Participation rate denominator = questions with net_upvotes ≥ 10** (configurable via admin).
5. **Weekly reset = Monday 12:00 AM Eastern (05:00 UTC).** Implemented via pg_cron.
6. **Slugs are permanent** and never change even if politician changes office.
7. **All RLS policies must be enabled** on all Supabase tables.
8. **Optimistic UI for votes** — increment immediately, roll back on 409.

---

## Tech Stack Quick Reference

| Layer | Technology |
|---|---|
| Framework | Next.js 15+ App Router, TypeScript |
| Auth | Supabase Auth |
| Database | Supabase PostgreSQL |
| Real-time | Supabase Broadcast |
| Hosting | Vercel |
| UI | shadcn/ui + Tailwind CSS |
| Cron | Supabase pg_cron |
| Bot prevention | Cloudflare Turnstile |
| ID verification | Stripe Identity ($1.50/verification) |
| Email | Resend |
| AI | Anthropic Claude API (haiku for classification, sonnet for generation) |
| Analytics | Vercel Analytics + PostHog |
| Errors | Sentry |

---

## Database Tables (Summary)

| Table | Purpose |
|---|---|
| `politicians` | All politician profiles; includes `slug`, `aliases[]`, `social_handles` jsonb, `verification_tier` |
| `questions` | User + seeded questions; `week_number` int, `is_seeded` bool, `net_upvotes` int (denormalized) |
| `votes` | Upvotes; UNIQUE(user_id, question_id, week_number) |
| `answers` | Politician answers; `answer_type`, `is_ai_generated`, `confidence_level` |
| `politician_team` | Staff access; roles: admin/editor/responder |
| `weekly_snapshots` | Permanent historical record per politician per week |
| `politician_aliases` | Name resolution; `alias_type`: nickname/title/informal/misspelling/former_title |

**Week number format:** `YYYY * 100 + ISO_WEEK` e.g. week 11 of 2026 = `202611`

**Participation rate formula:**
```sql
answered_qualifying / NULLIF(total_qualifying, 0) * 100
WHERE qualifying = net_upvotes >= 10
```

---

## Key API Integrations

| API | Purpose | Key |
|---|---|---|
| Congress.gov API | Federal legislator data | `CONGRESS_API_KEY` |
| OpenStates API | State legislator data | `OPENSTATES_API_KEY` |
| Ballotpedia | Politician metadata, photos, official URLs | (scraper/API) |
| FEC API | Campaign finance + candidate verification | `FEC_API_KEY` |
| VoteSmart API | Voting records, positions, ratings | `VOTESMART_API_KEY` |
| GovTrack | Bill tracking, voting records | (public) |
| CISA dotgov-data | Government email domain validation | (public GitHub) |
| Stripe Identity | ID verification | `STRIPE_SECRET_KEY` |
| Cloudflare Turnstile | Bot prevention | `CLOUDFLARE_TURNSTILE_SECRET_KEY` |
| Anthropic Claude | AI answers + seeded questions | `ANTHROPIC_API_KEY` |
| Resend | Transactional email | `RESEND_API_KEY` |

---

## Politician Verification Tiers

| Tier | Label | Methods |
|---|---|---|
| 0 | UNCLAIMED | Auto-created from public data |
| 1 | SELF-CLAIMED (Unverified) | Account created, identity declared |
| 2 | VERIFIED ✓ | Any 2 of: govt email / FEC ID / social code post / Stripe Identity / website meta tag |
| 3 | FULLY VERIFIED ✓✓ | Tier 2 + physical letter OR vouching |

---

## Name Resolution (Multi-Layer)

1. Exact match on `display_name`, `full_legal_name`, `aliases[]`
2. pg_trgm similarity (threshold 0.85)
3. `politician_aliases` table lookup
4. State-weighted scoring (if user has state set)
5. Disambiguation UI (show 2-3 matches, user picks)

Always show canonical full legal name. Never auto-correct user's text.

---

## Answer Types

| Type | Label | Visual |
|---|---|---|
| `ai_analysis` | 🤖 AI Analysis of Public Record | Muted gray |
| `ai_verified` | ✅ Politician Verified | Green border |
| `direct` | ✍️ Direct Answer | Blue border |
| `text` | Direct text | Blue border |
| `video` | Video embed | Blue border |
| `social_embed` | Social post embed | Blue border |
| `external_link` | External link card | Blue border |

---

## Weekly Reset Sequence

```
Monday 5:00 UTC:
1. Snapshot top 10 questions per politician → weekly_snapshots
2. Archive all active questions (status = 'archived')
3. Calculate participation rates → store in snapshot
4. Refresh materialized view current_week_leaderboard
5. NOTIFY 'weekly_reset' → triggers application layer
6. Application: generate new seeded questions for all politicians
7. Application: send weekly digest emails
8. Phase 2: Application: queue social media posts
```

---

## Social Distribution Layer (Phase 2 — Architecture Ready in Phase 1)

**Phase 1 must include:**
- `social_handles` jsonb field on `politicians` table
- `shareable_card` jsonb payload on `weekly_snapshots`
- Weekly reset as event/NOTIFY system (not just cron)
- Clean politician slugs (future social handle base)
- Abstract `SocialPublisher` interface in `/lib/social/`

**Phase 2 ships:**
- Branded social accounts per politician (e.g., `@WhyTho_DonaldTrump`)
- Account naming: "@WhyTho_[slug]" — never poses as politician
- Start with 537 federal officials only
- Platform: Twitter/X + TikTok + Facebook + Threads

---

## Seeded Question Generation Prompt Pattern

```typescript
const prompt = `
Generate 15 substantive, neutral civic questions a constituent might ask 
${politician.displayName}, ${politician.office}, representing ${politician.district}.

Based on:
- Recent votes: ${votingSummary}
- Stated positions: ${positionSummary}  
- Committee assignments: ${committees}
- District issues: ${districtIssues}

Rules:
- Never generate leading or hostile questions
- Never generate softball questions
- Base all questions on documented public record only
- Each question should reflect genuine constituent concern

Return JSON: [{question: string, topic: string, source: string}]
`;
```

---

## AI Analysis Guardrails

- Never speculate beyond documented positions
- Default to "Insufficient public record" (not a generated answer) when confidence is low
- Always cite specific sources with dates
- Full audit log retained indefinitely
- Politicians can dispute → flags as "⚠️ Disputed" pending admin review
- Use C2PA standard for machine-readable provenance metadata

---

## File Structure

```
/app/[slug]          → Politician profile (SSR)
/app/leaderboard     → Response rate rankings
/app/verify          → Verification wizard
/app/dashboard       → Politician dashboard (auth required)
/app/admin           → Admin panel
/app/api/questions   → Question CRUD
/app/api/votes       → Vote submission
/app/api/answers     → Answer CRUD
/app/api/verify      → Verification endpoints
/app/api/ai-analysis → AI answer generation
/components/politician/
/components/questions/
/components/votes/
/components/answers/
/components/auth/
/lib/supabase/       → Server + client Supabase instances
/lib/ai/             → AI generation logic
/lib/verification/   → Verification methods
/lib/social/         → SocialPublisher interface (Phase 2)
/lib/name-resolution/ → Fuzzy matching
/scripts/            → Data seeding scripts
```

---

## Phase 1 Scope (US Only)

**In scope:**
- 537 federal officials (Congress + President + Cabinet)
- State legislators: CA, TX, FL, NY, PA, IL, OH, GA, NC, MI
- Governors of all 50 states
- Mayors of top 50 cities

**Out of scope for Phase 1:**
- International politicians
- Mobile native apps
- Social media auto-posting
- Premium subscriptions
- Journalist API
- SMS notifications

---

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
STRIPE_SECRET_KEY
STRIPE_IDENTITY_WEBHOOK_SECRET
NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY
CLOUDFLARE_TURNSTILE_SECRET_KEY
RESEND_API_KEY
FEC_API_KEY
OPENSTATES_API_KEY
VOTESMART_API_KEY
CONGRESS_API_KEY
```

---

*Last updated: March 2026 | Owner: Quinnivations LLC*
