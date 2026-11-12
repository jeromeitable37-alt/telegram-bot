export function guidedPromptKind(reply={}) {
  const text=String(reply?.text||'');
  if(text.startsWith('🔎 YAJETZY FILE SEARCH'))return 'find';
  if(text.startsWith('💬 YAJETZY HOW ASSISTANT'))return 'how';
  return null;
}
export function fileFinderKeyboard(chatId,files=[]){
  const source=String(chatId).match(/^-100([1-9]\d+)$/);
  if(!source)return {inline_keyboard:[]};
  const rows=[];
  for(const file of files.slice(0,6)){
    const id=Number(file.message_id),thread=Number(file.thread_id);
    if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(thread)||thread<1||
      file.review_status!=='approved')continue;
    const post=thread===1?
      'https://t.me/c/'+source[1]+'/'+id:
      'https://t.me/c/'+source[1]+'/'+thread+'/'+id;
    const title=String(file.display_name||file.file_name||'Shared file').slice(0,35);
    rows.push(file.delivery_approved===true?
      [{text:'📥 '+title,callback_data:'fileget:'+id}]:
      [{text:'📍 '+title,url:post}]);
    if(file.delivery_approved===true)rows.push([
      {text:'↗ Original Telegram post',url:post}
    ]);
  }
  rows.push([{text:'🔎 Search again',callback_data:'find:new'}]);
  return {inline_keyboard:rows};
}
