# WhyTho — Development Project Plan

> **Goal:** Ship a working US prototype in 6 months. This plan breaks the build into 6 sprints of ~2 weeks each, then continues into Phase 2.
> **Stack:** Next.js 15 + Supabase + Vercel + shadcn/ui + Anthropic Claude API

---

## Sprint Overview

| Sprint | Name | Duration | Milestone |
|---|---|---|---|
| S1 | Foundation | Weeks 1-2 | Auth + DB schema + dev environment |
| S2 | Politician Profiles | Weeks 3-4 | Profiles live with seeded data |
| S3 | Questions & Votes | Weeks 5-6 | Core Q&A loop working |
| S4 | Weekly Reset + AI | Weeks 7-8 | Reset mechanic + seeded questions + AI analysis |
| S5 | Verification + Dashboard | Weeks 9-10 | Politicians can claim + answer |
| S6 | Launch Prep | Weeks 11-12 | SEO + moderation + pilot launch |
| P2-S1 | Social Layer | Weeks 13-16 | Social accounts + auto-posting |
| P2-S2 | Scale + Monetize | Weeks 17-24 | Premium features + journalist API |

---

## Sprint 1 — Foundation (Weeks 1-2)

### Goal
Working dev environment, auth system, and full DB schema deployed.

### Tasks

#### Environment setup
- [ ] Initialize Next.js 15 project with TypeScript and App Router
- [ ] Configure Tailwind CSS + shadcn/ui component library
- [ ] Set up Supabase project (dev + staging + prod environments)
- [ ] Configure Vercel deployment with environment variables
- [ ] Set up GitHub repository with branch protection rules
- [ ] Configure Cloudflare Turnstile (get site key)
- [ ] Set up Resend account for transactional email
- [ ] Install and configure Stripe Identity SDK

#### Database schema
- [ ] Create all core tables (see REQUIREMENTS.md R-schema)
  - `politicians`
  - `questions`
  - `votes`
  - `answers`
  - `politician_team`
  - `weekly_snapshots`
  - `politician_aliases`
- [ ] Create all indexes (slug, vote_count, week_number composites)
- [ ] Create materialized view `current_week_leaderboard`
- [ ] Write `get_current_week()` PostgreSQL function
- [ ] Enable pg_trgm extension (fuzzy search)
- [ ] Enable Row Level Security on all tables
- [ ] Write RLS policies:
  - Questions: anyone reads active; authenticated creates; owner edits
  - Votes: authenticated inserts own votes; reads all
  - Answers: politician team edits; anyone reads
  - Politician_team: admin manages; reads own team
- [ ] Write vote trigger: `increment_vote_count()` on votes INSERT/DELETE
- [ ] Write weekly_reset PostgreSQL function (stubbed, full logic in S4)
- [ ] Seed `get_current_week()` with current week number

#### Authentication
- [ ] Configure Supabase Auth: Google OAuth, Apple Sign-In, email magic link
- [ ] Implement anonymous sign-in (`signInAnonymously()`)
- [ ] Build `AuthModal` component (non-blocking, slides in on upvote/submit)
- [ ] Implement `linkIdentity()` on anonymous → real account upgrade
- [ ] Build auth context provider (`useAuth` hook)
- [ ] Create user profile table with: display_name, state, account_created_at
- [ ] Add Cloudflare Turnstile to auth flow

#### Dev tooling
- [ ] Set up ESLint + Prettier + TypeScript strict mode
- [ ] Configure Supabase local development (supabase CLI)
- [ ] Write seed script for test data (10 politicians, 50 questions, 200 votes)
- [ ] Set up basic CI/CD pipeline (GitHub Actions → Vercel preview deployments)

### Acceptance criteria
- [ ] `supabase start` runs locally with all migrations applied
- [ ] Can sign in with Google, anonymous, and magic link
- [ ] All tables exist with correct schemas and RLS enabled
- [ ] Vercel preview deployment working

---

## Sprint 2 — Politician Profiles (Weeks 3-4)

### Goal
Politician profile pages live with real data. Anyone can browse without signing in.

### Tasks

