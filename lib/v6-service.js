import {db,logAction} from './db.js';
import {tg,send} from './telegram.js';
import {messageLink} from './file-search-helpers.mjs';
import {topicUrl} from './topic-helpers.mjs';
import {ensureSecurityWebhook} from './security-shield.js';
import {publicFileAllowed,restrictedFileName} from './file-policy.mjs';
import {askHowInApp} from './how-assistant.js';
import {searchFederatedFiles} from './federated-files.js';
import {verifyTelegramInitData,safeSearchTerm,similarityScore,rankedFiles} from './v6-core.mjs';

const OUT={headers:{'cache-control':'no-store'}};
const no=(message,status=400)=>Response.json({ok:false,error:message},{status,...OUT});
const yes=(payload)=>Response.json({ok:true,...payload},OUT);
const validId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const validChatId=x=>Number.isSafeInteger(Number(x))&&Number(x)<-100000000;
async function authenticate(request){
  const data=request.headers.get('x-telegram-init-data')||'';
  return verifyTelegramInitData(data,process.env.BOT_TOKEN||'');
}
async function memberGroup(chatId,userId){
  if(!validChatId(chatId))return null;
  const rows=await db()`SELECT chat_id,title,enabled,rules_text FROM groups WHERE chat_id=${Number(chatId)} AND enabled=TRUE`;
  if(!rows.length)return null;
  try{
    const member=await tg('getChatMember',{chat_id:Number(chatId),user_id:userId});
    if(!['member','administrator','creator','restricted'].includes(member.status))return null;
    if(member.status==='restricted'&&member.is_member===false)return null;
    return {...rows[0],admin:['administrator','creator'].includes(member.status),
      canPost:member.status!=='restricted'||member.can_send_messages===true,userId};
  }catch(error){
    console.warn('V6 group membership check unavailable:',error.message);
    return null;
  }
}
async function listGroups(userId){
  const candidates=await db()`SELECT chat_id,title FROM groups WHERE enabled=TRUE ORDER BY title LIMIT 20`;
  const responses=await Promise.allSettled(candidates.map(row=>memberGroup(row.chat_id,userId)));
  return responses.filter(r=>r.status==='fulfilled'&&r.value).map(r=>({
    chatId:String(r.value.chat_id),title:r.value.title,admin:r.value.admin
  }));
}
function cleanText(raw,max=500){return String(raw||'').replace(/[\u0000-\u0008\u000e-\u001f]/g,'').trim().slice(0,max);}
function jsonFile(chatId,r,admin=false){
  const link=messageLink(chatId,r.thread_id,r.message_id);
  return {id:String(r.message_id),name:r.display_name,threadId:String(r.thread_id),
    link:admin||r.review_status==='approved'?link:null,reviewStatus:r.review_status,
    approvedForDelivery:r.delivery_approved===true&&!restrictedFileName(r),createdAt:r.indexed_at,
    mime:r.mime_type||''};
}
async function snapshot(chatId,user){
  const group=await memberGroup(chatId,user.id);
  if(!group)return no('You must be a member of this group to open its hub.',403);
  const [topics,notes,files,myTickets,acknowledgment]=await Promise.all([
    group.admin?db()`SELECT thread_id,title,description,listed,file_index_enabled FROM group_topics
      WHERE chat_id=${chatId} ORDER BY sort_order,thread_id LIMIT 50`:
    db()`SELECT thread_id,title,description,listed,file_index_enabled FROM group_topics
      WHERE chat_id=${chatId} AND listed=TRUE ORDER BY sort_order,thread_id LIMIT 50`,
    db()`SELECT slug,LEFT(content,1000) AS content FROM group_notes
      WHERE chat_id=${chatId} ORDER BY slug LIMIT 110`,
    group.admin?
      db()`SELECT message_id,thread_id,display_name,mime_type,review_status,delivery_approved,indexed_at
        FROM indexed_files WHERE chat_id=${chatId} ORDER BY indexed_at DESC LIMIT 200`:
      db()`SELECT message_id,thread_id,display_name,mime_type,review_status,delivery_approved,indexed_at
        FROM indexed_files WHERE chat_id=${chatId} AND review_status='approved' ORDER BY indexed_at DESC LIMIT 150`,
    db()`SELECT id,message,status,admin_reply,updated_at FROM support_tickets
      WHERE chat_id=${chatId} AND user_id=${user.id} ORDER BY created_at DESC LIMIT 20`,
    db()`SELECT rules_ack_at FROM member_onboarding WHERE chat_id=${chatId} AND user_id=${user.id}`
  ]);
  let adminData=null;
  if(group.admin){
    const [reports,tickets,stats,logs,security,securityEvents]=await Promise.all([
      db()`SELECT id,reporter_id,target_user_id,target_message_id,reason,status,created_at
        FROM member_reports WHERE chat_id=${chatId} ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 80`,
      db()`SELECT id,user_id,message,status,admin_reply,updated_at FROM support_tickets
        WHERE chat_id=${chatId} ORDER BY CASE WHEN status='open' THEN 0 ELSE 1 END,updated_at DESC LIMIT 80`,
      db()`SELECT
        (SELECT COUNT(*)::int FROM indexed_files WHERE chat_id=${chatId}) AS files,
        (SELECT COUNT(*)::int FROM indexed_files WHERE chat_id=${chatId} AND review_status='pending') AS pending_files,
        (SELECT COUNT(*)::int FROM member_reports WHERE chat_id=${chatId} AND status='pending') AS reports,
        (SELECT COUNT(*)::int FROM support_tickets WHERE chat_id=${chatId} AND status='open') AS open_tickets,
        (SELECT COUNT(*)::int FROM moderation_logs WHERE chat_id=${chatId} AND created_at>NOW()-INTERVAL '7 days') AS actions_7d`,
      db()`SELECT action,created_at FROM moderation_logs WHERE chat_id=${chatId} ORDER BY created_at DESC LIMIT 12`,
      db()`SELECT security_shield_enabled,security_block_bots,security_newcomer_links,
        security_newcomer_media,security_sensitive_spam,security_auto_mute
        FROM groups WHERE chat_id=${chatId}`,
      db()`SELECT user_id,reason,action,created_at FROM security_events
        WHERE chat_id=${chatId} ORDER BY created_at DESC LIMIT 35`
    ]);
    adminData={reports:reports.map(r=>({...r,id:String(r.id),targetUserId:r.target_user_id?String(r.target_user_id):null})),
      tickets:tickets.map(t=>({...t,id:String(t.id),userId:String(t.user_id)})),
      stats:stats[0]||{},logs,security:security[0]||{},securityEvents:securityEvents.map(e=>({...e,user_id:String(e.user_id)}))};
  }
  return yes({
    group:{id:String(group.chat_id),title:group.title,admin:group.admin,rules:group.rules_text},
    user:{id:String(user.id),name:user.first_name,username:user.username},
    topics:topics.map(t=>({...t,id:String(t.thread_id),
      url:topicUrl(chatId,t.thread_id)})),
    notes,
    files:files.filter(r=>group.admin||publicFileAllowed(r)).map(r=>jsonFile(chatId,r,group.admin)),
    myTickets:myTickets.map(t=>({...t,id:String(t.id)})),
    rulesAccepted:Boolean(acknowledgment.length),
    adminData
  });
}
async function doSearch(chatId,user,search){
  const group=await memberGroup(chatId,user.id);
  if(!group)return no('Not a member of this group.',403);
  const term=safeSearchTerm(search);
  if(term.length<2)return no('Search at least two characters.');
  const [files,notes]=await Promise.all([
    group.admin?db()`SELECT message_id,thread_id,display_name,file_name,review_status,delivery_approved,mime_type,indexed_at
      FROM indexed_files WHERE chat_id=${chatId} AND review_status!='rejected' ORDER BY indexed_at DESC LIMIT 350`:
    db()`SELECT message_id,thread_id,display_name,file_name,review_status,delivery_approved,mime_type,indexed_at
      FROM indexed_files WHERE chat_id=${chatId} AND review_status='approved' ORDER BY indexed_at DESC LIMIT 350`,
    db()`SELECT slug,LEFT(content,1000) AS content FROM group_notes WHERE chat_id=${chatId} ORDER BY slug LIMIT 110`
  ]);
  const foundNotes=notes.map(n=>({...n,score:similarityScore(term,n.slug)}))
    .filter(n=>n.score>=20).sort((a,b)=>b.score-a.score).slice(0,12)
    .map(({score,...n})=>n);
  return yes({files:rankedFiles(term,files.filter(publicFileAllowed)).map(r=>jsonFile(chatId,r,group.admin)),notes:foundNotes});
}
async function writeAction(chatId,user,action,body){
  const group=await memberGroup(chatId,user.id);
  if(!group)return no('Not a current group member.',403);
  const adminOnly=new Set(['file_review','report_review','ticket_answer','topic_update','announce','import_links','security_toggle']);
  if(adminOnly.has(action)&&!group.admin)return no('Telegram group administrator permission required.',403);

  // These member actions still require a fresh verified Telegram group membership.
  if(action==='ask_ai'){
    const result=await askHowInApp(chatId,user.id,body.question);
    if(result.error)return no(result.error,result.status||400);
    return yes({answer:result.answer,mode:result.mode,notice:result.notice||null});
  }
  if(action==='file_send'){
    if(!group.canPost)return no('This Telegram member account cannot post in the discussion.',403);
    if(!validId(body.messageId)||!validId(body.threadId))return no('Choose a file and Telegram discussion topic.');
    const sourceId=Number(body.messageId),topicId=Number(body.threadId);
    const [records,topics]=await Promise.all([
      db()`SELECT message_id,thread_id,display_name,file_name,review_status,delivery_approved
        FROM indexed_files WHERE chat_id=${chatId} AND message_id=${sourceId} LIMIT 1`,
      db()`SELECT title,listed FROM group_topics WHERE chat_id=${chatId} AND thread_id=${topicId} LIMIT 1`
    ]);
    if(!records.length||records[0].delivery_approved!==true||!publicFileAllowed(records[0])){
      return no('This file is not approved for public delivery.',403);
    }
    if(!topics.length||(!topics[0].listed&&!group.admin)){
      return no('Choose a visible Telegram discussion topic.',403);
    }
    const cooldown=await db()`INSERT INTO file_delivery_cooldowns(chat_id,user_id,last_used_at)
      VALUES(${chatId},${user.id},NOW())
      ON CONFLICT(chat_id,user_id) DO UPDATE SET last_used_at=NOW()
      WHERE file_delivery_cooldowns.last_used_at<NOW()-INTERVAL '30 seconds'
      RETURNING user_id`;
    if(!cooldown.length)return no('Please wait 30 seconds before sending another file.',429);
    try{
      const result=await tg('copyMessage',{
        chat_id:chatId,from_chat_id:chatId,message_id:sourceId,
        ...(topicId>1?{message_thread_id:topicId}:{})
      });
      await logAction(chatId,user.id,null,'mini_file_sent');
      return yes({sent:true,topicName:topics[0].title,
        link:messageLink(chatId,topicId,result.message_id)});
    }catch(error){
      console.warn('Mini App approved Telegram file copy failed:',String(error.message).slice(0,170));
      return no('Telegram could not send this file. The source post may have been deleted or the target topic may be closed.',502);
    }
  }
  if(action==='rules_ack'){
    await db()`INSERT INTO member_onboarding(chat_id,user_id) VALUES (${chatId},${user.id})
      ON CONFLICT(chat_id,user_id) DO UPDATE SET rules_ack_at=NOW()`;
    return yes({saved:true});
  }
  if(action==='ticket_create'){
    const message=cleanText(body.message,1000);
    if(message.length<5)return no('Please describe the issue with at least five characters.');
    const recent=await db()`SELECT COUNT(*)::int AS n FROM support_tickets
      WHERE chat_id=${chatId} AND user_id=${user.id} AND created_at>NOW()-INTERVAL '1 hour'`;
    if(Number(recent[0].n)>=3)return no('Ticket limit reached. Try again later.',429);
    const rows=await db()`INSERT INTO support_tickets(chat_id,user_id,message) VALUES (${chatId},${user.id},${message}) RETURNING id`;
    return yes({created:true,id:String(rows[0].id)});
  }
  if(action==='report_create'){
    const reason=cleanText(body.reason,500);
    if(reason.length<3)return no('Please include a report reason.');
    const recent=await db()`SELECT COUNT(*)::int AS n FROM member_reports
      WHERE chat_id=${chatId} AND reporter_id=${user.id} AND created_at>NOW()-INTERVAL '1 hour'`;
    if(Number(recent[0].n)>=3)return no('Report limit reached. Try again later.',429);
    const target=validId(body.targetUserId)?Number(body.targetUserId):null;
    const messageId=validId(body.messageId)?Number(body.messageId):null;
    const rows=await db()`INSERT INTO member_reports(chat_id,reporter_id,target_user_id,target_message_id,reason)
      VALUES(${chatId},${user.id},${target},${messageId},${reason}) RETURNING id`;
    return yes({created:true,id:String(rows[0].id)});
  }
  if(action==='file_review'){
    if(!validId(body.messageId)||!['approved','pending','rejected'].includes(body.status))return no('Invalid file review action.');
    if(body.status==='approved'){
      const existing=await db()`SELECT display_name,file_name FROM indexed_files
        WHERE chat_id=${chatId} AND message_id=${Number(body.messageId)} LIMIT 1`;
      if(!existing.length)return no('File not found.',404);
      if(restrictedFileName(existing[0]))return no('This upload is restricted from public file delivery.',403);
    }
    const reviewed=body.status;
    const rows=await db()`UPDATE indexed_files SET review_status=${reviewed},
      reviewed_by=${user.id},reviewed_at=NOW(),delivery_approved=${reviewed==='approved'}
      WHERE chat_id=${chatId} AND message_id=${Number(body.messageId)} RETURNING message_id`;
    if(!rows.length)return no('File not found.',404);
    await logAction(chatId,user.id,null,'v6_file_'+reviewed);
    return yes({saved:true});
  }
  if(action==='report_review'){
    if(!validId(body.id)||!['reviewed','dismissed','pending'].includes(body.status))return no('Invalid report update.');
    const rows=await db()`UPDATE member_reports SET status=${body.status},reviewed_by=${user.id},reviewed_at=NOW()
      WHERE chat_id=${chatId} AND id=${Number(body.id)} RETURNING id`;
    if(!rows.length)return no('Report not found.',404);
    await logAction(chatId,user.id,null,'v6_report_'+body.status);
    return yes({saved:true});
  }
  if(action==='ticket_answer'){
    if(!validId(body.id))return no('Invalid support ticket.');
    const answer=cleanText(body.answer,1000);
    const close=body.close===true;
    if(!close&&answer.length<2)return no('Reply cannot be empty.');
    const rows=await db()`UPDATE support_tickets SET admin_reply=CASE WHEN ${answer.length>0} THEN ${answer} ELSE admin_reply END,
      status=${close?'closed':'answered'},reviewed_by=${user.id},updated_at=NOW()
      WHERE chat_id=${chatId} AND id=${Number(body.id)} RETURNING user_id`;
    if(!rows.length)return no('Ticket not found.',404);
    await logAction(chatId,user.id,null,close?'v6_ticket_closed':'v6_ticket_answered');
    if(answer.length>1){
      try{await send(Number(rows[0].user_id),`🎟️ YAJETZY Support #${body.id}\n${answer.slice(0,700)}`);}
      catch(error){console.warn('Could not DM support response (member may not have started the bot):',error.message);}
    }
    return yes({saved:true});
  }
  if(action==='security_toggle'){
    const key=String(body.field||''),val=body.enabled;
    if(typeof val!=='boolean'||!['security_shield_enabled','security_block_bots',
      'security_newcomer_links','security_newcomer_media','security_sensitive_spam',
      'security_auto_mute'].includes(key))return no('Invalid security setting.');
    if(key==='security_shield_enabled')await db()`UPDATE groups SET security_shield_enabled=${val},updated_at=NOW() WHERE chat_id=${chatId}`;
    if(key==='security_block_bots')await db()`UPDATE groups SET security_block_bots=${val},updated_at=NOW() WHERE chat_id=${chatId}`;
    if(key==='security_newcomer_links')await db()`UPDATE groups SET security_newcomer_links=${val},updated_at=NOW() WHERE chat_id=${chatId}`;
    if(key==='security_newcomer_media')await db()`UPDATE groups SET security_newcomer_media=${val},updated_at=NOW() WHERE chat_id=${chatId}`;
    if(key==='security_sensitive_spam')await db()`UPDATE groups SET security_sensitive_spam=${val},updated_at=NOW() WHERE chat_id=${chatId}`;
    if(key==='security_auto_mute')await db()`UPDATE groups SET security_auto_mute=${val},updated_at=NOW() WHERE chat_id=${chatId}`;
    await logAction(chatId,user.id,null,'v6_shield_'+key+'_'+(val?'on':'off'));
    if(key==='security_shield_enabled'&&val){
      try{await ensureSecurityWebhook();}catch(error){console.warn('Security webhook sync failed:',error.message);}
    }
    return yes({saved:true});
  }
  if(action==='topic_update'){
    if(!validId(body.threadId)||!['listed','file_index_enabled'].includes(body.field)||typeof body.enabled!=='boolean')return no('Invalid topic setting.');
    const id=Number(body.threadId),val=body.enabled;
    const rows=body.field==='listed'?
      await db()`UPDATE group_topics SET listed=${val},updated_at=NOW() WHERE chat_id=${chatId} AND thread_id=${id} RETURNING thread_id`:
      await db()`UPDATE group_topics SET file_index_enabled=${val},updated_at=NOW() WHERE chat_id=${chatId} AND thread_id=${id} RETURNING thread_id`;
    if(!rows.length)return no('Topic not found.',404);
    await logAction(chatId,user.id,null,'v6_topic_'+body.field+'_'+(val?'on':'off'));
    return yes({saved:true,note:'Refresh General pinned menu separately from /panel to publish visible topic changes.'});
  }
  if(action==='announce'){
    const message=cleanText(body.message,600);
    if(body.confirm!==true||message.length<5)return no('Please confirm an announcement with at least five characters.');
    await send(chatId,'📣 YAJE Announcement\n\n'+message);
    await logAction(chatId,user.id,null,'v6_announcement');
    return yes({sent:true});
  }
  if(action==='import_links'){
    const rows=String(body.entries||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!rows.length||rows.length>30)return no('Paste 1–30 message links, each followed by | filename.');
    const parsed=[];
    for(const line of rows){
      const pair=line.split('|').map(x=>x.trim());
      if(pair.length!==2||pair[1].length<2||pair[1].length>200)return no('Format every line: https://t.me/c/GROUP/TOPIC/MESSAGE | filename');
      const match=pair[0].match(/^https:\/\/t\.me\/c\/([1-9]\d+)\/([1-9]\d+)\/([1-9]\d+)\/?$/);
      if(!match||('-100'+match[1])!==String(chatId))return no('Each URL must link to a message in the selected group topic.');
      parsed.push({thread:Number(match[2]),message:Number(match[3]),name:pair[1]});
    }
    for(const file of parsed){
      await db()`INSERT INTO indexed_files(chat_id,message_id,thread_id,display_name,file_name,review_status,manually_added)
        VALUES(${chatId},${file.message},${file.thread},${file.name},${file.name},'pending',TRUE)
        ON CONFLICT(chat_id,message_id) DO NOTHING`;
    }
    await logAction(chatId,user.id,null,'v6_link_import_'+parsed.length);
    return yes({added:parsed.length,note:'Links are pending review. Telegram cannot verify file contents from a pasted message URL.'});
  }
  return no('Unknown action.',404);
}
export async function v6Get(request){
  if(!process.env.BOT_TOKEN)return no('Server not configured.',503);
  const user=await authenticate(request);
  if(!user)return no('Open YAJETZY inside Telegram to verify your identity.',401);
  const url=new URL(request.url);
  const mode=url.searchParams.get('mode')||'bootstrap';
  if(mode==='bootstrap')return yes({user:{id:String(user.id),name:user.first_name},groups:await listGroups(user.id)});
  if(mode==='searchall'){
    const query=safeSearchTerm(url.searchParams.get('q'));
    if(query.length<2||query.length>60)return no('Enter a search keyword between 2 and 60 characters.');
    const limit=await db()`INSERT INTO federated_search_cooldowns(user_id,last_at)
      VALUES(${user.id},NOW())
      ON CONFLICT(user_id) DO UPDATE SET last_at=NOW()
      WHERE federated_search_cooldowns.last_at<NOW()-INTERVAL '8 seconds'
      RETURNING user_id`;
    if(!limit.length)return no('Please wait 8 seconds before another connected-group search.',429);
    const result=await searchFederatedFiles(user.id,query);
    if(result.error)return yes({files:[],notes:[],groups:result.groups,errorMessage:result.error});
    return yes({files:result.files,notes:[],groups:result.groups,searchScope:'all'});
  }
  const chatId=Number(url.searchParams.get('chatId'));
  if(!validChatId(chatId))return no('Select a group.');
  if(mode==='snapshot')return snapshot(chatId,user);
  if(mode==='search')return doSearch(chatId,user,url.searchParams.get('q'));
  return no('Unknown request.',404);
}
export async function v6Post(request){
  if(!process.env.BOT_TOKEN)return no('Server not configured.',503);
  const user=await authenticate(request);
  if(!user)return no('Open YAJETZY inside Telegram to verify your identity.',401);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return no('Expected JSON request.');
  let body;try{body=await request.json();}catch{return no('Invalid JSON.');}
  const chatId=Number(body?.chatId),action=String(body?.action||'');
  if(!validChatId(chatId))return no('Choose a valid group.');
  try{return await writeAction(chatId,user,action,body||{});}
  catch(error){console.error('V6 request failed:',action,error.message);return no('Unable to complete the action. Check bot permissions or try again.',500);}
}
