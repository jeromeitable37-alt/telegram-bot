import { db, logAction } from './db.js';
import { send, tg, isAdmin } from './telegram.js';
import { topicIdFromMessage } from './topic-helpers.mjs';
import {linkedNoteText,validLinkNoteSlug} from './file-note-helpers.mjs';
import {
  messageLink,searchQueryFromText,normalizeQuery,sharedMediaInfo,searchKeyboard
} from './file-search-helpers.mjs';
import {rankedFiles} from './v6-core.mjs';
import {fileFinderKeyboard} from './v7-search-helpers.mjs';
import {startGuidedPrompt} from './v7-prompts.js';
import {publicFileAllowed,restrictedFileName} from './file-policy.mjs';

async function isGroupAdmin(chatId,userId) {
  if (!userId || !Number.isSafeInteger(Number(chatId)) || Number(chatId)>=0) return false;
  return isAdmin(Number(chatId),userId);
}
function threadIdOf(m) {
  return topicIdFromMessage(m) || 1;
}
function topicExtras(m) {
  const id=topicIdFromMessage(m);
  return id && id>1 ? {message_thread_id:id}:{};
}
async function addRecord(chatId,messageId,threadId,info,manual=false,approved=false) {
  return db()`INSERT INTO indexed_files(chat_id,message_id,thread_id,display_name,file_name,caption_text,mime_type,manually_added,delivery_approved,review_status)
    VALUES(${chatId},${messageId},${threadId},${info.title},${info.fileName},${info.caption},${info.mime},${manual},${approved},${approved?'approved':'pending'})
    ON CONFLICT(chat_id,message_id) DO UPDATE SET
      display_name=EXCLUDED.display_name,file_name=EXCLUDED.file_name,
      caption_text=EXCLUDED.caption_text,mime_type=EXCLUDED.mime_type,
      thread_id=EXCLUDED.thread_id,manually_added=EXCLUDED.manually_added,
      delivery_approved=indexed_files.delivery_approved OR EXCLUDED.delivery_approved,
      review_status=CASE WHEN EXCLUDED.delivery_approved THEN 'approved' ELSE indexed_files.review_status END`;
}
export async function autoIndexDocument(m) {
  if (!m?.chat?.id || !sharedMediaInfo(m)) return;
  const threadId=threadIdOf(m);
  // Forum topics retain independent admin-approved indexing settings.
  // Regular supergroups must opt in explicitly with /filehub on.
  if(m.chat.is_forum){
    const topic=await db()`SELECT file_index_enabled FROM group_topics
      WHERE chat_id=${m.chat.id} AND thread_id=${threadId}`;
    if(!topic[0]?.file_index_enabled)return;
  }else{
    if(m.chat.type!=='supergroup')return;
    const rows=await db()`SELECT file_autoindex_enabled FROM groups
      WHERE chat_id=${m.chat.id} AND enabled=TRUE`;
    if(!rows[0]?.file_autoindex_enabled)return;
  }
  const info=sharedMediaInfo(m);
  if(!info)return;
  await addRecord(m.chat.id,m.message_id,threadId,info,false);
}
export async function registerReplyFile(m,customTitle) {
  if (!m.chat || !m.from?.id || !await isGroupAdmin(m.chat.id,m.from.id)) return false;
  const original=m.reply_to_message;
  const info=sharedMediaInfo(original);
  if (!original?.message_id || !info) {
    await send(m.chat.id,'Reply directly to the original document, video or photo post with /index or /index Custom title.',topicExtras(m));
    return true;
  }
  if(restrictedFileName(info)){
    await send(m.chat.id,'⚠️ This upload cannot be approved for bot delivery. Use verified, safe resources instead.',topicExtras(m));
    return true;
  }
  const name=String(customTitle||'').trim();
  if (name && name.length>200) {
    await send(m.chat.id,'Title must be at most 200 characters.',topicExtras(m));
    return true;
  }
  if (name) info.title=name;
  const actualThread=Number(original.message_thread_id)>0 ? Number(original.message_thread_id) : threadIdOf(m);
  await addRecord(m.chat.id,original.message_id,actualThread,info,true,true);
  await logAction(m.chat.id,m.from.id,null,'file_indexed_by_admin');
  try { await tg('deleteMessage',{chat_id:m.chat.id,message_id:m.message_id}); }
  catch(e){ console.warn('Could not delete /index command:',e.message); }
  try {
    await send(m.from.id,`✅ File added to YAJETZY search: ${info.title}
${messageLink(m.chat.id,actualThread,original.message_id)}
Members can now use /find ${info.title.slice(0,30)} in the group.`);
  } catch(e) {
    console.warn('Could not DM file-index confirmation:',e.message);
  }
  return true;
}
export async function linkReplyToNote(m, rawSlug, mode='link') {
  const shortSave=mode==='save';
  if(!m.chat?.id || !m.from?.id || !await isGroupAdmin(m.chat.id,m.from.id))return false;
  const slug=validLinkNoteSlug(rawSlug);
  if(!slug) {
    await send(m.chat.id,shortSave?
      'Usage: Reply directly to a file or tutorial video with /save name\nExample: /save potato_graphics (letters, numbers and underscores only)':
      'Usage: Reply to the original file or tutorial video post with /linknote notename\nExample: /linknote lsposed',topicExtras(m));
    return true;
  }
  const original=m.reply_to_message;
  const info=sharedMediaInfo(original);
  if(!original?.message_id || !info) {
    await send(m.chat.id,'Reply to the ORIGINAL file/video bubble (not a quoted text message) with /'+(shortSave?'save ':'linknote ')+slug+'.',topicExtras(m));
    return true;
  }
  if(restrictedFileName(info)){
    await send(m.chat.id,'⚠️ This upload cannot be approved for bot delivery. Use verified, safe resources instead.',topicExtras(m));
    return true;
  }
  const threadId=Number(original.message_thread_id)>0 ? Number(original.message_thread_id):threadIdOf(m);
  const link=messageLink(m.chat.id,threadId,original.message_id);
  if(!link) {
    await send(m.chat.id,'Could not determine this file post link. Try Copy Message Link and use the private Notes Library instead.',topicExtras(m));
    return true;
  }
  const existing=await db()`SELECT content FROM group_notes WHERE chat_id=${m.chat.id} AND slug=${slug}`;
  // /save creates a searchable alias as well as a hashtag note;
  // file_name stays the original Telegram document name for legacy catalog matching.
  if(shortSave)info.title=slug+' · '+info.title;
  const newContent=linkedNoteText(slug,info.title,link,existing[0]?.content||'');
  if(!newContent) {
    await send(m.chat.id,'This note already contains too much text. Edit it in the private Notes Library before linking another file.',topicExtras(m));
    return true;
  }
  await addRecord(m.chat.id,original.message_id,threadId,info,true,true);
  await db()`INSERT INTO group_notes(chat_id,slug,content,created_by,updated_by)
    VALUES(${m.chat.id},${slug},${newContent},${m.from.id},${m.from.id})
    ON CONFLICT(chat_id,slug) DO UPDATE SET content=EXCLUDED.content,
      updated_by=EXCLUDED.updated_by,updated_at=NOW()`;
  await logAction(m.chat.id,m.from.id,null,'file_linked_to_note');
  try {await tg('deleteMessage',{chat_id:m.chat.id,message_id:m.message_id});}
  catch(error){console.warn('Could not delete /linknote command:',error.message);}
  const result=`${shortSave?'✅ Saved group resource as':'✅ Linked Telegram post to'} #${slug}\nFile: ${info.title}\n${link}\n\nMembers can use #${slug}, /get ${slug}, /find ${slug}, or /notes.\n\n⚠️ YAJETZY does not security-scan community files. Group admins should review original posts before saving.`;
  try {await send(m.from.id,result);}
  catch(error){console.warn('Cannot DM file link confirmation:',error.message);await send(m.chat.id,'✅ File linked to #'+slug,topicExtras(m));}
  return true;
}

