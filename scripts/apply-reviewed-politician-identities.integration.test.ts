import assert from "node:assert/strict";
import test from "node:test";
import {
  hashBytes, runIdentityApplication,
  type CapturedRelationships, type IdentityApplyStore, type IdentityManifest,
  type IdentityProfile, type ReviewedLink,
} from "./apply-reviewed-politician-identities";

const ROOT = "10000000-0000-0000-0000-000000000001";
const SOURCE = "10000000-0000-0000-0000-000000000002";
const THIRD = "10000000-0000-0000-0000-000000000003";
const SHA = "a".repeat(64);
const counts = { questions: 3, answers: 0, weekly_snapshots: 1, politician_team: 0, politician_verifications: 0, x_posts: 2, x_outreach_log: 0,
  politician_aliases: 2, politician_verification_sources: 0, politician_photo_history: 1, race_candidates: 1, answer_media: 0 };

function fixture(three = false) {
  const ids = three ? [ROOT, SOURCE, THIRD] : [ROOT, SOURCE];
  const originals: IdentityProfile[] = ids.map((id, index) => ({
    id, updated_at: "2026-11-22T00:00:00Z", created_at: "2026-03-14T00:00:00Z",
    slug: `permanent-${index}`, full_name: index === 0 ? "Jane Smith" : `Jane A. Smith ${index}`,
    aliases: index === 0 ? ["Jane"] : [`Candidate ${index}`],
    party: index === 0 ? null : "Democrat", is_test: false, is_active: true, verification_tier: "0",
    bioguide_id: index === 0 ? "B000001" : null,
    candidate_fec_id: index > 0 ? `H0NY0000${index}` : null,
    photo_url: index === 0 ? "https://example.com/portrait.jpg" : null,
  }));
  const relationships: CapturedRelationships = {
    byId: Object.fromEntries(ids.map(id => [id, { ...counts }])), extra: { votes: [], races: [{ id: "race", incumbent_id: ROOT }], politician_account_audit: [] },
  };
  const manifest: IdentityManifest = {
    input_files: {},
    links: ids.slice(1).map((id, index): ReviewedLink => ({
      decision_id: `20000000-0000-0000-0000-00000000000${index + 1}`,
      source_id: id, canonical_id: ROOT, approved_to_apply: false,
      source_updated_at: originals[index + 1]!.updated_at, canonical_updated_at: originals[0]!.updated_at,
      evidence: {
        approved_to_apply: false, source_urls: ["https://example.com/reviewed-crosswalk"],
        source_profile_sha256: hashBytes(JSON.stringify(originals[index + 1])),
        canonical_profile_sha256: hashBytes(JSON.stringify(originals[0])),
      }, fields: {},
    })),
  };
  const live = structuredClone(originals);
  const calls: Parameters<IdentityApplyStore["link"]>[0][] = [];
  const savedDecisions: Awaited<ReturnType<IdentityApplyStore["decisions"]>> = [];
  const snapshots: unknown[] = [];
  const aliasRows: Awaited<ReturnType<IdentityApplyStore["aliases"]>> = ids.flatMap((id, index) => [
    { id: `30000000-0000-0000-0000-0000000000${index}1`, politician_id: id, alias: "Shared", alias_type: index === 0 ? "nickname" as const : "title" as const, created_at: "2026-01-01T00:00:00Z" },
    { id: `30000000-0000-0000-0000-0000000000${index}2`, politician_id: id, alias: `Original ${index}`, alias_type: "informal" as const, created_at: "2026-01-01T00:00:00Z" },
  ]);
  const ledgerDrift: Record<string, number> = {};
  let dependencyDrift = false;
  let verificationSource = false;
  const store: IdentityApplyStore = {
    async profiles(ids) { return structuredClone(ids ? live.filter(row => ids.includes(row.id) || ids.includes(String(row.canonical_politician_id))) : live); },
    async registry() { return []; },
    async decisions() { return savedDecisions; },
    async aliases(ids) { return structuredClone(aliasRows.filter(row => ids.includes(row.politician_id))); },
    async counts(ids) {
      const result: Record<string, number> = {
        questions: ids.length * counts.questions + Number(dependencyDrift), answers: 0,
        snapshots: ids.length * counts.weekly_snapshots, team: 0, verifications: 0,
        x_posts: ids.length * counts.x_posts, outreach: 0, votes: 0,
        politician_aliases: aliasRows.filter(row => ids.includes(row.politician_id)).length,
        politician_verification_sources: 0, politician_photo_history: ids.length,
        politician_account_audit: 0, race_candidates: ids.length, answer_media: 0,
        question_notification_events: ids.length * 2, politician_notification_preferences: 0,
        politician_notification_consent_audit: 0, answer_corrections: 0, question_reports: 0,
        incumbent_races: Number(ids.includes(ROOT)),
      };
      for (const [key, value] of Object.entries(ledgerDrift)) result[key] = (result[key] ?? 0) + value;
      return result;
    },
    async hasVerificationSources() { return verificationSource; },
    async link(args) {
      calls.push(args);
      const source = live.find(row => row.id === args.p_source_id)!;
      const canonical = live.find(row => row.id === args.p_canonical_id)!;
      const resultingMembers = live.filter(row => row.id === source.id || row.id === canonical.id || row.canonical_politician_id === canonical.id).map(row => row.id);
      assert.deepEqual(args.p_expected_counts, await store.counts(resultingMembers));
      const beforeAliases = structuredClone(aliasRows.filter(row => resultingMembers.includes(row.politician_id)));
      assert.equal(args.p_source_updated_at, source.updated_at);
      assert.equal(args.p_canonical_updated_at, canonical.updated_at);
      source.canonical_politician_id = canonical.id;
      source.updated_at = `2026-11-23T00:00:0${calls.length}Z`;
      canonical.updated_at = source.updated_at;
      const selectedParty = (args.p_fields as { party?: string } | undefined)?.party;
      if (selectedParty) canonical.party = selectedParty;
      canonical.aliases = [...new Set([...(canonical.aliases as string[]), ...(source.aliases as string[]), String(source.full_name)])].sort();
      for (const alias of aliasRows.filter(row => row.politician_id === source.id)) {
        if (!aliasRows.some(row => row.politician_id === canonical.id && row.alias === alias.alias)) {
          aliasRows.push({ ...alias, id: `40000000-0000-0000-0000-${String(aliasRows.length).padStart(12, "0")}`, politician_id: canonical.id, created_at: canonical.updated_at });
        }
      }
      for (const alias of [...source.aliases as string[], String(source.full_name), ...((args.p_fields as { aliases?: string[] } | undefined)?.aliases ?? [])]) {
        if (alias.trim() && !aliasRows.some(row => row.politician_id === canonical.id && row.alias === alias)) {
          aliasRows.push({ alias, alias_type: "nickname", id: `40000000-0000-0000-0000-${String(aliasRows.length).padStart(12, "0")}`, politician_id: canonical.id, created_at: canonical.updated_at });
        }
      }
      savedDecisions.push({
        id: args.p_decision_id, source_id: args.p_source_id, canonical_id: args.p_canonical_id,
        evidence: args.p_evidence, fields: args.p_fields, reviewed_by: args.p_reviewed_by,
        created_at: canonical.updated_at, before_state: { aliases: beforeAliases }, dependency_counts: args.p_expected_counts,
      });
      return { canonical_id: canonical.id };
    },
  };
  const approve = () => {
    for (const link of manifest.links) { link.approved_to_apply = true; link.evidence.approved_to_apply = true; }
  };
  const run = (apply = false, pinnedSha256: string | undefined = SHA) => runIdentityApplication({
    manifest, originals, relationships, store, apply, pinnedSha256, manifestSha256: SHA, reviewedBy: "Garrett Weiss",
    snapshot: async value => { snapshots.push(value); },
  });
  return { originals, live, manifest, calls, snapshots, store, run, approve, aliasRows, ledgerDrift,
    drift: () => { dependencyDrift = true; }, claimSource: () => { verificationSource = true; } };
}

