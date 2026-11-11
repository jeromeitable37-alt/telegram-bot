export function messageLink(chatId, threadId, messageId) {
  const match=String(chatId).match(/^-100([1-9]\d+)$/);
  const topic=Number(threadId), message=Number(messageId);
  if (!match || !Number.isSafeInteger(topic) || topic<1 ||
      !Number.isSafeInteger(message) || message<1) return null;
  return topic===1
    ? `https://t.me/c/${match[1]}/${message}`
    : `https://t.me/c/${match[1]}/${topic}/${message}`;
}
export function searchQueryFromText(text='') {
  const raw=String(text).trim();
  const match=raw.match(/^(?:hanap|find|search|file)\s+(.+)$/i);
  if (!match) return null;
  return normalizeQuery(match[1]);
}
export function normalizeQuery(raw='') {
  const text=String(raw).replace(/\s+/g,' ').trim();
  if (text.length<2 || text.length>60) return null;
  return text;
}
export function documentInfo(message) {
  const doc=message?.document;
  if (!doc || typeof doc!=='object') return null;
  const fileName=String(doc.file_name||'').trim().slice(0,200);
  const caption=String(message.caption||'').trim().slice(0,500);
  const title=(fileName||caption.slice(0,140)||'Shared file').slice(0,200);
  return {title,fileName,caption,mime:String(doc.mime_type||'').slice(0,120)};
}
export function searchKeyboard(chatId,records) {
  const rows=[];
  for(const entry of records.slice(0,5)) {
    const url=messageLink(chatId,entry.thread_id,entry.message_id);
    if (!url) continue;
    const actions=[{text:`📍 ${String(entry.display_name||'Shared file').slice(0,43)}`,url}];
    if(entry.delivery_approved===true){
      actions.push({text:'📥 Send File Here',callback_data:`fileget:${entry.message_id}`});
    }
    rows.push(actions);
  }
  return {inline_keyboard:rows};
}
export function escapeLike(raw='') {
  return String(raw).replace(/[\\%_]/g,'\\$&');
}
