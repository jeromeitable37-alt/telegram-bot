import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODERATION_COMMANDS, parseModerationTarget, moderationDuration,
  roleCanRestrict, moderationError, chatRestrictionPermissions
} from '../lib/moderation-helpers.mjs';

test('moderation targets support replies and numeric user IDs',()=>{
  assert.deepEqual(parseModerationTarget(123,'10m'),{userId:123,rest:'10m',via:'reply'});
  assert.deepEqual(parseModerationTarget(undefined,'987654321 2h'),{userId:987654321,rest:'2h',via:'id'});
  assert.deepEqual(parseModerationTarget(undefined,'987654321'),{userId:987654321,rest:'',via:'id'});
  assert.equal(parseModerationTarget(undefined,'@somebody 10m').userId,null);
  assert.equal(parseModerationTarget(undefined,'10m').userId,null);
  assert.equal(parseModerationTarget(undefined,'0').userId,null);
  assert.equal(parseModerationTarget(undefined,'9999999999999999999999').userId,null);
});
test('timed moderation supports default 10m and rejects unsafe durations',()=>{
  assert.equal(moderationDuration(''),10);
  assert.equal(moderationDuration('1m'),1);
  assert.equal(moderationDuration('12h'),720);
  assert.equal(moderationDuration('7d'),10080);
  assert.equal(moderationDuration('8d'),null);
  assert.equal(moderationDuration('30'),null);
  assert.equal(moderationDuration('0m'),null);
});
test('moderation right is granted only to owner or admins with restrict right',()=>{
  assert.equal(roleCanRestrict({status:'creator'}),true);
  assert.equal(roleCanRestrict({status:'administrator',can_restrict_members:true}),true);
  assert.equal(roleCanRestrict({status:'administrator',can_restrict_members:false}),false);
  assert.equal(roleCanRestrict({status:'member'}),false);
});
test('mute blocks messages; restrict permits text only; unmute restores chat defaults',()=>{
  const defaults={can_send_messages:true,can_send_photos:true,can_send_documents:false,can_invite_users:false};
  const muted=chatRestrictionPermissions('mute',defaults);
  assert.equal(muted.can_send_messages,false);
  assert.equal(muted.can_send_photos,false);
  const textOnly=chatRestrictionPermissions('restrict',defaults);
  assert.equal(textOnly.can_send_messages,true);
  assert.equal(textOnly.can_send_photos,false);
  assert.equal(textOnly.can_send_documents,false);
  const restored=chatRestrictionPermissions('restore',defaults);
  assert.equal(restored.can_send_messages,true);
  assert.equal(restored.can_send_photos,true);
  assert.equal(restored.can_send_documents,false);
  assert.equal(restored.can_invite_users,false);
});
test('permission errors are actionable and omit server error details',()=>{
  assert.match(moderationError(new Error('Telegram restrictChatMember: Bad Request: not enough rights to restrict/unrestrict chat member')),/Ban Users/);
  assert.match(moderationError(new Error('USER_ADMIN_INVALID')),/administrator/);
  assert.match(moderationError(new Error('Bad Request: USER_ID_INVALID')),/numeric user ID/);
  assert.doesNotMatch(moderationError(new Error('secret stack trace 1234')),/secret stack trace/);
});
test('all supported moderation commands include restrict/unrestrict',()=>{
  for(const name of ['ban','unban','mute','unmute','restrict','unrestrict','warn','warnings','resetwarns']){
    assert.equal(MODERATION_COMMANDS.has(name),true);
  }
});
