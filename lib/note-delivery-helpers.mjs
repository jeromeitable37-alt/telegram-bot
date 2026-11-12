import {messageLink} from './file-search-helpers.mjs';
import {publicFileAllowed} from './file-policy.mjs';

function escapeHtml(value='') {
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function comparable(value=''){
  return String(value).trim().toLowerCase().replace(/\s+/g,' ');
}
export function fileNamesInNote(content=''){
  if(!/YAJE FILE REFERENCE|Listed filenames received/i.test(content))return [];
  const lines=String(content).split(/\r?\n/);
  const names=[];
  for(const line of lines){
    const match=line.match(/^\s*[•*-]\s+(.{1,190}\.(?:zip|apk|pdf|rar|7z|txt|jar|webp|png|jpg|jpeg))\s*$/i);
    if(match&&!names.some(x=>comparable(x)===comparable(match[1])))names.push(match[1].trim());
  }
  return names.slice(0,30);
}
export function fileReferenceReply({slug,groupName,content,files=[],chatId}){
  const names=fileNamesInNote(content);
  if(!names.length)return null;
  const restricted=/Status:\s*Restricted review\b/i.test(content);
  const matched=new Map();
  for(const file of files){
    if(!publicFileAllowed(file))continue;
    const name=comparable(file.file_name||file.display_name);
    const url=messageLink(chatId,file.thread_id,file.message_id);
    if(!url||matched.has(name))continue;
    matched.set(name,{...file,url});
  }
  let linked=0;
  const rows=[],buttons=[];
  for(const name of names){
    const file=matched.get(comparable(name));
    if(restricted){
      rows.push('🔒 <code>'+escapeHtml(name)+'</code> — Restricted; no file link offered');
    }else if(file){
      linked++;
      rows.push('✅ <code>'+escapeHtml(name)+'</code> — Telegram post linked');
      const actions=[{text:'📍 Open: '+name.slice(0,39),url:file.url}];
      if(file.delivery_approved===true)actions.push({text:'📥 Send File Here',callback_data:'fileget:'+file.message_id});
      buttons.push(actions);
    }else rows.push('⏳ <code>'+escapeHtml(name)+'</code> — No Telegram post link yet');
  }
  const body=[
    '🗂️ <b>'+escapeHtml(slug)+'</b>',
    escapeHtml(groupName),
    '',
    '📦 <b>Files listed in this note</b>',
    ...rows,
    '',
    restricted?'🔒 Restricted note — no file links are offered.':'🔗 Linked: '+linked+'/'+names.length+' files',
    restricted?'This entry is restricted and cannot be enabled through the public file reference.':
      linked<names.length?'Missing links must be registered by a group admin from the original Telegram file posts.':'Tap a button below to open the original Telegram file.',
    '',
    '⚠️ Shared uploads are not security-scanned by YAJETZY.'
  ].join('\n').slice(0,3900);
  return {text:body,parse_mode:'HTML',reply_markup:buttons.length?{inline_keyboard:buttons.slice(0,12)}:undefined,linked,total:names.length};
}

export function genericFilenameNoteHtml(groupName,slug,content){
  const lines=String(content||'').split(/\r?\n/);
  if(!lines.some(line=>/^YAJE group file mentioned:\s*.+\.(?:zip|apk|pdf|7z|rar)\s*$/i.test(line)))return null;
  const formatted=lines.map(line=>{
    const match=line.match(/^(YAJE group file mentioned:\s*)(.+\.(?:zip|apk|pdf|7z|rar))\s*$/i);
    if(!match)return escapeHtml(line);
    return escapeHtml(match[1])+'<code>'+escapeHtml(match[2])+'</code>';
  });
  return {
    parse_mode:'HTML',
    text:('📝 <b>'+escapeHtml(slug)+'</b>\n'+escapeHtml(groupName)+'\n\n'+formatted.join('\n')).slice(0,4000)
  };
}


export function eligibleAutoDeliveryFiles(content='',files=[],chatId,maxFiles=2){
  // Explicitly restricted catalog entries are NEVER forwarded, even if an
  // indexed file was approved by mistake.
  if(/Status:\s*Restricted review\b/i.test(content))return [];
  const names=fileNamesInNote(content);
  const results=[],used=new Set();
  for(const name of names){
    const candidate=files.find(item=>
      publicFileAllowed(item) && item.delivery_approved===true &&
      comparable(item.file_name||item.display_name)===comparable(name) &&
      messageLink(chatId,item.thread_id,item.message_id)
    );
    if(!candidate||used.has(String(candidate.message_id)))continue;
    used.add(String(candidate.message_id));
    results.push({
      messageId:Number(candidate.message_id),
      threadId:Number(candidate.thread_id),
      name:String(candidate.display_name||name).slice(0,200),
      url:messageLink(chatId,candidate.thread_id,candidate.message_id)
    });
    if(results.length>=Math.min(2,Math.max(1,maxFiles)))break;
  }
  return results;
}


export function linkedPostsFromNote(content='',chatId){
  const posts=[];
  const body=String(content);
  const regexp=/(?:^|\n)Post:\s*(https:\/\/t\.me\/c\/[1-9]\d+\/(?:[1-9]\d+\/)?[1-9]\d+)\s*(?:\n|$)/gm;
  for(const match of body.matchAll(regexp)){
    const url=match[1];
    // This ensures linked posts are within this group, never another chat.
    const target=String(chatId).match(/^-100([1-9]\d+)$/);
    if(!target||!url.startsWith('https://t.me/c/'+target[1]+'/'))continue;
    if(!posts.includes(url))posts.push(url);
  }
  return posts.slice(0,10);
}
export function linkedMediaNoteReply({slug,groupName,content,files=[],chatId}){
  const links=linkedPostsFromNote(content,chatId);
  if(!links.length)return null;
  const restricted=/Status:\s*Restricted review\b/i.test(content);
  const actions=[],rows=[],eligible=[];
  for(const url of links){
    const file=files.find(item=>publicFileAllowed(item)&&
      messageLink(chatId,item.thread_id,item.message_id)===url);
    if(restricted){
      rows.push('🔒 Restricted media post (not available for delivery)');
    }else if(file){
      const title=String(file.display_name||'Telegram media').slice(0,160);
      rows.push('✅ <code>'+escapeHtml(title)+'</code> — Telegram post linked');
      const buttons=[{text:'📍 Open: '+title.slice(0,39),url}];
      if(file.delivery_approved===true){
        buttons.push({text:'📥 Send Here',callback_data:'fileget:'+file.message_id});
        eligible.push({
          messageId:Number(file.message_id),
          threadId:Number(file.thread_id),
          name:title,url
        });
      }
      actions.push(buttons);
    }else rows.push('⏳ Linked post awaiting admin review');
  }
  const prefix=String(content).split('📎 Shared Telegram post')[0].trim()
    .replace(/^🗂️ YAJE NOTES — [^\n]+/,'').trim().slice(0,420);
  const body=[
    '📝 <b>'+escapeHtml(slug)+'</b>',
    escapeHtml(groupName),
    ...(prefix?['',escapeHtml(prefix)]:[]),
    '',
    '📎 <b>Linked Telegram posts</b>',
    ...rows,
    '',
    restricted?'🔒 This note is restricted; no files or videos will be sent.':
      eligible.length?'The approved media can be opened or sent in this topic.':
      'Media needs an admin review before it can be delivered.',
    '⚠️ Shared uploads are not security-scanned by YAJETZY.'
  ].join('\n').slice(0,3900);
  return {text:body,parse_mode:'HTML',reply_markup:actions.length?{inline_keyboard:actions.slice(0,8)}:undefined,eligible:restricted?[]:eligible.slice(0,2)};
}