#### Data ingestion
- [ ] Write Congress.gov API client (fetch all 537 federal officials)
- [ ] Write OpenStates API client (fetch state legislators, 10 states)
- [ ] Write Ballotpedia scraper / API client (photos, official URLs, additional metadata)
- [ ] Build politician data normalization pipeline:
  - Deduplicate across sources
  - Generate slugs (collision-safe)
  - Extract aliases array
  - Map to `politicians` schema
- [ ] Seed politicians table with federal + 10-state legislators
- [ ] Seed politician_aliases table (nicknames from Ballotpedia)
- [ ] Write admin script: refresh politician data (run weekly)

#### Profile pages
- [ ] Build `/[slug]` politician profile page (SSR)
  - Server component fetches politician data + current week questions
  - Static generation for top 1000 profiles; dynamic for rest
- [ ] Build `PoliticianHeader` component:
  - Photo, name, office, district, state, party
  - Verified badge (conditional)
  - Response rate badge
  - "Claim this profile" CTA (if unclaimed)
- [ ] Build `ParticipationRate` component:
  - This week: X of Y answered
  - Lifetime: X of Y answered
  - Visual indicator (progress bar or donut)
- [ ] Build `QuestionList` component:
  - Sorted by net_upvotes descending
  - Tab: This Week / Past / All
  - Shows seeded question label where applicable
- [ ] Build `QuestionCard` component:
  - Question text, topic tags, vote count
  - Upvote button (disabled if not signed in)
  - Answer section (collapsed by default if answered)
  - Seeded label (📋) or user-submitted
- [ ] Build leaderboard page `/leaderboard`
- [ ] Build browse pages: `/federal`, `/state/[code]`, `/topic/[slug]`

#### SEO
- [ ] Add `generateMetadata()` for politician profile pages
- [ ] Add JSON-LD structured data (Person + GovernmentOrganization schema)
- [ ] Add Open Graph tags (politician photo as OG image)
- [ ] Generate `/sitemap.xml` from all politician slugs
- [ ] Configure `robots.txt`

### Acceptance criteria
- [ ] All 537 federal officials have profile pages with real data
- [ ] Profile pages server-side render under 1.5s LCP
- [ ] Leaderboard shows all politicians sortable by participation rate
- [ ] Sitemap generated with all politician URLs

---

## Sprint 3 — Questions & Votes (Weeks 5-6)

### Goal
Complete Q&A loop: users can submit questions, upvote, and see real-time counts.

### Tasks

#### Question submission
- [ ] Build `AskQuestionForm` component:
  - Text area (10-500 chars, character counter)
  - Topic tag multi-select
  - Submit button (disabled until valid)
  - Auth gate (shows AuthModal if not signed in)
- [ ] Build `/api/questions` POST endpoint:
  - Validate input (length, content)
  - Run Turnstile verification
  - Check user rate limit (5/day)
  - Insert question with week_number
  - Return created question
- [ ] Implement AI deduplication check:
  - On keystroke (debounced 500ms): POST to `/api/questions/check-duplicate`
  - Claude API call: compare against top 50 questions for that politician
  - If match ≥ 85%: render `DuplicateSuggestion` card
- [ ] Build `DuplicateSuggestion` component:
  - Shows similar existing question + vote count
  - "Upvote existing" or "Submit anyway" buttons

#### Name resolution
- [ ] Build politician search component (for homepage and "Ask from search")
- [ ] Implement multi-layer fuzzy match:
  - Layer 1: Exact match (SQL: `WHERE display_name ILIKE %query%`)
  - Layer 2: pg_trgm similarity (threshold 0.4)
  - Layer 3: aliases table lookup
  - Layer 4: state-weighted scoring if user has state set
- [ ] Build `PoliticianPicker` disambiguation component:
  - Shows 2-3 matches with photo, office, state
  - User selects to confirm target
- [ ] Write `resolve_politician_name(query, user_state)` PostgreSQL function

#### Voting system
- [ ] Build `VoteButton` component:
  - Optimistic UI: instant visual state change on click
  - Disabled state: "Already voted this week"
  - Auth gate: shows AuthModal if not signed in
- [ ] Build `/api/votes` POST endpoint:
  - Validate Turnstile token
  - Check rate limit (30 votes / 10 min)
  - INSERT vote with UNIQUE constraint
  - On 409: return "already voted" status
