# WhyTho — Prototype Requirements (v1.0)

> **Scope:** US-only MVP. Federal officials + top 10 states by population. Core Q&A loop, weekly reset, seeded questions, politician verification (Tier 2), AI-labeled answers.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15+ (App Router, TypeScript) |
| Auth | Supabase Auth (anonymous + email magic link + Google OAuth) |
| Database | Supabase PostgreSQL |
| Real-time | Supabase Broadcast |
| Hosting | Vercel |
| UI | shadcn/ui + Tailwind CSS |
| Bot prevention | Cloudflare Turnstile |
| ID verification | Stripe Identity |
| AI | Anthropic Claude API (claude-haiku-4-5 for classification; claude-sonnet-4-6 for generation) |
| Cron | Supabase pg_cron |

---

## R1 — Authentication

### R1.1 Anonymous auth
- Users can browse all content without signing in
- To upvote or submit a question, prompt sign-in (non-blocking modal, not redirect)
- Support `supabase.auth.signInAnonymously()` — assigns UUID, preserves session
- Anonymous users have public-facing username (auto-generated: "Voter_[4-char-code]")

### R1.2 Account creation
- Sign in via: Google OAuth, Apple Sign-In, email magic link
- On first sign-in: prompt for display name (optional) and state of residence (optional)
- Link anonymous session to real account on sign-in (`linkIdentity()`)

### R1.3 Anti-fraud
- Cloudflare Turnstile on all vote and question submission endpoints
- Rate limiting: max 30 votes per user per 10 minutes; max 5 question submissions per user per day
- One vote per user per question per week (enforced at DB level via UNIQUE constraint)
- Account age ≥ 24 hours to submit questions (configurable)

### R1.4 Politician auth
- Separate "Politician / Staff" sign-in flow
- After sign-in, redirect to verification flow (see R6)
- Role-based permissions enforced via RLS (admin, editor, responder)

---

## R2 — Politician Profiles

### R2.1 Auto-created profiles
- Every politician in the database has a profile page at `/[slug]`
- Profiles exist and are publicly visible before any politician claims them
- Profile displays: photo (from Ballotpedia/Wikipedia), full name, office, district, state, party, social links
- Unverified profiles show: "This profile has not been claimed. Are you [Name]? Verify your identity →"

### R2.2 Profile page layout
- **Header:** Photo, name, office, district, verified badge (if applicable), response rate badge
- **Week / Month / Year / All Time tabs:** Questions persist forever; filterable by time period (default: Week)
- **Ask a Question:** Inline question submission form (Week tab only)
- **Answers:** Politician's responses attached to each answered question
- **AI Analysis section** (if answers exist): Clearly labeled 🤖 AI Analysis panel
- **Week badges:** Older questions in Month/Year/All Time views show which week they were submitted

### R2.3 Participation rate display

```
Response Rate · Week 12, 2026: 0% (0 of 3 answered)
Response Rate · Last 30 Days:  0% (0 of 12 answered)
Response Rate · This Year:     0% (0 of 40 answered)
Response Rate · All Time:      0% (0 of N answered)
```

**Denominator formula (as of March 2026):**
```
denominator = min(questions_in_period, N)
N: week=10, month=20, year=40, all=actual_total
```
- No minimum vote threshold — all submitted questions count
- Voting disabled on questions from previous weeks
- Display even if politician has never claimed profile

**Future (AI clustering):** Similar questions across weeks will be merged into topic groups. Month/Year/All Time views will show merged topics as single entries with aggregate vote counts.

### R2.4 Slug format
- URL-safe, lowercase, hyphenated full name: `donald-trump`, `nancy-pelosi`
- For common name collisions: append state + office: `john-smith-tx-senator`
- Slugs are permanent and never change (even if politician changes office)

### R2.5 Politician data seeding
Initial data load from:
- Congress.gov API → all 537 federal officials
- OpenStates API → state legislators in CA, TX, FL, NY, PA, IL, OH, GA, NC, MI
- Ballotpedia API → additional metadata, photos, official URLs
- Manual curation → top 50 mayors

