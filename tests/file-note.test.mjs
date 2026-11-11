import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedNoteText,validLinkNoteSlug} from '../lib/file-note-helpers.mjs';

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