- [ ] Implement PostgreSQL trigger `increment_vote_count`:
  ```sql
  CREATE OR REPLACE FUNCTION increment_vote_count()
  RETURNS TRIGGER AS $$
  BEGIN
    UPDATE questions 
    SET vote_count = vote_count + NEW.value,
        net_upvotes = net_upvotes + NEW.value
    WHERE id = NEW.question_id;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  ```
- [ ] Implement Supabase Broadcast subscription on politician profile pages:
  - Subscribe to channel `politician:[id]`
  - Update question vote counts in real-time without full page reload

#### Rate limiting
- [ ] Implement `db_pre_request` PostgreSQL function for vote rate limiting
- [ ] Add Upstash Redis rate limiter on `/api/votes` (alternative: DB-based)
- [ ] IP-based rate limit: 100 votes/IP/hour via Vercel Edge middleware

### Acceptance criteria
- [ ] Can submit a question to any politician (authenticated)
- [ ] Duplicate detection shows suggestion for semantically similar questions
- [ ] Upvote button responds in < 200ms (optimistic)
- [ ] Vote count updates in real-time across browser tabs
- [ ] Rate limits prevent more than 30 votes per 10 minutes

---

## Sprint 4 — Weekly Reset + AI (Weeks 7-8)

### Goal
Weekly reset mechanic operational. Seeded questions populating all profiles. AI analysis generating on top questions.

### Tasks

#### Weekly reset
- [ ] Implement full `weekly_reset()` PostgreSQL function:
  ```sql
  -- 1. Snapshot top 10 questions per politician
  -- 2. Archive all active questions  
  -- 3. Calculate + store participation rates
  -- 4. Refresh materialized view
  -- 5. NOTIFY 'weekly_reset'
  ```
- [ ] Schedule pg_cron: `0 5 * * 1` (Monday 5:00 UTC = Monday midnight Eastern)
- [ ] Build application-layer event listener for `weekly_reset` NOTIFY
- [ ] Test reset in staging environment (trigger manually first)
- [ ] Build historical browse: `/[slug]?week=[week_number]`
- [ ] Build participation rate history sparkline component (8-week view)
- [ ] Write reset rollback procedure (in case of failure mid-transaction)

#### Seeded questions pipeline
- [ ] Build politician data aggregator:
  - GovTrack API client: fetch recent votes for politician
  - VoteSmart API client: fetch positions + ratings
  - Congress.gov API client: fetch committee assignments + sponsored bills
- [ ] Build seeded question generator:
  - Call Claude API with politician context
  - Parse JSON response
  - Quality filter (length, neutrality check)
  - Deduplication check
  - Insert with `is_seeded = true`
- [ ] Build admin endpoint: `POST /api/admin/seed-questions` (manual trigger)
- [ ] Wire to weekly_reset event (auto-trigger post-reset)
- [ ] Build 10% spot-check moderation queue for seeded questions
- [ ] Implement seeded question retirement (0 upvotes after 2 weeks → remove on reset)

#### AI analysis
- [ ] Build politician public record aggregator:
  - Fetches voting record, statements, positions for a politician
  - Returns structured context object
- [ ] Build AI analysis generator:
  - RAG: retrieve relevant public record chunks for the specific question
  - Call Claude API with strict prompt (no speculation beyond public record)
  - Parse response: answer text + citations + confidence level
- [ ] Build `/api/ai-analysis` POST endpoint (triggered on question crossing vote threshold)
- [ ] Build `AIAnalysisCard` component:
  - Muted gray background
  - 🤖 AI Analysis label (prominent)
  - Answer text
  - Source citations with dates
  - Confidence indicator
  - "Politician: Is this accurate? Verify or correct →" CTA
- [ ] Implement guardrail: if confidence = "insufficient", show "Insufficient public record" message (not a generated answer)
- [ ] Implement audit log table for all AI-generated content

### Acceptance criteria
- [ ] Manual reset trigger works: questions archived, snapshots saved, new week starts
- [ ] Every politician profile has 10-20 seeded questions within 2 hours of reset
- [ ] Seeded questions clearly labeled, visually distinct from user questions
- [ ] AI analysis appears on top 5 questions per politician with citations
- [ ] AI analysis is clearly labeled and visually distinct from politician answers

