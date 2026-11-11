import { db, logAction } from './db.js';
import { tg, send, isAdmin } from './telegram.js';
import { topicIdFromMessage, topicUrl, parseTopicRegistration, parseTopicReply, parseTopicLinkRegistration, menuContent } from './topic-helpers.mjs';

const MAX_TOPICS = 24;
const CHAT_ID_PATTERN = '-?\\d+';

async function adminGroup(chatId, userId) {
  if (!Number.isSafeInteger(chatId) || chatId >= 0 || !userId) return null;
  const rows = await db()`SELECT chat_id,title,enabled,menu_message_id FROM groups WHERE chat_id=${chatId} AND enabled=TRUE`;
  if (!rows.length || !await isAdmin(chatId,userId)) return null;
  return rows[0];
}
async function allTopics(chatId) {
  return db()`SELECT chat_id,thread_id,title,description,listed,link_policy,sort_order
    FROM group_topics WHERE chat_id=${chatId} ORDER BY sort_order,thread_id LIMIT 50`;
}
function menuKeyboard(chatId,topics) {
  return {inline_keyboard:topics.filter(t=>t.listed).slice(0,MAX_TOPICS).map(t=>[{
    text:String(t.title).slice(0,60),url:topicUrl(chatId,t.thread_id)
  }]).filter(row=>row[0].url)};
}
async function mainMenu(chatId, title) {
  const topics=await allTopics(chatId);
  const listed=topics.filter(t=>t.listed && topicUrl(chatId,t.thread_id));
  return {
    text:menuContent(title,listed),
    reply_markup:menuKeyboard(chatId,listed),
    listedCount:listed.length
  };
}

export async function discoverTopic(message) {
  if (!message?.chat?.is_forum || !message.chat?.id) return;
  const threadId=topicIdFromMessage(message);
  if (!threadId) return;
  const chatId=message.chat.id;
  // Bot API cannot list older forum topics. Detect known threads and name them when a service event is available.
  const created=message.forum_topic_created?.name;
  const renamed=message.forum_topic_edited?.name;
  if (created) {
    await db()`INSERT INTO group_topics(chat_id,thread_id,title,listed)
      VALUES(${chatId},${threadId},${String(created).slice(0,100)},TRUE)
      ON CONFLICT(chat_id,thread_id) DO UPDATE SET title=EXCLUDED.title,listed=TRUE,updated_at=NOW()`;
  } else if (renamed) {
    await db()`INSERT INTO group_topics(chat_id,thread_id,title,listed)
      VALUES(${chatId},${threadId},${String(renamed).slice(0,100)},TRUE)
      ON CONFLICT(chat_id,thread_id) DO UPDATE SET title=EXCLUDED.title,updated_at=NOW()`;
  } else if (threadId===1) {
    await db()`INSERT INTO group_topics(chat_id,thread_id,title,description,listed,sort_order)
      VALUES(${chatId},1,'General','Start here for discussion and rules.',TRUE,0)
      ON CONFLICT(chat_id,thread_id) DO NOTHING`;
  } else {
    // Do not expose guessed topic titles in the directory.
    await db()`INSERT INTO group_topics(chat_id,thread_id,title,listed)
      VALUES(${chatId},${threadId},${'Topic #'+threadId},FALSE)
      ON CONFLICT(chat_id,thread_id) DO NOTHING`;
  }
}

export async function topicLinksBlocked(message, groupLinksEnabled) {
  const threadId=topicIdFromMessage(message);
  if (!threadId) return Boolean(groupLinksEnabled);
  const rows=await db()`SELECT link_policy FROM group_topics WHERE chat_id=${message.chat.id} AND thread_id=${threadId}`;
  const policy=rows[0]?.link_policy || 'inherit';
  if (policy==='allow') return false;
  if (policy==='block') return true;
  return Boolean(groupLinksEnabled);
}

