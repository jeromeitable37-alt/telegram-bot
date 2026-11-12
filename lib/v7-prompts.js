
import {db} from './db.js';
import {send,tg} from './telegram.js';
import {guidedPromptKind} from './v7-search-helpers.mjs';

const config={
  find:{heading:'🔎 YAJETZY FILE SEARCH',text:'Type the filename, topic, or keyword as a REPLY to this message.\n\nExample: screen recorder',placeholder:'Search files, tutorials, guides...'},
  how:{heading:'💬 YAJETZY HOW ASSISTANT',text:'Reply with your tech question.\n\nExample: What is Android rooting and what should I check first?',placeholder:'Type your technology question...'}
};

export async function startGuidedPrompt(message,kind){
  if(!['find','how'].includes(kind)||!message?.chat?.id||!message?.from?.id)return false;
  const opts=config[kind];
  const thread=Number(message.message_thread_id);
  const sendOpts={
    ...(Number.isSafeInteger(thread)&&thread>1?{message_thread_id:thread}:{}),
    ...(message.message_id ? {reply_parameters:{message_id:message.message_id,allow_sending_without_reply:true}}:{}),
    reply_markup:{force_reply:true,selective:true,input_field_placeholder:opts.placeholder}
  };
  const posted=await send(message.chat.id,opts.heading+'\n'+opts.text,sendOpts);
  await db()`INSERT INTO bot_prompt_sessions(chat_id,prompt_message_id,user_id,kind,expires_at)
    VALUES(${message.chat.id},${posted.message_id},${message.from.id},${kind},NOW()+INTERVAL '10 minutes')
    ON CONFLICT(chat_id,prompt_message_id) DO UPDATE SET user_id=EXCLUDED.user_id,
      kind=EXCLUDED.kind,expires_at=EXCLUDED.expires_at`;
  return true;
}
export async function consumeGuidedPromptReply(message){
  if(!message?.chat?.id||!message?.from?.id||!message?.reply_to_message?.message_id||!message?.text)return null;
  const origin=message.reply_to_message;
  if(origin.from?.is_bot!==true||!guidedPromptKind(origin))return null;
  const botUser=(process.env.BOT_USERNAME||'').replace(/^@/,'').toLowerCase();
  if(botUser&&origin.from.username?.toLowerCase()!==botUser)return null;
  const rows=await db()`DELETE FROM bot_prompt_sessions
    WHERE chat_id=${message.chat.id} AND prompt_message_id=${origin.message_id}
      AND user_id=${message.from.id} AND expires_at>NOW()
    RETURNING kind`;
  return rows[0]?.kind||null;
}
export async function reopenSearchPrompt(query){
  if(query.data!=='find:new')return false;
  if(!query?.from?.id||!query.message?.chat||!['group','supergroup'].includes(query.message.chat.type))return true;
  await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Type your next filename in the reply box.'});
  await startGuidedPrompt({
    chat:query.message.chat,
    from:query.from,
    message_thread_id:query.message.message_thread_id
  },'find');
  return true;
}
