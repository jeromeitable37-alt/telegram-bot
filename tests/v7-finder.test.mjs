import test from 'node:test';
import assert from 'node:assert/strict';
import {guidedPromptKind,fileFinderKeyboard} from '../lib/v7-search-helpers.mjs';
import {offlineTechHelp,extractAiText} from '../lib/how-assistant.js';

test('recognize only YAJETZY guided search and how prompts',()=>{
  assert.equal(guidedPromptKind({text:'🔎 YAJETZY FILE SEARCH\nType a file'}),'find');
  assert.equal(guidedPromptKind({text:'💬 YAJETZY HOW ASSISTANT\nType your question'}),'how');
  assert.equal(guidedPromptKind({text:'hi'}),null);
});
test('Finder has tap-to-send for approved documents and original link',()=>{
  const kb=fileFinderKeyboard(-1004476272910,[{
    message_id:'32',thread_id:'4',display_name:'YAJE Guide.pdf',review_status:'approved',delivery_approved:true
  }]);
  assert.equal(kb.inline_keyboard[0][0].callback_data,'fileget:32');
  assert.equal(kb.inline_keyboard[1][0].url,'https://t.me/c/4476272910/4/32');
  assert.equal(kb.inline_keyboard.at(-1)[0].callback_data,'find:new');
});
test('unapproved files cannot appear as send options',()=>{
  const kb=fileFinderKeyboard(-1004476272910,[
    {message_id:'33',thread_id:'4',display_name:'unreviewed.apk',review_status:'pending',delivery_approved:true},
    {message_id:'35',thread_id:'4',display_name:'readme.pdf',review_status:'approved',delivery_approved:false}
  ]);
  assert.equal(kb.inline_keyboard.length,2);
  assert.equal(kb.inline_keyboard[0][0].url,'https://t.me/c/4476272910/4/35');
  assert.equal(kb.inline_keyboard[0][0].callback_data,undefined);
});
test('Finder ignores invalid message IDs and limits results to six',()=>{
  const files=Array.from({length:10},(_,i)=>({
    message_id:String(i+20),thread_id:4,display_name:'Guide '+i+'.pdf',
    review_status:'approved',delivery_approved:true
  }));
  assert.equal(fileFinderKeyboard(-1004476272910,files).inline_keyboard.length,13);
  assert.equal(fileFinderKeyboard(0,files).inline_keyboard.length,0);
  assert.equal(fileFinderKeyboard(-1004476272910,[{...files[0],message_id:'hi'}]).inline_keyboard.length,1);
});
test('basic assistant does not pretend to be live AI or invent rooting bypasses',()=>{
  const root=offlineTechHelp('How to root Android?');
  assert.match(root,/official manufacturer/i);
  assert.match(root,/data loss/i);
  assert.doesNotMatch(root,/fastboot (?:flash|boot)/i);
  const fallback=offlineTechHelp('What is NFC?');
  assert.match(fallback,/AI model/i);
});
test('Responses API parser reads only output_text messages',()=>{
  assert.equal(extractAiText({output:[
    {type:'message',content:[{type:'output_text',text:'Hello'},{type:'refusal',refusal:'No'}]},
    {type:'message',content:[{type:'output_text',text:'World'}]}
  ]}),'Hello\nWorld');
  assert.equal(extractAiText({output:[{type:'reasoning',content:[]}]}),'');
});
