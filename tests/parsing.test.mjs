import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCommand,hasLink,fillWelcome,parseDuration} from '../lib/parsing.mjs';

test('parses matching bot commands and excludes commands for others',()=>{
  assert.deepEqual(parseCommand('/links on','MyBot'),{name:'links',args:'on'});
  assert.deepEqual(parseCommand('/links@MyBot on','MyBot'),{name:'links',args:'on'});
  assert.equal(parseCommand('/links@OtherBot on','MyBot'),null);
});
test('detects URLs in text, caption, and Telegram entities',()=>{
  assert.equal(hasLink({text:'join t.me/example'}),true);
  assert.equal(hasLink({caption:'www.example.com'}),true);
  assert.equal(hasLink({text:'hello',entities:[{type:'text_link'}]}),true);
  assert.equal(hasLink({text:'just hello'}),false);
});
test('supports welcome variables',()=>{
  assert.equal(fillWelcome('Hello {name} from {group}','Sam','Club'),'Hello Sam from Club');
});
test('validates mute durations',()=>{
  assert.equal(parseDuration('10m'),10);
  assert.equal(parseDuration('2h'),120);
  assert.equal(parseDuration('1d'),1440);
  assert.equal(parseDuration('8d'),null);
});
