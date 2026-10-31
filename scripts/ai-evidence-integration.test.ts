/** Real generator modules, mocked model/audit boundaries. No paid calls or network. */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve,dirname } from "node:path";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import type { AnalysisInput, AnalysisResult } from "../lib/ai/analysis";
import type { PoliticianContext, SeededQuestion } from "../lib/ai/seeded-questions";
const realRequire=createRequire(import.meta.url);
const evidence={title:"Fixture vote",url:"https://example.gov/vote",date:"2026-10-01",excerpt:"The reviewed source describes a legislative vote by the selected official.",reviewedBy:"Fixture reviewer"};
const input:AnalysisInput={politicianId:"fixture-id",politicianName:"Fixture Official",office:"Senator",state:"CA",party:null,bio:null,question:"What was your reasoning?"};
function generators(output:unknown){
  let calls=0;
  function load(file:string):unknown{
    const source=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
    const loadedModule:{exports:unknown}={exports:{}};
    const require=(name:string):unknown=>{
      if(name==="./client")return {getAnthropicClient:()=>({messages:{create:async()=>{calls++;return {content:[{type:"text",text:JSON.stringify(output)}],usage:{input_tokens:1,output_tokens:1}};}}}),MODEL_GENERATE:"fixture-model"};
      if(name==="./audit-log")return {logAICall:async()=>{},hashPrompt:()=>"fixture-hash"};
      if(name.startsWith("."))return load(resolve(dirname(file),`${name}.ts`));
      return realRequire(name);
    };
    (runInThisContext(`(function(require,module,exports){${source}\n})`,{filename:file}) as (r:typeof require,m:typeof loadedModule,e:unknown)=>void)(require,loadedModule,loadedModule.exports);
    return loadedModule.exports;
  }
  const analysis=load(resolve("lib/ai/analysis.ts")) as {generateAnalysis:(value:AnalysisInput)=>Promise<AnalysisResult>};
  const seeds=load(resolve("lib/ai/seeded-questions.ts")) as {generateSeededQuestions:(value:PoliticianContext)=>Promise<SeededQuestion[]>};
  return {analysis,seeds,calls:()=>calls};
}
test("missing or malformed reviewed evidence never invokes generation",async()=>{
  const g=generators({});assert.deepEqual(await g.analysis.generateAnalysis(input),{insufficientRecord:true,confidence:"insufficient"});
  assert.deepEqual(await g.analysis.generateAnalysis({...input,evidence:[{...evidence,reviewedBy:""}]}),{insufficientRecord:true,confidence:"insufficient"});
  assert.deepEqual(await g.seeds.generateSeededQuestions({id:"fixture",full_name:"Fixture Official",office:"Senator",state:"CA",party:null,bio:null,bioguide_id:null}),[]);assert.equal(g.calls(),0);
});
test("zero-source prose and model-invented URLs cannot become analysis",async()=>{
  for(const sources of [[],[{...evidence,url:"https://example.gov/invented"}]]){
    const g=generators({insufficientRecord:false,confidence:"high",body:"A sufficiently long invented response that should never be published without its documented evidence.",sources});
    assert.equal((await g.analysis.generateAnalysis({...input,evidence:[evidence]})).insufficientRecord,true);
  }
});
test("analysis citations are canonical reviewed sources and confidence reflects unique sources",async()=>{
  const g=generators({insufficientRecord:false,confidence:"high",body:"The source describes the recorded legislative action and supports this bounded summary of the public record.",sources:[{...evidence,title:"Model's invented title"},evidence]});
  const result=await g.analysis.generateAnalysis({...input,evidence:[evidence]});assert.equal(result.insufficientRecord,false);
  if(!result.insufficientRecord){assert.equal(result.confidence,"medium");assert.deepEqual(result.sources,[{title:evidence.title,url:evidence.url,date:evidence.date}]);}
});
