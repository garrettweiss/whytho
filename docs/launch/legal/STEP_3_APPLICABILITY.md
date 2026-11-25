# Step 3: legal applicability and release facts

Reviewed November 23, 2026. Operator: Zellon LLC, California; product: WhyTho, a US civic question-and-answer platform. This is practical operator guidance based on inspected source and official materials, not attorney approval. Paid attorney review is deferred by owner decision. That does not prevent accurate notices, access controls or an operational complaint process, and does not eliminate legal exposure.

## What is required, conditional or chosen

| Topic | Classification | WhyTho action |
|---|---|---|
| Accurate public privacy notice | Treat as applicable CalOPPA duty on the stated commercial-operator facts | Publish a conspicuous Privacy link, effective date, actual data/sharing categories, change process and tracking disclosure; keep it aligned with behavior |
| CCPA comprehensive rights and notices | Conditional on statutory coverage; not established by California formation alone | Complete the business-level coverage record below before claiming either coverage or exemption |
| Children's privacy | COPPA conditional on audience/actual knowledge; 18+ is a separate product choice | Implement the approved age declaration; investigate credible under-13 collection and handle the actual information appropriately |
| Copyright | Underlying copyright restrictions apply; Section 512 protection is a conditional safe harbor | Operate rights review now; decide whether to complete agent registration and its continuing requirements |
| California breach notification | Conditional on incident/data facts; not a CCPA-size threshold | Maintain incident intake and assess the current deadlines below immediately on discovery |
| Permanent answers, private votes, opt-in office notifications | Product commitments, subject to applicable law | Implement what is promised; do not describe desired functionality as deployed |

### CalOPPA