Fields to seed: full_legal_name, display_name, office, district, state, party, photo_url, ballotpedia_id, social_handles, aliases[]

---

## R3 — Question Submission

### R3.1 Submission flow
1. User clicks "Ask a Question" on any politician profile (or from homepage search)
2. If not signed in: modal prompt to sign in (anonymous auto-sign-in is acceptable)
3. Free text field: 10-500 characters, character counter displayed
4. Topic tag selector: multi-select from predefined categories (Healthcare, Economy, Housing, Education, Environment, Foreign Policy, Immigration, Criminal Justice, Taxes, Other)
5. Submit button disabled until 10+ characters entered

### R3.2 Duplicate detection (pre-submit)
- On typing (debounced, 500ms): call AI deduplication endpoint
- If similar question exists (confidence ≥ 85%): show suggestion card
  - "A similar question already exists — upvote it instead?"
  - Shows existing question + current vote count
  - User can dismiss and submit their own version
- Deduplication is a suggestion only, never blocks submission

### R3.3 Name resolution (if submitting from search, not profile page)
- User types politician name in search field
- System runs multi-layer fuzzy match (see R3.4)
- Disambiguation card shown if 2+ matches
- Selected politician confirmed before submission

### R3.4 Name resolution layers
1. Exact match on `display_name`, `full_legal_name`, `aliases[]`
2. PostgreSQL trigram similarity (pg_trgm) with threshold 0.85
3. Alias database lookup (politician_aliases table)
4. Contextual: if user has provided state, weight politicians from that state
5. Disambiguation UI: show top 2-3 matches, user selects

### R3.5 Question display
- Questions visible immediately after submission (no moderation queue for basic questions)
- Questions with 3+ reports enter moderation queue (hidden pending review)
- Question card shows: text, topic tags, vote count, time since submitted, "Seeded" label if applicable, answer (if exists)

---

## R4 — Voting

### R4.1 Upvote mechanics
- One vote per user per question per week
- Vote value: +1 (upvote) only in Phase 1 (downvote deferred)
- Vote resets with weekly cycle (user can re-vote on same question each week)
- `net_upvotes` = sum of all votes for that question in current week

### R4.2 Real-time vote counts
- Optimistic UI: increment displayed count immediately on click
- Background: POST to `/api/votes`
- On 409 (duplicate vote): roll back UI, show "Already voted this week"
- Supabase Broadcast: push updated count to all viewers of that politician page
- PostgreSQL trigger: `INCREMENT vote_count` and `net_upvotes` on votes INSERT

### R4.3 Vote display
- Vote count displayed on every question card
- Questions sorted by net_upvotes (default) with option to sort by newest
- Questions with net_upvotes ≥ 10 display a "🔥 Trending" indicator
- Vote count animates on change (real-time update)

### R4.4 Vote fraud prevention
- `UNIQUE(user_id, question_id, week_number)` constraint at DB level
- Cloudflare Turnstile on vote endpoint (challenge if suspicious)
- Max 30 votes per user per 10-minute window (rate limiter in `db_pre_request`)
- IP-based rate limiting: max 100 votes per IP per hour

---

## R5 — Weekly Reset

### R5.1 Reset schedule
- Runs every Monday at 12:00 AM Eastern (05:00 UTC)
- Implemented as Supabase pg_cron job calling a PostgreSQL function

### R5.2 Reset procedure (atomic transaction)
```sql
-- Step 1: Snapshot top 10 questions per politician
INSERT INTO weekly_snapshots (politician_id, week_number, top_questions, ...)
SELECT ...

-- Step 2: Archive all active questions
UPDATE questions SET status = 'archived' WHERE week_number = current_week

-- Step 3: Refresh materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY current_week_leaderboard

-- Step 4: Fire reset event (notify application layer)
NOTIFY weekly_reset, '{"week": 202611}'
```

