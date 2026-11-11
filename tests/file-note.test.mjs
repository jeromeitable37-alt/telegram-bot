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
