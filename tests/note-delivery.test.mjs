import test from 'node:test';
import assert from 'node:assert/strict';
import {fileNamesInNote,fileReferenceReply} from '../lib/note-delivery-helpers.mjs';

const chatId=-1004476272910;
const note=`📂 YAJE FILE REFERENCE — anti_bootloop
Listed filenames received from the YAJE Discussions group:
• abootloop_v1.2.zip
• bootloop_protector.zip
• [Storm Guard] Bootloop Protector V2.zip

📎 Shared Telegram post
File: abootloop_v1.2.zip
Post: https://t.me/c/4476272910/4/32

⚠️ Community uploads are not security-scanned or verified by YAJETZY.`;

test('extract filenames from YAJE file catalogs without repetition',()=>{
  assert.deepEqual(fileNamesInNote(note),[
    'abootloop_v1.2.zip','bootloop_protector.zip','[Storm Guard] Bootloop Protector V2.zip'
  ]);
  assert.deepEqual(fileNamesInNote('Ordinary discussion about example.zip'),[]);
});
test('render Telegram link for approved file and missing statuses for the rest',()=>{
  const rendered=fileReferenceReply({
    chatId,slug:'anti_bootloop',groupName:'YAJE Discussions',content:note,
    files:[{message_id:'32',thread_id:'4',display_name:'abootloop_v1.2.zip',file_name:'abootloop_v1.2.zip',review_status:'approved',delivery_approved:true}]
  });
  assert.equal(rendered.linked,1);
  assert.equal(rendered.total,3);
  assert.equal(rendered.parse_mode,'HTML');
  assert.match(rendered.text,/<code>abootloop_v1\.2\.zip<\/code>/);
  assert.match(rendered.text,/⏳ <code>bootloop_protector\.zip<\/code>/);
  assert.doesNotMatch(rendered.text,/https:\/\/abootloop_v1\.2\.zip/);
  assert.equal(rendered.reply_markup.inline_keyboard.length,1);
  assert.equal(rendered.reply_markup.inline_keyboard[0][0].url,'https://t.me/c/4476272910/4/32');
  assert.deepEqual(rendered.reply_markup.inline_keyboard[0][1],
    {text:'📥 Send File Here',callback_data:'fileget:32'});
});
test('never provide file link for unapproved filename',()=>{
  const result=fileReferenceReply({
    chatId,slug:'anti_bootloop',groupName:'YAJE Discussions',content:note,
    files:[{message_id:33,thread_id:4,file_name:'bootloop_protector.zip',display_name:'bootloop_protector.zip',review_status:'pending',delivery_approved:true}]
  });
  assert.equal(result.linked,0);
  assert.equal(result.reply_markup,undefined);
  assert.match(result.text,/Linked: 0\/3 files/);
});
test('HTML-escape filenames so injected tags are inert',()=>{
  const malicious='• [Tool] <script>alert(1)</script>.apk';
  const result=fileReferenceReply({chatId,slug:'sample',groupName:'<YAJE>',content:'YAJE FILE REFERENCE\n'+malicious,files:[]});
  assert.ok(result);
  assert.match(result.text,/&lt;script&gt;/);
  assert.doesNotMatch(result.text,/<script>/);
});