test("dry-run accepts pending review and snapshots fresh evidence without any link writes", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.dryRun, true);
  assert.equal(result.applied, 0);
  assert.equal(f.calls.length, 0);
  assert.equal(f.snapshots.length, 1);
  assert.deepEqual(f.live, f.originals);
});

test("apply needs both explicit row/evidence approval and exact operator-pinned SHA", async () => {
  const f = fixture();
  await assert.rejects(f.run(true), /not explicitly approved/);
  f.approve();
  await assert.rejects(f.run(true, "b".repeat(64)), /operator-pinned/);
  assert.equal(f.calls.length, 0);
});

test("source errors, metadata drift, claims and dependency changes stop before all writes", async () => {
  const changed = fixture(); changed.approve(); changed.live[0]!.slug = "changed";
  await assert.rejects(changed.run(true), /profile drift/);
  assert.equal(changed.calls.length, 0);
  const dependency = fixture(); dependency.approve(); dependency.drift();
  await assert.rejects(dependency.run(true), /Dependency drift/);
  assert.equal(dependency.snapshots.length, 0);
  const claimed = fixture(); claimed.approve(); claimed.claimSource();
  await assert.rejects(claimed.run(true), /authority evidence/);
  const failed = fixture(); failed.approve(); failed.store.profiles = async () => { throw new Error("source unavailable"); };
  await assert.rejects(failed.run(true), /source unavailable/);
  assert.equal(failed.calls.length, 0);
});

