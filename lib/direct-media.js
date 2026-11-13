import {db} from './db.js';
import {tg,send} from './telegram.js';
import {publicFileAllowed} from './file-policy.mjs';

function normalized(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ');}
export function exactFileForQuery(query,rows=[]){
  const q=normalized(query);
  if(q.length<2)return null;
  const files=rows.filter(f=>publicFileAllowed(f)&&f.delivery_approved===true);
  const aliases=files.filter(f=>{
    const display=normalized(f.display_name);
    const alias=normalized(String(f.display_name||'').split(' · ')[0]);
    return display===q || alias===q || normalized(f.file_name)===q;
  });
  if(aliases.length===1)return aliases[0];
  if(aliases.length>1)return null;
  if(files.length!==1)return null;
  // A fuzzy suggestion alone is not sufficient to send an attachment.
  // Require a literal substring match for the single remaining candidate.
  const file=files[0];
  return normalized(file.display_name).includes(q)||normalized(file.file_name).includes(q)?file:null;
}


export function telegramSendFileCommand(file){
  const id=String(file?.file_id||'').trim();
  const kind=String(file?.media_kind||'').trim();
  const choices={document:['sendDocument','document'],video:['sendVideo','video'],photo:['sendPhoto','photo'],animation:['sendAnimation','animation'],video_note:['sendVideoNote','video_note']};
  if(!id || !choices[kind])return null;
  return {method:choices[kind][0],mediaKey:choices[kind][1],fileId:id};
}

// No preliminary text or list: copy the original Telegram file or video directly
// into the member's current topic. Only records already approved for delivery.
export async function sendMediaOnly(message,items=[],max=2){
  const chatId=Number(message?.chat?.id),userId=Number(message?.from?.id);
  const selected=items.filter(item=>publicFileAllowed(item)&&item.delivery_approved===true)
    .slice(0,Math.max(1,Math.min(2,max)));
  if(!Number.isSafeInteger(chatId)||chatId>=0||
    !Number.isSafeInteger(userId)||userId<1||!selected.length)return false;
  const allowed=await db()`INSERT INTO file_delivery_cooldowns(chat_id,user_id,last_used_at)
    VALUES(${chatId},${userId},NOW())
    ON CONFLICT(chat_id,user_id) DO UPDATE SET last_used_at=NOW()
      WHERE file_delivery_cooldowns.last_used_at<NOW()-INTERVAL '30 seconds'
    RETURNING user_id`;
  if(!allowed.length){
    await send(chatId,'⏳ Please try again in 30 seconds.',{});
    return true;
  }
  const thread=Number(message.message_thread_id);
  const opts=Number.isSafeInteger(thread)&&thread>1?{message_thread_id:thread}:{};
  let delivered=false;
  for(const file of selected){
    const msgId=Number(file.messageId??file.message_id);
    if(!Number.isSafeInteger(msgId)||msgId<1)continue;
    try{
      const direct=telegramSendFileCommand(file);
      if(direct)await tg(direct.method,{
        chat_id:chatId,[direct.mediaKey]:direct.fileId,...opts
      });
      else await tg('copyMessage',{chat_id:chatId,from_chat_id:chatId,message_id:msgId,...opts});
      delivered=true;
    }catch(e){
      console.warn('Direct Telegram media delivery failed:',String(e.message).slice(0,150));
      await send(chatId,
        '⚠️ Hindi maipadala ang actual file/video. Admin: reply sa original attachment gamit ang /save name para ma-refresh ang saved file.',
        opts);
    }
  }
  return delivered;
}