// Inside groups /save name is a single admin-reviewed publish action.
// In private chats /save remains the user's personal vault command.
export async function saveReplyFile(m,rawName){
  return linkReplyToNote(m,rawName,'save');
}

export async function removeReplyFile(m) {
  if (!m.chat || !m.from?.id || !await isGroupAdmin(m.chat.id,m.from.id)) return false;
  const messageId=m.reply_to_message?.message_id;
  if (!messageId) {
    await send(m.chat.id,'Reply to the original indexed file post with /unindex to remove it from search.',topicExtras(m));
    return true;
  }
  const removed=await db()`DELETE FROM indexed_files WHERE chat_id=${m.chat.id} AND message_id=${messageId} RETURNING display_name`;
  if (removed.length) await logAction(m.chat.id,m.from.id,null,'file_removed_from_index');
  try {await tg('deleteMessage',{chat_id:m.chat.id,message_id:m.message_id});}
  catch(error){console.warn('Could not delete /unindex command:',error.message);}
  try {await send(m.from.id,removed.length?'✅ Removed from search: '+removed[0].display_name:'That message was not indexed.');}
  catch(error){console.warn('Cannot send unindex confirmation DM:',error.message);}
  return true;
}

export async function searchFiles(m,queryText) {
  if (!m.from?.id || !m.chat?.id || m.chat.type==='private')return;
  if (!String(queryText||'').trim())return startGuidedPrompt(m,'find');
  const query=normalizeQuery(queryText);
  if(!query)return send(m.chat.id,
    '🔎 Type a filename or keyword between 2 and 60 characters. Example: /find setup guide',
    topicExtras(m));
  const allowed=await db()`INSERT INTO file_search_cooldowns(chat_id,user_id,last_used_at)
    VALUES(${m.chat.id},${m.from.id},NOW())
    ON CONFLICT(chat_id,user_id) DO UPDATE SET last_used_at=NOW()
    WHERE file_search_cooldowns.last_used_at<NOW()-INTERVAL '8 seconds'
    RETURNING user_id`;
  if(!allowed.length)return;
  // Search only explicitly admin-approved indexed posts. A filename catalog
  // alone is never enough to claim a file exists or send unreviewed binaries.
  const records=await db()`SELECT message_id,thread_id,display_name,file_name,caption_text,
      mime_type,review_status,delivery_approved,indexed_at
    FROM indexed_files WHERE chat_id=${m.chat.id} AND review_status='approved'
    ORDER BY indexed_at DESC LIMIT 450`;
  const allowedRecords=records.filter(publicFileAllowed);
  const fuzzy=rankedFiles(query,allowedRecords,12);
  const matched=fuzzy.length?fuzzy.slice(0,6):allowedRecords.filter(record=>
    String(record.caption_text||'').toLowerCase().includes(query.toLowerCase())).slice(0,6);
  if(!matched.length){
    return send(m.chat.id,`🔎 No approved files found for "${query}".

Try a shorter keyword or check whether an admin has reviewed the original Telegram upload.
Old Telegram messages require forwarding or manual registration.`,{
      ...topicExtras(m),
      reply_markup:{inline_keyboard:[[{text:'🔎 Search again',callback_data:'find:new'}]]}
    });
  }
  const list=matched.map((entry,i)=>`${i+1}. ${String(entry.display_name).slice(0,95)}
   ${entry.delivery_approved?'📥 Tap to send here':'📍 Open original post'}`).join('\n');
  return send(m.chat.id,`🔎 YAJETZY File Finder
Search: ${query}
Found ${matched.length} approved result${matched.length===1?'':'s'}.

${list}

Tap a 📥 result to copy the reviewed file into this discussion, or open the original Telegram post.`,{
    ...topicExtras(m),
    reply_markup:fileFinderKeyboard(m.chat.id,matched)
  });
}

