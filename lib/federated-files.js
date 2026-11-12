import {db,logAction} from './db.js';
import {tg,send,isAdmin} from './telegram.js';
import {messageLink,normalizeQuery} from './file-search-helpers.mjs';
import {rankedFiles} from './v6-core.mjs';
import {publicFileAllowed} from './file-policy.mjs';

const MAX_GROUPS=15;
const isActualMember=m=>m && ['creator','administrator','member','restricted'].includes(m.status)
  && !(m.status==='restricted' && m.is_member===false);
const isAdminMember=m=>m && ['creator','administrator'].includes(m.status);

export function federationGroupLabel(row) {
  return String(row?.title||'Telegram group').slice(0,90);
}
export function federationSearchItem(group,file) {
  return {
    id:String(file.message_id),
    name:String(file.display_name||file.file_name||'Shared file').slice(0,200),
    sourceChatId:String(group.chat_id),
    sourceGroup:federationGroupLabel(group),
    threadId:String(file.thread_id),
    link:messageLink(Number(group.chat_id),file.thread_id,file.message_id),
    mime:String(file.mime_type||''),
    reviewStatus:'approved',
    approvedForDelivery:false, // Never auto-export private media into another group.
    createdAt:file.indexed_at||null
  };
}

// An opted-in group's files are visible only when the requester is still
// a member and the bot is still a group admin, verified live via Telegram.
export async function accessibleFederatedGroups(userId) {
  if(!Number.isSafeInteger(Number(userId))||Number(userId)<1)return [];
  const rows=await db()`SELECT chat_id,title FROM groups
    WHERE enabled=TRUE AND federated_search_enabled=TRUE
      AND chat_id < -100000000
    ORDER BY title LIMIT ${MAX_GROUPS}`;
  if(!rows.length)return [];
  const me=await tg('getMe');
  const checked=await Promise.allSettled(rows.map(async group=>{
    const [bot,user]=await Promise.all([
      tg('getChatMember',{chat_id:Number(group.chat_id),user_id:me.id}),
      tg('getChatMember',{chat_id:Number(group.chat_id),user_id:Number(userId)})
    ]);
    return isAdminMember(bot)&&isActualMember(user)?group:null;
  }));
  return checked.flatMap((result,i)=>result.status==='fulfilled'&&result.value?[result.value]:[]);
}
export async function searchFederatedFiles(userId,rawQuery){
  const query=normalizeQuery(rawQuery);
  if(!query)return {query:'',files:[],groups:[],error:'Type at least 2 letters (up to 60).'};
  const groups=await accessibleFederatedGroups(userId);
  if(!groups.length)return {query,files:[],groups:[],
    error:'No connected groups available. Ask a group admin to add YAJETZY and enable /filehub on.'};
  const results=await Promise.allSettled(groups.map(async group=>{
    const files=await db()`SELECT message_id,thread_id,display_name,file_name,
      mime_type,review_status,delivery_approved,indexed_at
      FROM indexed_files WHERE chat_id=${Number(group.chat_id)}
        AND review_status='approved' ORDER BY indexed_at DESC LIMIT 180`;
    return files.filter(publicFileAllowed).map(file=>({...file,_group:group}));
  }));
  const flattened=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  const ranked=rankedFiles(query,flattened,16);
  return {
    query,
    files:ranked.map(file=>federationSearchItem(file._group,file)).filter(file=>file.link),
    groups:groups.map(group=>({id:String(group.chat_id),name:federationGroupLabel(group)}))
  };
}

