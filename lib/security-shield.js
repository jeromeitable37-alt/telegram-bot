import {createHash} from 'node:crypto';
import {db,ensureGroup,logAction} from './db.js';
import {tg,send,isAdmin,mute} from './telegram.js';
import {fingerprintSource,securityDecision,nextPenalty} from './security-helpers.mjs';

const settingsFields={shield:'security_shield_enabled',bots:'security_block_bots',links:'security_newcomer_links',videos:'security_newcomer_media',promos:'security_sensitive_spam',penalties:'security_auto_mute'};
const labels={shield:'Security Shield',bots:'Block joining bots',links:'New-member links (6h)',videos:'New-member videos (1h)',promos:'Suspicious/scam promotions',penalties:'Escalate repeat spam'};
async function record(chatId,userId,reason,action,messageId=null){
  try{
    await db()`INSERT INTO security_events(chat_id,user_id,reason,action,message_id)
      VALUES(${chatId},${userId},${reason},${action},${messageId})`;
    await logAction(chatId,0,userId,'shield_'+action+'_'+reason);
  }catch(e){console.warn('Security audit log unavailable:',e.message);}
}
async function ordinaryMember(chatId,userId){
  try{
    const result=await tg('getChatMember',{chat_id:chatId,user_id:userId});
    return result.status==='member'||result.status==='restricted';
  }catch(e){console.warn('Security target role check failed:',e.message);return false;}
}
async function blockBot(chatId,userId,selfId){
  if(!userId||!selfId||userId===selfId)return false;
  if(!await ordinaryMember(chatId,userId))return false;
  try{
    await tg('banChatMember',{chat_id:chatId,user_id:userId,revoke_messages:false});
    await record(chatId,userId,'unapproved_bot_join','ban');
    return true;
  }catch(e){
    console.warn('Security bot-ban failed (check Ban Users):',e.message);
    await record(chatId,userId,'unapproved_bot_join','ban_failed');
    return false;
  }
}
async function saveJoin(chatId,userId){
  await db()`INSERT INTO security_recent_joins(chat_id,user_id,joined_at)
    VALUES(${chatId},${userId},NOW())
    ON CONFLICT(chat_id,user_id) DO UPDATE SET joined_at=NOW()`;
}
export async function securityHandleJoins(m,settings){
  if(!settings?.security_shield_enabled)return false;
  const members=(m.new_chat_members||[]).filter(x=>Number.isSafeInteger(x.id)&&x.id>0);
  if(!members.length)return false;
  let selfId=null;
  if(members.some(x=>x.is_bot)&&settings.security_block_bots!==false){
    try{selfId=(await tg('getMe')).id;}catch(e){console.warn('Could not identify YAJETZY:',e.message);}
  }
  for(const member of members){
    if(member.is_bot){
      if(settings.security_block_bots!==false&&selfId)await blockBot(m.chat.id,member.id,selfId);
    }else{
      try{await saveJoin(m.chat.id,member.id);}catch(e){console.warn('Join tracking failed:',e.message);}
    }
  }
  return true;
}
export async function securityHandleMemberUpdate(change){
  const chat=change?.chat,user=change?.new_chat_member?.user;
  if(!chat||!['group','supergroup'].includes(chat.type)||!user?.id)return false;
  const before=change.old_chat_member?.status;
  const now=change.new_chat_member?.status;
  if(!['left','kicked'].includes(before)||!['member','administrator','creator','restricted'].includes(now))return false;
  await ensureGroup(chat);
  const rows=await db()`SELECT security_shield_enabled,security_block_bots FROM groups WHERE chat_id=${chat.id}`;
  if(!rows[0]?.security_shield_enabled)return false;
  if(user.is_bot){
    if(rows[0].security_block_bots!==false&&now!=='administrator'&&now!=='creator'){
      let self=null;try{self=(await tg('getMe')).id;}catch(e){console.warn(e.message);}
      if(self)return blockBot(chat.id,user.id,self);
    }
    return false;
  }
  await saveJoin(chat.id,user.id);
  return true;
}
export async function securityHandleMessage(m,settings){
  if(!settings?.security_shield_enabled||!m?.chat?.id||!m.from?.id||!m.message_id)return false;
  if(m.from.is_bot||m.sender_chat||m.new_chat_members||m.left_chat_member)return false;
  if(m.text?.startsWith('/'))return false;
  const chatId=m.chat.id,userId=m.from.id;
  const sample=fingerprintSource(m);
  const hash=sample?createHash('sha256').update(sample).digest('hex'):'';
  const [joined,activity]=await Promise.all([
    db()`SELECT EXTRACT(EPOCH FROM (NOW()-joined_at))/60 AS minutes
      FROM security_recent_joins WHERE chat_id=${chatId} AND user_id=${userId}
        AND joined_at>NOW()-INTERVAL '7 hours'`,
    db()`INSERT INTO security_user_windows(chat_id,user_id,window_start,message_count,last_fingerprint,duplicate_count)
      VALUES(${chatId},${userId},NOW(),1,${hash},${hash?1:0})
      ON CONFLICT(chat_id,user_id) DO UPDATE SET
        message_count=CASE WHEN security_user_windows.window_start<NOW()-INTERVAL '10 seconds' THEN 1
          ELSE security_user_windows.message_count+1 END,
        duplicate_count=CASE WHEN security_user_windows.window_start<NOW()-INTERVAL '10 seconds'
          THEN CASE WHEN ${hash!==''} THEN 1 ELSE 0 END
          WHEN ${hash!==''} AND security_user_windows.last_fingerprint=${hash}
          THEN security_user_windows.duplicate_count+1
          ELSE CASE WHEN ${hash!==''} THEN 1 ELSE 0 END END,
        last_fingerprint=${hash},
        window_start=CASE WHEN security_user_windows.window_start<NOW()-INTERVAL '10 seconds' THEN NOW()
          ELSE security_user_windows.window_start END
      RETURNING message_count,duplicate_count`
  ]);
  const reason=securityDecision({
    message:m,joinedMinutes:joined.length?Number(joined[0].minutes):null,
    windowCount:Number(activity[0]?.message_count||0),
    duplicateCount:Number(activity[0]?.duplicate_count||0),settings
  });
  if(!reason)return false;
  // Never delete or punish an admin's content. API failures also fail open.
  let admin=false;
  try{admin=await isAdmin(chatId,userId);}catch(e){
    console.warn('Shield cannot verify admin; skipping automatic action:',e.message);return false;
  }
  if(admin)return false;
  let deleted=false;
  try{await tg('deleteMessage',{chat_id:chatId,message_id:m.message_id});deleted=true;}
  catch(e){console.warn('Shield needs Delete Messages:',e.message);}
  if(!deleted){await record(chatId,userId,reason,'delete_failed',m.message_id);return false;}
  const rows=await db()`INSERT INTO security_strikes(chat_id,user_id,window_start,strike_count)
    VALUES(${chatId},${userId},NOW(),1)
    ON CONFLICT(chat_id,user_id) DO UPDATE SET
      strike_count=CASE WHEN security_strikes.window_start<NOW()-INTERVAL '1 hour'
        THEN 1 ELSE security_strikes.strike_count+1 END,
      window_start=CASE WHEN security_strikes.window_start<NOW()-INTERVAL '1 hour'
        THEN NOW() ELSE security_strikes.window_start END
    RETURNING strike_count`;
  const penalty=nextPenalty(Number(rows[0]?.strike_count||1),reason,settings.security_auto_mute!==false);
  let action='delete';
  if(penalty.action!=='delete'&&await ordinaryMember(chatId,userId)){
    try{
      if(penalty.action==='ban'){
        await tg('banChatMember',{chat_id:chatId,user_id:userId,revoke_messages:false});
        action='ban';
      }else{
        await mute(chatId,userId,penalty.minutes);
        action='mute_'+penalty.minutes+'m';
      }
    }catch(e){console.warn('Security escalation unavailable:',e.message);}
  }
  await record(chatId,userId,reason,action,m.message_id);
  return true;
}
export async function securityStatusCommand(m,args=''){
  const chatId=m.chat.id,userId=m.from?.id;
  if(!userId||!await isAdmin(chatId,userId))return send(chatId,'Admins only.');
  const command=String(args).trim().toLowerCase();
  if(['on','off'].includes(command)){
    const value=command==='on';
    await db()`UPDATE groups SET security_shield_enabled=${value},updated_at=NOW() WHERE chat_id=${chatId}`;
    await logAction(chatId,userId,null,'shield_'+command);
  }else if(command&&command!=='status')return send(chatId,'Usage: /security on | /security off | /security');
  const [group,stats]=await Promise.all([
    db()`SELECT security_shield_enabled,security_block_bots,security_newcomer_links,
      security_newcomer_media,security_sensitive_spam,security_auto_mute
      FROM groups WHERE chat_id=${chatId}`,
    db()`SELECT COUNT(*)::int AS n FROM security_events WHERE chat_id=${chatId}
      AND created_at>NOW()-INTERVAL '24 hours'`
  ]);
  const g=group[0],yes=x=>x?'ON':'OFF';
  return send(chatId,`🛡️ YAJETZY Security Shield: ${yes(g.security_shield_enabled)}
New bots: ${yes(g.security_block_bots)}
New-member links (6h): ${yes(g.security_newcomer_links)}
New-member videos (1h): ${yes(g.security_newcomer_media)}
Scam/scandal promo detection: ${yes(g.security_sensitive_spam)}
Repeat spam penalties: ${yes(g.security_auto_mute)}
Actions in last 24h: ${stats[0]?.n||0}

Admin controls: private /panel → Security Shield.
Requires Delete Messages and Ban Users/Restrict Members rights.`);
}
export async function securityPanelCallback(query){
  const match=String(query.data||'').match(/^sec:(menu|toggle):(-?\d+)(?::([a-z]+))?$/);
  if(!match)return false;
  const chatId=Number(match[2]),userId=query.from?.id;
  if(query.message?.chat?.type!=='private'||query.message.chat.id!==userId)return true;
  if(!Number.isSafeInteger(chatId)||chatId>=0||!await isAdmin(chatId,userId)){
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Group admins only.',show_alert:true});
    return true;
  }
  await tg('answerCallbackQuery',{callback_query_id:query.id});
  if(match[1]==='toggle'){
    const key=match[3];
    if(!Object.hasOwn(settingsFields,key))return true;
    const rows=await db()`SELECT * FROM groups WHERE chat_id=${chatId}`;
    if(!rows.length)return true;
    const next=!rows[0][settingsFields[key]];
    if(key==='shield')await db()`UPDATE groups SET security_shield_enabled=${next},updated_at=NOW() WHERE chat_id=${chatId}`;
    if(key==='bots')await db()`UPDATE groups SET security_block_bots=${next},updated_at=NOW() WHERE chat_id=${chatId}`;
    if(key==='links')await db()`UPDATE groups SET security_newcomer_links=${next},updated_at=NOW() WHERE chat_id=${chatId}`;
    if(key==='videos')await db()`UPDATE groups SET security_newcomer_media=${next},updated_at=NOW() WHERE chat_id=${chatId}`;
    if(key==='promos')await db()`UPDATE groups SET security_sensitive_spam=${next},updated_at=NOW() WHERE chat_id=${chatId}`;
    if(key==='penalties')await db()`UPDATE groups SET security_auto_mute=${next},updated_at=NOW() WHERE chat_id=${chatId}`;
    await logAction(chatId,userId,null,'shield_'+key+'_'+(next?'on':'off'));
    await send(userId,labels[key]+': '+(next?'ON':'OFF'));
  }
  const rows=await db()`SELECT * FROM groups WHERE chat_id=${chatId} AND enabled=TRUE`;
  const g=rows[0];
  if(!g)return true;
  const buttons=Object.entries(settingsFields).map(([key,col])=>[{
    text:(g[col]?'✅ ':'⬜ ')+labels[key],callback_data:`sec:toggle:${chatId}:${key}`
  }]);
  buttons.push([{text:'↩ Back to Admin Panel',callback_data:'dm:open:'+chatId}]);
  return send(userId,`🛡️ YAJETZY SECURITY SHIELD — ${g.title}

Main Shield: ${g.security_shield_enabled?'ON':'OFF'}
Enable individual protections using the buttons below.

First suspicious post is removed; repeated offenses lead to temporary mute, then ban for persistent high-confidence spam.
New members can still upload ZIP/PDF files in Modules Files, but suspicious videos and links are restricted briefly.
Admin accounts are exempt. This bot cannot inspect video/photo pixels, so content moderation is based on captions, filenames and posting behavior.

Required bot permissions: Delete Messages, Ban Users / Restrict Members.`,{
    reply_markup:{inline_keyboard:buttons}
  });
}
