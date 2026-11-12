import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySecuritySpam,fingerprintSource,containsVideo,hasExternalLink,securityDecision,nextPenalty}
  from '../lib/security-helpers.mjs';

const shield={security_shield_enabled:true,security_sensitive_spam:true,
  security_newcomer_links:true,security_newcomer_media:true,security_auto_mute:true};
test('filters promotion of leaked personal media, not neutral discussion',()=>{
  assert.equal(classifySecuritySpam({text:'Scandal and misinformation affect communities.'}),null);
  assert.equal(classifySecuritySpam({text:'Watch the leaked scandal video now https://example.test/xxx'}),'suspicious_private_media_promo');
  assert.equal(classifySecuritySpam({caption:'Free money! Claim your prize https://bad.example'}),'scam_link_promo');
  assert.equal(classifySecuritySpam({text:'Here are the group rules and the moderation guide.'}),null);
});
test('limits newcomer links but preserves ordinary discussion and safe ZIPs',()=>{
  assert.equal(securityDecision({message:{text:'Visit https://example.test'},joinedMinutes:10,settings:shield}),'new_member_external_link');
  assert.equal(securityDecision({message:{text:'Visit https://example.test'},joinedMinutes:400,settings:shield}),null);
  assert.equal(securityDecision({message:{document:{file_name:'Guide.zip',mime_type:'application/zip'}},joinedMinutes:5,settings:shield}),null);
  assert.equal(securityDecision({message:{text:'Learn about a recent scandal safely.'},joinedMinutes:10,settings:shield}),null);
});
test('newcomer videos are gated briefly, but other file uploads are free',()=>{
  assert.equal(containsVideo({video:{file_unique_id:'a'}}),true);
  assert.equal(containsVideo({document:{file_name:'clip.mp4'}}),true);
  assert.equal(containsVideo({document:{file_name:'guide.pdf'}}),false);
  assert.equal(securityDecision({message:{video:{file_unique_id:'a'}},joinedMinutes:10,settings:shield}),'new_member_video');
  assert.equal(securityDecision({message:{video:{file_unique_id:'a'}},joinedMinutes:75,settings:shield}),null);
});
test('flooding and repeated posting trigger reviews',()=>{
  assert.equal(securityDecision({message:{text:'Hello'},windowCount:8,settings:shield}),'flood_10_seconds');
  assert.equal(securityDecision({message:{text:'Hello'},duplicateCount:3,settings:shield}),'repeated_message');
  assert.equal(securityDecision({message:{text:'Hello'},windowCount:8,settings:{...shield,security_shield_enabled:false}}),null);
  assert.equal(hasExternalLink({entities:[{type:'text_link'}]}),true);
});
test('sanitizes fingerprinting for duplicate document messages',()=>{
  assert.equal(fingerprintSource({document:{file_unique_id:'unique1'}}),'media:unique1');
  assert.equal(fingerprintSource({text:'Hello      world again'}),'text:hello world again');
  assert.equal(fingerprintSource({text:'ok'}),'');
});
test('graduated penalties prioritize deletion, mute then ban only repeated strong signals',()=>{
  assert.deepEqual(nextPenalty(1,'suspicious_private_media_promo'),{action:'delete',minutes:0});
  assert.deepEqual(nextPenalty(2,'suspicious_private_media_promo'),{action:'mute',minutes:10});
  assert.deepEqual(nextPenalty(3,'flood_10_seconds'),{action:'mute',minutes:30});
  assert.deepEqual(nextPenalty(5,'repeated_message'),{action:'ban',minutes:0});
  assert.deepEqual(nextPenalty(5,'new_member_video'),{action:'mute',minutes:30});
  assert.deepEqual(nextPenalty(5,'scam_link_promo',false),{action:'delete',minutes:0});
});