test("multiple sources retain permanent root and refresh only expected own-link changes", async () => {
  const f = fixture(true); f.approve();
  const result = await f.run(true);
  assert.equal(result.applied, 2);
  assert.equal(f.calls[0]!.p_canonical_updated_at, f.originals[0]!.updated_at);
  assert.equal(f.calls[1]!.p_canonical_updated_at, "2026-11-23T00:00:01Z");
  assert.equal((f.calls[0]!.p_expected_counts as { questions: number }).questions, 6);
  assert.equal((f.calls[1]!.p_expected_counts as { questions: number }).questions, 9);
  assert.equal((f.calls[0]!.p_expected_counts as { politician_aliases: number }).politician_aliases, 4);
  assert.equal((f.calls[1]!.p_expected_counts as { politician_aliases: number }).politician_aliases, 9);
  assert.equal(Object.keys(f.calls[0]!.p_expected_counts as object).length, 20);
  assert.equal(f.aliasRows.length, 12);
  assert.equal(f.aliasRows.find(row => row.politician_id === ROOT && row.alias === "Shared")!.alias_type, "nickname");
  assert.equal(f.live[0]!.slug, f.originals[0]!.slug);
  assert.equal(f.live[0]!.photo_url, f.originals[0]!.photo_url);
  assert.equal(f.live[0]!.verification_tier, "0");
  assert.equal(f.live[1]!.canonical_politician_id, ROOT);
  assert.equal(f.live[2]!.canonical_politician_id, ROOT);
});

test("repeated pinned decisions are idempotent and preserve snapshot history", async () => {
  const f = fixture(true); f.approve();
  await f.run(true);
  const result = await f.run(true);
  assert.equal(result.alreadyApplied, 2);
  assert.equal(result.applied, 0);
  assert.equal(f.calls.length, 2);
  assert.equal(f.snapshots.length, 2);
});

test("mid-batch unrelated root edits stop further links instead of blessing fresh timestamps", async () => {
  const f = fixture(true); f.approve();
  const link = f.store.link;
  f.store.link = async args => {
    const result = await link(args);
    f.live[0]!.photo_url = "https://example.com/unreviewed.jpg";
    return result;
  };
  await assert.rejects(f.run(true), /profile drift/);
  assert.equal(f.calls.length, 1);
});

test("unreviewed external provider owners and unexpected canonical members veto apply", async () => {
  const conflicting = fixture(); conflicting.approve();
  conflicting.live.push({ ...conflicting.originals[1]!, id: THIRD });
  await assert.rejects(conflicting.run(true), /outside reviewed group/);
  assert.equal(conflicting.calls.length, 0);
  const member = fixture(); member.approve();
  member.live.push({ ...member.originals[1]!, id: THIRD, candidate_fec_id: "OTHER", canonical_politician_id: ROOT });
  await assert.rejects(member.run(true), /Unreviewed identity members/);
});

test("captured optional ledgers and unrecognized RPC keys fail closed", async () => {
  const captured = fixture(); captured.approve(); captured.ledgerDrift.answer_media = 1;
  await assert.rejects(captured.run(true), /Dependency drift requires review: answer_media/);
  assert.equal(captured.calls.length, 0);
  const unknown = fixture(); unknown.approve(); unknown.ledgerDrift.unreviewed_new_ledger = 1;
  await assert.rejects(unknown.run(true), /dependency RPC contract/);
  assert.equal(unknown.calls.length, 0);
});

test("newly available optional ledgers are snapshotted and must remain exactly unchanged", async () => {
  const f = fixture(); f.approve();
  const link = f.store.link;
  f.store.link = async args => {
    const result = await link(args);
    f.ledgerDrift.question_notification_events = 1;
    return result;
  };
  await assert.rejects(f.run(true), /Post-link preservation count changed/);
  const snapshot = f.snapshots[0] as { dependency_counts: Record<string, Record<string, number>> };
  assert.equal(snapshot.dependency_counts[ROOT]!.question_notification_events, 4);
});

test("alias copying allows only exact missing alias pairs, preserving existing IDs and types", async () => {
  const f = fixture(true); f.approve();
  const before = structuredClone(f.aliasRows);
  await f.run(true);
  for (const original of before) assert.deepEqual(f.aliasRows.find(row => row.id === original.id), original);
  assert.equal(f.aliasRows.filter(row => row.politician_id === ROOT && row.alias === "Shared").length, 1);
  const tampered = fixture(); tampered.approve();
  const link = tampered.store.link;
  tampered.store.link = async args => {
    const result = await link(args);
    tampered.aliasRows[0]!.alias_type = "title";
    return result;
  };
  await assert.rejects(tampered.run(true), /Alias ledger changed/);
});

test("replay uses recorded complete counts and rejects post-application optional ledger drift", async () => {
  const f = fixture(true); f.approve();
  await f.run(true);
  f.ledgerDrift.question_notification_events = 1;
  await assert.rejects(f.run(true), /Completed decision ledger drift/);
  assert.equal(f.calls.length, 2);
});

test("reviewed missing party fills survive multi-source apply and replay without changing portraits", async () => {
  const f = fixture(true); f.approve();
  for (const link of f.manifest.links) link.fields.party = "Democrat";
  await f.run(true);
  assert.equal(f.live[0]!.party, "Democrat");
  assert.equal(f.live[0]!.photo_url, f.originals[0]!.photo_url);
  assert.equal((await f.run(true)).applied, 0);
});
