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
export function mute(chatId,userId,minutes) {
  const duration = Math.max(1,Math.min(10080,minutes));
  return tg('restrictChatMember',{
    chat_id:chatId,user_id:userId,
    permissions:{can_send_messages:false},
    use_independent_chat_permissions:true,
    until_date:Math.floor(Date.now()/1000)+duration*60
  });
}
export function unmute(chatId,userId) {
  return tg('restrictChatMember',{
    chat_id:chatId,user_id:userId,
    use_independent_chat_permissions:true,
    permissions:{
      can_send_messages:true,can_send_audios:true,can_send_documents:true,
      can_send_photos:true,can_send_videos:true,can_send_video_notes:true,
      can_send_voice_notes:true,can_send_polls:true,can_send_other_messages:true,
      can_add_web_page_previews:true,can_invite_users:true
    }
  });
}
