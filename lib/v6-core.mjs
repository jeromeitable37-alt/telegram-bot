import {createHmac,timingSafeEqual} from 'node:crypto';

export function verifyTelegramInitData(raw,botToken,nowSec=Math.floor(Date.now()/1000)){
  if(!botToken||typeof raw!=='string'||!raw||raw.length>8192)return null;
  const params=new URLSearchParams(raw);
  const seen=new Set();
  const parts=[];
  let providedHash='';
  for(const [key,value] of params){
    if(seen.has(key)|| !/^[a-z_]+$/.test(key))return null;
    seen.add(key);
    if(key==='hash')providedHash=value;
    else parts.push([key,value]);
  }
  if(!/^[a-f0-9]{64}$/i.test(providedHash))return null;
  const authDate=Number(params.get('auth_date'));
  if(!Number.isSafeInteger(authDate)||authDate<=0||authDate>nowSec+60||nowSec-authDate>86400)return null;
  parts.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  const dataCheck=parts.map(([key,val])=>key+'='+val).join('\n');
  const secret=createHmac('sha256','WebAppData').update(botToken).digest();
  const expected=createHmac('sha256',secret).update(dataCheck).digest();
  const actual=Buffer.from(providedHash,'hex');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  try{
    const user=JSON.parse(params.get('user')||'{}');
    if(!Number.isSafeInteger(user.id)||user.id<=0||user.is_bot===true)return null;
    return {id:user.id,first_name:String(user.first_name||'').slice(0,80),username:String(user.username||'').slice(0,50),authDate};
  }catch{return null;}
}
export function safeSearchTerm(raw){
  return String(raw||'').replace(/\s+/g,' ').trim().slice(0,80);
}
export function similarityScore(input,name){
  const a=safeSearchTerm(input).toLowerCase(),b=String(name||'').toLowerCase();
  if(a.length<2||!b)return 0;
  if(b===a)return 100;
  if(b.startsWith(a))return 85;
  if(b.includes(a))return 70;
  const bits=a.split(' ').filter(x=>x.length>=2);
  if(bits.length && bits.every(x=>b.includes(x)))return 55;
  const tri=s=>{
    const result=new Set();
    const padded=' '+s+' ';
    for(let i=0;i<padded.length-2;i++)result.add(padded.slice(i,i+3));
    return result;
  };
  const x=tri(a),y=tri(b);
  let common=0;for(const val of x)if(y.has(val))common++;
  return Math.round((2*common/(x.size+y.size))*45);
}
export function rankedFiles(query,files,max=20){
  return files
    .map(f=>({...f,_score:Math.max(similarityScore(query,f.display_name),similarityScore(query,f.file_name))}))
    .filter(f=>f._score>=17)
    .sort((a,b)=>b._score-a._score||new Date(b.indexed_at)-new Date(a.indexed_at))
    .slice(0,max)
    .map(({_score,...f})=>f);
}
