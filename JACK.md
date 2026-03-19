# Jack — WhyTho X Insights System

> Jack is WhyTho's X intelligence lead. He orchestrates a team of 7 specialized sub-agents
> that collect real constituent questions from X, surface them on WhyTho, notify posters,
> and eventually bring politicians to the platform.
>
> **X account:** @WhyTho_official
> **Scope (V1):** Federal officials + Governors (~590 politicians)
> **Credits:** X API credits model. Current budget: $25 (probe run). DO NOT exceed without authorization.

---

## Agent Team

| Agent | Role | Model | Runs |
|---|---|---|---|
| **Harvester** | Tweet collection + credit manager | Script | Daily |
| **Scout** | X handle discovery | claude-haiku-4-5 | Weekly |
| **Curator** | Question quality scoring | claude-haiku-4-5 | After Harvester |
| **Mapper** | Theme + similarity linking | claude-haiku-4-5 | After Curator |
| **Publisher** | Create WhyTho records + display | Script | After Mapper |
| **Herald** | Reply from @WhyTho_official | Script | After Publisher (rate-limited) |
| **Diplomat** | Politician outreach | claude-haiku-4-5 | Weekly |
| **Evaluator** | Performance analysis + threshold tuning | claude-sonnet-4-6 | Weekly |

---

## 🌾 Harvester — Credit Manager & Tweet Collector

**Harvester is the sole agent that makes X API read calls. All credit spend flows through it.**

### Credit Management Protocol

```
On each run:
1. Check X_DAILY_CREDIT_BUDGET env var (configurable hard cap)
2. Log credits_used_today to x_credit_log table
3. If credits_used_today >= X_DAILY_CREDIT_BUDGET * 0.80 → WARN in logs + notify Jack
4. If credits_used_today >= X_DAILY_CREDIT_BUDGET → STOP, skip remaining politicians
5. After each run, write spend report: politicians covered, credits used, cost/politician
```

### Initial Budget: $25 (probe)

**Goal of probe run:** Determine cost-per-politician before scaling.
- Target: Cover top 50 federal politicians by follower count
- Measure: Credits consumed, tweets returned, approval rate
- Deliverable: Estimated monthly cost to cover all 590 politicians

### Priority Queue (when credits are constrained)

Politicians are processed in priority order — highest follower count first:
1. President + VP + Cabinet (24)
2. U.S. Senators (100, sorted by follower count)
3. Governors (50, sorted by follower count)
4. U.S. Representatives (438, sorted by follower count)