---

## Sprint 5 — Verification + Politician Dashboard (Weeks 9-10)

### Goal
Politicians can claim profiles, verify identity, manage teams, and answer questions.

### Tasks

#### Verification flow
- [x] Build `/verify` page (multi-step wizard):
  - Step 1: Find your profile (search by name)
  - Step 2: Confirm identity methods (select 2 of 5)
  - Step 3: Complete chosen methods
  - Step 4: Review + submit
  - Step 5: Confirmation screen
- [x] Implement Method A (government email):
  - Domain validation against CISA dotgov-data allowlist
  - Magic link flow separate from regular auth magic link
  - Mark `verification_method_a = true` on success
- [ ] Implement Method B (FEC filing ID):
  - Build FEC API client (`api.open.fec.gov/v1/candidates/{id}`)
  - Name fuzzy match (≥ 90% threshold)
  - Handle FEC API rate limits
- [ ] Implement Method C (social media code post):
  - Generate unique 6-char verification code
  - Store code with 48h expiry
  - Accept Twitter/X or Facebook post URL
  - Fetch post content (oEmbed for Twitter, scrape for others)
  - Check for code in post text
- [ ] Implement Method D (Stripe Identity):
  - Integrate Stripe Identity SDK
  - Create verification session on backend
  - Handle `identity.verification_session.verified` webhook
  - Cross-reference verified name against politician record
- [x] Implement Method E (website meta tag):
  - Generate unique meta tag code
  - Accept URL submission
  - Crawl URL (server-side), confirm meta tag present
  - Cross-reference with Ballotpedia official site

#### Politician dashboard
- [x] Build `/dashboard` layout (authenticated + verified politician only)
- [x] Build `QuestionInbox` component:
  - Questions sorted by net_upvotes
  - Filter bar: topic, date, threshold status, answered/unanswered
  - Bulk select actions
- [x] Build `AnswerComposer` component:
  - Format selector: text / video / social post / external link / approve AI draft
  - Text: markdown editor with preview
  - Video: URL input + embed preview
  - Social post: URL input + oEmbed preview (Twitter, Instagram, YouTube, TikTok)
  - External link: URL + description field
  - AI draft approval: shows AI analysis with "Confirm as accurate" button
- [x] Build answer submission flow (text, role-gated):
  - Responder: save as draft (pending approval)
  - Editor: publish immediately
  - Admin: publish + retroactive edit
  - Email notification to question author on answer published
- [ ] Build `TeamManagement` component:
  - Invite staff by email
  - Assign role (admin/editor/responder)
  - List current team members
  - Remove team member
- [ ] Build basic `Analytics` component:
  - Questions received this week / last 4 weeks (bar chart)
  - Top 5 topics by volume
  - Participation rate sparkline

#### Answer display on profile
- [ ] Build answer rendering for all 5 formats
- [ ] Implement oEmbed caching (store HTML in `media_embeds` JSONB field)
- [ ] Build three-tier visual system (🤖 / ✅ / ✍️)
- [ ] Build AI answer dispute flow (flag + admin review)

### Acceptance criteria
- [x] Politician can complete Tier 2 verification using any 2 methods (A + E)
- [x] Verified politician can access dashboard and see question inbox
- [ ] Politician can answer a question in all 5 formats
- [ ] Team members can be invited and given appropriate role-based access
- [x] Answered questions display correctly on public profile with correct tier label

---

## Sprint 6 — Launch Prep (Weeks 11-12)

### Goal
Platform ready for pilot launch in one congressional district. Moderation, notifications, and polish complete.

### Tasks

#### Moderation
- [ ] Build report button + report modal on all question cards
- [ ] Implement 3-report threshold → auto-hide pending moderation
- [ ] Build `/admin/moderation` queue:
  - List of flagged questions with report reasons
  - Approve (restore) / Remove / Escalate actions
  - One-click bulk actions
