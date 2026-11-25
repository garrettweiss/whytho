import assert from "node:assert/strict";
import test from "node:test";
import { classifyCongressAttribution, commonsLicense, commonsTitleFromFilePath, districtKey, fullNameMatches, surnameMatches, stripTags } from "./manifest-sources";
import { photoRightsManifest } from "./rights";

test("Congress.gov attributions split into federal works, member-supplied and unresolved", () => {
  assert.equal(classifyCongressAttribution("Official U.S. Senate Photo").kind, "federal_official");
  assert.equal(classifyCongressAttribution('<a href="http://www.senate.gov/x">Courtesy U.S. Senate Historical Office</a>').kind, "federal_official");
  assert.equal(classifyCongressAttribution("Collection of the U.S. House of Representatives").kind, "federal_official");
  assert.equal(classifyCongressAttribution("Image courtesy of the Member").kind, "member_supplied");
  assert.equal(classifyCongressAttribution("Image Courtesy of Member").kind, "member_supplied");
  assert.equal(classifyCongressAttribution("GPO Member Guide").kind, "gpo_publication");
  assert.equal(classifyCongressAttribution("Image, Congressional Pictorial Directory, 109th.").kind, "gpo_publication");
  assert.equal(classifyCongressAttribution("Photo by Campaign Studio").kind, "unresolved");
  assert.equal(classifyCongressAttribution(undefined).kind, "unresolved");
  assert.equal(stripTags("<b>Jane</b>  Doe"), "Jane Doe");
});

test("surname check tolerates order, suffixes and accents", () => {
  assert.ok(surnameMatches("Nicholas J. Begich III", "Begich, Nicholas J."));
  assert.ok(surnameMatches("Raúl Grijalva", "Grijalva, Raul M."));
  assert.equal(surnameMatches("Mike DeWine", "Gavin Newsom"), false);
});

test("Commons licenses map only to accepted bases", () => {
  const cc = commonsLicense({ LicenseShortName: { value: "CC BY-SA 3.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/3.0" } });
  assert.equal(cc.license, "CC-BY-SA-3.0");
  const url = (meta: Parameters<typeof commonsLicense>[0]) => { const result = commonsLicense(meta); return result.license ? result.license_url : null; };
  assert.equal(url({ LicenseShortName: { value: "CC BY 2.0" }, LicenseUrl: { value: "http://creativecommons.org/licenses/by/2.0" } }), "https://creativecommons.org/licenses/by/2.0");
  assert.equal(url({ LicenseShortName: { value: "CC BY-SA 4.0" }, LicenseUrl: { value: "javascript:x" } }), "https://creativecommons.org/licenses/by-sa/4.0/");
  assert.equal(commonsLicense({ LicenseShortName: { value: "CC BY 4.0" } }).license, "CC-BY-4.0");
  assert.equal(commonsLicense({ LicenseShortName: { value: "CC0" } }).license, "CC0-1.0");
  const federal = commonsLicense({ LicenseShortName: { value: "Public domain" }, License: { value: "pd" }, Categories: { value: "PD US Congress|Members of the 109th United States Congress" } });
  assert.equal(federal.license, "US-federal-official-duty");
  const state = commonsLicense({ LicenseShortName: { value: "Public domain" }, License: { value: "pd" }, Categories: { value: "Personality rights warning|PD California" } });
  assert.equal(state.license, "US-state-public-record");
  assert.equal(commonsLicense({ LicenseShortName: { value: "Public domain" }, License: { value: "pd" }, Categories: { value: "PD-old-70|Portraits" } }).license, null);
  assert.equal(commonsLicense({ LicenseShortName: { value: "GFDL" } }).license, null);
  assert.equal(commonsLicense({ LicenseShortName: { value: "CC BY-NC 4.0" } }).license, null);
  assert.equal(commonsLicense({}).license, null);
  // Every accepted value must be a manifest license.
  for (const value of ["CC-BY-SA-3.0", "CC-BY-4.0", "CC0-1.0", "US-federal-official-duty", "US-state-public-record"]) {
    assert.ok(photoRightsManifest.element.shape.license.options.includes(value as never));
  }
});

test("Commons file titles are recovered from Wikidata image URLs", () => {
  assert.equal(commonsTitleFromFilePath("http://commons.wikimedia.org/wiki/Special:FilePath/Greg%20Abbott%20at%20NASA%202024%20%28cropped%29.jpg"), "File:Greg Abbott at NASA 2024 (cropped).jpg");
  assert.equal(commonsTitleFromFilePath("https://example.com/x.jpg"), null);
});

test("office-keyed matching needs first and last name and comparable districts", () => {
  assert.ok(fullNameMatches("Mike DeWine", "Mike DeWine"));
  assert.ok(fullNameMatches("Brianna Titone", "Brianna Titone"));
  assert.ok(fullNameMatches("Raúl M. Grijalva", "Raul Grijalva"));
  assert.ok(fullNameMatches("Julie McCluskie", "Julie McCluskie-Smith"));
  assert.equal(fullNameMatches("Mike DeWine", "Michael DeWine"), false);
  assert.equal(fullNameMatches("John Smith", "Jane Smith"), false);
  assert.equal(fullNameMatches("Smith", "John Smith"), false);
  assert.equal(districtKey("Colorado House of Representatives District 5"), "5");
  assert.equal(districtKey("HD-05"), "5");
  assert.equal(districtKey("Rutland"), "rutland");
  assert.equal(districtKey(null), null);
});
