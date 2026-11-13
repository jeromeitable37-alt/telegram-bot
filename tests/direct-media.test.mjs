import test from 'node:test';
import assert from 'node:assert/strict';
import {exactFileForQuery} from '../lib/direct-media.js';

const approved=(id,name,fileName='')=>({
  message_id:String(id),thread_id:'4',display_name:name,
  file_name:fileName,review_status:'approved',delivery_approved:true
});
test('/find saved alias selects the actual approved attachment without a text list',()=>{
  const file=approved(38,'potato · ChromaBoostv3.zip','ChromaBoostv3.zip');
  assert.equal(exactFileForQuery('potato',[file])?.message_id,'38');
  assert.equal(exactFileForQuery('chromaBoostv3.zip',[file])?.message_id,'38');
  assert.equal(exactFileForQuery('  POTATO   ',[file])?.message_id,'38');
});
test('unambiguous /find name works for a native tutorial video',()=>{
  const tutorial=approved(72,'Android safety tutorial');
  assert.equal(exactFileForQuery('tutorial',[tutorial])?.message_id,'72');
});
test('ambiguous matching files require choice rather than silently sending wrong file',()=>{
  const a=approved(10,'example · file-a.pdf');
  const b=approved(11,'example · file-b.pdf');
  assert.equal(exactFileForQuery('example',[a,b]),null);
});
test('unreviewed and restricted files never qualify for automatic direct delivery',()=>{
  const approvedFile=approved(19,'Helpful guide.pdf','Helpful guide.pdf');
  const pending={...approvedFile,review_status:'pending'};
  const restricted=approved(20,'Disable Thermal.zip','Disable Thermal.zip');
  assert.equal(exactFileForQuery('helpful guide.pdf',[pending]),null);
  assert.equal(exactFileForQuery('disable thermal',[restricted]),null);
  assert.equal(exactFileForQuery('safe',[{...approvedFile,delivery_approved:false}]),null);
});
test('exact alias wins over loosely matching approved files',()=>{
  const exact=approved(50,'potato · Safe Guide.pdf');
  const other=approved(51,'potato tutorial extra.pdf');
  assert.equal(exactFileForQuery('potato',[other,exact])?.message_id,'50');
});

test('typo-only fuzzy suggestion never triggers direct file delivery',()=>{
  const file=approved(71,'ScreenRecorder Manual.pdf','ScreenRecorder Manual.pdf');
  assert.equal(exactFileForQuery('screanrecoder',[file]),null);
  assert.equal(exactFileForQuery('screenrecorder',[file])?.message_id,'71');
});
