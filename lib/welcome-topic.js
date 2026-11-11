import {db,logAction} from './db.js';
import {tg,send,isAdmin} from './telegram.js';
import {validWelcomeThreadId,welcomeTopicLabel} from './welcome-topic-helpers.mjs';
import {sendWelcomePreviewToTopic} from './experience.js';

function safeChatId(value){
  const id=Number(value);
  return Number.isSafeInteger(id)&&id<0?id:null;
}
async function groupAdmin(chatId,userId){
  if(!safeChatId(chatId)||!userId||!await isAdmin(chatId,userId))return null;
  const r=await db()`SELECT * FROM groups WHERE chat_id=${chatId} AND enabled=TRUE`;
  return r[0]||null;
}
function topicLink(chatId,threadId){
  const match=String(chatId).match(/^-100([1-9]\d+)$/);
  const thread=validWelcomeThreadId(threadId);
  return match&&thread?'https://t.me/c/'+match[1]+'/'+thread:null;
}
async function sendSetup(chatId,userId){
  const group=await groupAdmin(chatId,userId);
  if(!group)return send(userId,'You must be an administrator of this Telegram group.');
  const chosen=validWelcomeThreadId(group.welcome_thread_id);
  const topics=await db()`SELECT thread_id,title FROM group_topics WHERE chat_id=${chatId}
    AND thread_id>1 ORDER BY last_seen_at DESC,thread_id DESC LIMIT 24`;
  const buttons=[
    [{text:'🎉 Create new Welcome topic',callback_data:'wt:create:'+chatId}],
    ...topics.map(t=>[{
      text:(String(t.thread_id)===String(chosen)?'✅ ':'📍 ')+String(t.title).slice(0,39)+' (#'+t.thread_id+')',
      callback_data:'wt:set:'+chatId+':'+t.thread_id
    }]),
    ...(chosen ? [
      [{text:'🖼 Test welcome banner in topic',callback_data:'wt:test:'+chatId}],
      [{text:(group.welcome_clear_join_event?'✅':'⬜')+' Clear General join notices',callback_data:'wt:clean:'+chatId}],
      [{text:'↩️ Send welcomes to General (disable topic)',callback_data:'wt:off:'+chatId}]
    ] : []),
    [{text:'🔙 Back to private panel',callback_data:'dm:open:'+chatId}]
  ];
  const info=`🎉 WELCOME TOPIC — ${group.title}

Current destination: ${welcomeTopicLabel(group)}
${chosen?'Join notice cleanup: '+(group.welcome_clear_join_event?'ON':'OFF'):'Welcome banner still goes to General until you select or create a topic.'}

Choose a registered topic, or let YAJETZY create a fresh 🎉 Welcome topic.

After setup, new members receive the existing welcome image, text and buttons IN that topic—not in General.
${chosen?'\n'+topicLink(chatId,chosen):''}

Note: Removing Telegram's automatic "joined" service message from General needs YAJETZY to have Delete Messages admin permission. If missing, the banner still goes to Welcome, but Telegram may show the system notice in General.`;
  return send(userId,info,{reply_markup:{inline_keyboard:buttons}});
}
export async function handleWelcomeTopicCallback(query){
  const data=String(query?.data||'');
  const match=data.match(/^wt:(list|create|set|test|clean|off):(-?\d+)(?::(\d+))?$/);
  if(!match)return false;
  if(query.message?.chat?.type!=='private'||query.from?.id!==query.message.chat.id)return true;
  const action=match[1],chatId=safeChatId(match[2]),userId=query.from.id;
  if(!chatId)return true;
  const group=await groupAdmin(chatId,userId);
  if(!group){
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Group admin access required.',show_alert:true});
    return true;
  }
  await tg('answerCallbackQuery',{callback_query_id:query.id});
  try{
    if(action==='list')return await sendSetup(chatId,userId);
    if(action==='create'){
      if(validWelcomeThreadId(group.welcome_thread_id)){
        await send(userId,'Already assigned to a welcome topic. Select a different topic below or disable the old one first.');
        return sendSetup(chatId,userId);
      }
      const bot=await tg('getMe');
      const [me,actor,chat]=await Promise.all([
        tg('getChatMember',{chat_id:chatId,user_id:bot.id}),
        tg('getChatMember',{chat_id:chatId,user_id:userId}),
        tg('getChat',{chat_id:chatId})
      ]);
      const allowed=member=>member.status==='creator'||(member.status==='administrator'&&member.can_manage_topics===true);
      if(!chat.is_forum){
        return send(userId,'YAJE Discussions must have Topics enabled before creating a Welcome topic.');
      }
      if(!allowed(me)||!allowed(actor)){
        return send(userId,'Enable Manage Topics for YAJETZY and your admin account in Group → Administrators, then try again.');
      }
      const topic=await tg('createForumTopic',{chat_id:chatId,name:'🎉 Welcome'});
      const thread=validWelcomeThreadId(topic.message_thread_id);
      if(!thread)throw new Error('Telegram returned an invalid topic ID');
      await db()`INSERT INTO group_topics(chat_id,thread_id,title,description,listed,sort_order,file_index_enabled)
        VALUES(${chatId},${thread},'🎉 Welcome','Welcome banners and new member greetings.',TRUE,15,FALSE)
        ON CONFLICT(chat_id,thread_id) DO UPDATE SET title='🎉 Welcome',listed=TRUE,file_index_enabled=FALSE,updated_at=NOW()`;
      await db()`UPDATE groups SET welcome_thread_id=${thread},welcome_clear_join_event=TRUE,
        welcome_enabled=TRUE,updated_at=NOW() WHERE chat_id=${chatId}`;
      await logAction(chatId,userId,null,'welcome_topic_created');
      await send(userId,'✅ Created 🎉 Welcome and routed future welcome banners to '+topicLink(chatId,thread)+
        '\nExisting photo + welcome buttons are preserved. General will no longer receive bot welcome banners.\n\nRefresh the General topic directory from Topics & Main Menu if you want the new Welcome topic to appear in the pinned directory.');
      return sendSetup(chatId,userId);
    }
    if(action==='set'){
      const thread=validWelcomeThreadId(match[3]);
      if(!thread)return send(userId,'Invalid topic ID.');
      const rows=await db()`SELECT title FROM group_topics WHERE chat_id=${chatId} AND thread_id=${thread}`;
      if(!rows.length)return send(userId,'That topic was not registered. Create or register it first.');
      if(/^Topic [#\d(]/i.test(rows[0].title)||/^Topic #?\d+$/i.test(rows[0].title)){
        await db()`UPDATE group_topics SET title='🎉 Welcome',listed=TRUE,file_index_enabled=FALSE,updated_at=NOW()
          WHERE chat_id=${chatId} AND thread_id=${thread}`;
      }
      await db()`UPDATE groups SET welcome_thread_id=${thread},welcome_enabled=TRUE,updated_at=NOW() WHERE chat_id=${chatId}`;
      await logAction(chatId,userId,null,'welcome_topic_selected');
      await send(userId,'✅ Welcome banner destination saved: '+topicLink(chatId,thread)+
        '\nNew member banners will be sent there. Existing welcome image and buttons stay the same.');
      return sendSetup(chatId,userId);
    }
    if(action==='off'){
      await db()`UPDATE groups SET welcome_thread_id=NULL,updated_at=NOW() WHERE chat_id=${chatId}`;
      await logAction(chatId,userId,null,'welcome_topic_disabled');
      await send(userId,'Welcome topic routing disabled. Future welcome banners will appear in General again.');
      return sendSetup(chatId,userId);
    }
    if(action==='clean'){
      const next=!group.welcome_clear_join_event;
      await db()`UPDATE groups SET welcome_clear_join_event=${next},updated_at=NOW() WHERE chat_id=${chatId}`;
      await logAction(chatId,userId,null,'welcome_clear_join_'+(next?'on':'off'));
      await send(userId,'Clear native join service notices in General: '+(next?'ON':'OFF')+
        '. If ON, bot requires Delete Messages permission. Failed deletions do not stop Welcome topic banners.');
      return sendSetup(chatId,userId);
    }
    if(action==='test'){
      if(!validWelcomeThreadId(group.welcome_thread_id))return send(userId,'Choose or create a Welcome topic first.');
      await sendWelcomePreviewToTopic(chatId,group);
      await send(userId,'🖼️ Preview welcome banner posted in '+topicLink(chatId,group.welcome_thread_id)+
        '. Check the actual topic; this test did not add a member.');
      return true;
    }
  }catch(error){
    console.error('Welcome topic configuration failed:',action,error.message);
    await send(userId,'⚠️ Could not finish welcome topic setup. Make sure YAJETZY has Manage Topics / Post Messages permission. If it was created but not saved, select the new topic in the menu. Error: '+String(error.message).slice(0,180));
    return true;
  }
  return false;
}
