import {db} from './db.js';
import {tg,send} from './telegram.js';
import {sharedMediaInfo,normalizeQuery} from './file-search-helpers.mjs';
import {restrictedFileName} from './file-policy.mjs';
import {rankedFiles} from './v6-core.mjs';

const ownChat=m=>m?.chat?.type==='private' && Number(m.from?.id)===Number(m.chat.id) && Number(m.from?.id)>0;
const clean=x=>String(x||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,200);
export function vaultFileInfo(message){
  const base=sharedMediaInfo(message);
  if(!base)return null;
  const title=clean(base.title||base.fileName||'Telegram media');
  if(restrictedFileName({display_name:title,file_name:base.fileName}))return null;
  return {
    display_name:title||'Telegram media',
    file_name:clean(base.fileName),
    mime_type:clean(base.mime),
    caption_text:String(base.caption||'').slice(0,500)
  };
}
export async function saveVaultMessage(userId,message){
  const info=vaultFileInfo(message);
  if(!info||!Number.isSafeInteger(Number(message?.message_id)))return false;
  await db()`INSERT INTO private_saved_files(user_id,message_id,display_name,file_name,mime_type,caption_text)
    VALUES(${userId},${message.message_id},${info.display_name},${info.file_name},${info.mime_type},${info.caption_text})
    ON CONFLICT(user_id,message_id) DO UPDATE SET display_name=EXCLUDED.display_name,file_name=EXCLUDED.file_name,
    mime_type=EXCLUDED.mime_type,caption_text=EXCLUDED.caption_text`;
  return true;
}
export async function captureForwardedVaultFile(m){
  if(!ownChat(m)||!m.forward_origin||!vaultFileInfo(m))return false;
  await saveVaultMessage(m.from.id,m);
  await send(m.chat.id,'📁 Saved to My Vault: '+clean(vaultFileInfo(m).display_name)+
    '\nUse /myfind keyword to find it later. Saved files stay in your private YAJETZY chat and are never indexed for other members.');
  return true;
}
export async function saveRepliedVaultFile(m){
  if(!ownChat(m))return false;
  const original=m.reply_to_message;
  const info=vaultFileInfo(original);
  if(!info)return send(m.chat.id,'Reply directly to a forwarded document, tutorial video or photo with /save. If Telegram blocks forwarding, YAJETZY cannot access that source.');
  const saved=await saveVaultMessage(m.from.id,original);
  if(saved)return send(m.chat.id,'✅ Saved '+info.display_name+' in your private file vault. Search with /myfind keyword.');
}
export async function searchPersonalVault(userId,raw='',limit=16){
  const q=String(raw||'').trim();
  const rows=await db()`SELECT message_id,display_name,file_name,mime_type,caption_text,created_at
    FROM private_saved_files WHERE user_id=${Number(userId)} ORDER BY created_at DESC LIMIT 350`;
  if(!q)return rows.slice(0,Math.max(1,Math.min(30,limit)));
  const normal=normalizeQuery(q);
  if(!normal)return [];
  const ranked=rankedFiles(normal,rows.map(row=>({...row,indexed_at:row.created_at})),limit);
  return ranked.length?ranked:rows.filter(row=>row.caption_text?.toLowerCase().includes(normal.toLowerCase())).slice(0,limit);
}
export function vaultKeyboard(rows=[]){
  return {inline_keyboard:rows.slice(0,10).map(row=>[{
    text:'📥 '+clean(row.display_name).slice(0,45),callback_data:'vault:get:'+row.message_id
  }])};
}
export async function vaultCommand(m,name,args=''){
  if(!ownChat(m))return false;
  if(name==='save')return saveRepliedVaultFile(m);
  if(name==='vault')return send(m.chat.id,
    '📁 YAJETZY MY FILE VAULT\n\nForward permitted files or tutorial videos from other Telegram chats directly here and YAJETZY will save their filenames privately.\n\nFind them with /myfind keyword or list recent files with /myfiles. To save something you uploaded yourself, reply to the file with /save.\n\nThis does not read other groups automatically. It cannot access protected posts or deleted originals, and does not scan file contents.');
  const q=name==='myfiles'?'':String(args||'').trim();
  if(name==='myfind'&&!q)return send(m.chat.id,'Usage: /myfind filename\nExample: /myfind screen recorder');
  const records=await searchPersonalVault(m.from.id,q,10);
  if(!records.length)return send(m.chat.id,'📁 Nothing saved matching that keyword. Forward permitted files here first, or try /myfiles.');
  return send(m.chat.id,
    '📁 YOUR PRIVATE FILE VAULT'+(q?'\nSearch: '+q:'')+
    '\n\n'+records.map((r,i)=>(i+1)+'. '+clean(r.display_name)).join('\n')+
    '\n\nTap a result to have YAJETZY copy your saved file back into this private chat.',
    {reply_markup:vaultKeyboard(records)});
}
export async function vaultCallback(query){
  const match=String(query.data||'').match(/^vault:get:(\d+)$/);
  if(!match)return false;
  const userId=Number(query.from?.id),privateChat=query.message?.chat;
  if(!Number.isSafeInteger(userId)||userId<1||privateChat?.type!=='private'||Number(privateChat.id)!==userId){
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Open My Vault privately with YAJETZY.',show_alert:true});
    return true;
  }
  const result=await resendVaultFile(userId,Number(match[1]));
  await tg('answerCallbackQuery',{callback_query_id:query.id,
    text:result.ok?'Saved file sent privately.':result.error||'Unable to deliver file.',show_alert:!result.ok});
  return true;
}
export async function resendVaultFile(userId,messageId){
  if(!Number.isSafeInteger(Number(userId))||Number(userId)<1||
      !Number.isSafeInteger(Number(messageId))||Number(messageId)<1)return {ok:false,error:'Invalid saved file.'};
  const rows=await db()`SELECT message_id,display_name,file_name FROM private_saved_files
    WHERE user_id=${Number(userId)} AND message_id=${Number(messageId)} LIMIT 1`;
  if(!rows.length||restrictedFileName(rows[0]))return {ok:false,error:'This saved file is unavailable.'};
  const throttle=await db()`INSERT INTO personal_vault_cooldowns(user_id,last_at) VALUES(${Number(userId)},NOW())
    ON CONFLICT(user_id) DO UPDATE SET last_at=NOW()
    WHERE personal_vault_cooldowns.last_at<NOW()-INTERVAL '15 seconds' RETURNING user_id`;
  if(!throttle.length)return {ok:false,error:'Please wait 15 seconds before requesting another saved file.'};
  try{
    const copied=await tg('copyMessage',{chat_id:Number(userId),from_chat_id:Number(userId),message_id:Number(messageId)});
    return {ok:true,messageId:copied.message_id};
  }catch(e){
    console.warn('Private vault file copy failed:',String(e.message).slice(0,160));
    return {ok:false,error:'Telegram cannot copy the original message; check whether it was deleted or restricted.'};
  }
}