export async function approveReplyForDirectDelivery(m) {
  if(!m.chat?.id || !m.from?.id || !await isGroupAdmin(m.chat.id,m.from.id))return false;
  const original=m.reply_to_message;
  const info=sharedMediaInfo(original);
  if(!original?.message_id || !info) {
    await send(m.chat.id,'Reply to a document or tutorial video you have reviewed with /approvefile. Do not approve unknown APKs, sensitive logs, or dangerous files.',topicExtras(m));
    return true;
  }
  if(restrictedFileName(info)){
    await send(m.chat.id,'⚠️ This upload cannot be approved for bot delivery. Use verified, safe resources instead.',topicExtras(m));
    return true;
  }
  const threadId=Number(original.message_thread_id)>0?Number(original.message_thread_id):threadIdOf(m);
  await addRecord(m.chat.id,original.message_id,threadId,info,true,true);
  await logAction(m.chat.id,m.from.id,null,'file_delivery_approved');
  try{await tg('deleteMessage',{chat_id:m.chat.id,message_id:m.message_id});}
  catch(error){console.warn('Could not delete /approvefile command:',error.message);}
  try{await send(m.from.id,`✅ Approved for direct delivery: ${info.title}\nMembers can use /find ${info.title.slice(0,35)} and tap 📥 Send File Here.\nReview files carefully. YAJETZY does not scan uploads.`);}
  catch(error){console.warn('Cannot DM approval confirmation:',error.message);}
  return true;
}

