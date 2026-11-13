import { db, logAction } from './db.js';
import { send, tg, isAdmin } from './telegram.js';
import { normalizeNoteSlug, noteHashtag, noteCreateReply, notePrompt, noteView, noteListText, NOTE_MAX_CONTENT } from './note-helpers.mjs';
import {fileNamesInNote,fileReferenceReply,genericFilenameNoteHtml,eligibleAutoDeliveryFiles,linkedMediaNoteReply} from './note-delivery-helpers.mjs';
import {sendMediaOnly} from './direct-media.js';

const RESERVED=new Set(['rules','help','menu','start','status','notes']);
async function adminGroup(chatId,userId) {
  if(!Number.isSafeInteger(chatId)||chatId>=0||!userId)return null;
  const rows=await db()`SELECT title FROM groups WHERE chat_id=${chatId} AND enabled=TRUE`;
  return rows.length && await isAdmin(chatId,userId) ? rows[0] : null;
}
function answerOptions(m) {
  return {...(m.message_thread_id ? {message_thread_id:m.message_thread_id}:{}),
    ...(m.message_id ? {reply_parameters:{message_id:m.message_id,allow_sending_without_reply:true}}:{})};
}
async function limited(m) {
  if(!m.from?.id)return false;
  const rows=await db()`INSERT INTO note_cooldowns(chat_id,user_id,last_used_at)
    VALUES(${m.chat.id},${m.from.id},NOW())
    ON CONFLICT(chat_id,user_id) DO UPDATE SET last_used_at=NOW()
    WHERE note_cooldowns.last_used_at < NOW()-INTERVAL '4 seconds'
    RETURNING user_id`;
  return !!rows.length;
}

