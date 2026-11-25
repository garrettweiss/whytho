# WhyTho public email contacts

Updated November 2, 2026, Pacific time.

Garrett authorized four public role addresses and selected `garrett@whytho.us` as their receiving inbox. After Garrett signed in, the GoDaddy Email & Office dashboard confirmed an existing Garrett Weiss administrator mailbox at that address. The mailbox initially had no aliases.

## Configuration completed

The authenticated dashboard now lists all four aliases under **Manage aliases for garrett@whytho.us**, with the statement that aliases direct mail to that inbox:

| Address | Configuration | Gmail test message ID | Receipt verified |
|---|---|---|---|
| support@whytho.us | Created | 1a19fe4aabfe075f | Outlook Inbox, Nov 2, 21:32 Pacific |
| privacy@whytho.us | Created | 1a19fe4b4155490c | Outlook Inbox, Nov 2, 21:32 Pacific |
| copyright@whytho.us | Created | 1a19fe4bd51c5e7f | Outlook Inbox, Nov 2, 21:32 Pacific |
| security@whytho.us | Created | 1a19fe4c4525472a | Outlook Inbox, Nov 2, 21:32 Pacific |

[Configuration screenshot](../../outputs/whytho-launch-tracker-20261101/email-aliases-created.png)

No existing aliases, mailbox accounts or messages were deleted. No DNS, forwarding destination, password, MFA policy, license or paid add-on was changed. The existing mailbox remains the recipient; no other person was granted access.

## Delivery and reply verification passed

One uniquely labeled test message was sent from Garrett's connected Gmail account to each newly created address. After Garrett completed Microsoft MFA, all four `WT-20261102-` messages were separately visible in the `garrett@whytho.us` Outlook Inbox, timestamped 21:32 Pacific. A search of all folders also showed each result labeled Inbox.

[Receipt screenshot](../../outputs/whytho-launch-tracker-20261101/email-aliases-received.png)

A reply to the support test was sent to Garrett only, with reference `WT-20261102-REPLY`. Gmail confirms receipt in the Inbox at 21:36 Pacific, message ID `1a19fe88bdbbc14a`, with actual From `Garrett Weiss <garrett@whytho.us>` and To `garrettweiss@gmail.com`. Sending from each individual alias was not tested. The recipient's authentication result reports SPF and DMARC pass; this observation concerns the single tested message.

Outlook displayed an existing forwarding notice to `garrettweiss@gmail.com`. That setting was preserved. The received reply was readable but included a `winmail.dat` attachment; outgoing formatting merits a small follow-up before routine public replies. No attachment was opened and no tenant formatting policy was changed.

## Intake operations still separate

Garrett is the accepted interim accountable owner. Route reports by their addressed role: support for product/account help, privacy for data-rights requests, copyright for rights complaints, and security for vulnerability reports. Until category rules are deliberately configured, inspect the original To address and record the report type and owner manually. No categorization rule, auto-response, report-processing automation or politician notification was enabled by this setup.

D03 still requires a coverage schedule, willing backup and named specialist/legal reviewers. Receipt verification establishes working mail routing, not continuous monitoring or legal-review coverage. LG01 still owns public notices and company-record reconciliation.

The public contact details are owner-approved: Zellon LLC, California; 2108 N St., Ste N, Sacramento, CA 95816. Publishing notices and completing the wider LG01 policy task remain separate work.
