import { chatRestrictionPermissions,roleCanRestrict } from './moderation-helpers.mjs';
export async function tg(method, body = {}) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is not configured');
  const response = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  const json = await response.json();
  if (!response.ok || !json.ok) throw new Error('Telegram ' + method + ': ' + (json.description || response.status));
  return json.result;
}
export function send(chatId, text, extra = {}) {
  return tg('sendMessage', {chat_id:chatId, text:String(text).slice(0,4096), ...extra});
}
export async function isAdmin(chatId,userId) {
  if (!userId) return false;
  const m = await tg('getChatMember',{chat_id:chatId,user_id:userId});
  return m.status === 'creator' || m.status === 'administrator';
}
export async function checkModerationRights(chatId,actorId){
  const me=await tg('getMe');
  const [actor,bot]=await Promise.all([
    tg('getChatMember',{chat_id:chatId,user_id:actorId}),
    tg('getChatMember',{chat_id:chatId,user_id:me.id})
  ]);
  return {
    actorStatus:actor.status,
    actorAllowed:roleCanRestrict(actor),
    botStatus:bot.status,
    botAllowed:roleCanRestrict(bot)
  };
}
export function mute(chatId,userId,minutes) {
  return tg('restrictChatMember',{
    chat_id:chatId,user_id:userId,
    permissions:chatRestrictionPermissions('mute'),
    use_independent_chat_permissions:true,
    until_date:Math.floor(Date.now()/1000)+minutes*60
  });
}
export async function restrictMedia(chatId,userId,minutes){
  const chat=await tg('getChat',{chat_id:chatId});
  return tg('restrictChatMember',{
    chat_id:chatId,user_id:userId,
    permissions:chatRestrictionPermissions('restrict',chat.permissions||{}),
    use_independent_chat_permissions:true,
    until_date:Math.floor(Date.now()/1000)+minutes*60
  });
}
export async function unmute(chatId,userId) {
  const chat=await tg('getChat',{chat_id:chatId});
  return tg('restrictChatMember',{
    chat_id:chatId,user_id:userId,
    use_independent_chat_permissions:true,
    permissions:chatRestrictionPermissions('restore',chat.permissions||{})
  });
}