### R5.3 Post-reset seeded question generation
- Application layer listens for `weekly_reset` Postgres NOTIFY
- For each politician with active profile: trigger seeded question generation job
- New seeded questions generated within 2 hours of reset

### R5.4 Historical browsing
- All archived questions accessible via `/[politician-slug]?week=[week_number]`
- Participation rate history shown as sparkline chart on politician profile
- Weekly snapshots table provides all-time record

### R5.5 Week number format
`YYYY * 100 + ISO_WEEK_NUMBER` — e.g., week 11 of 2026 = `202611`

---

## R6 — Politician Verification

### R6.1 Verification entry points
- "Claim this profile" button on any unverified politician profile
- Direct URL: `/verify`
- Email invitation (admin can invite politicians directly)

### R6.2 Tier 2 verification (requires any TWO of the following)

**Method A — Government email**
1. User enters their official government email address
2. System checks domain against CISA dotgov-data allowlist
3. Magic link sent to that address
4. User clicks link → email verified ✓

**Method B — FEC filing ID**
1. User enters their FEC Candidate ID (format: H/S/P + 9 digits)
2. System queries FEC API: `https://api.open.fec.gov/v1/candidates/{id}`
3. Cross-references name against profile being claimed
4. Match confidence ≥ 90% → verified ✓

**Method C — Social media code post**
1. System generates unique 6-character verification code
2. User posts code to their official Twitter/X or Facebook account
3. User submits URL of the post
4. System fetches post via oEmbed/scrape, confirms code present
5. Account must be linked from Ballotpedia or official .gov page → verified ✓

**Method D — Stripe Identity**
1. User completes Stripe Identity flow (government ID + selfie)
2. System receives `identity.verification_session.verified` webhook
3. Cross-references verified legal name against politician record
4. Name match ≥ 85% → verified ✓
5. Cost: $1.50 per verification (passed to user or absorbed)

**Method E — Official website meta tag**
1. System provides `<meta name="whytho-verification" content="[unique-code]">`
2. User adds meta tag to official campaign or government website
3. User submits website URL
4. System crawls URL, confirms meta tag present
5. Website must match Ballotpedia-listed official site → verified ✓

### R6.3 Post-verification
- Profile updated: `verification_tier = 2`
- "VERIFIED ✓" badge displayed on profile
- Welcome email with dashboard access instructions
- Admin notified for spot-check review

### R6.4 Candidate verification (not yet elected)
- FEC filing is sufficient as one signal (Method B)
- Must pair with any other method
- Profile shows "CANDIDATE — VERIFIED ✓" badge
- Eligible for same features as elected officials

---

## R7 — Politician Dashboard

### R7.1 Dashboard access
- `/dashboard` — requires authenticated politician account with verified profile
- Role-based: admin and editor see full dashboard; responder sees answer queue only

