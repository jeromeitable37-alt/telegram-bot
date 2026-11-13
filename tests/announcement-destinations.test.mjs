import test from 'node:test';
import assert from 'node:assert/strict';
import {validAnnouncementThread,announcementTargets,announcementDestinationLabel} from '../lib/announcement-destinations.mjs';

test('unconfigured announcements go to General only; no guessed forum topic',()=>{
  assert.deepEqual(announcementTargets(0),[{label:'General',extra:{}}]);
  assert.deepEqual(announcementTargets(undefined),[{label:'General',extra:{}}]);
  assert.match(announcementDestinationLabel(null),/General only/);
});

test('configured topic duplicates announcements to General and the exact target topic',()=>{
  assert.deepEqual(announcementTargets(458),[
    {label:'General',extra:{}},
    {label:'Announcements',extra:{message_thread_id:458}}
  ]);
  assert.equal(validAnnouncementThread('458'),458);
  assert.match(announcementDestinationLabel('458'),/458/);
});
test('General and invalid values are never accepted as a dedicated announcement topic',()=>{
  for(const bad of [0,1,'1',-1,'xyz',123.45,Number.MAX_SAFE_INTEGER+2]){
    assert.equal(validAnnouncementThread(bad),null);
    assert.deepEqual(announcementTargets(bad),[{label:'General',extra:{}}]);
  }
});
