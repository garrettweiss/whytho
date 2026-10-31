import test from "node:test";
import assert from "node:assert/strict";
import { planQuestionNotification, deliveryRecovery, type QuestionEvent, type Recipient } from "./planner";
import { requireOutreachPreview, blockLegacyOutreachDelivery } from "./outreach-guard";
const event: QuestionEvent = { id: "11111111-1111-4111-8111-111111111111", politicianId: "22222222-2222-4222-8222-222222222222", createdAt: "2026-10-30T12:00:00Z", source: "user", isSeeded: false, status: "active", hasPublishedOfficialAnswer: false };
const recipient: Recipient = { userId: "33333333-3333-4333-8333-333333333333", politicianId: event.politicianId, activeMember: true, verificationTier: "2", emailVerified: true, consentedAt: "2026-10-29T12:00:00Z", consentVersion: "politician-question-notices-v1", mode: "prompt", suppressed: false };
const options = { now: "2026-10-30T12:01:00Z", lastSentAt: null, alreadyDelivered: false, nextDailyWindow: "2026-10-30T16:00:00Z" };
test("a new human question queues only for a verified opted-in team member after debounce",()=>{
  const result=planQuestionNotification(event,recipient,options);
  assert.equal(result.action,"queue");
  if(result.action==="queue") { assert.equal(result.earliestAt,"2026-10-30T12:15:00.000Z"); assert.equal(result.recipientKey,`question-created:${event.id}:email:${recipient.userId}:v1`); }
});
test("seeded and imported questions never masquerade as new constituent demand",()=>{
  for(const update of [{source:"seeded" as const},{source:"x" as const},{isSeeded:true}]) assert.equal(planQuestionNotification({...event,...update},recipient,options).action,"skip");
});
test("hidden, archived and already answered questions are suppressed",()=>{
  for(const update of [{status:"hidden" as const},{status:"archived" as const},{hasPublishedOfficialAnswer:true}]) assert.equal(planQuestionNotification({...event,...update},recipient,options).action,"skip");
});
test("pending or removed staff, unrelated teams and unverified profiles cannot receive",()=>{
  for(const update of [{activeMember:false},{politicianId:event.id},{verificationTier:"0" as const},{verificationTier:"1" as const},{emailVerified:false}]) assert.equal(planQuestionNotification(event,{...recipient,...update},options).action,"skip");
});
test("missing, future, obsolete, revoked and suppressed consent all fail closed",()=>{
  for(const update of [{consentedAt:null},{consentedAt:"2099-01-01"},{consentVersion:"old"},{mode:"off" as const},{suppressed:true}]) assert.equal(planQuestionNotification(event,{...recipient,...update},options).action,"skip");
});
test("daily batching and the 24-hour contact cap combine without dropping the event",()=>{
  const result=planQuestionNotification(event,{...recipient,mode:"daily"},{...options,lastSentAt:"2026-10-30T11:00:00Z"});
  assert.equal(result.action,"queue");if(result.action==="queue")assert.equal(result.earliestAt,"2026-10-31T11:00:00.000Z");
});
test("already delivered events cannot send again",()=>assert.equal(planQuestionNotification(event,recipient,{...options,alreadyDelivered:true}).action,"skip"));
test("malformed ids and clocks fail closed",()=>{
  assert.equal(planQuestionNotification({...event,id:"not-id"},recipient,options).action,"skip");
  assert.equal(planQuestionNotification(event,recipient,{...options,now:"invalid"}).action,"skip");
  assert.equal(planQuestionNotification(event,recipient,{...options,nextDailyWindow:"2026-10-29T00:00:00Z"}).action,"skip");
});
test("provider acceptance ends retries; ambiguous sends retain the same key within its retention window",()=>{
  assert.equal(deliveryRecovery({outcome:"accepted",firstAttemptAt:options.now,now:options.now}),"done");
  assert.equal(deliveryRecovery({outcome:"not_started",firstAttemptAt:null,now:options.now}),"send");
  assert.equal(deliveryRecovery({outcome:"ambiguous",firstAttemptAt:"2026-10-30T12:00:00Z",now:"2026-10-30T13:00:00Z"}),"retry_same_key");
  assert.equal(deliveryRecovery({outcome:"ambiguous",firstAttemptAt:"2026-10-29T12:00:00Z",now:"2026-10-30T13:00:00Z"}),"reconcile");
  assert.equal(deliveryRecovery({outcome:"rejected",firstAttemptAt:null,now:options.now}),"reconcile");
});
test("legacy outreach defaults to preview and rejects every live override",()=>{
  assert.equal(requireOutreachPreview([]),true);assert.equal(requireOutreachPreview(["--dry-run"]),true);
  for(const flag of ["--send","--apply","--live","--send=true"])assert.throws(()=>requireOutreachPreview([flag]),/paused/);
  assert.throws(()=>blockLegacyOutreachDelivery(),/disabled/);
});