- [ ] Implement profanity filter (use `bad-words` npm package + custom list)
- [ ] Build spam detection: same user, same politician, >3 near-identical questions in 24h
- [ ] Build `/admin` dashboard:
  - Platform stats (users, questions, votes, participation rates)
  - Politician verification queue
  - Seeded question review queue
  - User management

#### Notifications
- [ ] Set up Resend email templates:
  - Weekly digest template
  - Answer notification template
  - Threshold alert template
  - Politician welcome email template
- [ ] Build email preference center (`/settings/notifications`)
- [ ] Wire weekly digest to pg_cron weekly_reset event
- [ ] Wire answer notifications to answer INSERT trigger

#### Homepage
- [ ] Build full homepage:
  - Hero with search + "Ask your representative" CTA
  - Top 5 most-upvoted questions this week
  - Trending politicians (most question activity)
  - Leaderboard preview (top 3 + bottom 3)
  - "How it works" explainer (3 steps)
- [ ] Build `/about` page
- [ ] Build `/how-it-works` page
- [ ] Build `/faq` page

#### Performance + polish
- [ ] Lighthouse audit: target 90+ score on all metrics
- [ ] Optimize politician profile page (image optimization, lazy loading)
- [ ] Add loading skeletons for all async components
- [ ] Add error boundaries and fallback UI
- [ ] Test on mobile (responsive design audit)
- [ ] Cross-browser test (Chrome, Firefox, Safari)
- [ ] Accessibility audit (axe-core)

#### Launch
- [ ] Choose pilot congressional district (swing district, active local media)
- [ ] Reach out to 3-5 local journalists with the "unanswered questions" story pitch
- [ ] Prepare press kit (screenshots, one-pager, founder quote)
- [ ] Set up error monitoring (Sentry)
- [ ] Set up analytics (Vercel Analytics + PostHog for events)
- [ ] Configure uptime monitoring
- [ ] Create support email + response templates
- [ ] Soft launch: share with 50-100 beta users for 1 week
- [ ] Full launch

### Acceptance criteria
- [ ] Platform passes Lighthouse score 90+ (Performance, Accessibility, SEO)
- [ ] Moderation queue functional with admin review capability
- [ ] Weekly email digest sends correctly at Monday reset
- [ ] Platform handles 100 concurrent users without degradation
- [ ] Pilot district has 10+ seeded questions per federal representative
- [ ] Local journalist has been briefed and story is in the pipeline

---

## Phase 2 — Social Distribution Layer (Weeks 13-20)

### P2-S1 — Social Account Infrastructure (Weeks 13-16)

#### Architecture
- [ ] Build abstract `SocialPublisher` interface:
  ```typescript
  interface SocialPublisher {
    createPost(content: PostContent): Promise<PostResult>
    schedulePost(content: PostContent, time: Date): Promise<ScheduledPost>
    deletePost(postId: string): Promise<void>
    getAccountStats(accountId: string): Promise<AccountStats>
  }
  ```
- [ ] Implement `TwitterPublisher` (Twitter/X Basic API)
- [ ] Implement `FacebookPublisher` (Meta Graph API)
- [ ] Implement `TikTokPublisher` (TikTok for Developers API)
- [ ] Implement `ThreadsPublisher` (Threads API)
- [ ] Build routing layer: routes to correct platform(s) based on politician social handles

#### Post content system
- [ ] Build `PostContentGenerator`:
  - Weekly top questions post template
  - Participation rate milestone template
  - Answer event template
  - Unanswered streak template
- [ ] Build OG image generator (Vercel OG Image API):
  - Politician photo + name + question text + vote count card
  - Participation rate card
- [ ] Store `shareable_card` payload on weekly snapshots

#### Account management
- [ ] Build social account creation workflow (admin-initiated for Phase 2 launch)
- [ ] Build account registry (maps politician_id → {platform, account_id, handle})
- [ ] Build post scheduling queue (tied to weekly_reset event)
- [ ] Build performance monitoring (engagement tracking per post)

#### Launch
- [ ] Create and verify accounts for all 537 federal officials
- [ ] Run first automated Monday posting cycle
- [ ] Monitor for platform policy issues (impersonation flags)

### P2-S2 — Scale + Monetization (Weeks 17-24)

