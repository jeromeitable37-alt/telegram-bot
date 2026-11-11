import {db,logAction} from './db.js';
import {tg,send,mute,unmute,restrictMedia,checkModerationRights} from './telegram.js';
import {MODERATION_COMMANDS,parseModerationTarget,moderationDuration,moderationError} from './moderation-helpers.mjs';

const ADMIN_COMMANDS=new Set([...MODERATION_COMMANDS,'modcheck']);

export function isModerationCommand(name){return ADMIN_COMMANDS.has(name);}
function threadOptions(m){return m.message_thread_id ? {message_thread_id:m.message_thread_id}:{};}
function say(m,message){return send(m.chat.id,message,threadOptions(m));}
async function record(chatId,actorId,targetId,action) {
  try{await logAction(chatId,actorId,targetId,action);}
  catch(error){console.warn('Moderation succeeded but could not write audit log:',error.message);}
}
function usage(command){
  const examples={
    ban:'/ban — reply to a member, or /ban 123456789',
    unban:'/unban 123456789 — or reply to an old message',
    mute:'/mute 10m — reply to member, or /mute 123456789 10m (1m–7d). Default: 10m',
    unmute:'/unmute — reply to member, or /unmute 123456789',
    restrict:'/restrict 10m — reply to member, or /restrict 123456789 10m (text only; 1m–7d)',
    unrestrict:'/unrestrict — reply to member, or /unrestrict 123456789',
    warn:'/warn — reply to member, or /warn 123456789',
    warnings:'/warnings — reply to member, or /warnings 123456789',
    resetwarns:'/resetwarns — reply to member, or /resetwarns 123456789'
  };
  return 'Usage: '+(examples[command]||'Reply to a member or provide their numeric Telegram user ID.');
}
async function inspectRights(chatId,actorId){
  const rights=await checkModerationRights(chatId,actorId);
  if(!rights.actorAllowed)return {ok:false,message:'Your account needs the Telegram administrator right Ban Users / Restrict Members to use this action.'};
  if(!rights.botAllowed)return {ok:false,message:'YAJETZY does not have the Ban Users / Restrict Members right. Go to YAJE Discussions → Manage → Administrators → YAJETZY and enable Ban Users.'};
  return {ok:true,message:'Ready'};
}
async function protectTarget(chatId,actorId,userId) {
  if(userId===actorId)return 'You cannot moderate your own account.';
  const member=await tg('getChatMember',{chat_id:chatId,user_id:userId});
  if(member.status==='administrator'||member.status==='creator')return 'Cannot moderate the group owner or another administrator.';
  return null;
}
export async function handleModerationCommand(m,cmd,settings){
  if(!isModerationCommand(cmd.name))return false;
  const chatId=m.chat.id, actorId=m.from?.id;
  if(!actorId)return true;
  if(cmd.name==='modcheck') {
    try{
      const rights=await checkModerationRights(chatId,actorId);
      return say(m,`🛡️ YAJETZY MODERATION CHECK
Your account: ${rights.actorStatus} — ${rights.actorAllowed?'✅ Can restrict members':'❌ Missing Ban Users permission'}
Bot: ${rights.botStatus} — ${rights.botAllowed?'✅ Can restrict members':'❌ Missing Ban Users permission'}

${rights.actorAllowed&&rights.botAllowed?'Ready to test /mute or /restrict on a regular member.':'Enable Ban Users / Restrict Members for the bot and the administrator running commands.'}`);
    }catch(error){return say(m,'Unable to check moderation rights: '+moderationError(error));}
  }
  const rawReply=m.reply_to_message?.sender_chat ? null : m.reply_to_message?.from?.id;
  const parsed=parseModerationTarget(rawReply,cmd.args);
  if(!parsed.userId)return say(m,usage(cmd.name));
  const userId=parsed.userId;
  if(['ban','unban','unmute','unrestrict','warnings','resetwarns'].includes(cmd.name) && parsed.rest) {
    return say(m,usage(cmd.name));
  }
  let minutes;
  if(['mute','restrict'].includes(cmd.name)) {
    minutes=moderationDuration(parsed.rest);
    if(!minutes)return say(m,usage(cmd.name));
  }
  try{
    if(['ban','mute','restrict','unban','unmute','unrestrict'].includes(cmd.name)){
      const rights=await inspectRights(chatId,actorId);
      if(!rights.ok)return say(m,'⚠️ '+rights.message);
    }
    if(!['unban','warnings'].includes(cmd.name)){
      const protectedUser=await protectTarget(chatId,actorId,userId);
      if(protectedUser)return say(m,'⚠️ '+protectedUser);
    }
    if(cmd.name==='warnings'){
      const rows=await db()`SELECT count FROM member_warnings WHERE chat_id=${chatId} AND user_id=${userId}`;
      return say(m,`Member ${userId}: ${Number(rows[0]?.count||0)} warning(s).`);
    }
    if(cmd.name==='resetwarns'){
      await db()`DELETE FROM member_warnings WHERE chat_id=${chatId} AND user_id=${userId}`;
      await record(chatId,actorId,userId,'resetwarns');
      return say(m,`✅ Warnings cleared for ${userId}.`);
    }
    if(cmd.name==='warn'){
      const rows=await db()`INSERT INTO member_warnings(chat_id,user_id,count) VALUES (${chatId},${userId},1)
        ON CONFLICT(chat_id,user_id) DO UPDATE SET count=member_warnings.count+1 RETURNING count`;
      const count=Number(rows[0].count);
      await record(chatId,actorId,userId,'warn');
      if(count>=settings.max_warnings){
        const rights=await inspectRights(chatId,actorId);
        if(!rights.ok)return say(m,`⚠️ Member ${userId} has ${count} warnings, but automatic mute was not applied. ${rights.message}`);
        await mute(chatId,userId,10);
        await db()`DELETE FROM member_warnings WHERE chat_id=${chatId} AND user_id=${userId}`;
        await record(chatId,0,userId,'auto_mute_10m');
        return say(m,`🔇 Member ${userId} reached ${count} warnings and was muted for 10 minutes. Warning count reset.`);
      }
      return say(m,`⚠️ Member ${userId} warned (${count}/${settings.max_warnings}).`);
    }
    if(cmd.name==='ban'){
      await tg('banChatMember',{chat_id:chatId,user_id:userId});
      await record(chatId,actorId,userId,'ban');
      return say(m,`🚫 Member ${userId} was banned from ${settings.title}.`);
    }
    if(cmd.name==='unban'){
      await tg('unbanChatMember',{chat_id:chatId,user_id:userId,only_if_banned:true});
      await record(chatId,actorId,userId,'unban');
      return say(m,`✅ Member ${userId} unbanned. They may join again if invited.`);
    }
    if(cmd.name==='mute'){
      await mute(chatId,userId,minutes);
      await record(chatId,actorId,userId,`mute_${minutes}m`);
      return say(m,`🔇 Member ${userId} muted for ${minutes} minute(s).`);
    }
    if(cmd.name==='restrict'){
      await restrictMedia(chatId,userId,minutes);
      await record(chatId,actorId,userId,`restrict_${minutes}m`);
      return say(m,`🔒 Member ${userId} restricted for ${minutes} minute(s): text allowed, media and files disabled.`);
    }
    if(cmd.name==='unmute'||cmd.name==='unrestrict'){
      await unmute(chatId,userId);
      await record(chatId,actorId,userId,cmd.name);
      return say(m,`✅ Restrictions lifted for member ${userId}; normal group defaults restored.`);
    }
  }catch(error){
    console.warn('YAJE moderation command failed:',cmd.name,String(error?.message||error));
    return say(m,`⚠️ /${cmd.name} failed: ${moderationError(error)}\n\nTry /modcheck to check Telegram permissions.`);
  }
  return false;
}
