import { db, logAction } from './db.js';
import { tg, send, isAdmin } from './telegram.js';
import { fillWelcome } from './parsing.mjs';
import {welcomeDeliveryOptions} from './welcome-topic-helpers.mjs';
import { publicTopicMenu } from './topics.js';
import {
  groupCommands, privateCommands, parsePhotoPrompt, parseStartTarget,
  makePhotoPrompt, welcomeMarkup, welcomeCaption, publicHelp
} from './experience-helpers.mjs';

async function adminGroup(chatId,userId) {
  if (!Number.isSafeInteger(chatId) || chatId >= 0 || !userId) return null;
  const rows=await db()`SELECT * FROM groups WHERE chat_id=${chatId} AND enabled=TRUE`;
  if (!rows.length || !await isAdmin(chatId,userId)) return null;
  return rows[0];
}
function botName() {
  return (process.env.BOT_USERNAME||'').replace(/^@/,'').trim();
}
async function welcomeMessage(chatId, recipientChatId, settings, personName, title) {
  const text=fillWelcome(settings.welcome_text,personName,title);
  const reply_markup=settings.welcome_buttons ?
    welcomeMarkup(chatId,settings.menu_message_id,botName()) : undefined;
  const targetOptions=welcomeDeliveryOptions(chatId,recipientChatId,settings);
  if (settings.welcome_photo_file_id) {
    try {
      return await tg('sendPhoto',{
        chat_id:recipientChatId,
        photo:settings.welcome_photo_file_id,
        caption:welcomeCaption(text),
        reply_markup,...targetOptions
      });
    } catch(error) {
      // Safe fallback if a photo was deleted or its file_id expired.
      console.warn('Welcome photo failed. Falling back to text:',error.message);
    }
  }
  return send(recipientChatId,text,{reply_markup,...targetOptions});
}
export async function sendWelcomePreviewToTopic(chatId,settings) {
  if(!settings.welcome_thread_id)throw new Error('No welcome topic selected');
  return welcomeMessage(chatId,chatId,settings,'Preview Member',settings.title||'YAJE Discussions');
}
export async function sendWelcome(message,member,settings) {
  const personName=[member.first_name,member.last_name].filter(Boolean).join(' ').slice(0,100)||'Member';
  return welcomeMessage(message.chat.id,message.chat.id,settings,personName,message.chat.title||'the group');
}
export async function handlePhotoReply(m) {
  if (!m?.chat || m.chat.type!=='private' || !m.reply_to_message?.from?.is_bot) return false;
  const username=botName().toLowerCase();
  if (!username || m.reply_to_message.from.username?.toLowerCase()!==username) return false;
  const chatId=parsePhotoPrompt(m.reply_to_message.text);
  if (!chatId) return false;
  const group=await adminGroup(chatId,m.from?.id);
  if (!group) {
    await send(m.chat.id,'You do not have administrator access to that group.');
    return true;
  }
  const fileId=Array.isArray(m.photo) ? m.photo.at(-1)?.file_id : null;
  if (!fileId || typeof fileId!=='string') {
    await send(m.chat.id,'Please reply to the same prompt with a photo (not a document).');
    return true;
  }
  await db()`UPDATE groups SET welcome_photo_file_id=${fileId},
      welcome_last_configured_at=NOW(),updated_at=NOW() WHERE chat_id=${chatId}`;
  await logAction(chatId,m.from.id,null,'welcome_photo_configured');
  await send(m.chat.id,'✅ Welcome photo saved for '+group.title+'. It will be used for future new members. Only a private preview is sent during setup.');
  return true;
}
export async function sendRulesToGroup(m,settings) {
  const menu=await publicTopicMenu(m.chat.id,m.chat.title||settings.title);
  return send(m.chat.id,settings.rules_text,{
    ...(m.message_thread_id ? {message_thread_id:m.message_thread_id}:{}),
    reply_markup:{
      inline_keyboard:[
        [{text:'🗂️ Browse Topics',url:`https://t.me/c/${String(m.chat.id).replace(/^-100/,'')}/${Number(settings.menu_message_id)||1}`}]
      ]
    }
  });
}
export async function sendPublicMenu(m) {
  const menu=await publicTopicMenu(m.chat.id,m.chat.title||'YAJE Discussions');
  const text=menu.listedCount ? menu.text : '🗂️ Topic directory is being prepared. Please check the pinned message in General.';
  return send(m.chat.id,text,{
    ...(m.message_thread_id ? {message_thread_id:m.message_thread_id}:{}),
    ...(menu.listedCount ? {reply_markup:menu.reply_markup}: {})
  });
}
export async function sendBotStatus(m) {
  if (m.chat?.type==='private') {
    return send(m.chat.id,`🟢 YAJETZY is responding.\n\nUse /panel to manage groups or /help for guidance.`);
  }
  const rows=await db()`SELECT welcome_enabled,welcome_thread_id,anti_links,anti_flood,join_queue,
    (SELECT COUNT(*)::int FROM group_topics t WHERE t.chat_id=groups.chat_id AND listed=TRUE) AS topics
    FROM groups WHERE chat_id=${m.chat.id}`;
  if (!rows.length) return send(m.chat.id,'🟢 YAJETZY is responding. Group configuration is being initialized.');
  const data=rows[0];
  return send(m.chat.id,`🟢 YAJETZY — ONLINE\n\nGroup: ${String(m.chat.title||'Telegram Group').slice(0,120)}\nWelcome: ${data.welcome_enabled?'ON':'OFF'}${data.welcome_thread_id?' → Topic #'+data.welcome_thread_id:' → General'}\nRegistered topics: ${data.topics}\nLink filtering: ${data.anti_links?'ON':'OFF'} (topic rules may differ)\nAnti-flood: ${data.anti_flood?'ON':'OFF'}\nJoin approvals: ${data.join_queue?'ON':'OFF'}\n\nFor commands: /help`,{
    ...(m.message_thread_id ? {message_thread_id:m.message_thread_id}:{})
  });
}
export async function sendDeepLinkResponse(m,args) {
  const target=parseStartTarget(args);
  if (!target) return false;
  const rows=await db()`SELECT * FROM groups WHERE chat_id=${target.chatId} AND enabled=TRUE`;
  if (!rows.length) {
    await send(m.chat.id,'That group is not registered with YAJETZY.');
    return true;
  }
  const group=rows[0];
  try {
    const membership=await tg('getChatMember',{chat_id:target.chatId,user_id:m.from.id});
    if (['left','kicked'].includes(membership.status)) {
      await send(m.chat.id,'Join this group first to view its private member resources.');
      return true;
    }
  } catch(error) {
    console.warn('Cannot verify member for deeplink:',error.message);
    await send(m.chat.id,'Could not verify your group membership. Please try again or use /rules inside the group.');
    return true;
  }
  if (target.action==='rules') {
    const menu=await publicTopicMenu(target.chatId,group.title);
    await send(m.chat.id,`📜 ${group.title} — RULES\n\n${group.rules_text}`.slice(0,4096),
      menu.listedCount ? {reply_markup:menu.reply_markup}:{});
  } else if (target.action==='menu') {
    const menu=await publicTopicMenu(target.chatId,group.title);
    await send(m.chat.id,menu.listedCount?menu.text:'No published topics yet.',
      menu.listedCount?{reply_markup:menu.reply_markup}:{});
  } else {
    await send(m.chat.id,publicHelp);
  }
  return true;
}
export async function handleExperienceCallback(query) {
  if (!query?.from?.id || query.message?.chat?.type!=='private' || query.message.chat.id!==query.from.id) return false;
  const match=String(query.data||'').match(/^exp:(photo|clear|preview|commands|buttons):(-?\d+)$/);
  if (!match) return false;
  const type=match[1],chatId=Number(match[2]);
  const group=await adminGroup(chatId,query.from.id);
  if (!group) {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Group administrator access required.',show_alert:true});
    return true;
  }
  await tg('answerCallbackQuery',{callback_query_id:query.id});
  if (type==='photo') {
    await send(query.from.id,makePhotoPrompt(chatId,group.title),{
      reply_markup:{force_reply:true,input_field_placeholder:'Reply with your welcome image'}
    });
  } else if (type==='clear') {
    await db()`UPDATE groups SET welcome_photo_file_id=NULL,welcome_last_configured_at=NOW(),updated_at=NOW() WHERE chat_id=${chatId}`;
    await logAction(chatId,query.from.id,null,'welcome_photo_removed');
    await send(query.from.id,'✅ Welcome photo removed for '+group.title+'. Future joins receive text welcomes.');
  } else if (type==='buttons') {
    const next=!group.welcome_buttons;
    await db()`UPDATE groups SET welcome_buttons=${next},updated_at=NOW() WHERE chat_id=${chatId}`;
    await logAction(chatId,query.from.id,null,'welcome_buttons_'+(next?'on':'off'));
    await send(query.from.id,`Welcome buttons ${next?'ON':'OFF'} for ${group.title}.`);
  } else if (type==='preview') {
    await send(query.from.id,`👀 Private welcome preview — ${group.title}\nThis does NOT post in the group.`);
    await welcomeMessage(chatId,query.from.id,group,'New Member',group.title);
  } else if (type==='commands') {
    await tg('setMyCommands',{commands:groupCommands,scope:{type:'all_group_chats'}});
    await tg('setMyCommands',{commands:privateCommands,scope:{type:'all_private_chats'}});
    await send(query.from.id,'✅ Telegram command menus updated for YAJETZY.\n\nGroup chats: /menu /rules /status /help and more.\nPrivate chat: /panel /groups /topicadd and more.\n\nThis is a bot-wide setting across all groups.');
  }
  return true;
}