export async function changeFileFederation(message,args='') {
  const chat=message.chat,userId=message.from?.id;
  if(!chat||!['group','supergroup'].includes(chat.type)||!userId)return false;
  if(!await isAdmin(chat.id,userId))return send(chat.id,'Only a Telegram group administrator can enable shared file search.');
  const value=String(args).trim().toLowerCase();
  if(!['on','off','status',''].includes(value))return send(chat.id,
    'Usage: /filehub on | /filehub off | /filehub status');
  if(value==='on'){
    if(chat.type!=='supergroup')return send(chat.id,
      'To share private Telegram post links, convert this group to a supergroup (forum topics are optional).');
    const bot=await tg('getMe');
    const role=await tg('getChatMember',{chat_id:chat.id,user_id:bot.id});
    if(!isAdminMember(role))return send(chat.id,
      'An authorized group admin must make YAJETZY a group administrator before enabling multi-group file search. The bot requires that role to verify members and receive new uploads.');
    await db()`UPDATE groups SET federated_search_enabled=TRUE,
      file_autoindex_enabled=TRUE,updated_at=NOW() WHERE chat_id=${chat.id}`;
    await logAction(chat.id,userId,null,'filehub_federation_on');
    return send(chat.id,`✅ YAJETZY File Hub enabled for ${String(chat.title||'this group').slice(0,80)}.

New files in a regular supergroup enter the admin review queue. In forum groups, enable auto-indexing separately for each permitted topic.
Only reviewed files appear in cross-group results, and only to verified members of THIS group. Results open the original post; they cannot automatically forward private files into unrelated groups.

Older posts need to be forwarded or linked by a group admin using /index or /fileadd.`);
  }
  if(value==='off'){
    await db()`UPDATE groups SET federated_search_enabled=FALSE,
      file_autoindex_enabled=FALSE,updated_at=NOW() WHERE chat_id=${chat.id}`;
    await logAction(chat.id,userId,null,'filehub_federation_off');
    return send(chat.id,'✅ Cross-group File Hub disabled. This group will no longer appear in connected-group search results.');
  }
  const rows=await db()`SELECT federated_search_enabled,file_autoindex_enabled FROM groups WHERE chat_id=${chat.id}`;
  const group=rows[0]||{};
  return send(chat.id,`📁 YAJETZY CONNECTED FILE HUB

Cross-group search: ${group.federated_search_enabled?'ON':'OFF'}
Regular-group file indexing: ${group.file_autoindex_enabled?'ON':'OFF'}
Forum-topic indexing: managed per topic in /panel

Admins: /filehub on or /filehub off.
Members: use /find filename here, or /findall filename privately with @yaje37_bot.`);
}
export async function findAllInPrivate(message,args=''){
  if(message.chat?.type!=='private'||!message.from?.id)return false;
  const term=normalizeQuery(args);
  if(!term)return send(message.chat.id,'🔎 Use /findall filename to search all connected Telegram groups you are a member of.\n\nExample: /findall screen recorder');
  const limit=await db()`INSERT INTO federated_search_cooldowns(user_id,last_at)
    VALUES(${message.from.id},NOW())
    ON CONFLICT(user_id) DO UPDATE SET last_at=NOW()
    WHERE federated_search_cooldowns.last_at < NOW()-INTERVAL '10 seconds'
    RETURNING user_id`;
  if(!limit.length)return send(message.chat.id,'⏳ Please wait 10 seconds before another connected-group search.');
  const result=await searchFederatedFiles(message.from.id,term);
  if(result.error)return send(message.chat.id,'🔎 '+result.error);
  if(!result.files.length)return send(message.chat.id,
    `🔎 No reviewed files found for "${result.query}" in your ${result.groups.length} accessible connected group(s).`);
  const rows=result.files.slice(0,8).map((file,i)=>[{
    text:`📍 ${file.name.slice(0,33)} · ${file.sourceGroup.slice(0,17)}`,
    url:file.link
  }]);
  return send(message.chat.id,
    `🔎 YAJETZY Multi-Group File Finder
Search: ${result.query}
Accessible groups: ${result.groups.length}
Matching approved files: ${result.files.length}

Tap a result to open its ORIGINAL Telegram post.
Private-group content stays inside the source group. Other members cannot search it unless Telegram confirms their membership.`,
    {reply_markup:{inline_keyboard:rows}});
}
