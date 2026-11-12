import test from 'node:test';
import assert from 'node:assert/strict';
import {restrictedFileName,publicFileAllowed} from '../lib/file-policy.mjs';
import {fileFinderKeyboard} from '../lib/v7-search-helpers.mjs';

test('normal reviewed documents and tutorials remain available',()=>{
  assert.equal(publicFileAllowed({display_name:'YAJE Guide.pdf',review_status:'approved'}),true);
  assert.equal(publicFileAllowed({display_name:'Tutorial video #300',review_status:'approved'}),true);
  assert.equal(publicFileAllowed({display_name:'ScreenRecorder.apk',review_status:'approved'}),true);
});
test('restrict clear unsafe binary package names despite accidental admin approval',()=>{
  const names=['Disable Thermal.zip','GhostLock.apk','Spoof Device.zip','Premium Mod.apk',
    'netcutter.apk','Paid App Cracked.apk'];
  for(const name of names){
    assert.equal(restrictedFileName({display_name:name}),true,name);
    assert.equal(publicFileAllowed({display_name:name,review_status:'approved'}),false,name);
  }
});
test('harmless educational guides are not blocked by the binary policy',()=>{
  assert.equal(restrictedFileName({display_name:'Device security bypass risks.pdf'}),false);
  assert.equal(restrictedFileName({display_name:'Understanding thermal safety.txt'}),false);
});
test('finder never offers delivery button for restricted file even if approved',()=>{
  const keyboard=fileFinderKeyboard(-1004476272910,[
    {message_id:11,thread_id:4,display_name:'Disable Thermal.zip',review_status:'approved',delivery_approved:true},
    {message_id:12,thread_id:4,display_name:'YAJE Guide.pdf',review_status:'approved',delivery_approved:true}
  ]);
  assert.equal(keyboard.inline_keyboard[0][0].callback_data,'fileget:12');
  assert.equal(keyboard.inline_keyboard.some(row=>row.some(x=>x.callback_data==='fileget:11')),false);
});
