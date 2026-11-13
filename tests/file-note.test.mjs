import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedNoteText,validLinkNoteSlug,savedGroupFileTitle,autoNoteSlugFromMedia} from '../lib/file-note-helpers.mjs';
import {linkedMediaNoteReply} from '../lib/note-delivery-helpers.mjs';
import {rankedFiles} from '../lib/v6-core.mjs';

const url='https://t.me/c/4476272910/123/456';

test('validates note names without allowing reserved commands',()=>{
  assert.equal(validLinkNoteSlug(' LSPOSED '),'lsposed');
  assert.equal(validLinkNoteSlug('codm_120fps'),'codm_120fps');
  assert.equal(validLinkNoteSlug('rules'),null);
  assert.equal(validLinkNoteSlug('hello world'),null);
  assert.equal(validLinkNoteSlug('a'.repeat(49)),null);
});
test('creates a note from an original Telegram document post link',()=>{
  const body=linkedNoteText('lsposed','LSPosed-v2.zip',url);
  assert.match(body,/LSPosed-v2.zip/);
  assert.match(body,/https:\/\/t.me\/c\/4476272910\/123\/456/);
  assert.match(body,/not security-scanned/);
});
test('replaces pending placeholders but preserves an existing verified information note',()=>{
  const pending='🗂️ YAJE NOTES — demo\n\nStatus: Link pending verification.';
  const replaced=linkedNoteText('demo','tool.zip',url,pending);
  assert.doesNotMatch(replaced,/Link pending verification/);
  const existing='Project information: https://github.com/org/repo';
  const updated=linkedNoteText('demo','tool.zip',url,existing);
  assert.match(updated,/Project information/);
  assert.match(updated,/tool.zip/);
});
test('does not add duplicate links or accept unrelated URLs',()=>{
  const existing=linkedNoteText('demo','tool.zip',url);
  assert.equal(linkedNoteText('demo','tool.zip',url,existing),existing);
  assert.equal(linkedNoteText('demo','tool.zip','https://example.org/file',existing),null);
  assert.equal(linkedNoteText('demo','tool.zip',url,'x'.repeat(3499)),null);
});

test('links a real Telegram post without leaving outdated pending text in imported file catalog',()=>{
  const old='📂 YAJE FILE REFERENCE — anti_bootloop\nListed filenames received from the YAJE Discussions group:\n• abootloop_v1.2.zip\nStatus: Original Telegram post link pending. These filenames have not been verified by YAJETZY.\n\nTo link a suitable, reviewed file post, a group admin can reply to that post with /linknote anti_bootloop.';
  const out=linkedNoteText('anti_bootloop','abootloop_v1.2.zip','https://t.me/c/4476272910/4/678',old);
  assert.match(out,/abootloop_v1.2.zip/);
  assert.match(out,/https:\/\/t.me\/c\/4476272910\/4\/678/);
  assert.doesNotMatch(out,/pending/);
});
test('keeps official source link and removes outdated pending status when file added',()=>{
  const old='LSPosed Information 📱\nOfficial GitHub: https://github.com/LSPosed/LSPosed\n\nYAJE group file mentioned: LSPosed-v2.0.0.zip\nOriginal Telegram file post link pending. This shared archive has not been verified by YAJETZY.';
  const out=linkedNoteText('lsposed','LSPosed-v2.0.0.zip','https://t.me/c/4476272910/4/679',old);
  assert.match(out,/github.com\/LSPosed\/LSPosed/);
  assert.doesNotMatch(out,/pending/);
});

test('/save name produces a searchable filename alias while preserving original name',()=>{
  const title=savedGroupFileTitle('potato_graphics','ChromaBoostv3.zip');
  assert.equal(title,'potato_graphics · ChromaBoostv3.zip');
  assert.equal(savedGroupFileTitle('bad name','Guide.pdf'),null);
  assert.equal(savedGroupFileTitle('a'.repeat(48),'x'.repeat(300)).length,200);
  assert.deepEqual(rankedFiles('potato_graphics',[
    {message_id:'33',display_name:title,file_name:'ChromaBoostv3.zip',indexed_at:'2026-11-13'}
  ]).map(x=>x.message_id),['33']);
});
test('/save resource note is retrievable by #name with direct file and original-post buttons',()=>{
  const title=savedGroupFileTitle('screens','ScreenRecorder.apk');
  const note=linkedNoteText('screens',title,'https://t.me/c/4476272910/4/72');
  const result=linkedMediaNoteReply({
    slug:'screens',groupName:'YAJE Discussions',content:note,chatId:-1004476272910,
    files:[{message_id:'72',thread_id:'4',display_name:title,file_name:'ScreenRecorder.apk',
      review_status:'approved',delivery_approved:true}]
  });
  assert.ok(result);
  assert.equal(result.eligible.length,1);
  assert.equal(result.eligible[0].messageId,72);
  assert.equal(result.reply_markup.inline_keyboard[0][0].url,'https://t.me/c/4476272910/4/72');
  assert.equal(result.reply_markup.inline_keyboard[0][1].callback_data,'fileget:72');
});
test('/save still refuses restricted APK names from public direct delivery',()=>{
  const title=savedGroupFileTitle('blocked','GhostLock.apk');
  const note=linkedNoteText('blocked',title,'https://t.me/c/4476272910/4/77');
  const result=linkedMediaNoteReply({slug:'blocked',groupName:'YAJE Discussions',
    content:note,chatId:-1004476272910,
    files:[{message_id:'77',thread_id:'4',display_name:title,file_name:'GhostLock.apk',
      review_status:'approved',delivery_approved:true}]});
  assert.ok(result);
  assert.equal(result.eligible.length,0);
  assert.equal(result.reply_markup,undefined);
});

test('auto publish gives clear hashtag aliases without overwriting existing human notes',()=>{
  assert.equal(autoNoteSlugFromMedia({fileName:'Getting Started.pdf',title:'Getting Started.pdf'}),'getting_started');
  assert.equal(autoNoteSlugFromMedia({fileName:'',title:'Android Setup Tutorial'}),'android_setup_tutorial');
  assert.equal(autoNoteSlugFromMedia({fileName:'',title:'Tutorial video #99'}),null);
  assert.equal(autoNoteSlugFromMedia({fileName:'',title:'Photo guide #22'}),null);
  assert.equal(autoNoteSlugFromMedia({fileName:'2026-guide.pdf',title:'2026-guide.pdf'}),'file_2026_guide');
  assert.equal(autoNoteSlugFromMedia({fileName:'',title:'news'}),'news');
  assert.equal(autoNoteSlugFromMedia({fileName:'',title:'rules'}),null);
  assert.equal(autoNoteSlugFromMedia({fileName:'',title:'a'.repeat(300)}).length,48);
});