export async function deliverIndexedFile(query) {
  const match=String(query.data||'').match(/^fileget:(\d+)$/);
  if(!match)return false;
  const chat=query.message?.chat;
  const chatId=Number(chat?.id), messageId=Number(match[1]);
  if(!chat || !['group','supergroup'].includes(chat.type) ||
    !Number.isSafeInteger(chatId) || chatId>=0 ||
    !Number.isSafeInteger(messageId) || messageId<1 || !query.from?.id) {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Only available inside the original group.',show_alert:true});
    return true;
  }
  const rows=await db()`SELECT f.thread_id,f.display_name,f.file_name,f.review_status FROM indexed_files AS f
    INNER JOIN groups AS g ON g.chat_id=f.chat_id AND g.enabled=TRUE
    WHERE f.chat_id=${chatId} AND f.message_id=${messageId} AND f.delivery_approved=TRUE AND f.review_status='approved' LIMIT 1`;
  if(!rows.length || !publicFileAllowed(rows[0])){
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'File not approved for direct delivery. Use the Telegram post link.',show_alert:true});
    return true;
  }
  const allowed=await db()`INSERT INTO file_delivery_cooldowns(chat_id,user_id,last_used_at)
    VALUES(${chatId},${query.from.id},NOW())
    ON CONFLICT(chat_id,user_id) DO UPDATE SET last_used_at=NOW()
      WHERE file_delivery_cooldowns.last_used_at < NOW()-INTERVAL '20 seconds'
    RETURNING user_id`;
  if(!allowed.length){
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Please wait 20 seconds before requesting another file.'});
    return true;
  }
  await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Sending the file to this topic...'});
  try {
    const threadId=Number(query.message?.message_thread_id);
    await tg('copyMessage',{
      chat_id:chatId,from_chat_id:chatId,message_id:messageId,
      ...(Number.isSafeInteger(threadId)&&threadId>1?{message_thread_id:threadId}:{})
    });
  } catch(error) {
    console.warn('Cannot copy indexed file:',error.message);
    const source=messageLink(chatId,rows[0].thread_id,messageId);
    await send(chatId,
      `⚠️ Could not resend "${String(rows[0].display_name).slice(0,120)}".\nOpen the original post instead: ${source||'Ask an admin for the file link.'}`,
      Number(query.message?.message_thread_id)>1?{message_thread_id:query.message.message_thread_id}:{});
  }
  return true;
}

export function parsePlainFileSearch(text) {
  return searchQueryFromText(text);
}
export async function registerFileLinkDm(m,args) {
  if (m.chat?.type!=='private') return;
  const parts=String(args||'').split('|').map(x=>x.trim());
  if (parts.length!==2 || !parts[1] || parts[1].length>200) {
    return send(m.chat.id,'Usage: /fileadd https://t.me/c/GROUP_ID/TOPIC_ID/MESSAGE_ID | File title\n\nCopy the message link directly from the original file post.');
  }
  const match=parts[0].match(/^https:\/\/t\.me\/c\/([1-9]\d+)\/(?:([1-9]\d+)\/)?([1-9]\d+)\/?$/i);
  if(!match) return send(m.chat.id,'Invalid message link. Use Copy Message Link from the Telegram file post.');
  const chatId=Number('-100'+match[1]);
  const threadId=match[2]?Number(match[2]):1;
  const messageId=Number(match[3]);
  if (!Number.isSafeInteger(chatId)||!Number.isSafeInteger(threadId)||!Number.isSafeInteger(messageId)) {
    return send(m.chat.id,'Invalid message identifiers.');
  }
  const groups=await db()`SELECT title,enabled FROM groups WHERE chat_id=${chatId}`;
  if (!groups[0]?.enabled || !await isGroupAdmin(chatId,m.from.id)) {
    return send(m.chat.id,'Only administrators of a group managed by YAJETZY can register file links.');
  }
  const info={title:parts[1],fileName:'',caption:'',mime:''};
  await addRecord(chatId,messageId,threadId,info,true);
  await logAction(chatId,m.from.id,null,'file_link_indexed_by_admin');
  return send(m.chat.id,`✅ Added to the file index for ${groups[0].title}:
${parts[1]}
${messageLink(chatId,threadId,messageId)}

Status: pending review. YAJETZY cannot verify the content of older file links. Approve it in the V6 File Center after checking the actual post.`);
}
export async function handleFileTopicCallback(query) {
  const text=String(query.data||'');
  const match=text.match(/^fileidx:toggle:(-?\d+):(\d+)$/);
  if (!match) return false;
  if (query.message?.chat?.type!=='private'||query.message.chat.id!==query.from?.id) return true;
  const chatId=Number(match[1]),threadId=Number(match[2]);
  if (!Number.isSafeInteger(chatId)||!Number.isSafeInteger(threadId)||!await isGroupAdmin(chatId,query.from.id)) {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Group admins only.',show_alert:true});
    return true;
  }
  const rows=await db()`UPDATE group_topics SET file_index_enabled=NOT file_index_enabled,updated_at=NOW()
    WHERE chat_id=${chatId} AND thread_id=${threadId}
    RETURNING title,file_index_enabled`;
  if (!rows.length) {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Register the topic first.',show_alert:true});
    return true;
  }
  await logAction(chatId,query.from.id,null,'file_autoindex_'+(rows[0].file_index_enabled?'enabled':'disabled'));
  await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Saved'});
  await send(query.from.id,`${rows[0].file_index_enabled?'✅':'⬜'} File indexing ${rows[0].file_index_enabled?'ON':'OFF'} in "${rows[0].title}".

${rows[0].file_index_enabled?'New document uploads will be added to search results. Older posts need manual registration.':'No new uploads in this topic will be indexed. Previously registered results remain searchable.'}

Use /panel → Topics & Main Menu to return.`);
  return true;
}
