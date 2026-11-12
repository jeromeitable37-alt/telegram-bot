import test from 'node:test';
import assert from 'node:assert/strict';
import {fileNamesInNote,fileReferenceReply,genericFilenameNoteHtml,eligibleAutoDeliveryFiles} from '../lib/note-delivery-helpers.mjs';

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

test('restricted notes never expose direct file-post buttons',()=>{
  const out=fileReferenceReply({chatId,slug:'restricted',groupName:'YAJE Discussions',
    content:'YAJE FILE REFERENCE\n• risky-item.apk\nStatus: Restricted review. No download link will be shared.',
    files:[{file_name:'risky-item.apk',message_id:350,thread_id:7,review_status:'approved',delivery_approved:true}]
  });
  assert.equal(out.linked,0);
  assert.equal(out.reply_markup,undefined);
  assert.match(out.text,/Restricted note/);
  assert.match(out.text,/<code>risky-item\.apk<\/code>/);
});
test('informational notes protect .zip filenames while preserving official project URLs',()=>{
  const out=genericFilenameNoteHtml('YAJE Discussions','lsposed',
    'Official GitHub: https://github.com/LSPosed/LSPosed\nYAJE group file mentioned: LSPosed-v2.0.0-release.zip');
  assert.match(out.text,/<code>LSPosed-v2\.0\.0-release\.zip<\/code>/);
  assert.match(out.text,/https:\/\/github.com\/LSPosed\/LSPosed/);
  assert.equal(genericFilenameNoteHtml('YAJE','normal','Hello members.'),null);
});

test('auto-delivers the first approved file named in #anti_bootloop and skips absent ones',()=>{
  const list=eligibleAutoDeliveryFiles(note,[
    {message_id:'32',thread_id:'4',display_name:'abootloop_v1.2.zip',file_name:'abootloop_v1.2.zip',review_status:'approved',delivery_approved:true}
  ],chatId);
  assert.deepEqual(list,[{
    messageId:32,threadId:4,name:'abootloop_v1.2.zip',
    url:'https://t.me/c/4476272910/4/32'
  }]);
});
test('auto delivery needs explicit approval, valid message, and respects restricted notes',()=>{
  const file={message_id:'32',thread_id:'4',display_name:'abootloop_v1.2.zip',
    file_name:'abootloop_v1.2.zip',review_status:'approved',delivery_approved:true};
  assert.equal(eligibleAutoDeliveryFiles(note,[{...file,delivery_approved:false}],chatId).length,0);
  assert.equal(eligibleAutoDeliveryFiles(note,[{...file,review_status:'pending'}],chatId).length,0);
  assert.equal(eligibleAutoDeliveryFiles(note,[{...file,message_id:'invalid'}],chatId).length,0);
  assert.equal(eligibleAutoDeliveryFiles(note+'\nStatus: Restricted review. No download link will be shared.',[file],chatId).length,0);
});
test('auto delivery caps files at 2 and does not duplicate indexed messages',()=>{
  const files=['abootloop_v1.2.zip','bootloop_protector.zip','[Storm Guard] Bootloop Protector V2.zip'].map((name,i)=>({
    message_id:String(i+32),thread_id:'4',display_name:name,file_name:name,review_status:'approved',delivery_approved:true
  }));
  assert.deepEqual(eligibleAutoDeliveryFiles(note,files,chatId).map(f=>f.messageId),[32,33]);
  assert.deepEqual(eligibleAutoDeliveryFiles(note,[files[0],files[0]],chatId).map(f=>f.messageId),[32]);
});