Business and Professions Code sections 22575-22579 cover commercial websites/services collecting personally identifiable information from California consumers. WhyTho's account email collection by a California commercial LLC supports treating the notice requirement as applicable; a free civic service is not automatically outside it. The notice should identify information and recipient categories, any review/change process, policy-change notification process and effective date. Tracking disclosures address the operator's response to Do Not Track and whether other parties may track across time and services. These obligations do not depend on meeting CCPA revenue thresholds. [California AG privacy-policy explanation](https://oag.ca.gov/privacy/facts/online-privacy/privacy-policy), [AG tracking amendment explanation](https://oag.ca.gov/privacy/privacy-legislation/leg2013).

The direct [statutory page](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22575.) returned 403 in this environment; the official AG sources were accessible. Do not treat a disabled browser analytics helper as a completed vendor/network inventory. The draft explicitly permits possible third-party collection and makes no blanket no-tracking or no-sale/share certification.

### CCPA coverage record

For the ordinary for-profit-business test, the entity must do business in California, collect consumers' personal information and determine processing purposes/means, and satisfy at least one threshold: prior-calendar-year gross revenue **over $26,625,000**; annually buy, sell or share information of **100,000 or more consumers or households**; or derive **50% or more annual revenue** from selling or sharing consumers' information. Merely having 100,000 visitors is not that second test. Control/common-branding relationships, joint ventures and voluntary certification can create additional coverage routes. [CPPA applicability guide](https://cppa.ca.gov/pdf/business_comply), [2025 monetary adjustment](https://cppa.ca.gov/announcements/2024/20241217.html).

**Unresolved business facts:** applicable 2025 entity revenue threshold result, annual statutory buy/sell/share count, sale/share revenue proportion, relevant related-entity arrangements, and vendor contract/use classification. No personal financial information was accessed. Record business-level yes/no determinations with supporting company evidence separately; do not infer them from the politician directory count. Recheck when business practices change and for the next inflation adjustment. The privacy notice offers a request channel without falsely claiming that every CCPA right applies universally or that WhyTho is exempt. If coverage is established, map the current [2026 statute](https://www.cppa.ca.gov/pdf/20260101_ccpa_statute.pdf) and applicable regulations to additional notices, rights, contracts and deadlines before declaring completion.

### COPPA and the adult-use decision

COPPA covers child-directed commercial services and general-audience services with relevant actual knowledge of under-13 collection. An adult-use statement alone does not settle either condition. FTC's amended Rule became effective June 23, 2025, with general compliance due April 22, 2026. A universal 18+ age check is not a COPPA requirement; WhyTho's 18+ rule is its own product decision. [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions), [final amended Rule and dates](https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm).

Use minimal adult attestation, not invented age verification or unnecessary dates of birth. If a report, chat or support interaction reveals credible under-13 collection, restrict further collection while evaluating it, record the information involved and use the legally appropriate response. Do not keep collecting on the assumption that a checkbox cures actual knowledge. Do not launch a child-directed campaign or school onboarding without reassessing the audience and the current Rule. This bounded review does not certify compliance with every state youth-privacy law.

### Copyright and Section 512

Section 512(c) can limit remedies for qualifying material stored at users' direction; it is not a license to use a portrait or a guarantee against claims. Eligibility includes the relevant knowledge/control conditions, expeditious action on qualifying notices, a publicly identified and Copyright Office-designated agent, a reasonably implemented repeat-infringer policy and accommodation of qualifying standard technical measures. Registration is a condition for seeking that safe harbor, not a universal command that every website register. [Current 17 USC 512](https://uscode.house.gov/us/usc/t17/s512/), text current through November 10, 2026.

`copyright@whytho.us` is a verified inbox, not verified agent registration. No designation, signature, payment or registration has been completed in this task. Operator-sourced photos require their own rights analysis. If safe-harbor operation is chosen, record the agent's authority and public contact details, register and maintain the designation, and operate notice/counter-notice and repeat-infringer handling. Counter-notice procedures can require restoring access in 10-14 business days unless the required lawsuit notification is received; do not invent an automatic irreversible takedown policy. [Copyright Office process](https://www.copyright.gov/512/).

### California incident notification

Civil Code 1798.82 applies to relevant California businesses owning/licensing computerized data, when the statutory personal information is acquired or reasonably believed acquired without authorization, including specified encryption-key compromise cases. It has no CCPA revenue prerequisite. Current law requires covered consumer notice within **30 calendar days** of discovery/notification, subject to specified law-enforcement and necessary scope/integrity delays. For notice to **more than 500 California residents** from one breach, submit a sample to the AG within **15 calendar days** after notifying consumers. A maintainer of another entity's covered data must notify its owner/licensee immediately on the specified discovery. [California's official 2026 code compilation, section 1798.82, printed pages 107-110](https://dre.ca.gov/files/pdf/relaw/excerpts.pdf).

Not every disclosed profile field or vote triggers this particular statute. Its defined information includes specified identity/financial/health combinations and certain online-account credentials. Record affected fields, acquisition evidence, encryption/key facts, residency, dates, roles and notices; assess other applicable jurisdictions separately. A serious private-vote disclosure still needs containment and assessment even if this particular definition is not met. The old instruction to notify only “without unreasonable delay” is insufficient as the entire 2026 deadline rule.

## Baseline audit and same-release gates

Source audited: `/private/tmp/whytho-r2-identity-integration-20261123`, commit `339e29c`. Source observations are not a fresh live production test.

| Evidence | Actual baseline | Release implication |
|---|---|---|
| `app/api/auth/anonymous/route.ts`, `app/api/questions/route.ts`, `app/api/votes/route.ts`, `app/api/chat/route.ts` | Guest sessions allowed; no adult assent | Parent release adds versioned adult assent and registered voting. Test server rejection, not just UI. Preserve and disclose earlier guest records |
| `app/api/settings/profile/route.ts` | Actively accepts optional city/county/state/affiliation | Parent reports same-release UI/API/DB rejection of new affiliation values, preserving historical data. Public cut depends on this change; verify all layers. City/county/state remain optional |
| `app/api/chat/route.ts` | Sends conversation/page context to Anthropic; can persist feedback and forwarded questions | Disclose both processing and storage. Chat preparation returns a draft, not a public post |
| `lib/ai/audit-log.ts` | Operation metadata/result summaries; indefinite-retention comment; no cleanup established | No claim of automatic deletion, prompt anonymity or zero retention |
| `lib/analytics/posthog-client.ts`, Sentry client configuration | Browser analytics helper disabled; replay/tracing off; server diagnostics remain | Keep optional telemetry off. Check actual provider/network behavior before stronger statements |
| `app/api/settings/office-notifications/route.ts` | Preference storage; `sending_enabled:false` | Keep office delivery disabled. No current promise of a working email unsubscribe flow |
| `app/api/settings/notifications/route.ts` | Answer/digest preferences; absent values default true | Do not call every existing preference opt-in. Verify each sender honors preferences before enabling |
| `20261122000200_answer_corrections.sql` | Original official answer body/sources protected; separate public dated corrections | Can describe answer originals/corrections. Immutable original-question snapshot not established |
| Account settings/disconnect | No proven self-service account erase/export; office disconnect is different | Offer manual request intake without promising automatic closure or complete anonymization |

## Exact publication cut and remaining decisions

Extract the Markdown strictly between `<!-- PUBLIC_COPY_START -->` and `<!-- PUBLIC_COPY_END -->` in [privacy draft](PRIVACY_NOTICE_DRAFT.md) and [terms draft](TERMS_DRAFT.md). Exclude internal notes and markers from rendered public copy. Version IDs are `privacy-2026-11-23` and `terms-2026-11-23`; use the actual effective date if publication changes day. Record the released text/version with assent. A prospective license is not retroactive permission for earlier content, and simply visiting a public page is not a substitute for agreement.

Before publication, the release owner must verify adult assent/registered-vote gates, public privacy/terms links, guest-history disclosure, private voting records and drafts, new-affiliation rejection and the no-login `/report#intimate-images` route requested for this release. No optional telemetry or office mail is enabled by these documents. A data-rights email intake can be offered now; a CCPA-specific opt-out claim needs the actual coverage and processing analysis. A checkbox may record agreement; it must not be represented as an operator signature, registered agent designation, verified age or privacy consent for unrelated optional uses.

Remaining operator facts are category-specific retention and backup/provider settings, business-level CCPA coverage, active human mailbox coverage, existing-content permissions, and whether to complete conditional DMCA agent registration. Adopt a private-data retention schedule separately from permanent public answers, with appropriate holds and request exceptions; do not guess vendor deletion periods. No new external communication, account registration, data deletion or legal filing is authorized by this document.
