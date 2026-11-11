import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNoteSlug,noteHashtag,noteCreateReply,notePrompt,noteView,noteListText,NOTE_MAX_CONTENT} from '../lib/note-helpers.mjs';

test('normalizes note names and blocks unsupported or oversized names',()=>{
  assert.equal(normalizeNoteSlug(' LSPOSED '),'lsposed');
  assert.equal(normalizeNoteSlug('anti_bootloop'),'anti_bootloop');
  assert.equal(normalizeNoteSlug('1.1.1.1'),null);
  assert.equal(normalizeNoteSlug('with space'),null);
  assert.equal(normalizeNoteSlug('x'.repeat(49)),null);
});
test('exact note hashtags trigger, regular chat and malformed tags do not',()=>{
  assert.equal(noteHashtag('  #lsposed  '),'lsposed');
  assert.equal(noteHashtag('#anti_bootloop'),'anti_bootloop');
  assert.equal(noteHashtag('Please check #lsposed'),null);
  assert.equal(noteHashtag('#lsposed extra'),null);
});
test('admin can create multiline notes and retain additional pipe characters',()=>{
  assert.deepEqual(noteCreateReply('setup_guide | Please read rules.\nhttps://example.org/a|b'),
    {slug:'setup_guide',content:'Please read rules.\nhttps://example.org/a|b'});
  assert.equal(noteCreateReply('setup_guide'),null);
  assert.equal(noteCreateReply('invalid name | text'),null);
  assert.equal(noteCreateReply('valid | '+ 'a'.repeat(NOTE_MAX_CONTENT+1)),null);
});
test('only exact private note reply prompts are recognized',()=>{
  assert.deepEqual(notePrompt('NOTE ADD -1004476272910\nYAJE Discussions'),
    {mode:'add',chatId:-1004476272910,noteId:null});
  assert.deepEqual(notePrompt('NOTE EDIT -1004476272910 41\nYAJE Discussions'),
    {mode:'edit',chatId:-1004476272910,noteId:41});
  assert.equal(notePrompt('NOTE EDIT -1004476272910\n'),null);
  assert.equal(notePrompt('NOTE ADD 12345\n'),null);
});
test('note responses are within Telegram message limit and note list sorted by caller',()=>{
  assert.match(noteView('YAJE Discussions','setup_guide','https://example.org'),/setup_guide/);
  assert.ok(noteView('Some Group','a','a'.repeat(5000)).length<=4096);
  const list=noteListText('YAJE Discussions',[{slug:'example'},{slug:'manual'}]);
  assert.match(list,/\/get notename/);
  assert.match(list,/example/);
  assert.match(list,/#notename/);
});
