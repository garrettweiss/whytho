import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizeUploadedPortrait } from "./portrait";
import { profileInput } from "./profile-input";
import { photoRightsManifest, approvedRights } from "./rights";
const id = "11111111-1111-4111-8111-111111111111";
test("portrait encoding produces bounded JPEG without embedded metadata", async () => {
  const input = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#aabbcc" } }).withMetadata().png().toBuffer();
  const output = await normalizeUploadedPortrait(input);
  const meta = await sharp(output).metadata();
  assert.equal(meta.width, 400); assert.equal(meta.height, 500); assert.equal(meta.format, "jpeg"); assert.equal(meta.exif, undefined);
});
test("rejects tiny images, active formats, invalid bytes and oversized files", async () => {
  await assert.rejects(normalizeUploadedPortrait(await sharp({ create: { width: 40, height: 50, channels: 3, background: "white" } }).png().toBuffer()), /400 pixels/);
  await assert.rejects(normalizeUploadedPortrait(Buffer.from('<svg width="500" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="500" height="600"/></svg>')), /still JPEG/);
  await assert.rejects(normalizeUploadedPortrait(Buffer.from("not an image")));
  await assert.rejects(normalizeUploadedPortrait(Buffer.alloc(4 * 1024 * 1024 + 1)), /4 MB/);
});
test("profile validation rejects unsafe URLs, prototype keys and malformed payloads", () => {
  for (const website_url of ["javascript:alert(1)", "httpstuff", "https://user:pass@example.com"]) assert.equal(profileInput.safeParse({ politician_id: id, website_url }).success, false);
  assert.equal(profileInput.safeParse({ politician_id: id, social_handles: { arbitrary: "value" } }).success, false);
  assert.equal(profileInput.safeParse(null).success, false);
  assert.equal(profileInput.safeParse({ politician_id: id, website_url: "https://example.gov", social_handles: { instagram: "" } }).success, true);
});
test("photo rights require exact identity, reviewed rights and source binding", () => {
  assert.equal(photoRightsManifest.safeParse([{ politician_id: id, source_url: "https://example.gov/photo.jpg" }]).success, false);
  const rows = photoRightsManifest.parse([{ politician_id: id, source_url: "https://example.gov/photo.jpg", source_page: "https://example.gov/photo", creator: "Fixture Creator", license: "CC-BY-4.0", license_url: "https://creativecommons.org/licenses/by/4.0/", evidence: "Fixture permission evidence retained in source record.", identity_verified: true, reviewed_by: "Fixture Reviewer", reviewed_at: "2026-10-30T12:00:00Z", changes: "Resized and cropped to portrait." }]);
  assert.ok(approvedRights(rows,id,rows[0]!.source_url));
  assert.equal(approvedRights(rows,id,"https://example.gov/different.jpg"),null);
});
