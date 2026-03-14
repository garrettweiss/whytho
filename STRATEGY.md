# WhyTho — Full Product Strategy

> **Tagline:** Silence is its own answer.
> **One-liner:** A platform where the public votes on the questions they most want politicians to answer — and whether they respond is always public.

---

## Table of Contents

1. [Vision & Mission](#1-vision--mission)
2. [The Problem](#2-the-problem)
3. [Competitive Landscape](#3-competitive-landscape)
4. [What Has & Hasn't Worked — Lessons from the Graveyard](#4-what-has--hasnt-worked)
5. [Market Opportunity](#5-market-opportunity)
6. [Product Strategy](#6-product-strategy)
7. [Name & Brand](#7-name--brand)
8. [Core User Experience — Citizen](#8-core-user-experience--citizen)
9. [Core User Experience — Politician](#9-core-user-experience--politician)
10. [AI Strategy](#10-ai-strategy)
11. [Politician Verification System](#11-politician-verification-system)
12. [Politician Name Resolution](#12-politician-name-resolution)
13. [Seeded / Filler Questions](#13-seeded--filler-questions)
14. [Weekly Reset Mechanic](#14-weekly-reset-mechanic)
15. [Social Distribution Layer (Phase 2)](#15-social-distribution-layer-phase-2)
16. [Technical Architecture](#16-technical-architecture)
17. [Data Model](#17-data-model)
18. [Geographic & Global Strategy](#18-geographic--global-strategy)
19. [Monetization](#19-monetization)
20. [Go-To-Market Strategy](#20-go-to-market-strategy)
21. [Risks & Mitigations](#21-risks--mitigations)
22. [Metrics & Success Criteria](#22-metrics--success-criteria)
23. [Roadmap](#23-roadmap)

---

## 1. Vision & Mission

**Vision:** A world where every elected official faces the same questions their constituents actually want answered — publicly, on the record, every week.

**Mission:** Build the infrastructure for democratic accountability that makes non-responsiveness as visible and consequential as responsiveness.

WhyTho is not a petition platform, a contact-your-rep tool, or a political social network. It is an accountability engine: a structured, weekly public record of what citizens want to know and whether their representatives answered.

---

## 2. The Problem

### Politicians control their message. Constituents don't.

Every channel through which citizens currently interact with politicians is controlled, filtered, or structured in favor of the politician:

- **Press conferences:** Reporter questions are pre-screened or politicians dodge at will
- **Town halls:** Staff select which questions to ask; rarely archived publicly
- **Official contact forms:** Questions go into a CRM black hole; templated responses are the norm; 81 million constituent messages sent to Congress in 2022 received 3.5 million actual responses — a 4% response rate
- **Reddit AMAs:** One-time events; politicians cherry-pick softballs; no persistence
- **Social media Q&A:** Flooded with trolls; politicians broadcast, rarely respond; no accountability mechanism; no public record of non-answers
- **Tele-town halls:** 2M+ dials in 2022, but questions are screened; approval ratings rise but accountability doesn't

**The result:** Citizens don't know what their representatives have been asked and refused to answer. Non-responsiveness is invisible.

### The core gap

No platform combines:
1. Public question submission to specific officials
2. Democratic upvoting to surface what constituents care most about
3. Politician-owned verified profiles with direct answer capability
4. A public, persistent record of response rates
5. A weekly reset that keeps content fresh and creates a recurring accountability cycle

---

## 3. Competitive Landscape

### Direct predecessors (all dead or pivoted)

| Platform | What it did | Why it died |
|---|---|---|
| **AskThem.io** | Public Q&A with 142K officials; upvoting | $35K in funding; 0.05% politician participation; no accountability teeth; UX friction |
| **White House "We The People"** | Petition platform with response threshold | Overrun by joke petitions; shut down 2017; politicians still controlled responses |
| **Brigade** ($40-50M) | Civic social network | Failed to achieve user scale; no clear utility |
| **iCitizen** | Upvoting issues on politician pages | Couldn't sustain engagement; dissolved |
| **Countable** | Civic engagement app | Pivoted to enterprise AI for customer engagement |
| **DemocracyOS** | Deliberation with upvoting | Never focused on directed politician Q&A |

### Indirect competitors (alive but different)

| Platform | Relevance | Key gap |
|---|---|---|
| **Reddit AMAs** | Proves massive demand for politician Q&A | One-time events; no persistence; no accountability record |
| **Slido** | Nails upvoted Q&A mechanics | B2B/events only; no civic accountability |
| **Change.org** | Public pressure on officials | Petitions only; no Q&A; no response tracking |
| **Twitter/X** | Where political Q&A actually happens | No structure; trolls; no accountability record; broadcast not dialogue |
| **GovTrack** | 20+ year survivor in civic tech | Legislation tracking only; no Q&A |
| **ISideWith** | 87M users; politician position matching | Passive; no direct engagement; no accountability |
| **Ballotpedia** | Authoritative politician data | Reference only; no engagement layer |
| **Abgeordnetenwatch.de** | Exact model in Germany since 2004 | German only; no weekly reset; no AI layer |

### Key competitive insight
Abgeordnetenwatch.de in Germany has run this model successfully for 20+ years — validating the concept's viability. No US equivalent exists with real traction.

---

## 4. What Has & Hasn't Worked

### The ten failure modes of AskThem.io (and how WhyTho avoids them)

| AskThem Failure | WhyTho Fix |
|---|---|
| Launched covering 142,000 officials on $35K | Launch with top ~9,000 federal + state officials; prove model before expanding |
| 0.05% politician participation at launch | Platform creates value WITHOUT participation; response rate IS the product |
| Address-lookup friction before asking | No address required; anyone asks any politician immediately |
| Questions delivered via Twitter mention — no teeth | Public response rate scoreboard; non-answer is prominently displayed |
| Petition threshold created death spiral | All questions visible; threshold only affects participation count metric |
| No recurring cadence | Weekly reset is core mechanic; Monday = new cycle = media hook |
| Nonprofit dependent on grants | PBC structure; earned revenue from Day 1 planning |
| No earned revenue model | Politician premium profiles; data API for journalists |
| Social network ambition | Tool first — one thing done exceptionally well |
| No community management | Dedicated moderation + curation from launch |

### What has worked across civic tech

- **Narrow focus wins:** GovTrack (bill tracking), ISideWith (voter matching), OpenSecrets (money in politics) — each doing one thing for 10-20+ years
- **One-sided value first:** ISideWith built 87M users before politicians were involved at all
- **Making non-participation the story:** When a politician doesn't respond, that IS the news
- **Local media partnerships:** Local newspapers cover "what are voters in [district] asking?" weekly
- **SEO as primary distribution:** Politician profile pages ranking for "[politician name] questions"

---

## 5. Market Opportunity

### US addressable market

- **537** federal officials (435 House, 100 Senate, President + Cabinet)
- **7,383** state legislators across 50 states
- **~90,000** county and municipal officials in major metros
- **~240M** eligible US voters
- **~130M** politically engaged adults online

### The engagement signal is massive

- Barack Obama's 2012 Reddit AMA crashed Reddit's servers
- Congressional offices received **81 million constituent messages** in 2022
- Political content drives the highest engagement rates on every social platform
- Town halls with constituent Q&A show approval rating increases of +18 points

### Why now

- Trust in government and media is at historic lows — demand for direct accountability is high
- AI makes seeded question generation and answer summarization newly tractable
- Weekly reset mechanic addresses civic tech's core engagement decay problem
- Political polarization has increased demand for direct constituent-to-official communication channels

---

## 6. Product Strategy

### Core strategic principles

**1. The platform works without politician participation.**
Value to citizens must exist before a single politician claims a profile. The response rate — "0 of 847 questions answered" — is itself informative and shareable. This avoids the cold-start problem that killed AskThem.io.

**2. Non-response is a feature, not a bug.**
The primary accountability mechanism is visibility of non-response. Politicians who ignore questions are not failing to use the platform — they are actively generating content (the unanswered question record) that citizens and journalists find valuable.

**3. Weekly reset creates a content heartbeat.**
Every Monday, the slate resets. This creates: a recurring media hook, a manageable engagement cycle for politicians, a natural news cadence, and protection against stale questions dominating forever. The reset is architecturally central, not cosmetic.

**4. Start narrow and achieve depth before breadth.**
Launch with top federal + major state officials. Get to 80%+ participation in one cohort before expanding. AskThem.io failed by going wide immediately.

**5. Integrate into existing politician workflows.**
Questions should be deliverable in formats that fit existing CRM workflows (Fireside, Indigov). Be an input to existing systems, not a competing destination.

**6. Seeded questions ensure every profile has immediate value.**
Auto-generated, clearly labeled filler questions from public records (voting history, policy positions, public statements) ensure no profile is empty. Citizens engage with seeded questions immediately; their upvotes signal which matter most.

### Phase strategy

| Phase | Focus | Timeline |
|---|---|---|
| **Phase 1** | Build and launch US-only prototype; federal officials + top 10 states | 0-6 months |
| **Phase 2** | Social distribution layer; automated profile posts on Twitter/X, TikTok, Facebook | 6-12 months |
| **Phase 3** | All 50 states; county/municipal; premium politician profiles; journalist API | 12-24 months |
| **Phase 4** | UK + Australia international expansion | 24-36 months |
| **Phase 5** | EU, Canada, broader global expansion | 36+ months |

---

## 7. Name & Brand

### Selected name: WhyTho

**Rationale:** WhyTho does three things simultaneously:
1. Describes the product — weekly unannounced questions politicians must face
2. Establishes tone — fun, slightly menacing, anti-bureaucratic, universally understood
3. Embeds the weekly reset mechanic — every Monday is a WhyTho moment

**Domain strategy:** whytho.com / whytho.io (verify availability; acquire both)

**Tagline:** *Silence is its own answer.*

**Brand personality:**
- Trusted and verified — feels legitimate, not a troll platform
- Approachable — not stiff or government-portal feeling
- Slightly irreverent — asks the question everyone is thinking but politicians dodge
- Direct — every design decision should communicate "we don't accept non-answers"

**Runner-up names considered:**
- HeldTo — pure accountability, great domain availability, slightly awkward standalone
- AskDrop — modern, verb-ready, strong startup energy
- TownMic — cleanest brand-domain combination, slightly earnest
- Grill.us — cleverest domain hack, limited by .us TLD for global ambitions
- WeAsk — simplest, most inclusive, most globally scalable

---

## 8. Core User Experience — Citizen

### Discovery

Citizens arrive via:
- SEO: "[politician name] questions" → politician profile page
- Social share: someone shares a question they asked or upvoted
- Media coverage: local newspaper "Top 10 unanswered questions for [rep]"
- Direct URL: whytho.com/[politician-slug]

### First session (unauthenticated)

1. Land on politician profile page
2. See: profile card (photo, office, district, verified badge if applicable), this week's top questions sorted by net upvotes, response rate badge, and seeded questions clearly labeled
3. Can read all questions and see vote counts without signing in
4. To upvote or submit a question → prompted to sign in (low-friction)

### Authentication

- Sign in via Google, Apple, or email magic link
- Anonymous identity preserved publicly (username or "Anonymous Voter")
- One verified account per person (email + phone verification)
- No address required to ask — address optionally provided to filter "questions from constituents only"

### Asking a question

1. User types question in free-text field (10-500 characters)
2. System runs fuzzy name match to confirm politician target (see Section 12)
3. AI deduplication check — if very similar question exists, suggest upvoting existing instead
4. User can tag question with topic category (Healthcare, Economy, Housing, etc.)
5. Question submitted → appears immediately in "New" feed
6. Upvotes push it toward "Top" feed

### Upvoting

- One upvote per user per question per week (resets with weekly cycle)
- Upvoting is the core engagement mechanic — the leaderboard IS the product
- Net upvote count visible on every question
- Questions with net upvotes ≥ 10 count toward politician's participation rate denominator (configurable threshold)

### The participation rate

- Displayed prominently on every politician profile: **"X of Y questions answered this week"**
- Y = count of questions with net upvotes ≥ 10 (configurable)
- X = count of those questions with a verified politician answer
- Historical participation rate also displayed: "Lifetime answer rate: 3%"
- This metric exists and is public regardless of whether politician has claimed profile

### Browsing

- **By politician:** whytho.com/[politician-slug] — full profile with this week's questions
- **By district:** whytho.com/district/[district-id] — all officials in a district
- **By topic:** whytho.com/topic/[topic-slug] — questions tagged with a topic across all politicians
- **Leaderboard:** whytho.com/leaderboard — top and bottom responders this week

### Notifications

- Weekly digest email: "Top questions for your representatives reset Monday"
- Notification when a politician answers a question you asked or upvoted
- Alert when a question you submitted hits 10+ upvotes

---

## 9. Core User Experience — Politician

### Claiming a profile

1. Politician or staff finds profile (auto-created from public data)
2. Clicks "Claim this profile"
3. Chooses verification method (see Section 11)
4. Upon verification: profile marked "VERIFIED ✓", team management unlocked, answer tools activated

### The politician dashboard

- **Inbox view:** Questions sorted by net upvotes, filtered to those with ≥10 upvotes
- **Response queue:** Unanswered questions above threshold, sorted by urgency
- **Analytics:** Vote trends by topic, constituent concern heatmap, week-over-week engagement
- **Team management:** Add/remove staff with role-based permissions
- **Answer composer:** Rich text, video embed, or social media post link

### Answering a question

Politicians can answer in any of five formats:
1. **Direct text response** — written directly in the platform
2. **Video link** — YouTube/Vimeo URL that embeds on the platform
3. **Social media post** — paste a Twitter/X, Instagram, Facebook, or TikTok URL → oEmbed renders inline
4. **External link** — link to an official press release, speech transcript, or vote record
5. **Team answer** — staff member drafts, politician or chief of staff approves (tracked internally)

### Why politicians participate

- **Loss aversion:** A "0% response rate" public badge is reputationally costly
- **Constituent intelligence:** The upvote data tells them what issues actually matter to constituents — for free
- **Campaign asset:** A high response rate is a differentiator ("I'm the only candidate who answers")
- **Control the narrative:** AI-generated answers (clearly labeled) from public record may be imperfect; direct answers override them
- **Opposition pressure:** If an opponent is on the platform and they're not, non-participation becomes a story

### Team roles

| Role | Permissions |
|---|---|
| **Admin** (politician or CoS) | Full control; can approve answers; manage team |
| **Editor** (comms director) | Draft and publish answers; edit profile |
| **Responder** (staffer) | Draft answers only; cannot publish without approval |

---

## 10. AI Strategy

### AI-generated answers (clearly labeled)

**Concept:** For every politician profile, generate AI answers to top questions based entirely on the politician's public record — votes, speeches, press releases, campaign website positions.

**Framing (critical):** This is "AI Analysis of Public Record" — never "AI-Generated Answer from [Politician]." The distinction is legally and reputationally significant.

**Implementation:**
- RAG (Retrieval-Augmented Generation) architecture
- Source documents: VoteSmart API, GovTrack voting records, Congress.gov, official press releases, campaign website
- Every AI answer includes: source citations with dates, confidence level indicator, clear "🤖 AI Analysis" label
- Three-tier visual system:
  - 🤖 **AI Analysis** — muted styling, clearly distinct from human answers
  - ✅ **Politician Verified** — politician confirmed the AI answer is accurate
  - ✍️ **Direct Answer** — politician wrote their own response

**The behavioral incentive:**
Politicians with even slightly inaccurate AI answers will be motivated to "correct the record" by providing their own direct answer. Loss aversion + reputation management = participation incentive. This is the Yelp profile-claiming dynamic applied to civic tech.

**Legal framing:**
- Clearly labeled AI content based on public record = First Amendment protected speech
- Politicians as public figures have reduced right-of-publicity protections
- 46+ states have deepfake legislation but focus on deceptive content; disclosed AI civic analysis is explicitly excluded from most statutes
- EU AI Act (Article 50, effective August 2026) requires machine-readable AI labeling — adopt C2PA standard now

**Critical guardrails:**
- AI never speculates beyond documented positions
- Default response: "Insufficient public record to generate a confident answer"
- Complete audit logging of all AI-generated content
- Strict guardrails to prevent "opposition research screenshot" weaponization
- Politicians can flag AI answers as inaccurate → triggers review → replaces with corrected version or "Disputed" label

### AI-assisted question deduplication
When a user submits a new question, AI checks semantic similarity against existing open questions. If match confidence > 85%, suggest upvoting existing question instead of creating a new one.

### AI topic categorization
Auto-tag submitted questions with topic categories (Healthcare, Economy, Housing, Foreign Policy, etc.) using a lightweight classification model.

### Seeded question generation
See Section 13.

---

## 11. Politician Verification System

### Three-tier model

**Tier 1 — Self-Claimed (Unverified)**
- Create account, declare political identity
- Auto-cross-referenced against Ballotpedia and public databases
- Profile shows "UNVERIFIED" label
- Cannot appear in search results as verified
- Purpose: Creates profile shell and incentivizes upgrading

**Tier 2 — Standard Verified (requires any TWO of six methods)**
1. Government email code confirmation (.gov, senate.gov, house.gov, etc.)
2. Campaign filing ID cross-referenced against FEC API
3. Social media code post on an account linked from Ballotpedia or official government pages
4. Stripe Identity document + selfie cross-referenced against electoral records
5. Official website/DNS verification (add meta tag to campaign site)
6. National digital ID (GOV.UK One Login, EU Digital Wallet — future)

Profile shows "VERIFIED ✓" badge, appears in search, answers displayed prominently.

**Tier 3 — Full Verified (Tier 2 + one additional)**
- Physical letter with code to official office address
- Vouching by existing Tier-3 verified politician in same legislative body
- Confirmation across 2+ authoritative third-party databases

Unlocks: staff management, direct constituent messaging, priority placement, persistent profile across election cycles.

### Candidates (not yet elected)

- Eligible for Tier 2 once FEC filing exists (FEC ID is sufficient second signal)
- Pre-filing candidates limited to Tier 1
- System auto-upgrades when electoral commission data shows new filing

### Key government email domains (US)
- Federal: @house.gov, @senate.gov
- State: varies; CISA dotgov-data repository (github.com/cisagov/dotgov-data) is the authoritative machine-readable source, updated daily

---

## 12. Politician Name Resolution

### The problem

Users refer to politicians by: full legal name, nickname, title + last name, party + position ("the Republican senator from Ohio"), informal references ("the mayor"), or misspellings.

### Solution: multi-layer fuzzy matching

**Layer 1 — Exact match** on display name, full legal name, and known aliases

**Layer 2 — Fuzzy string match** using Levenshtein distance (threshold: 85%+ similarity)

**Layer 3 — Alias database** maintained manually + crowd-sourced:
- Nicknames: "Dick" → Richard, "Ted" → Edward/Theodore
- Title variations: "Senator Warren" → Elizabeth Warren
- Common references: "Speaker Johnson" → Mike Johnson (current Speaker)
- Former titles: "President Obama" → Barack Obama

**Layer 4 — Contextual resolution:**
- If user is in California and types "the governor" → Gavin Newsom
- If user types "my senator" + has provided state → resolves to that state's senators

**Layer 5 — Disambiguation UI:**
- When 2+ matches exist with confidence > 70%, show disambiguation card
- "Did you mean: [Politician A] or [Politician B]?"
- User selects; selection feeds back into alias learning

**Canonical name display:**
- Always show the official full legal name prominently
- Show alternative names used: "Also known as: Ted Cruz | Senator Cruz | Rafael Cruz"
- User-entered name that triggered match is preserved in the question text — not auto-corrected

### Data sources for alias database
- Ballotpedia (official + commonly used names)
- Wikipedia (nicknames, birth names)
- FEC filings (legal name as filed)
- Manual curation for high-profile officials

---

## 13. Seeded / Filler Questions

### Purpose

Every politician profile needs immediate content on launch. Waiting for organic user questions creates empty profiles that repel engagement. Seeded questions:
- Ensure every profile has 10-20 relevant, substantive questions from day one
- Cover the issues most relevant to that politician's record and jurisdiction
- Demonstrate platform value before any organic activity exists
- Are clearly labeled as non-user-generated to maintain transparency

### Generation method

**Source data per politician:**
- Recent votes on major legislation (from GovTrack / Congress.gov)
- Campaign platform positions (from Ballotpedia, candidate website)
- Committee assignments (what issues they're responsible for)
- Recent public statements and press releases
- District-specific issues (unemployment rate, major employers, recent local events)
- Party platform positions on key issues

**AI generation prompt structure:**
Generate 15-20 substantive questions a constituent might want to ask this politician, based on their public record. Questions should be specific, non-partisan in framing, and reflect genuine constituent concerns. Do not generate leading, hostile, or softball questions.

**Labeling (non-negotiable):**
All seeded questions display: "📋 Suggested Question — AI-generated from public record. Not submitted by a user."

Seeded questions:
- CAN be upvoted by users (this is how organic engagement starts)
- ARE included in participation rate calculation once they reach the 10 net upvote threshold
- Get REPLACED in prominence as organic user questions accumulate upvotes
- Are refreshed weekly with new seeded questions based on current events

### Curation pipeline

1. Automated generation via GPT-4o or Claude API, triggered on profile creation
2. Human moderation review before publishing (spot-check; not every question)
3. Quality filters: question length (20-300 chars), neutrality check, duplicate check
4. Weekly refresh: remove lowest-voted seeded questions, add new ones based on recent news

---

## 14. Weekly Reset Mechanic

### How it works

Every **Monday at 12:00 AM Eastern**:

1. **Snapshot:** Top 10 questions per politician (with vote counts and answer status) saved to `weekly_snapshots` table as permanent historical record
2. **Archive:** All questions from previous week move to `status = 'archived'`
3. **Reset:** Vote counts do NOT transfer; the week starts fresh
4. **Refresh:** New seeded questions generated for each politician
5. **Notify:** Weekly digest emails sent to subscribers
6. **Event:** `weekly_reset` event fires — in Phase 2, this triggers social media posting queue

### What persists across resets

- The questions themselves (archived, browsable)
- All answers (permanently attached to the question they answered)
- Participation rate history (cumulative, per-week breakdown)
- Upvote counts in historical snapshots (read-only)

### What resets

- Active vote counts (each week starts at zero)
- The "current week" leaderboard
- User's upvote allocation (can vote on questions again each week, including re-upvoting same questions)

### Why weekly (not daily or monthly)

- **Daily** would be too chaotic; politicians couldn't realistically keep up; media can't cover it
- **Monthly** is too slow; current events become stale; engagement drops
- **Weekly** matches the natural news cycle, congressional schedule, and constituent communication cadence; creates a Monday ritual

### The participation rate formula

```
weekly_participation_rate = 
  (questions_answered WHERE net_upvotes >= 10) / 
  (total_questions WHERE net_upvotes >= 10)

Threshold: net_upvotes >= 10 (configurable in admin; subject to change)
```

---

## 15. Social Distribution Layer (Phase 2)

*Architecture decisions required in Phase 1 — feature ships in Phase 2.*

### Concept

For each politician profile, create and manage official branded social accounts on Twitter/X, TikTok, Facebook, and Instagram. These accounts post:
- Weekly "top questions" summaries
- Notable answer events ("Senator X just answered for the first time in 6 weeks")
- Response rate milestones ("Representative Y's answer rate just hit 0% for the 8th consecutive week")
- New high-vote questions crossing thresholds

### Account naming convention

`@WhyTho_[politician-slug]` — e.g., `@WhyTho_DonaldTrump`

Description template: "Top public questions for @[official_handle] — Answer rate this week: X%. Submit yours at whytho.com/[slug]"

### Critical legal/policy framing

Account must be unambiguously WhyTho's brand, not the politician's:
- Profile photo: WhyTho logo / branded template card (NOT politician photo)
- Bio clearly states: "Unofficial. Questions asked by the public at WhyTho.com"
- Every post links back to whytho.com/[slug]
- Never uses first person as the politician

### Phase 1 architecture requirements (build now)

1. **`social_handles` field** on every politician profile (Twitter/X, Facebook, Instagram, TikTok handles)
2. **`shareable_card` payload** on every weekly snapshot (pre-formatted text, OG image metadata, stats)
3. **Weekly reset as event/webhook** (not just a cron job) — Phase 2 auto-post queue subscribes to this event
4. **Politician profile slugs** must be clean, consistent, and match future social account names
5. **`SocialPublisher` interface** as an abstract service layer — routing logic is platform-agnostic

### Scale strategy

- Do NOT create one account per politician (500K+ is unmanageable)
- Phase 2 launch: accounts for all ~537 federal officials + top 50 governors/mayors
- Phase 2 expansion: state legislators in top 10 states
- Phase 3: individual accounts for all tracked politicians

---

## 16. Technical Architecture

### Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 15+ (App Router) | SSR for SEO; React ecosystem; Supabase integration depth |
| Auth | Supabase Auth | Native RLS integration; anonymous auth; $25/mo for 50K MAU |
| Database | Supabase PostgreSQL | Row-level security; real-time subscriptions; pg_cron for weekly reset |
| Real-time | Supabase Broadcast | Lightweight WebSocket pub/sub for live vote counts |
| Hosting | Vercel Pro | $20/mo; Next.js native; edge functions |
| Search | PostgreSQL full-text + GIN indexes | Handles 50K questions; no Algolia needed at Phase 1 scale |
| Cron | Supabase pg_cron | Weekly reset; runs inside PostgreSQL; no external infrastructure |
| Bot prevention | Cloudflare Turnstile | Free; CAPTCHA alternative on vote/submit endpoints |
| UI | shadcn/ui + Tailwind CSS | Accessible; consistent; fast to build |
| ID verification | Stripe Identity | $1.50/verification; 120+ countries; simple API |
| AI (answers) | Claude API / GPT-4o via RAG | Seeded questions; AI answer generation; deduplication |
| AI (search) | Anthropic claude-haiku-4-5 | Low-cost classification for topic tagging |
| Social posting (Phase 2) | Abstract SocialPublisher interface | Platform-agnostic; Twitter/X Basic API ($100/mo) |

**Monthly infrastructure cost at launch: ~$45-65**

### Security

- Supabase RLS: `auth.uid()` wrapped in `(SELECT auth.uid())` subselect for per-statement caching
- Rate limiting: `db_pre_request` function; max 30 votes/user/minute; max 5 questions/user/day
- Vote fraud: `UNIQUE(user_id, question_id, week_number)` constraint at DB level
- Bot prevention: Cloudflare Turnstile on all POST endpoints
- AI guardrails: strict prompt constraints; no speculation beyond public record; full audit logging

### Real-time vote architecture

1. User clicks upvote → optimistic UI increment (immediate)
2. POST to `/api/votes` → INSERT with UNIQUE constraint (duplicate = 409, UI rolls back)
3. PostgreSQL trigger fires → increments denormalized `vote_count` on question
4. Trigger broadcasts new count to Supabase Broadcast channel `politician:[id]`
5. All connected clients receive update via WebSocket

---

## 17. Data Model

### Core tables

```sql
-- Politicians
politicians (
  id uuid PRIMARY KEY,
  full_legal_name text NOT NULL,
  display_name text,           -- Common name used publicly
  slug text UNIQUE NOT NULL,   -- URL slug + future social handle base
  office text,
  district text,
  state text,
  party text,
  photo_url text,
  social_handles jsonb,        -- {twitter, facebook, instagram, tiktok, official_website}
  verification_tier int DEFAULT 0,  -- 0=unclaimed, 1=self-claimed, 2=verified, 3=full-verified
  claimed_by uuid REFERENCES auth.users,
  ballotpedia_id text,
  fec_id text,
  govtrack_id text,
  aliases text[],              -- Array of known alternative names/nicknames
  is_candidate boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
)

-- Questions
questions (
  id uuid PRIMARY KEY,
  politician_id uuid REFERENCES politicians NOT NULL,
  author_id uuid REFERENCES auth.users,
  question_text text NOT NULL CHECK (length(question_text) BETWEEN 10 AND 500),
  topic_tags text[],
  week_number int NOT NULL,    -- ISO year * 100 + ISO week, e.g., 202611
  status text DEFAULT 'active' CHECK (status IN ('active', 'archived', 'removed')),
  is_seeded boolean DEFAULT false,  -- AI-generated filler question
  vote_count int DEFAULT 0,    -- Denormalized for performance
  net_upvotes int DEFAULT 0,   -- upvotes - downvotes
  created_at timestamptz DEFAULT now()
)

-- Votes
votes (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  question_id uuid REFERENCES questions NOT NULL,
  week_number int NOT NULL,
  value int DEFAULT 1 CHECK (value IN (1, -1)),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, question_id, week_number)
)

-- Answers
answers (
  id uuid PRIMARY KEY,
  question_id uuid REFERENCES questions NOT NULL,
  politician_id uuid REFERENCES politicians NOT NULL,
  answer_type text CHECK (answer_type IN ('text', 'video', 'social_embed', 'external_link', 'ai_analysis')),
  content text,
  media_embeds jsonb,          -- Cached oEmbed HTML for social posts
  source_urls text[],          -- Citations for AI answers
  confidence_level text,       -- For AI answers: 'high', 'medium', 'low', 'insufficient'
  is_ai_generated boolean DEFAULT false,
  ai_verified_by_politician boolean DEFAULT false,
  answered_by uuid REFERENCES auth.users,  -- Which team member
  created_at timestamptz DEFAULT now()
)

-- Politician team members
politician_team (
  id uuid PRIMARY KEY,
  politician_id uuid REFERENCES politicians NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  role text CHECK (role IN ('admin', 'editor', 'responder')),
  invited_by uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now(),
  UNIQUE(politician_id, user_id)
)

-- Weekly snapshots (permanent historical record)
weekly_snapshots (
  id uuid PRIMARY KEY,
  politician_id uuid REFERENCES politicians NOT NULL,
  week_number int NOT NULL,
  top_questions jsonb,         -- Array of {question_text, vote_count, answered, answer_summary}
  questions_answered int,
  questions_above_threshold int,
  participation_rate numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(politician_id, week_number)
)

-- Politician aliases (for name resolution)
politician_aliases (
  id uuid PRIMARY KEY,
  politician_id uuid REFERENCES politicians NOT NULL,
  alias text NOT NULL,
  alias_type text CHECK (alias_type IN ('nickname', 'title', 'informal', 'misspelling', 'former_title')),
  created_at timestamptz DEFAULT now()
)
```

### Key indexes

```sql
CREATE INDEX idx_questions_politician_week ON questions(politician_id, week_number);
CREATE INDEX idx_questions_vote_count ON questions(net_upvotes DESC);
CREATE INDEX idx_questions_status ON questions(status);
CREATE INDEX idx_votes_user_question ON votes(user_id, question_id);
CREATE INDEX idx_politician_slug ON politicians(slug);
CREATE INDEX idx_politician_aliases ON politician_aliases USING gin(to_tsvector('english', alias));
```

### Materialized view for leaderboard

```sql
CREATE MATERIALIZED VIEW current_week_leaderboard AS
SELECT 
  p.id, p.display_name, p.slug, p.office, p.state, p.verification_tier,
  COUNT(q.id) as total_questions,
  COUNT(q.id) FILTER (WHERE q.net_upvotes >= 10) as qualifying_questions,
  COUNT(a.id) FILTER (WHERE q.net_upvotes >= 10) as answered_qualifying,
  ROUND(
    COUNT(a.id) FILTER (WHERE q.net_upvotes >= 10)::numeric /
    NULLIF(COUNT(q.id) FILTER (WHERE q.net_upvotes >= 10), 0) * 100, 1
  ) as participation_rate
FROM politicians p
LEFT JOIN questions q ON q.politician_id = p.id AND q.week_number = get_current_week()
LEFT JOIN answers a ON a.question_id = q.id
GROUP BY p.id;

-- Refresh every 30 seconds via pg_cron
```

---

## 18. Geographic & Global Strategy

### Phase 1: USA only

Launch scope:
- All 537 federal officials (Congress + President + Cabinet)
- State legislators in top 10 states by population (CA, TX, FL, NY, PA, IL, OH, GA, NC, MI)
- Governors of all 50 states
- Mayors of top 50 cities by population

Data sources:
- Congress.gov API (federal legislators)
- OpenStates/Plural API (state legislators)
- Ballotpedia (candidates + comprehensive politician data)
- FEC API (campaign finance; candidate verification)
- CISA dotgov-data repository (government email domain verification)

### Future international expansion (background context — not in Phase 1 plan)

**Best entry markets after US:**

1. **UK** — Richest open data ecosystem; English; ~930 national legislators; TheyWorkForYou API; mySociety partnership potential; Democracy Club
2. **Australia** — English; only ~7K total officials; compulsory voting = highly engaged electorate; OpenAustralia Foundation
3. **Germany** — Abgeordnetenwatch.de has proven the model since 2004; potential partner not competitor
4. **Canada** — English + French bilingual; manageable scale; strong press freedom

**Key international legal risks (research phase only):**
- GDPR: Politicians' party membership = "political opinions" = special category data under Article 9
- France: Electoral silence law prohibits all electoral content during blackout periods
- UK: Plaintiff-friendly libel law; Defamation Act 2013 provides some protection
- India/Brazil: Criminal defamation laws weaponized by politicians
- Thailand/Singapore: Extreme speech restriction laws — avoid entirely

**International data infrastructure (for when needed):**
- Wikidata: 600K+ politician items globally; CC0 license; multilingual
- Popolo standard: International legislative data specification
- Country-specific APIs: TheyWorkForYou (UK), NosDéputés.fr (France), various electoral commission APIs

---

## 19. Monetization

### Year 1: Grants + community funding (target $200K-500K)

Primary targets:
- Knight Foundation (civic tech)
- Democracy Fund
- Omidyar Network
- Hewlett Foundation

Entity structure: **Public Benefit Corporation** (PBC) — allows both grant funding and earned revenue; encodes civic mission in corporate charter; avoids nonprofit bureaucracy.

### Year 2-3: Earned revenue

**Politician premium profiles ($50-200/month):**
- Advanced analytics dashboard (constituent concern trends, topic heatmap)
- CRM integration (export questions to Fireside/Indigov format)
- Custom branding on profile
- Priority placement in search
- **Critical:** Free-tier politicians never penalized in visibility; premium = tools only

**Journalist/researcher data API ($500-2,000/month):**
- Aggregated question trends by topic, district, state
- Response rate historical data
- Bulk export for research
- Webhook integrations for newsroom tools

**Media partnerships:**
- Weekly "Top Questions" sponsored content with local newspapers
- Embeddable widget for news org websites

### Revenue models to avoid

- **Political advertising:** Fatally undermines trust
- **User data monetization:** Mission-conflicting; legal risk
- **Government procurement:** Long sales cycles; credibility risk
- **Paid promotion of questions:** Creates two-tier democracy; destroys trust

---

## 20. Go-To-Market Strategy

### Cold start solution: launch in one congressional district

Do not launch nationally. Choose a single high-engagement district:
- Competitive district (both parties have incentive to participate)
- Active local media (will cover "what voters are asking")
- Tech-savvy population (early adopters)
- Suggestion: a swing district in Pennsylvania, Georgia, or Arizona

**Week 1 goals in pilot district:**
- 100+ questions submitted
- 500+ upvotes cast
- 1 local newspaper story
- 1 candidate (not necessarily incumbent) claims profile

### The accountability story writes itself

In the pilot district, the primary media hook is NOT "new civic tech app." It's:
**"[District]'s constituents have asked [Representative] 200 questions. They've answered 0."**

This story requires zero politician participation to be true and newsworthy.

### Distribution channels

1. **SEO (primary long-term):** Politician profile pages targeting "[name] questions", "[name] accountability", "[name] voting record questions"
2. **Earned media:** Pitch the participation rate story to local journalists; weekly "unanswered questions" column opportunity
3. **Social seeding:** Share question cards on Reddit political subreddits, Facebook civic groups, Twitter/X with politician @mentions
4. **Email to existing civic communities:** local League of Women Voters chapters, civic tech communities, political science departments
5. **Direct politician outreach:** Email comms directors and chiefs of staff with a one-page pitch focused on constituent intelligence value

### The politician acquisition pitch

Frame it as constituent intelligence, not accountability:

> "Your office receives 30,000 constituent messages a year. Most of them cover the same 20 issues, but you have no way to know which issues matter most to the voters who don't contact you. WhyTho tells you. Here's what the 50,000 voters in your district are most concerned about this week — for free."

---

## 21. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Politicians refuse to participate | High | Medium | Platform works without participation; non-response IS the story |
| AI-generated answers weaponized for opposition research | Medium | High | Strict guardrails; "Insufficient record" default; audit logging |
| Platform captured by coordinated partisan question-bombing | Medium | High | Upvote velocity limits; flagging system; moderation queue |
| Legal threat from politician over AI-generated content | Low-Medium | High | Strict labeling; C2PA standards; public figure doctrine; First Amendment |
| Platform becomes echo chamber (only partisan questions) | Medium | Medium | Topic balance scoring; editorial curation of seeded questions |
| Spam/bot upvoting | High | Medium | Cloudflare Turnstile; rate limiting; account age requirements; vote velocity detection |
| Funding gap before earned revenue | Medium | High | Grants pipeline; PBC structure; lean team; $45/mo infra |
| Twitter/X API cost increase | Low | Low | Abstract SocialPublisher interface; multi-platform from day one |
| Cold start / no organic questions | Medium | High | Seeded questions ensure every profile has immediate content |
| Impersonation of politicians by fake accounts | Medium | High | Tiered verification; "UNVERIFIED" labels; reporting mechanism |

---

## 22. Metrics & Success Criteria

### Phase 1 success (6 months)

| Metric | Target |
|---|---|
| Monthly active users | 10,000+ |
| Questions submitted | 5,000+ |
| Upvotes cast | 50,000+ |
| Politician profiles created (auto) | 1,000+ |
| Politicians verified (any tier) | 50+ |
| Politicians with at least 1 answer | 20+ |
| Local media stories | 10+ |
| Average weekly participation rate (all politicians) | <5% (non-response is the story) |

### North star metric

**Weekly active question sessions** — the number of users who visit the platform, read questions, and take an action (upvote, submit, share) in a given week. This captures both supply (questions) and demand (engagement) in a single metric.

### Accountability metrics (public)

- **Participation rate per politician** (primary)
- **Response time** (how quickly politicians answer once they claim a profile)
- **Streak** (consecutive weeks with at least one answer)
- **Topic distribution** (which issue categories get answered vs. ignored)

---

## 23. Roadmap

### Phase 1 — Prototype & Launch (Months 1-6)

**M1-2: Foundation**
- Tech stack setup (Next.js + Supabase)
- Auth system (anonymous + verified)
- Politician database seeding (federal officials + top 10 states)
- Core question/vote/answer schema
- Basic politician profile pages

**M3-4: Core product**
- Upvoting system with real-time counts
- Weekly reset mechanic (pg_cron + event system)
- Seeded question generation pipeline
- Name resolution / fuzzy matching
- Participation rate calculation + display

**M5-6: Launch**
- Politician verification flow (Tier 2)
- Team management for politician profiles
- AI answer generation (clearly labeled)
- Leaderboard
- SEO optimization
- Pilot district launch

### Phase 2 — Distribution (Months 7-12)

- Social media account creation + auto-posting
- Weekly email digest system
- Journalist data API (v1)
- Premium politician profiles
- Mobile-optimized experience
- Expand to all 50 states

### Phase 3 — Scale (Months 13-24)

- Full US coverage (county + municipal)
- Fireside/Indigov CRM integrations
- Full mobile apps (Flutter)
- Politician premium tier
- International research + legal review (UK/Australia)

### Phase 4 — International (Months 25-36)

- UK + Australia launch
- German partnership evaluation (Abgeordnetenwatch.de)
- Multilingual infrastructure
- GDPR compliance layer
- Wikidata integration

---

*Last updated: March 2026*
*Document owner: Quinnivations LLC*
*Status: Active strategy — living document*
