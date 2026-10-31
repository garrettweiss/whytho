import assert from "node:assert/strict";
import test from "node:test";
import { buildVerificationResumes, initialVerificationResume } from "./resume";

const politician = { id: "profile-1", slug: "test-profile", full_name: "Test Person", office: "Governor", state: "CA", party: null, photo_url: null, verification_tier: "1" };
const membership = { user_id: "owner", role: "admin", politicians: politician };

test("existing team members resume completed identity methods without reclaiming", () => {
  const profiles = buildVerificationResumes("owner", [membership], [
    { user_id: "owner", politician_id: politician.id, method: "gov_email", status: "completed" },
    { user_id: "owner", politician_id: politician.id, method: "meta_tag", status: "pending" },
  ]);
  assert.deepEqual(profiles[0]?.completedMethods, ["gov_email"]);
  assert.equal(profiles[0]?.verified, false);
  assert.equal(initialVerificationResume(profiles, politician.id), profiles[0]);
  assert.equal(initialVerificationResume(profiles, "someone-elses-profile"), null);
});

test("resume data rejects another account, unknown roles, and unrelated verification rows", () => {
  const profiles = buildVerificationResumes("owner", [membership, { ...membership, user_id: "other" }, { ...membership, role: "unknown" }], [
    { user_id: "other", politician_id: politician.id, method: "gov_email", status: "completed" },
    { user_id: "owner", politician_id: "other-profile", method: "meta_tag", status: "completed" },
    { user_id: "owner", politician_id: politician.id, method: "gov_email", status: "expired" },
    { user_id: "owner", politician_id: politician.id, method: "stripe", status: "completed" },
  ]);
  assert.equal(profiles.length, 1);
  assert.deepEqual(profiles[0]?.completedMethods, []);
  assert.deepEqual(buildVerificationResumes("other", [membership], []), []);
});

test("verified status comes from the stored tier, not method count or serialized secrets", () => {
  const rows = ["gov_email", "meta_tag", "gov_email"].map(method => ({ user_id: "owner", politician_id: politician.id, method, status: "completed", verification_code: "secret", metadata: { email: "private@example.gov" } }));
  const [pending] = buildVerificationResumes("owner", [membership], rows);
  assert.deepEqual(pending?.completedMethods, ["gov_email", "meta_tag"]);
  assert.equal(pending?.verified, false);
  assert.equal(JSON.stringify(pending).includes("secret"), false);
  assert.equal(JSON.stringify(pending).includes("private@"), false);
  for (const role of ["admin", "editor", "responder"]) {
    const [verified] = buildVerificationResumes("owner", [{ ...membership, role, politicians: [{ ...politician, verification_tier: "2" }] }], []);
    assert.equal(verified?.verified, true);
    assert.equal(verified?.role, role);
  }
});
