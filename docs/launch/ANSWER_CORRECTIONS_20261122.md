# Published answer corrections

Verified office admins and editors can add a dated correction from the answer in their dashboard or from the expanded answer on the public profile, including answers from earlier weeks. A correction is a new record attached to the original answer. The published body, sources and answer link stay intact. Readers see the original wording followed by corrections in date order. Private drafts continue to support editing. The form explains that publishing adds a public correction and shares a request identifier across retries with the same text.

The database restricts correction publishing to an authenticated member of the linked verified office. Disputed answers use the support review path. Public correction visibility follows the published answer and active question. The public table contains the answer ID, correction ID, text and date. Actor attribution lives in the private account audit.

## Local verification

- Fourteen checks passed in a fresh socket-only PostgreSQL 17 cluster. The fixture verified corrections to a two-month-old answer, repeated submission, a second correction, immutable original wording, editable drafts, public visibility and access grants. Evidence is in `/private/tmp/whytho-correction-db.73jhQ8/results.log`.
- The full release integration suite passed all thirty tests in the isolated runtime. Coverage includes draft editing, a published response's protection, correction submission, rejected malformed input and changes in draft status during an edit.

Apply the migration before deploying code that selects the nested `answer_corrections(id,body,created_at)` relationship. The migration adds the history table and protects future writes to an original response. Existing corrections made by replacing text before this migration cannot be reconstructed from this feature. A broader approved dispute and withdrawal workflow, a complete permanent archive for removed questions and public acceptance on the deployed site remain separate.
