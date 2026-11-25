import test from "node:test";
import assert from "node:assert/strict";
import { isParticipationMutation, validAssent, TERMS_VERSION } from "./participation";
test("only current affirmative adult assent is valid",()=>{
 assert.equal(validAssent({adult:true,terms_version:TERMS_VERSION}),true);
 for(const value of [null,{}, {adult:false,terms_version:TERMS_VERSION},{adult:"true",terms_version:TERMS_VERSION},{adult:true,terms_version:"old"}])assert.equal(validAssent(value),false);
});
test("public reads and account rights remain open while interaction writes are gated",()=>{
 for(const path of ["/api/votes","/api/questions","/api/chat","/api/answers/uuid/approve","/api/dashboard/team","/api/verify/claim","/api/politicians/uuid/photo"]) {assert.equal(isParticipationMutation(path,"POST"),true);assert.equal(isParticipationMutation(path,"GET"),false);}
 for(const path of ["/api/participation","/api/settings/profile","/api/settings/notifications","/privacy","/terms","/report","/api/auth/anonymous"])assert.equal(isParticipationMutation(path,"POST"),false);
});
