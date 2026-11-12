import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isActualMember,isAdminMember,federationSearchItem,federationGroupLabel
} from '../lib/federated-files.js';

test('only actual Telegram source-group members qualify for cross-group search',()=>{
  assert.equal(isActualMember({status:'member'}),true);
  assert.equal(isActualMember({status:'administrator'}),true);
  assert.equal(isActualMember({status:'creator'}),true);
  assert.equal(isActualMember({status:'restricted',is_member:true}),true);
  assert.equal(isActualMember({status:'restricted',is_member:false}),false);
  assert.equal(isActualMember({status:'left'}),false);
  assert.equal(isActualMember({status:'kicked'}),false);
  assert.equal(isActualMember(null),null);
});
test('file federation only trusts bot admins for reliable membership checks',()=>{
  assert.equal(isAdminMember({status:'administrator'}),true);
  assert.equal(isAdminMember({status:'creator'}),true);
  assert.equal(isAdminMember({status:'member'}),false);
  assert.equal(isAdminMember({status:'left'}),false);
});
test('search results preserve exact original source group link, never grant cross-group send',()=>{
  const result=federationSearchItem(
    {chat_id:'-1004476272910',title:'YAJE Discussions'},
    {message_id:'55',thread_id:'7',display_name:'Guide.pdf',file_name:'Guide.pdf',
      review_status:'approved',delivery_approved:true,mime_type:'application/pdf',indexed_at:'2026-11-12T10:00:00Z'}
  );
  assert.equal(result.link,'https://t.me/c/4476272910/7/55');
  assert.equal(result.sourceChatId,'-1004476272910');
  assert.equal(result.sourceGroup,'YAJE Discussions');
  assert.equal(result.approvedForDelivery,false);
  assert.equal(result.reviewStatus,'approved');
});
test('group labels are truncated and basic group links are not forged',()=>{
  assert.equal(federationGroupLabel({title:'A'.repeat(500)}).length,90);
  const basic=federationSearchItem({chat_id:'-1234',title:'Old group'},
    {message_id:7,thread_id:1,display_name:'guide.pdf'});
  assert.equal(basic.link,null);
});
