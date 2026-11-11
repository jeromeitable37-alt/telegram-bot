import {db} from './db.js';
import {send} from './telegram.js';
import {similarityScore,rankedFiles,safeSearchTerm} from './v6-core.mjs';
import {messageLink} from './file-search-helpers.mjs';
const MINI_URL='https://telegram-bot-theta-nine.vercel.app/mini';
const BOT_START='https://t.me/yaje37_bot?start=v6';
function thread(m){return Number(m.message_thread_id)>1?{message_thread_id:m.message_thread_id}:{};}

export async function sendHubEntry(m){
  if(m.chat?.type==='private'){
    return send(m.chat.id,'🚀 YAJETZY V6 — Community Control Center\n\nSearch approved resources, browse topics, confirm rules, open support tickets and access admin review tools.\n\nTap below to launch securely inside Telegram.',{
      reply_markup:{inline_keyboard:[[{text:'🚀 Open YAJETZY V6',web_app:{url:MINI_URL}}]]}
    });
  }
  return send(m.chat.id,'🚀 YAJETZY V6 Community Hub\n\nOpen a private chat with YAJETZY and tap the Mini App button to access the File Center, Support Hub and Smart Search.',{
    ...thread(m),reply_markup:{inline_keyboard:[[{text:'Open YAJETZY V6',url:BOT_START}]]}
  });
}

export async function reportMemberMessage(m,args=''){
  const original=m.reply_to_message;
  if(!original?.message_id||(!original.from?.id&&!original.sender_chat)){
    return send(m.chat.id,'Reply to the concerning message with /report short reason. For private support, use /hub.',thread(m));
  }
  const reason=String(args||'').replace(/\s+/g,' ').trim().slice(0,500);
  if(reason.length<3)return send(m.chat.id,'Usage: Reply to a message with /report short reason (at least 3 characters).',thread(m));
  if(!m.from?.id)return;
  const count=await db()`SELECT COUNT(*)::int AS n FROM member_reports
    WHERE chat_id=${m.chat.id} AND reporter_id=${m.from.id} AND created_at>NOW()-INTERVAL '1 hour'`;
  if(Number(count[0]?.n||0)>=3)return send(m.chat.id,'Report limit reached for now. Moderators can still review your earlier reports.',thread(m));
  await db()`INSERT INTO member_reports(chat_id,reporter_id,target_user_id,target_message_id,reason)
    VALUES(${m.chat.id},${m.from.id},${original.from?.id||null},${original.message_id},${reason})`;
  return send(m.chat.id,'✅ Report received. It is in the YAJETZY admin review queue. No automatic punishment was applied.',thread(m));
}
export async function groupSmartSearch(m,args=''){
  if(!m?.from?.id||!m.chat?.id)return;
  const query=safeSearchTerm(args);
  if(query.length<2)return send(m.chat.id,'Usage: /smart filename or topic (at least two characters).',thread(m));
  const limited=await db()`INSERT INTO file_search_cooldowns(chat_id,user_id,last_used_at) VALUES(${m.chat.id},${m.from.id},NOW())
    ON CONFLICT(chat_id,user_id) DO UPDATE SET last_used_at=NOW()
    WHERE file_search_cooldowns.last_used_at<NOW()-INTERVAL '8 seconds'
    RETURNING user_id`;
  if(!limited.length)return;
  const [files,notes]=await Promise.all([
    db()`SELECT message_id,thread_id,display_name,file_name,indexed_at
      FROM indexed_files WHERE chat_id=${m.chat.id} AND review_status='approved'
      ORDER BY indexed_at DESC LIMIT 300`,
    db()`SELECT slug FROM group_notes WHERE chat_id=${m.chat.id} ORDER BY slug LIMIT 110`
  ]);
  const topFiles=rankedFiles(query,files,4);
  const topNotes=notes.map(x=>({slug:x.slug,score:similarityScore(query,x.slug)}))
    .filter(x=>x.score>=22).sort((a,b)=>b.score-a.score).slice(0,4);
  const texts=[];
  if(topFiles.length)texts.push('📦 Files:\n'+topFiles.map(x=>'• '+x.display_name).join('\n'));
  if(topNotes.length)texts.push('📚 Notes:\n'+topNotes.map(x=>'• #'+x.slug).join('\n'));
  if(!texts.length)texts.push('No approved files or matching notes yet. Try another keyword or ask an admin.');
  const keyboard=topFiles.map(x=>[{text:'📍 '+x.display_name.slice(0,45),url:messageLink(m.chat.id,x.thread_id,x.message_id)}])
    .filter(x=>x[0].url);
  keyboard.push([{text:'🚀 Open Smart Search',url:BOT_START}]);
  return send(m.chat.id,`🔎 YAJETZY Smart Search: "${query}"\n\n${texts.join('\n\n')}\n\nFile links appear after admin review.`,{
    ...thread(m),reply_markup:{inline_keyboard:keyboard}
  });
}