export async function registerTopicByLinkDM(message, raw) {
  const topic=parseTopicLinkRegistration(raw);
  if (!topic) return send(message.chat.id,
    'Usage: /topicadd https://t.me/c/4476272910/123 | Topic Name | Optional description\n\nUse the actual topic link (Copy Topic Link), not an individual message link.');
  const group=await adminGroup(topic.chatId,message.from?.id);
  if (!group) return send(message.chat.id,
    'This topic link does not belong to a registered group that you administer. Add YAJETZY as a group admin first.');
  await db()`INSERT INTO group_topics(chat_id,thread_id,title,description,listed)
    VALUES(${topic.chatId},${topic.threadId},${topic.name},${topic.description},TRUE)
    ON CONFLICT(chat_id,thread_id) DO UPDATE SET
      title=EXCLUDED.title,description=EXCLUDED.description,listed=TRUE,updated_at=NOW()`;
  await logAction(topic.chatId,message.from.id,null,'topic_registered_dm');
  return send(message.chat.id,`✅ Added "${topic.name}" to ${group.title}.\n${topicUrl(topic.chatId,topic.threadId)}\n\nOpen /panel → Topics & Main Menu to review it. Publish / Refresh when the directory is ready.`);
}

export async function registerTopicCommand(message, raw) {
  const parsed=parseTopicRegistration(raw);
  if (!parsed) {
    return send(message.chat.id,'Usage: /topicregister Topic name | Optional short description',{message_thread_id:topicIdFromMessage(message) || undefined});
  }
  if (!message.chat?.is_forum) {
    return send(message.chat.id,'Enable Telegram Topics for this group first.');
  }
  const threadId=topicIdFromMessage(message);
  if (!threadId) return;
  await db()`INSERT INTO group_topics(chat_id,thread_id,title,description,listed)
    VALUES(${message.chat.id},${threadId},${parsed.name},${parsed.description},TRUE)
    ON CONFLICT(chat_id,thread_id) DO UPDATE SET
    title=EXCLUDED.title,description=EXCLUDED.description,listed=TRUE,updated_at=NOW()`;
  await logAction(message.chat.id,message.from.id,null,'topic_registered');
  // Registration should not clutter the group's topic.
  try { await tg('deleteMessage',{chat_id:message.chat.id,message_id:message.message_id}); }
  catch(error) { console.warn('Topic registration command could not be deleted:',error.message); }
  try {
    await send(message.from.id,`✅ Registered ${parsed.name} under ${message.chat.title}.\n${topicUrl(message.chat.id,threadId)}\n\nOpen /panel → Topics & Main Menu to configure it. Then refresh your published menu.`);
  } catch(error) {
    console.warn('Could not DM registering group admin; they may need /start first:',error.message);
  }
}

