import assert from "node:assert/strict";
import test from "node:test";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";

test("patched AI SDK and Anthropic provider stream plain text with validated tool schema", async () => {
  let calls = 0;
  const provider = createAnthropic({ apiKey: "fixture-only-no-network", fetch: async (_input, init) => {
    calls++;
    const body=JSON.parse(String(init?.body)) as { model: string; tools: { input_schema: { type: string } }[] };
    assert.equal(body.model,"claude-sonnet-4-6");assert.equal(body.tools[0]?.input_schema.type,"object");
    const events = [
      {type:"message_start",message:{id:"fixture",type:"message",role:"assistant",content:[],model:"claude-sonnet-4-6",stop_reason:null,stop_sequence:null,usage:{input_tokens:5,output_tokens:0}}},
      {type:"content_block_start",index:0,content_block:{type:"text",text:""}},
      {type:"content_block_delta",index:0,delta:{type:"text_delta",text:"Fixture public answer."}},
      {type:"content_block_stop",index:0},
      {type:"message_delta",delta:{stop_reason:"end_turn",stop_sequence:null},usage:{output_tokens:4}},
      {type:"message_stop"},
    ];
    return new Response(events.map(event=>`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""),{headers:{"content-type":"text/event-stream"}});
  }});
  const result=streamText({model:provider("claude-sonnet-4-6"),messages:[{role:"user",content:"Fixture question"}],stopWhen:stepCountIs(4),maxOutputTokens:50,
    tools:{public_record:tool({inputSchema:z.object({id:z.string().uuid()}),execute:async()=>({found:false})})}});
  assert.equal(await result.toTextStreamResponse().text(),"Fixture public answer.");assert.equal(calls,1);
});