#### All 50 states
- [ ] Ingest all state legislators (OpenStates API for all 50 states)
- [ ] Ingest top 500 mayors (manual + Wikipedia data)
- [ ] Scale seeded question generation for ~8,000 total politicians

#### Premium politician profiles
- [ ] Build Stripe subscription integration
- [ ] Build premium dashboard tier:
  - Constituent concern heatmap (topics by district geography)
  - Week-over-week trend charts
  - Export to CSV / Fireside-compatible format
  - CRM webhook integration (Fireside, Indigov)
- [ ] Define pricing: $50/month (state/local) / $200/month (federal)

#### Journalist data API
- [ ] Build API key management system
- [ ] Build `/api/v1/politicians` endpoint (aggregated stats)
- [ ] Build `/api/v1/questions` endpoint (trending topics, top questions)
- [ ] Build `/api/v1/participation` endpoint (response rate time series)
- [ ] Build API documentation page
- [ ] Pricing: $500/month (newsroom license)

---

## Phase 3 — Mobile + Full US Coverage (Months 13-24)

### Mobile apps (Flutter)
- [ ] Flutter project setup with existing Supabase backend
- [ ] iOS + Android builds
- [ ] App Store + Play Store submission
- [ ] Push notification support

### Fireside / Indigov CRM integration
- [ ] Research Fireside API access
- [ ] Build question export in Fireside-compatible format
- [ ] Build webhook that delivers threshold questions to congressional office CRMs
- [ ] Pilot with 2-3 congressional offices

---

## Phase 4 — International (Months 25-36)

### UK launch
- [ ] Legal review: UK defamation law, Ofcom compliance
- [ ] Data infrastructure: TheyWorkForYou API integration
- [ ] UK politician database seeding (~930 MPs + Lords + devolved)
- [ ] GDPR compliance layer
- [ ] UK-specific verification: official parliament.uk email domains

### Australia launch
- [ ] Legal review: Australian defamation law
- [ ] Data infrastructure: OpenAustralia Foundation API
- [ ] Australian politician database (~7K officials)

---

## Engineering Conventions

### Branch strategy
- `main` → production (Vercel production deployment)
- `staging` → staging environment (Vercel preview)
- `feature/[sprint]-[feature-name]` → feature branches
- PRs require 1 review before merge to staging; 2 reviews to main

### Commit message format
```
[S1] feat: implement anonymous auth flow
[S2] fix: politician slug collision for common names
[S3] perf: add GIN index for full-text question search
```

### Environment variables required
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
STRIPE_SECRET_KEY
STRIPE_IDENTITY_WEBHOOK_SECRET
CLOUDFLARE_TURNSTILE_SECRET_KEY
NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY
RESEND_API_KEY
FEC_API_KEY
OPENSTATES_API_KEY
VOTESMART_API_KEY
CONGRESS_API_KEY
TWITTER_BEARER_TOKEN (Phase 2)
META_ACCESS_TOKEN (Phase 2)
```

### File structure
```
/app
  /[slug]          → Politician profile (SSR)
  /leaderboard     → Leaderboard page
  /federal         → Federal officials browse
  /state/[code]    → State browse
  /topic/[slug]    → Topic browse
  /verify          → Verification wizard
  /dashboard       → Politician dashboard
  /admin           → Admin panel
  /api             → API routes
    /questions
    /votes
    /answers
    /verify
    /ai-analysis
    /admin
/components
  /politician      → PoliticianHeader, ProfileCard, etc.
  /questions       → QuestionCard, QuestionList, AskForm
  /votes           → VoteButton
  /answers         → AnswerCard, AnswerComposer, AIAnalysisCard
  /auth            → AuthModal, UserMenu
  /leaderboard     → LeaderboardTable
  /ui              → shadcn/ui components
/lib
  /supabase        → Supabase clients (server + client)
  /ai              → AI analysis + seeded question generation
  /verification    → Verification method implementations
  /social          → SocialPublisher interface + implementations (Phase 2)
  /name-resolution → Fuzzy matching logic
/types             → TypeScript type definitions
/scripts           → Data seeding + admin scripts
```

---

*Version: 1.0*
*Last updated: March 2026*
*Owner: Quinnivations LLC*
