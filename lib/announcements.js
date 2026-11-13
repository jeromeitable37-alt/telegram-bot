import {db,logAction} from './db.js';
import {send} from './telegram.js';
import {topicIdFromMessage} from './topic-helpers.mjs';
import {announcementTargets,validAnnouncementThread,announcementDestinationLabel} from './announcement-destinations.mjs';

/** Send identical announcement content to General and the configured topic. */
export async function publishAnnouncement(chatId,text){
  const groups=await db()`SELECT enabled,announcement_thread_id FROM groups WHERE chat_id=${chatId} LIMIT 1`;
  if(!groups[0]?.enabled)throw new Error('This group is not enabled');
  const destinations=announcementTargets(groups[0].announcement_thread_id);
  const result={general:false,announcement:false,configured:destinations.length===2,errors:[]};
  for(const destination of destinations){
    try{
      await send(chatId,text,destination.extra);
      if(destination.label==='General')result.general=true;
      else result.announcement=true;
    }catch(error){
      result.errors.push(destination.label);
      console.warn('Announcement delivery failed in '+destination.label+' for group '+chatId+': '+String(error.message).slice(0,180));
    }
  }
  return result;
}
export function announcementDeliverySummary(result){
  const completed=[result.general?'General':null,result.announcement?'Announcements':null].filter(Boolean);
  if(!completed.length)return '❌ Could not post the announcement. Check the bot\'s posting rights.';
  const line='✅ Posted to '+completed.join(' and ')+'.';
  if(!result.configured)return line+' To also post in Announcements, run /announcetopic here inside that topic.';
  return result.errors.length?line+' ⚠️ Failed in '+result.errors.join(', ')+'. Check bot permissions and topic status.':line;
}
/** Must be called after verifying the human is a real Telegram group admin. */
export async function configureAnnouncementTopic(message,args=''){
  const chatId=Number(message.chat?.id);
  const actorId=Number(message.from?.id);
  if(!Number.isSafeInteger(chatId)||chatId>=0||!Number.isSafeInteger(actorId)||actorId<1)return;
  const value=String(args||'').trim().toLowerCase();
  if(value==='status'){
    const rows=await db()`SELECT announcement_thread_id FROM groups WHERE chat_id=${chatId}`;
    return send(chatId,'📣 Announcement destination: '+announcementDestinationLabel(rows[0]?.announcement_thread_id),
      message.message_thread_id>1?{message_thread_id:message.message_thread_id}:{});
  }
  if(value==='off'){
    await db()`UPDATE groups SET announcement_thread_id=0,updated_at=NOW() WHERE chat_id=${chatId}`;
    await logAction(chatId,actorId,null,'announcement_topic_disabled');
    return send(chatId,'Announcement topic removed. Announcements will post to General only.',
      message.message_thread_id>1?{message_thread_id:message.message_thread_id}:{});
  }
  if(value && value!=='here')return send(chatId,'Usage: open the Announcements topic and send /announcetopic here. For settings: /announcetopic status or /announcetopic off.',
    message.message_thread_id>1?{message_thread_id:message.message_thread_id}:{});
  const thread=validAnnouncementThread(topicIdFromMessage(message));
  if(!message.chat?.is_forum||!thread)return send(chatId,
    'Open the actual Announcements topic first, then send /announcetopic here. General cannot be used as an announcement destination.');
  await db()`UPDATE groups SET announcement_thread_id=${thread},updated_at=NOW() WHERE chat_id=${chatId}`;
  await logAction(chatId,actorId,null,'announcement_topic_configured');
  return send(chatId,'✅ Announcements topic connected! Future /announce posts, private admin announcements, and daily reminders will go to BOTH General and this topic.\n\nTopic ID: '+thread,
    {message_thread_id:thread});
}
