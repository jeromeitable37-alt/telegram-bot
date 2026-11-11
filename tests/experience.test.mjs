import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupCommands,privateCommands,parseStartTarget,parsePhotoPrompt,
  makePhotoPrompt,welcomeLinks,welcomeMarkup,welcomeCaption,publicHelp
} from '../lib/experience-helpers.mjs';

test('Telegram command menu definitions have valid command names and short descriptions',()=>{
  for (const cmds of [groupCommands,privateCommands]) {
    assert.ok(cmds.length<=100);
    for (const item of cmds) {
      assert.match(item.command,/^[a-z0-9_]{1,32}$/);
      assert.ok(item.description.length>=3 && item.description.length<=256);
    }
  }
});
test('rules, topics and help buttons stay within YAJE and the current bot',()=>{
  const links=welcomeLinks(-1004476272910,493,'yaje37_bot');
  assert.deepEqual(links,{
    rules:'https://t.me/yaje37_bot?start=rules_1004476272910',
    topics:'https://t.me/c/4476272910/493',
    help:'https://t.me/yaje37_bot?start=help_1004476272910'
  });
  assert.equal(welcomeLinks(123,1,'yaje37_bot'),null);
  assert.equal(welcomeLinks(-1004476272910,493,'invalid space'),null);
  const keyboard=welcomeMarkup(-1004476272910,null,'yaje37_bot');
  assert.equal(keyboard.inline_keyboard[0][1].url,'https://t.me/c/4476272910/1');
});
test('valid deep links parse and invalid payloads are rejected',()=>{
  assert.deepEqual(parseStartTarget('rules_1004476272910'),{action:'rules',chatId:-1004476272910});
  assert.deepEqual(parseStartTarget('menu_1004476272910'),{action:'menu',chatId:-1004476272910});
  assert.equal(parseStartTarget('status_1004476272910'),null);
  assert.equal(parseStartTarget('rules_-1004476272910'),null);
  assert.equal(parseStartTarget('rules_999999999999999999999999999'),null);
});
test('photo prompt records only a group ID, never tokens or arbitrary text',()=>{
  const prompt=makePhotoPrompt(-1004476272910,'YAJE Discussions');
  assert.equal(parsePhotoPrompt(prompt),-1004476272910);
  assert.equal(parsePhotoPrompt('WELCOME PHOTO 1234\nExample'),null);
  assert.equal(parsePhotoPrompt('WELCOME PHOTO -1004476272910'),null);
});
test('photo caption is clamped to Telegram limit and help includes useful commands',()=>{
  assert.equal(welcomeCaption('hello'),'hello');
  assert.ok(welcomeCaption('a'.repeat(1600)).length<=1000);
  assert.match(publicHelp,/\/menu/);
  assert.match(publicHelp,/\/rules/);
  assert.match(publicHelp,/\/status/);
});