async function showList(query,chatId) {
  const chat=await adminGroup(chatId,query.from.id);
  if (!chat) {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'You are not an admin of this group.',show_alert:true});
    return;
  }
  await tg('answerCallbackQuery',{callback_query_id:query.id});
  const topics=await allTopics(chatId);
  const buttons=topics.map(t=>[{
    text:`${t.listed?'✅':'⬜'} ${String(t.title).slice(0,43)}`,
    callback_data:`topic:open:${chatId}:${t.thread_id}`
  }]);
  buttons.push([{text:'👁 Preview main menu',callback_data:`topic:preview:${chatId}`}]);
  buttons.push([{text:'📌 Publish / Refresh General menu',callback_data:`topic:publish:${chatId}`}]);
  buttons.push([{text:'↩️ Back to group controls',callback_data:`dm:open:${chatId}`}]);
  return send(query.from.id,
    `🗂️ TOPIC MANAGEMENT — ${chat.title}\n\n${topics.length} topic(s) discovered. ✅ means visible in the directory.\n\nTo add an existing topic privately, copy its Telegram Topic Link and send in THIS chat:\n/topicadd https://t.me/c/4476272910/123 | Topic name | Description\n\nReplace 123 with the actual topic ID from Copy Topic Link. Alternatively, send /topicregister Name | Description inside the target topic; I will try to delete that command.\n\nYou may edit a topic's display name or link policy here. Changes affect the directory only; they don't rename Telegram's actual topic.\n\nPublishing is manual.`,
    {reply_markup:{inline_keyboard:buttons}});
}
async function showTopic(query,chatId,threadId) {
  const group=await adminGroup(chatId,query.from.id);
  if (!group) return tg('answerCallbackQuery',{callback_query_id:query.id,text:'Admins only.',show_alert:true});
  const rows=await db()`SELECT * FROM group_topics WHERE chat_id=${chatId} AND thread_id=${threadId}`;
  if (!rows.length) return tg('answerCallbackQuery',{callback_query_id:query.id,text:'Topic not registered.',show_alert:true});
  const topic=rows[0];
  await tg('answerCallbackQuery',{callback_query_id:query.id});
  const url=topicUrl(chatId,threadId);
  return send(query.from.id,
    `🗂️ ${topic.title}\nGroup: ${group.title}\nTopic ID: ${threadId}\nDescription: ${topic.description || '(none)'}\nListed: ${topic.listed?'YES':'NO'}\nLink rule: ${topic.link_policy.toUpperCase()}\nLink: ${url || 'unavailable'}\n\nLink rule: INHERIT uses the group setting. ALLOW always permits links here. BLOCK removes links here even when group blocking is off.`,
    {reply_markup:{inline_keyboard:[
      [{text:'✏️ Edit directory name',callback_data:`topic:editname:${chatId}:${threadId}`}],
      [{text:'📝 Edit description',callback_data:`topic:editdesc:${chatId}:${threadId}`}],
      [{text:`${topic.listed?'✅':'⬜'} Show in menu`,callback_data:`topic:toggle:${chatId}:${threadId}`}],
      [{text:'🔗 Link policy: '+topic.link_policy.toUpperCase(),callback_data:`topic:policy:${chatId}:${threadId}`}],
      [{text:'↩️ All topics',callback_data:`topic:list:${chatId}`}]
    ]}});
}
async function promptEdit(query,chatId,threadId,field) {
  const group=await adminGroup(chatId,query.from.id);
  if (!group) return tg('answerCallbackQuery',{callback_query_id:query.id,text:'Admins only.',show_alert:true});
  const t=await db()`SELECT title FROM group_topics WHERE chat_id=${chatId} AND thread_id=${threadId}`;
  if (!t.length) return tg('answerCallbackQuery',{callback_query_id:query.id,text:'Unknown topic.',show_alert:true});
  await tg('answerCallbackQuery',{callback_query_id:query.id});
  return send(query.from.id,
    `TOPIC EDIT ${field} ${chatId} ${threadId}\n${t[0].title}\n\nReply with a new ${field==='name'?'directory display name (1–100 characters)':'description (0–350 characters; type a dash to clear)'}.\n\nThis changes only YAJETZY's directory, not the Telegram topic itself.`,
    {reply_markup:{force_reply:true,input_field_placeholder:'Type your update...'}});
}
export async function handleTopicReply(message) {
  if (!message.text || !message.reply_to_message?.from?.is_bot) return false;
  const bot=(process.env.BOT_USERNAME||'').replace(/^@/,'').toLowerCase();
  if (!bot || message.reply_to_message.from.username?.toLowerCase()!==bot) return false;
  const prompt=parseTopicReply(message.reply_to_message.text);
  if (!prompt) return false;
  const group=await adminGroup(prompt.chatId,message.from?.id);
  if (!group) { await send(message.chat.id,'Admin access is required for this group.'); return true; }
  const rows=await db()`SELECT title FROM group_topics WHERE chat_id=${prompt.chatId} AND thread_id=${prompt.threadId}`;
  if (!rows.length) { await send(message.chat.id,'Topic no longer exists in the directory.'); return true; }
  const raw=message.text.trim();
  const title=prompt.field==='name' ? raw : null;
  const description=prompt.field==='description' ? (raw==='-'?'':raw) : null;
  if (prompt.field==='name' && (!title || title.length>100)) {
    await send(message.chat.id,'Topic name must be 1–100 characters. Please reply again to the same prompt.');
    return true;
  }
  if (prompt.field==='description' && description.length>350) {
    await send(message.chat.id,'Description must be no more than 350 characters. Please reply again.');
    return true;
  }
  if (prompt.field==='name') {
    await db()`UPDATE group_topics SET title=${title},listed=TRUE,updated_at=NOW()
      WHERE chat_id=${prompt.chatId} AND thread_id=${prompt.threadId}`;
  } else {
    await db()`UPDATE group_topics SET description=${description},updated_at=NOW()
      WHERE chat_id=${prompt.chatId} AND thread_id=${prompt.threadId}`;
  }
  await logAction(prompt.chatId,message.from.id,null,'topic_edit_'+prompt.field);
  await send(message.chat.id,
    `✅ ${prompt.field==='name'?'Name':'Description'} saved for ${group.title}. If your main menu is published, click Publish / Refresh to apply it there.`);
  return true;
}
async function publishMenu(query,chatId) {
  const group=await adminGroup(chatId,query.from.id);
  if (!group) return tg('answerCallbackQuery',{callback_query_id:query.id,text:'Admins only.',show_alert:true});
  await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Updating General menu...'});
  const menu=await mainMenu(chatId,group.title);
  if (!menu.listedCount) return send(query.from.id,'No listed topics yet. Register a topic first.');
  let msgId=group.menu_message_id;
  let created=false;
  if (msgId) {
    try {
      await tg('editMessageText',{chat_id:chatId,message_id:Number(msgId),text:menu.text,reply_markup:menu.reply_markup});
    } catch(error) {
      if (!String(error.message).includes('message is not modified')) {
        console.warn('Cannot edit existing main menu; posting replacement:',error.message);
        msgId=null;
      }
    }
  }
  if (!msgId) {
    // Do not include a message_thread_id; this targets the forum's General thread.
    const msg=await send(chatId,menu.text,{reply_markup:menu.reply_markup});
    msgId=msg.message_id;
    created=true;
  }
  let pinned=true;
  try {
    await tg('pinChatMessage',{chat_id:chatId,message_id:Number(msgId),disable_notification:true});
  } catch(error) {
    pinned=false;
    console.warn('Main menu published but could not be pinned:',error.message);
  }
  await db()`UPDATE groups SET menu_message_id=${msgId},menu_updated_at=NOW() WHERE chat_id=${chatId}`;
  await logAction(chatId,query.from.id,null,'topic_menu_'+(created?'published':'refreshed'));
  return send(query.from.id,
    `✅ ${created?'Published':'Refreshed'} YAJE topic menu in ${group.title} (General).\nTopics: ${menu.listedCount}\nPinned: ${pinned?'YES':'NO — give bot Pin Messages permission or pin it manually.'}\n\nTo update the directory later, press Publish / Refresh again.`);
}
export async function handleTopicCallback(query) {
  if (!query.from?.id || query.message?.chat?.type!=='private' || query.message.chat.id!==query.from.id) return false;
  const data=String(query.data||'');
  const match=data.match(/^topic:(list|preview|publish):(-?\d+)$/);
  if (match) {
    const chatId=Number(match[2]);
    if (match[1]==='list') return Boolean(await showList(query,chatId) || true);
    if (match[1]==='publish') return Boolean(await publishMenu(query,chatId) || true);
    const group=await adminGroup(chatId,query.from.id);
    if (!group) {await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Admins only.',show_alert:true});return true;}
    await tg('answerCallbackQuery',{callback_query_id:query.id});
    const menu=await mainMenu(chatId,group.title);
    await send(query.from.id,menu.text,{reply_markup:menu.reply_markup});
    return true;
  }
  const detail=data.match(/^topic:(open|toggle|policy|editname|editdesc):(-?\d+):(\d+)$/);
  if (!detail) return false;
  const action=detail[1],chatId=Number(detail[2]),threadId=Number(detail[3]);
  const group=await adminGroup(chatId,query.from.id);
  if (!group) {await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Admins only.',show_alert:true});return true;}
  if (action==='open') {await showTopic(query,chatId,threadId);return true;}
  const rows=await db()`SELECT listed,link_policy FROM group_topics WHERE chat_id=${chatId} AND thread_id=${threadId}`;
  if (!rows.length) {await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Unknown topic.',show_alert:true});return true;}
  if (action==='editname'||action==='editdesc') {
    await promptEdit(query,chatId,threadId,action==='editname'?'name':'description');
    return true;
  }
  if (action==='toggle') {
    const next=!rows[0].listed;
    await db()`UPDATE group_topics SET listed=${next},updated_at=NOW() WHERE chat_id=${chatId} AND thread_id=${threadId}`;
    await logAction(chatId,query.from.id,null,'topic_visibility_changed');
  } else if (action==='policy') {
    const next={inherit:'allow',allow:'block',block:'inherit'}[rows[0].link_policy]||'inherit';
    await db()`UPDATE group_topics SET link_policy=${next},updated_at=NOW() WHERE chat_id=${chatId} AND thread_id=${threadId}`;
    await logAction(chatId,query.from.id,null,'topic_link_policy_'+next);
  }
  await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Saved. Refresh the menu to show changes.'});
  await send(query.from.id,'✅ Topic setting updated. Use Topics & Main Menu to view it. If the published directory changed, press Publish / Refresh.');
  return true;
}
