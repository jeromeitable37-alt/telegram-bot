import { db, logAction } from './db.js';
import { send, tg, isAdmin } from './telegram.js';
import { topicIdFromMessage } from './topic-helpers.mjs';
import {
  messageLink,searchQueryFromText,normalizeQuery,documentInfo,searchKeyboard
} from './file-search-helpers.mjs';

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
async function addRecord(chatId,messageId,threadId,info,manual=false) {
  return db()`INSERT INTO indexed_files(chat_id,message_id,thread_id,display_name,file_name,caption_text,mime_type,manually_added)
    VALUES(${chatId},${messageId},${threadId},${info.title},${info.fileName},${info.caption},${info.mime},${manual})
    ON CONFLICT(chat_id,message_id) DO UPDATE SET
      display_name=EXCLUDED.display_name,file_name=EXCLUDED.file_name,
      caption_text=EXCLUDED.caption_text,mime_type=EXCLUDED.mime_type,
      thread_id=EXCLUDED.thread_id,manually_added=EXCLUDED.manually_added`;
}
export async function autoIndexDocument(m) {
  if (!m?.chat?.id || !m.document || !m.chat.is_forum) return;
  // Indexing is strictly opt-in per registered forum topic.
  const threadId=threadIdOf(m);
  const topic=await db()`SELECT file_index_enabled FROM group_topics
    WHERE chat_id=${m.chat.id} AND thread_id=${threadId}`;
  if (!topic[0]?.file_index_enabled) return;
  const info=documentInfo(m);
  if (!info) return;
  await addRecord(m.chat.id,m.message_id,threadId,info,false);
}
export async function registerReplyFile(m,customTitle) {
  if (!m.chat || !m.from?.id || !await isGroupAdmin(m.chat.id,m.from.id)) return false;
  const original=m.reply_to_message;
  const info=documentInfo(original);
  if (!original?.message_id || !info) {
    await send(m.chat.id,'Reply to an existing Telegram file post with /index or /index Custom title.',topicExtras(m));
    return true;
  }
  const name=String(customTitle||'').trim();
  if (name && name.length>200) {
    await send(m.chat.id,'Title must be at most 200 characters.',topicExtras(m));
    return true;
  }
  if (name) info.title=name;
  const actualThread=Number(original.message_thread_id)>0 ? Number(original.message_thread_id) : threadIdOf(m);
  await addRecord(m.chat.id,original.message_id,actualThread,info,true);
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
  if (!m.from?.id || !m.chat?.id || m.chat.type==='private') return;
  const query=normalizeQuery(queryText);
  if (!query) return send(m.chat.id,'Usage: /find filename (2–60 characters). Example: /find setup guide',topicExtras(m));
  if (!m.chat?.id || m.chat.type==='private') return;
  // Lightweight throttling: keeps repeated queries from flooding a busy forum.
  const allowed=await db()`INSERT INTO file_search_cooldowns(chat_id,user_id,last_used_at)
    VALUES(${m.chat.id},${m.from.id},NOW())
    ON CONFLICT(chat_id,user_id) DO UPDATE SET last_used_at=NOW()
      WHERE file_search_cooldowns.last_used_at < NOW()-INTERVAL '8 seconds'
    RETURNING user_id`;
  if (!allowed.length) return; // Don't post spammy cooldown messages.
  const matches=await db()`SELECT message_id,thread_id,display_name
    FROM indexed_files WHERE chat_id=${m.chat.id}
      AND (strpos(lower(display_name),lower(${query}))>0
        OR strpos(lower(file_name),lower(${query}))>0
        OR strpos(lower(caption_text),lower(${query}))>0)
    ORDER BY manually_added DESC,indexed_at DESC LIMIT 5`;
  if (!matches.length) {
    return send(m.chat.id,`🔎 No indexed file matches for "${query}".

Only files registered by admins or newly posted in indexing-enabled topics are searchable.
Try another filename or ask an admin to add an older post.`,topicExtras(m));
  }
  return send(m.chat.id,`🔎 Found ${matches.length} matching file post${matches.length===1?'':'s'} for "${query}".

Tap a result below to open the original Telegram post. Files are not verified as safe.`,{
    ...topicExtras(m),
    reply_markup:searchKeyboard(m.chat.id,matches)
  });
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

Note: YAJETZY cannot verify the content of older file links. Confirm the link points to the correct file post.`);
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