export async function retrieveNote(m,name,quiet=false) {
  const slug=normalizeNoteSlug(name);
  if(!slug) {
    if(!quiet && await limited(m))await send(m.chat.id,'Usage: /get notename (letters, numbers, underscores).',answerOptions(m));
    return !quiet;
  }
  const rows=await db()`SELECT content FROM group_notes WHERE chat_id=${m.chat.id} AND slug=${slug}`;
  if(!rows.length && quiet)return false;
  if(!await limited(m))return true;
  if(!rows.length)return send(m.chat.id,'No saved note named "'+slug+'". Use /notes for available names.',answerOptions(m));
  const groups=await db()`SELECT title FROM groups WHERE chat_id=${m.chat.id}`;
  const groupName=groups[0]?.title||'Telegram Group';
  // File reference notes show actual Telegram post buttons, never a bare .zip/.apk
  // filename that Telegram might mistakenly turn into a browser URL.
  if(fileNamesInNote(rows[0].content).length){
    const records=await db()`SELECT message_id,thread_id,display_name,file_name,review_status,delivery_approved
      FROM indexed_files WHERE chat_id=${m.chat.id} AND review_status='approved'
      ORDER BY indexed_at DESC LIMIT 350`;
    const result=fileReferenceReply({
      slug,groupName,content:rows[0].content,files:records,chatId:m.chat.id
    });
    if(result){
      const eligible=eligibleAutoDeliveryFiles(rows[0].content,records,m.chat.id,2);
      // When a note contains a real reviewed resource, reply with the media
      // itself only. No Telegram note header, list, or link text first.
      if(eligible.length){
        const items=eligible.map(item=>records.find(file=>Number(file.message_id)===item.messageId))
          .filter(Boolean);
        return sendMediaOnly(m,items,2);
      }
      // Metadata-only historical notes cannot produce actual attachments.
      return send(m.chat.id,'📦 No reviewed Telegram file is available for #'+slug+'.',answerOptions(m));
    }
  }

  // Tutorial videos and other media added with /linknote have Telegram post
  // references even when the note has no legacy filename catalog.
  if(rows[0].content.includes('📎 Shared Telegram post')){
    const records=await db()`SELECT message_id,thread_id,display_name,file_name,review_status,delivery_approved
      FROM indexed_files WHERE chat_id=${m.chat.id} AND review_status='approved'
      ORDER BY indexed_at DESC LIMIT 350`;
    const linked=linkedMediaNoteReply({
      slug,groupName,content:rows[0].content,files:records,chatId:m.chat.id
    });
    if(linked){
      if(linked.eligible.length){
        const items=linked.eligible.map(item=>records.find(file=>Number(file.message_id)===item.messageId))
          .filter(Boolean);
        return sendMediaOnly(m,items,2);
      }
      return send(m.chat.id,'📦 No reviewed Telegram file is available for #'+slug+'.',answerOptions(m));
    }
  }
  const safeGeneric=genericFilenameNoteHtml(groupName,slug,rows[0].content);
  if(safeGeneric)return send(m.chat.id,safeGeneric.text,{
    ...answerOptions(m),parse_mode:safeGeneric.parse_mode
  });
  return send(m.chat.id,noteView(groupName,slug,rows[0].content),answerOptions(m));
}
export async function replyToNoteHashtag(m) {
  const slug=noteHashtag(m.text||'');
  if(!slug||RESERVED.has(slug))return false;
  await retrieveNote(m,slug,true);
  return true;
}
export async function listGroupNotes(m) {
  if(!await limited(m))return;
  const rows=await db()`SELECT slug FROM group_notes WHERE chat_id=${m.chat.id} ORDER BY updated_at DESC,slug LIMIT 100`;
  const groups=await db()`SELECT title FROM groups WHERE chat_id=${m.chat.id}`;
  return send(m.chat.id,noteListText(groups[0]?.title||m.chat.title||'Group',rows),answerOptions(m));
}
async function callbackAnswer(q,message) {
  return tg('answerCallbackQuery',{callback_query_id:q.id,...(message?{text:message}:{})});
}
async function manager(q,chatId,page=0) {
  const group=await adminGroup(chatId,q.from.id);
  if(!group)return callbackAnswer(q,'Only group admins can edit notes.');
  await callbackAnswer(q);
  const count=await db()`SELECT COUNT(*)::int AS total FROM group_notes WHERE chat_id=${chatId}`;
  const total=Number(count[0]?.total||0);
  const pageSize=15,totalPages=Math.max(1,Math.ceil(total/pageSize));
  const current=Math.max(0,Math.min(totalPages-1,Math.floor(Number(page)||0)));
  const offset=current*pageSize;
  const rows=await db()`SELECT note_id,slug FROM group_notes WHERE chat_id=${chatId} ORDER BY slug LIMIT ${pageSize} OFFSET ${offset}`;
  const buttons=rows.map(n=>[{text:'📝 '+n.slug,callback_data:`note:open:${chatId}:${n.note_id}`}]);
  const navigation=[];
  if(current>0)navigation.push({text:'⬅️ Previous',callback_data:`note:list:${chatId}:${current-1}`});
  if(current<totalPages-1)navigation.push({text:'Next ➡️',callback_data:`note:list:${chatId}:${current+1}`});
  if(navigation.length)buttons.push(navigation);
  buttons.push([{text:'➕ Add note',callback_data:`note:new:${chatId}`}]);
  buttons.push([{text:'↩️ Group controls',callback_data:`dm:open:${chatId}`}]);
  return send(q.from.id,`📚 NOTES LIBRARY — ${group.title}

${total} total notes · Page ${current+1} of ${totalPages}.

Members can use:
• /notes — list notes
• /get notename — read a note
• #notename — instant reply

Manage entries privately using the buttons below.`,{reply_markup:{inline_keyboard:buttons}});
}
async function getById(chatId,noteId) {
  const rows=await db()`SELECT note_id,slug,content FROM group_notes WHERE chat_id=${chatId} AND note_id=${noteId}`;
  return rows[0]||null;
}
async function openNote(q,chatId,noteId) {
  const group=await adminGroup(chatId,q.from.id);
  if(!group)return callbackAnswer(q,'Admins only.');
  const note=await getById(chatId,noteId);
  if(!note)return callbackAnswer(q,'Note not found.');
  await callbackAnswer(q);
  return send(q.from.id,`🔐 PRIVATE PREVIEW

${noteView(group.title,note.slug,note.content)}`,{reply_markup:{inline_keyboard:[
    [{text:'✏️ Edit note',callback_data:`note:edit:${chatId}:${noteId}`}],
    [{text:'🗑 Delete note',callback_data:`note:delete:${chatId}:${noteId}`}],
    [{text:'↩️ Notes Library',callback_data:`note:list:${chatId}`}]
  ]}});
}
async function editPrompt(q,chatId,noteId) {
  const group=await adminGroup(chatId,q.from.id);
  if(!group)return callbackAnswer(q,'Admins only.');
  const existing=noteId?await getById(chatId,noteId):null;
  if(noteId&&!existing)return callbackAnswer(q,'Note not found.');
  await callbackAnswer(q);
  const mark=existing?`NOTE EDIT ${chatId} ${noteId}`:`NOTE ADD ${chatId}`;
  const instructions=existing?`Editing ${existing.slug}.\nReply with the full replacement text or link (max ${NOTE_MAX_CONTENT} characters).`:
    'Reply with: notename | Text or URL\n\nExample:\nwelcome_guide | Read /rules and browse /menu.\n\nNames must start with a letter and use a-z, 0-9, and underscores.';
  return send(q.from.id,`${mark}\n${group.title}\n\n${instructions}`,{
    reply_markup:{force_reply:true,input_field_placeholder:'Type your note here'}
  });
}
async function deleteConfirm(q,chatId,noteId) {
  const group=await adminGroup(chatId,q.from.id);
  if(!group)return callbackAnswer(q,'Admins only.');
  const note=await getById(chatId,noteId);
  if(!note)return callbackAnswer(q,'Note not found.');
  await callbackAnswer(q);
  return send(q.from.id,`Delete "${note.slug}" from ${group.title}?`,{
    reply_markup:{inline_keyboard:[
      [{text:'🗑 Confirm delete',callback_data:`note:confirm:${chatId}:${noteId}`}],
      [{text:'Cancel',callback_data:`note:open:${chatId}:${noteId}`}]
    ]}
  });
}
async function deleteSaved(q,chatId,noteId) {
  if(!await adminGroup(chatId,q.from.id))return callbackAnswer(q,'Admins only.');
  const rows=await db()`DELETE FROM group_notes WHERE chat_id=${chatId} AND note_id=${noteId} RETURNING slug`;
  if(rows.length)await logAction(chatId,q.from.id,null,'note_deleted');
  await callbackAnswer(q,rows.length?'Deleted':'Already deleted');
  return send(q.from.id,rows.length?`✅ Deleted note ${rows[0].slug}.`:'Note already deleted.');
}
export async function handleNoteCallback(q) {
  if(q?.message?.chat?.type!=='private'||q.message.chat.id!==q.from?.id)return false;
  const data=String(q.data||'');
  const group=data.match(/^note:(list|new):(-?\d+)(?::(\d+))?$/);
  if(group) {
    const chatId=Number(group[2]);
    if(!Number.isSafeInteger(chatId)||chatId>=0)return false;
    if(group[1]==='list')await manager(q,chatId,group[3]?Number(group[3]):0);
    else await editPrompt(q,chatId,null);
    return true;
  }
  const item=data.match(/^note:(open|edit|delete|confirm):(-?\d+):(\d+)$/);
  if(!item)return false;
  const action=item[1],chatId=Number(item[2]),id=Number(item[3]);
  if(!Number.isSafeInteger(chatId)||chatId>=0||!Number.isSafeInteger(id)||id<1)return false;
  if(action==='open')await openNote(q,chatId,id);
  if(action==='edit')await editPrompt(q,chatId,id);
  if(action==='delete')await deleteConfirm(q,chatId,id);
  if(action==='confirm')await deleteSaved(q,chatId,id);
  return true;
}
export async function handleNoteReply(m) {
  if(m?.chat?.type!=='private'||!m.reply_to_message?.from?.is_bot)return false;
  const username=(process.env.BOT_USERNAME||'').replace(/^@/,'').toLowerCase();
  if(!username||m.reply_to_message.from.username?.toLowerCase()!==username)return false;
  const prompt=notePrompt(m.reply_to_message.text);
  if(!prompt)return false;
  const group=await adminGroup(prompt.chatId,m.from?.id);
  if(!group) {
    await send(m.chat.id,'Only group admins can edit this Notes Library.');
    return true;
  }
  if(prompt.mode==='add') {
    const note=noteCreateReply(m.text||'');
    if(!note||RESERVED.has(note.slug)) {
      await send(m.chat.id,'Invalid note. Reply to the ORIGINAL prompt with:\nnotename | Note text or link\n\nNames use a-z, 0-9, underscore and start with a letter. Content: 1–3500 characters. Reserved words like rules cannot be used.');
      return true;
    }
    const rows=await db()`INSERT INTO group_notes(chat_id,slug,content,created_by,updated_by)
      VALUES(${prompt.chatId},${note.slug},${note.content},${m.from.id},${m.from.id})
      ON CONFLICT(chat_id,slug) DO NOTHING RETURNING note_id`;
    if(!rows.length) {
      await send(m.chat.id,`The note "${note.slug}" exists already. Open it in Notes Library to edit.`);
      return true;
    }
    await logAction(prompt.chatId,m.from.id,null,'note_added');
    await send(m.chat.id,`✅ Saved ${note.slug} in ${group.title}.\nMembers can now use #${note.slug} or /get ${note.slug}.`);
    return true;
  }
  const value=String(m.text||'').trim();
  if(!value||value.length>NOTE_MAX_CONTENT) {
    await send(m.chat.id,'Reply to the ORIGINAL prompt with 1–3500 characters.');
    return true;
  }
  const rows=await db()`UPDATE group_notes SET content=${value},updated_by=${m.from.id},updated_at=NOW()
    WHERE chat_id=${prompt.chatId} AND note_id=${prompt.noteId} RETURNING slug`;
  if(!rows.length) {
    await send(m.chat.id,'Note no longer exists.');
    return true;
  }
  await logAction(prompt.chatId,m.from.id,null,'note_updated');
  await send(m.chat.id,`✅ Updated note ${rows[0].slug}.`);
  return true;
}
