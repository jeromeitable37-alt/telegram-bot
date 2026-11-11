import test from 'node:test';
import assert from 'node:assert/strict';
import {topicIdFromMessage, topicUrl, parseTopicRegistration, parseTopicReply, menuContent} from '../lib/topic-helpers.mjs';

test('builds safe topic URLs for private Telegram supergroups',()=>{
  assert.equal(topicUrl(-1004476272910,1),'https://t.me/c/4476272910/1');
  assert.equal(topicUrl(-1004476272910,489),'https://t.me/c/4476272910/489');
  assert.equal(topicUrl(-4476272910,2),null);
  assert.equal(topicUrl(-1004476272910,-1),null);
});
test('reads forum topic IDs and defaults General to 1',()=>{
  assert.equal(topicIdFromMessage({chat:{is_forum:true},message_thread_id:123}),123);
  assert.equal(topicIdFromMessage({chat:{is_forum:true}}),1);
  assert.equal(topicIdFromMessage({chat:{type:'private'}}),null);
});
test('validates display names and optional descriptions',()=>{
  assert.deepEqual(parseTopicRegistration('Feedbacks | Share suggestions'),{name:'Feedbacks',description:'Share suggestions'});
  assert.deepEqual(parseTopicRegistration('General'),{name:'General',description:''});
  assert.equal(parseTopicRegistration(''),null);
  assert.equal(parseTopicRegistration('a'.repeat(101)),null);
  assert.equal(parseTopicRegistration('Files | '+'b'.repeat(351)),null);
});
test('parses authorized reply prompts without accepting other prompts',()=>{
  assert.deepEqual(parseTopicReply('TOPIC EDIT name -1004476272910 43\nReply now'),{field:'name',chatId:-1004476272910,threadId:43});
  assert.deepEqual(parseTopicReply('TOPIC EDIT description -1004476272910 4\nReply now'),{field:'description',chatId:-1004476272910,threadId:4});
  assert.equal(parseTopicReply('TOPIC EDIT name 123 43\nReply now'),null);
  assert.equal(parseTopicReply('NOT TOPIC EDIT name -1004476272910 43\n'),null);
});
test('menu lists only published topics and stays under Telegram length limit',()=>{
  const text=menuContent('YAJE Discussions',[
    {listed:true,title:'General',description:'Start here'},
    {listed:false,title:'Hidden',description:'Do not show'},
    {listed:true,title:'Feedbacks',description:'Your suggestions'}
  ]);
  assert.match(text,/YAJE Discussions/);
  assert.match(text,/General/);
  assert.match(text,/Feedbacks/);
  assert.doesNotMatch(text,/Hidden/);
  assert.ok(text.length<4096);
});
