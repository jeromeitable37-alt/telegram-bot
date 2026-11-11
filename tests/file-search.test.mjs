import test from 'node:test';
import assert from 'node:assert/strict';
import {
  messageLink,searchQueryFromText,normalizeQuery,documentInfo,searchKeyboard
} from '../lib/file-search-helpers.mjs';

test('builds Telegram links to original file messages inside forum topics',()=>{
  assert.equal(messageLink(-1004476272910,123,987),'https://t.me/c/4476272910/123/987');
  assert.equal(messageLink(-1004476272910,1,987),'https://t.me/c/4476272910/987');
  assert.equal(messageLink(-1004476272910,123,0),null);
  assert.equal(messageLink(-12345,123,987),null);
});
test('supports /find arguments and simple Filipino or English find phrases',()=>{
  assert.equal(searchQueryFromText('hanap camera config'),'camera config');
  assert.equal(searchQueryFromText('find sample.zip'),'sample.zip');
  assert.equal(searchQueryFromText('SEARCH  setup guide'),'setup guide');
  assert.equal(searchQueryFromText('random message'),null);
  assert.equal(normalizeQuery('  a '),null);
  assert.equal(normalizeQuery('a'.repeat(61)),null);
});
test('extracts metadata from a Telegram document without copying file bytes or secrets',()=>{
  assert.deepEqual(documentInfo({
    document:{file_name:'sample-file.zip',mime_type:'application/zip',file_id:'NOT_TO_BE_STORED'},
    caption:'Trusted user guide'
  }),{title:'sample-file.zip',fileName:'sample-file.zip',caption:'Trusted user guide',mime:'application/zip'});
  assert.equal(documentInfo({text:'hello'}),null);
});
test('search results use original Telegram message links with max five buttons',()=>{
  const results=Array.from({length:8},(_,i)=>({
    display_name:'File '+i,message_id:i+2,thread_id:123
  }));
  const keyboard=searchKeyboard(-1004476272910,results);
  assert.equal(keyboard.inline_keyboard.length,5);
  assert.equal(keyboard.inline_keyboard[0][0].url,'https://t.me/c/4476272910/123/2');
  assert.equal(keyboard.inline_keyboard.at(-1)[0].url,'https://t.me/c/4476272910/123/6');
});
