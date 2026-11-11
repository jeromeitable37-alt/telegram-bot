import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyTelegramInitData,similarityScore,rankedFiles,safeSearchTerm} from '../lib/v6-core.mjs';

const token='99999:LOCAL_TEST_TOKEN_NOT_REAL';
const now=1783919700;
function signedData({authDate=now,user={id:123456789,first_name:'Tester'},more={}}={}){
  const values={auth_date:String(authDate),user:JSON.stringify(user),...more};
  const query=Object.entries(values).sort(([a],[b])=>a.localeCompare(b))
    .map(([key,val])=>`${key}=${val}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  const hash=createHmac('sha256',secret).update(query).digest('hex');
  return new URLSearchParams({...values,hash}).toString();
}
test('authenticates valid signed Telegram Mini App user',()=>{
  const data=signedData();
  assert.deepEqual(verifyTelegramInitData(data,token,now),{id:123456789,first_name:'Tester',username:'',authDate:now});
});
test('rejects tampered identity, duplicate keys, stale auth and missing token',()=>{
  const good=signedData();
  assert.equal(verifyTelegramInitData(good.replace('Tester','Admin'),token,now),null);
  assert.equal(verifyTelegramInitData(good+'&user=other',token,now),null);
  assert.equal(verifyTelegramInitData(signedData({authDate:now-90000}),token,now),null);
  assert.equal(verifyTelegramInitData(signedData({authDate:now+180}),token,now),null);
  assert.equal(verifyTelegramInitData(good,'wrong-token',now),null);
  assert.equal(verifyTelegramInitData(good,'',now),null);
});
test('does not accept forged bot identities or unsafe user IDs',()=>{
  assert.equal(verifyTelegramInitData(signedData({user:{id:999,is_bot:true}}),token,now),null);
  assert.equal(verifyTelegramInitData(signedData({user:{id:0}}),token,now),null);
  assert.equal(verifyTelegramInitData(signedData({user:{id:'123'}}),token,now),null);
});
test('smart search matches misspelled or partial file names without SQL interpolation',()=>{
  assert.equal(safeSearchTerm('  audio   guide  '),'audio guide');
  assert.equal(similarityScore('lspos','LSPosed-v2.zip')>=60,true);
  const results=rankedFiles('screen recorder',[
    {display_name:'Screen Recorder.pdf',file_name:'Recorder.pdf',indexed_at:'2026-11-11'},
    {display_name:'Boot Device.zip',file_name:'boot.zip',indexed_at:'2026-11-11'}
  ]);
  assert.equal(results[0]?.display_name,'Screen Recorder.pdf');
  assert.equal(results.some(r=>r.display_name==='Boot Device.zip'),false);
});
