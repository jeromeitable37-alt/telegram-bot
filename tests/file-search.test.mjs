import test from 'node:test';
import assert from 'node:assert/strict';
import {
  messageLink,searchQueryFromText,normalizeQuery,documentInfo,sharedMediaInfo,searchKeyboard
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
  assert.equal(keyboard.inline_keyboard[0].length,1,'unapproved files show the Telegram link only');
});

test('approved files have both original post link and send file action',()=>{
  const keyboard=searchKeyboard(-1004476272910,[{
    display_name:'YAJE Guide.pdf',message_id:321,thread_id:4,delivery_approved:true
  }]);
  assert.deepEqual(keyboard.inline_keyboard[0],[
    {text:'📍 YAJE Guide.pdf',url:'https://t.me/c/4476272910/4/321'},
    {text:'📥 Send File Here',callback_data:'fileget:321'}
  ]);
});
test('unapproved APK or ZIP file never shows a resend action',()=>{
  const keyboard=searchKeyboard(-1004476272910,[{
    display_name:'unreviewed-file.apk',message_id:322,thread_id:7,delivery_approved:false
  }]);
  assert.equal(keyboard.inline_keyboard[0].length,1);
  assert.equal(keyboard.inline_keyboard[0][0].url,'https://t.me/c/4476272910/7/322');
});

test('extracts native Telegram tutorial video information without requiring document',()=>{
  const vid=sharedMediaInfo({
    message_id:987,
    video:{file_id:'secret-file-id',file_unique_id:'unique',mime_type:'video/mp4',duration:61},
    caption:'How to configure potato graphics safely\nStep-by-step overview'
  });
  assert.deepEqual(vid,{
    title:'How to configure potato graphics safely',
    fileName:'',
    caption:'How to configure potato graphics safely\nStep-by-step overview',
    mime:'video/mp4'
  });
  assert.deepEqual(sharedMediaInfo({message_id:15,video:{mime_type:'video/mp4'}}),{
    title:'Tutorial video #15',fileName:'',caption:'',mime:'video/mp4'
  });
  assert.equal(sharedMediaInfo({text:'Forwarded from Kai: text quote only'}),null);
});
test('supports actual forwarded video and photo messages while keeping document behavior unchanged',()=>{
  const forwarded={forward_origin:{type:'user'},message_id:12,video:{file_name:'tutorial.mp4',mime_type:'video/mp4'}};
  assert.equal(sharedMediaInfo(forwarded).title,'tutorial.mp4');
  assert.equal(sharedMediaInfo({message_id:13,photo:[{file_id:'p1'},{file_id:'p2'}]}).title,'Photo guide #13');
  assert.deepEqual(sharedMediaInfo({document:{file_name:'ChromaBoostv3.zip',mime_type:'application/zip'}}),
    documentInfo({document:{file_name:'ChromaBoostv3.zip',mime_type:'application/zip'}}));
});