### R7.2 Inbox view
- Questions sorted by net_upvotes (descending)
- Filter options: topic, date range, answered/unanswered, above/below threshold
- Default view: unanswered questions with net_upvotes ≥ 10
- Bulk actions: mark as noted, dismiss (doesn't affect public view)

### R7.3 Answer composer
**Format options:**
1. **Text** — rich text editor (markdown supported); max 2000 characters
2. **Video** — paste YouTube or Vimeo URL; system generates embed preview
3. **Social post** — paste Twitter/X, Instagram, Facebook, or TikTok URL; oEmbed renders
4. **External link** — URL + brief description; renders as linked card
5. **Approve AI draft** — if AI analysis exists, politician can approve it as accurate (changes label to "✅ Politician Verified")

**Workflow:**
- Responder: can draft but not publish
- Editor: can draft and publish
- Admin: can draft, publish, and retroactively edit/remove answers

### R7.4 Team management
- Invite staff by email
- Assign roles: admin, editor, responder
- Audit log: every answer records `answered_by` user ID and role
- Remove team members at any time

### R7.5 Analytics (Phase 1 — basic)
- Total questions submitted this week / last 4 weeks
- Top 5 topics by question volume
- Participation rate trend (sparkline, 8-week)
- Questions answered / unanswered breakdown

---

## R8 — Seeded / Filler Questions

### R8.1 Generation trigger
- Triggered on: new politician profile creation, weekly reset event, manual admin trigger
- Rate: 10-20 seeded questions per politician per week
- Maximum 30 seeded questions visible at any time per politician

### R8.2 Data sources
- GovTrack API: recent votes on major legislation
- Congress.gov API: bill sponsorships, committee assignments
- Ballotpedia: campaign positions, biography
- VoteSmart API: voting record, public statements, interest group ratings
- OpenSecrets API: campaign finance data (top donors, PAC affiliations)

### R8.3 Generation prompt (Claude API)
```
System: You generate substantive, neutral civic questions a constituent might want to ask an elected official. 
Always base questions on their actual public record. Never generate leading, hostile, or softball questions.
Questions should be specific and reflect genuine constituent concerns.

User: Generate 15 questions for {politician_name}, {office}, representing {district}.
Their recent record includes: {voting_record_summary}
Their stated positions include: {position_summary}
Current top issues in {district}: {district_issues}

Return JSON array of objects: [{question: string, topic: string, source: string}]
```

### R8.4 Quality filters
- Length: 20-300 characters
- No leading questions ("Why did you vote to destroy...") — AI guardrail
- No softball questions ("What's your greatest accomplishment...") — AI guardrail
- Duplicate check against existing questions (semantic similarity > 80% = discard)
- Human spot-check: 10% random sample reviewed by admin before publishing

### R8.5 Labeling (non-negotiable)
Every seeded question displays:
```
📋 Suggested Question
AI-generated from public record. Not submitted by a user.
```
Visual treatment: muted background, italic text, smaller font weight than user questions

### R8.6 Seeded question lifecycle
- Seeded questions CAN be upvoted by users
- Upvoted seeded questions (≥10 net upvotes) COUNT toward participation rate
- Seeded questions with 0 upvotes after 2 weeks are removed on next reset
- A user submitting a very similar question to a seeded question: seeded version removed, user version takes its place (credit transferred)

---

## R9 — AI Analysis (Politician Answers)

### R9.1 Generation scope
Phase 1: Generate AI analysis for top 5 questions per politician (by vote count) that have no direct politician answer.

### R9.2 Generation approach
- RAG architecture: retrieve source documents before generating
- Sources: VoteSmart, GovTrack, Congress.gov, official press releases
- Every answer includes citations with dates
- Confidence levels: High (3+ sources), Medium (1-2 sources), Low (inference), Insufficient (no clear record)

### R9.3 Labeling (non-negotiable)
```
🤖 AI Analysis of Public Record
This answer was generated by AI based on [Politician]'s public voting record and official statements.
This is NOT a statement from [Politician].
Sources: [list of cited sources with dates]
Confidence: High / Medium / Low / Insufficient
```

### R9.4 Three-tier answer display
- 🤖 AI Analysis — muted gray background, clearly labeled
- ✅ Politician Verified — green border, politician has confirmed accuracy
- ✍️ Direct Answer — blue border, politician wrote directly

### R9.5 Guardrails
- Never speculate beyond documented positions
- Default to "Insufficient public record" rather than guessing
- No commentary on personal life, family, or non-political matters
- If asked about future intent: only reference explicitly stated campaign commitments
- Full audit log of all AI-generated content retained indefinitely

### R9.6 Dispute mechanism
- Politician or verified staff can flag AI answer as inaccurate
- Flagged answers display: "⚠️ Disputed — Politician contests this AI analysis"
- Admin reviews within 48 hours; outcome: corrected, removed, or upheld
- Politician encouraged to submit direct answer to replace AI analysis

---

## R10 — Leaderboard

### R10.1 Leaderboard page (`/leaderboard`)
- Top responders this week (highest participation rate among politicians with ≥5 qualifying questions)
- Bottom responders this week (lowest participation rate among politicians with ≥5 qualifying questions)
- Filter by: federal/state, chamber, party, state
- Updated in real-time from materialized view (refreshed every 30 seconds)

### R10.2 Leaderboard metrics displayed
- Politician name + office + state
- Participation rate (%)
- Questions answered / qualifying questions
- Streak (consecutive weeks with ≥1 answer)
- Verified badge status

### R10.3 Embed widget (Phase 1 — basic)
- `<iframe>` embed for external sites
- Shows: politician name, participation rate, top unanswered question
- Used by local news partners

---

## R11 — Search & Discovery

### R11.1 Global search
- Search bar in header: searches politician names, question text, topics
- PostgreSQL full-text search with GIN indexes
- Results ranked by: exact match > partial match > fuzzy match
- Politician results show: photo thumbnail, office, participation rate badge
- Question results show: question text, politician name, vote count

### R11.2 Homepage
- Hero: search bar + "Ask your representative" CTA
- Featured: Top 5 most-upvoted questions this week (across all politicians)
- Trending politicians: most question activity this week
- Leaderboard preview: top 3 and bottom 3 responders

### R11.3 Browse by
- `/federal` — all federal officials
- `/state/[state-code]` — all officials for a state
- `/topic/[topic-slug]` — all questions tagged with a topic
- `/leaderboard` — response rate rankings

---

## R12 — Notifications

### R12.1 Email notifications
- Weekly digest: "Your representatives' top questions reset Monday" (opt-in)
- Answer alert: "A politician answered a question you upvoted"
- Threshold alert: "Your question hit 10+ upvotes and now counts toward [Politician]'s participation rate"
- Politician dashboard: "You have 12 new questions this week above threshold"

### R12.2 Email service
- Resend (resend.com) — generous free tier, simple API, Next.js integration
- Weekly digest triggered by weekly_reset pg_cron event

---

## R13 — Moderation

### R13.1 User reporting
- "Report" button on every question
- Report categories: Spam, Harassment, Misinformation, Duplicate, Inappropriate
- 3 reports from different users → question moves to moderation queue (hidden from public)
- Moderator reviews: approve (restore), remove, or escalate

### R13.2 Automated filters
- Profanity filter on question submission (configurable blocklist)
- Spam detection: same user submitting >3 identical/near-identical questions
- Bot detection: Cloudflare Turnstile escalation for suspicious patterns

### R13.3 Admin panel (`/admin`)
- Moderation queue (flagged questions)
- Politician verification review queue
- Seeded question quality review
- User management (ban, warn, reset)
- Platform statistics dashboard

---

## Non-Functional Requirements

### Performance
- Politician profile page: < 1.5s LCP (Largest Contentful Paint)
- Vote submission: < 200ms perceived response (optimistic UI)
- Search results: < 500ms
- Leaderboard materialized view refresh: every 30 seconds

### Scale targets (Phase 1)
- 10,000 monthly active users
- 1,000 politician profiles
- 50,000 questions total
- 500,000 votes total
- 1,000 concurrent users (peak)

### Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigable
- Screen reader compatible (semantic HTML, ARIA labels)

### SEO
- Server-side rendered politician profile pages (Next.js SSR)
- Structured data: `Person` and `GovernmentOrganization` schema markup
- Open Graph tags on every page (question cards shareable with preview)
- Sitemap auto-generated from politician slugs

### Security
- All RLS policies enabled in Supabase
- No sensitive data in URL parameters
- HTTPS everywhere
- Environment variables for all API keys (never in client bundle)
- Regular automated dependency scanning

---

## Out of Scope for Prototype

- Mobile native apps (Flutter) — Phase 3
- Social media auto-posting accounts — Phase 2
- International politicians — Phase 4
- Direct messaging between users and politicians — Phase 3
- Journalist API — Phase 3
- Premium politician subscriptions — Phase 3
- Video recording in-platform — Phase 3
- SMS notifications — Phase 3

---

*Version: 1.0*
*Last updated: March 2026*