**Skip a politician if:** handle not yet verified by Scout (don't waste credits on wrong account).

### Search Strategy

For each politician with a verified handle:
```
Search: "@{handle} ?" — directed questions only
Time window: past 7 days (rolling)
Max per politician: 100 tweets per run (cap to control credit spend)
Dedup: skip tweet_id already in x_posts table
```

### Environment Variables

```bash
X_API_BEARER_TOKEN=          # Read access
X_API_KEY=                   # App key
X_API_SECRET=                # App secret
X_ACCESS_TOKEN=              # @WhyTho_official write access
X_ACCESS_TOKEN_SECRET=       # @WhyTho_official write access
X_WHYTHO_HANDLE=WhyTho_official
X_DAILY_CREDIT_BUDGET=       # Set conservatively. Start: equivalent of ~$1/day
```

---

## 🕵️ Scout — Handle Discovery Agent

Finds and verifies X handles for politicians. Writes to `politicians.social_handles.twitter`.

**Confidence tiers:**
- `verified` — from Congress.gov API or OpenStates official data
- `inferred` — AI-matched from name + state + office, flagged for admin confirm
- `missing` — not found, skip in Harvester

**Sources (priority order):**
1. Existing `social_handles.twitter` in DB
2. Congress.gov API (`/members` endpoint includes social handles)
3. OpenStates people API
4. Ballotpedia (scrape or search)
5. Claude-haiku inference (last resort, confidence = `inferred`)

**Never harvest for `inferred` handles** — only `verified`. Admin can upgrade `inferred` → `verified` in `/admin/x-queue`.

---

## 🧑‍⚖️ Curator — Question Evaluator

Scores each collected tweet. Continuously improved by Evaluator based on WhyTho engagement data.

### Scoring Rubric (1–10)

| Factor | Weight | Description |
|---|---|---|
| Is a genuine question | 25% | Has `?`, interrogative structure, not rhetorical |
| Substantive | 30% | Policy/accountability topic, not insult/joke |
| Engagement | 20% | ≥3 likes OR politician replied |
| Not duplicate | 15% | No existing WhyTho question covers same topic for same politician |
| Author quality | 10% | ≥10 followers, not obvious bot/spam |

### Auto-routing

| Score | Action |
|---|---|
| ≥ 8 | Auto-approve → Publisher |
| 5–7 | Admin review queue → `/admin/x-queue` |
| < 5 | Auto-reject, reason logged |

**Threshold tuning:** Evaluator adjusts these thresholds weekly based on: what scores actually got upvotes, what scores got flagged as spam by users.

---

## 🗺️ Mapper — Theme & Similarity Agent

Two jobs after Curator approves a tweet:

**1. Link to existing WhyTho questions**
Find similar questions already asked for this politician. These appear as "Related questions on WhyTho" in the X card display. Uses haiku classification (not embeddings — cheaper).

**2. Gap detection**
If ≥3 approved X tweets on the same theme exist for a politician with no WhyTho equivalent → flag to Jack as a seeded question candidate. Jack surfaces top 5 weekly to Evaluator report.

---

## 📰 Publisher — Display & Import

Creates a `questions` record with `source = 'x'` and `x_post_id` FK.

**Display card (WhyTho-styled, oEmbed-powered):**

```
┌─────────────────────────────────────────────┐
│ 🐦 Asked on X                               │
│                                             │
│  [tweet content rendered via oEmbed]        │
│                                             │
│  @handle · {N} likes · {date}               │
│  View original ↗                            │
│                                             │
│  Similar questions on WhyTho:               │
│  · "What is your position on..." (↑23)      │
└─────────────────────────────────────────────┘
```

**Legal approach: oEmbed only**
- Store `tweet_id` in DB — never the tweet text
- At display time: server calls `https://publish.x.com/oembed?url=https://x.com/i/web/status/{tweet_id}&omit_script=true`
- Cache response per `cache_age` value returned by X
- Wrap in WhyTho-styled container card

---

## 📣 Herald — Notification Agent

Replies to original tweets from @WhyTho_official after a question is published.

**Reply templates (A/B tested by Evaluator):**

Template A:
> "Hey @{user} — your question for {politician} is now live on WhyTho, where silence is its own answer. 👀 [{link}]"

Template B:
> "@{user} Others can upvote your question for {politician} on WhyTho. Their response rate is always public. [{link}]"

**Rate limits (to avoid spam flags):**
- Max 50 replies/day from @WhyTho_official
- Never reply to same user within 7 days
- Only reply to accounts with ≥10 followers
- 30-second delay between replies

**All attempts logged** in `x_outreach_log` with engagement tracking (was the reply liked? retweeted? did the user follow @WhyTho_official?).

---

## 🤝 Diplomat — Politician Outreach Agent

Brings unclaimed politicians to WhyTho. Runs weekly.

**Channel research per politician (in order):**
1. X — Does the politician post regularly (≥2 posts/week)? Do they engage with constituents? Open DMs?
2. Official website contact form (`.gov` domains)
3. Staff email (pattern-match: `firstname.lastname@house.gov`, `firstname.lastname@senate.gov`)
4. Press/comms contact (for high-profile politicians)

**Outreach message (personalized by Diplomat):**
> "Your constituents are already asking questions on WhyTho — your response rate is public whether you participate or not. Claim your profile to answer directly and show you're listening. [{politician_profile_url}]"

**Constraints:**
- Max 1 outreach attempt per politician per 30 days
- Log channel, message, sent_at, and any engagement
- Flag politicians who engage with the outreach for immediate follow-up

---

## 📊 Evaluator — Continuous Improvement Agent

Runs weekly. Uses claude-sonnet-4-6 (only agent that warrants it).

**Inputs:**
- Which imported X questions got upvotes on WhyTho? → Curator quality signal
- Which Herald replies got engagement? → Template effectiveness
- Which Diplomat outreach led to politician claims? → Channel + message effectiveness
- Credit spend per politician vs. questions approved → ROI by politician
- X question gap clusters → seeded question candidates

**Outputs:**
- Updated Curator scoring thresholds (written to `jack_config` table)
- Winning Herald template (A/B test result)
- Diplomat channel ranking by effectiveness
- Weekly summary report → saved to `jack_reports` table → surfaced to admin dashboard
- Top 5 X question clusters → candidates for new seeded questions

---

## Data Model

### New tables

```sql
-- Raw collected tweets (never display tweet text from here — use oEmbed)
CREATE TABLE x_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id          TEXT UNIQUE NOT NULL,
  politician_id     UUID REFERENCES politicians(id),
  author_handle     TEXT NOT NULL,
  author_name       TEXT,
  tweet_url         TEXT NOT NULL,
  likes             INT DEFAULT 0,
  retweets          INT DEFAULT 0,
  reply_count       INT DEFAULT 0,
  tweet_date        TIMESTAMPTZ,
  collected_at      TIMESTAMPTZ DEFAULT now(),
  status            TEXT DEFAULT 'pending',
  -- pending | approved | rejected | published | notified
  curator_score     NUMERIC(3,1),
  rejection_reason  TEXT,
  theme_tags        TEXT[],
  whytho_question_id UUID REFERENCES questions(id),
  oembed_cache      TEXT,           -- cached oEmbed HTML (expires per cache_age)
  oembed_cached_at  TIMESTAMPTZ
);

-- All outreach attempts (both poster notifications and politician outreach)
CREATE TABLE x_outreach_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type     TEXT NOT NULL,   -- 'poster' | 'politician'
  target_handle   TEXT,
  politician_id   UUID REFERENCES politicians(id),
  x_post_id       UUID REFERENCES x_posts(id),
  channel         TEXT NOT NULL,   -- 'x_reply' | 'x_dm' | 'contact_form' | 'email'
  message         TEXT,
  sent_at         TIMESTAMPTZ DEFAULT now(),
  engagement      JSONB DEFAULT '{}'  -- { liked, retweeted, followed, replied }
);

-- Jack config (thresholds, template variants — updated by Evaluator)
CREATE TABLE jack_config (
  key     TEXT PRIMARY KEY,
  value   JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Weekly reports from Evaluator
CREATE TABLE jack_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number INT NOT NULL,
  report      JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Credit spend tracking
CREATE TABLE x_credit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date     DATE NOT NULL,
  agent        TEXT NOT NULL,    -- 'harvester' | 'herald'
  credits_used NUMERIC(10,4),
  politicians_covered INT,
  tweets_collected    INT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### Extend existing tables

```sql
-- questions: track source
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user',
  -- 'user' | 'seeded' | 'x'
  ADD COLUMN IF NOT EXISTS x_post_id UUID REFERENCES x_posts(id);

-- user_profiles: admin flag (already applied)
-- ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
```

---

## Implementation Phases

| Phase | Deliverables | Status |
|---|---|---|
| **P1 — Foundation** | DB migration, env vars, admin auth update, `is_admin` on Garrett's account | ⏳ Ready to build |
| **P2 — Scout + Harvester** | Handle discovery, tweet collection, credit manager, `x_credit_log` reporting | ⏳ Needs X API creds |
| **P3 — Curator + Mapper** | AI scoring pipeline, similarity linking, admin `/admin/x-queue` page | ⏳ After P2 |
| **P4 — Publisher + Display** | oEmbed display card, questions with `source='x'`, related questions UI | ⏳ After P3 |
| **P5 — Herald** | @WhyTho_official reply pipeline, rate limiter, outreach log | ⏳ Needs write API access |
| **P6 — Diplomat** | Channel research, multi-channel outreach, politician claim prompt | ⏳ After P5 |
| **P7 — Evaluator** | Performance tracking, Curator threshold tuning, weekly report | ⏳ After P5–P6 |

---

## Open Items

| Item | Owner | Status |
|---|---|---|
| X API credits — pricing per call confirmed? | Garrett | 🔄 $25 loaded, probe TBD |
| @WhyTho_official developer app (read + write) | Garrett | ⏳ |
| `X_API_BEARER_TOKEN` + write tokens added to Vercel env | Garrett | ⏳ |
| `X_DAILY_CREDIT_BUDGET` value determined | After probe run | ⏳ |
| Scout probe: how many federal politicians already have handles in DB? | Esteban | ⏳ |

---

*Last updated: March 2026 | Owner: Quinnivations LLC*
