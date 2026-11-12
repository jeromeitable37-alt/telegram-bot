import test from 'node:test';
import assert from 'node:assert/strict';
import {vaultFileInfo,vaultKeyboard} from '../lib/personal-vault.js';

test('manually forwarded documents can be saved as private filenames',()=>{
  assert.deepEqual(vaultFileInfo({message_id:23,document:{
    file_name:'Study-Guide.pdf',mime_type:'application/pdf'
  },caption:'Class notes'}),{
    display_name:'Study-Guide.pdf',file_name:'Study-Guide.pdf',
    mime_type:'application/pdf',caption_text:'Class notes'
  });
});
test('video tutorials and photos are supported without accessing origin group',()=>{
  const video=vaultFileInfo({message_id:27,video:{mime_type:'video/mp4'},
    caption:'Screen recording tutorial'});
  assert.equal(video.display_name,'Screen recording tutorial');
  assert.equal(video.mime_type,'video/mp4');
  assert.equal(vaultFileInfo({message_id:28,photo:[{file_id:'abc'}]}).display_name,'Photo guide #28');
  assert.equal(vaultFileInfo({message_id:29,text:'Plain message only'}),null);
});
test('known risky module or bypass packages are not added to vault',()=>{
  assert.equal(vaultFileInfo({document:{file_name:'Disable Thermal.zip'}}),null);
  assert.equal(vaultFileInfo({document:{file_name:'GhostLock.apk'}}),null);
  assert.equal(vaultFileInfo({document:{file_name:'safe-document.pdf',mime_type:'application/pdf'}}).file_name,'safe-document.pdf');
});
test('private file delivery buttons reference only the saved message ID',()=>{
  const menu=vaultKeyboard([{message_id:'32',display_name:'Safe Guide.pdf'}]);
  assert.deepEqual(menu,{inline_keyboard:[[{text:'📥 Safe Guide.pdf',callback_data:'vault:get:32'}]]});
  assert.equal(vaultKeyboard([]).inline_keyboard.length,0);
});
