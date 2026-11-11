import test from 'node:test';
import assert from 'node:assert/strict';
import {validWelcomeThreadId,welcomeDeliveryOptions,shouldClearJoinEvent,welcomeTopicLabel} from '../lib/welcome-topic-helpers.mjs';

const groupId=-1004476272910;
test('validates forum topic IDs and excludes General as target',()=>{
  assert.equal(validWelcomeThreadId('475'),475);
  assert.equal(validWelcomeThreadId(193),193);
  assert.equal(validWelcomeThreadId('1'),null);
  assert.equal(validWelcomeThreadId('0'),null);
  assert.equal(validWelcomeThreadId('99999999999999999'),null);
  assert.equal(validWelcomeThreadId('not-a-topic'),null);
});
test('welcome text/photo go to the configured forum topic, never General',()=>{
  const settings={welcome_thread_id:'475'};
  assert.deepEqual(welcomeDeliveryOptions(groupId,groupId,settings),{message_thread_id:475});
  assert.deepEqual(welcomeDeliveryOptions(groupId,groupId,{}),{});
});
test('private photo previews do not include forum thread IDs',()=>{
  const settings={welcome_thread_id:475};
  assert.deepEqual(welcomeDeliveryOptions(groupId,123456789,settings),{});
});
test('General join service cleanup requires enabled destination and join event',()=>{
  const join={chat:{id:groupId},message_id:501,new_chat_members:[{id:10}]};
  assert.equal(shouldClearJoinEvent({welcome_thread_id:475,welcome_clear_join_event:true},join),true);
  assert.equal(shouldClearJoinEvent({welcome_thread_id:475,welcome_clear_join_event:false},join),false);
  assert.equal(shouldClearJoinEvent({welcome_thread_id:null,welcome_clear_join_event:true},join),false);
  assert.equal(shouldClearJoinEvent({welcome_thread_id:475,welcome_clear_join_event:true},{...join,new_chat_members:[]}),false);
  assert.equal(shouldClearJoinEvent({welcome_thread_id:475,welcome_clear_join_event:true},{...join,message_id:0}),false);
});
test('admin status shows selected destination or General setup',()=>{
  assert.match(welcomeTopicLabel({welcome_thread_id:475}),/475/);
  assert.match(welcomeTopicLabel({}),/General/);
});
