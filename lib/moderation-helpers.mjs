export const MODERATION_COMMANDS=new Set(['ban','unban','mute','unmute','restrict','unrestrict','warn','warnings','resetwarns']);

export function parseModerationTarget(replyUserId,rawArgs=''){
  const input=String(rawArgs||'').trim();
  const parts=input?input.split(/\s+/):[];
  const reply=Number(replyUserId);
  if(Number.isSafeInteger(reply)&&reply>0){
    return {userId:reply,rest:input,via:'reply'};
  }
  const userId=Number(parts[0]);
  if(!parts.length || !/^\d+$/.test(parts[0]) || !Number.isSafeInteger(userId) || userId<=0){
    return {userId:null,rest:input,via:null};
  }
  return {userId,rest:parts.slice(1).join(' '),via:'id'};
}

export function moderationDuration(raw,defaultDuration='10m'){
  const value=String(raw||'').trim().toLowerCase() || defaultDuration;
  const match=value.match(/^(\d+)(m|h|d)$/);
  if(!match)return null;
  const minutes=Number(match[1])*({m:1,h:60,d:1440}[match[2]]);
  return Number.isSafeInteger(minutes)&&minutes>=1&&minutes<=10080 ? minutes : null;
}

export function roleCanRestrict(member){
  return member?.status==='creator' || (member?.status==='administrator'&&member?.can_restrict_members===true);
}

export function moderationError(error){
  const message=String(error?.message||error||'');
  if(/not enough rights|not enough permissions|not an administrator|have no rights|CHAT_ADMIN_REQUIRED|need administrator rights/i.test(message)){
    return 'Telegram denied the action: YAJETZY needs administrator permission to BAN USERS / RESTRICT MEMBERS. Check the bot permissions under Group → Administrators.';
  }
  if(/user is an administrator|can't restrict.*admin|can't ban.*admin|can't remove chat owner|USER_ADMIN_INVALID|user is an admin/i.test(message)){
    return 'Telegram does not allow restricting or banning the group owner or another administrator.';
  }
  if(/user not found|USER_ID_INVALID|member not found|participant_id_invalid/i.test(message)){
    return 'Telegram could not find that user. Reply to one of their messages or use their valid numeric user ID.';
  }
  if(/chat not found|CHAT_ID_INVALID/i.test(message)){
    return 'Telegram could not access this group. Check that YAJETZY is still an administrator.';
  }
  if(/timeout|fetch failed|network|aborted/i.test(message)){
    return 'Telegram did not respond. Please try the command again.';
  }
  return 'Telegram rejected this moderation request. Check that the bot is an admin and the target is a regular group member.';
}

export function chatRestrictionPermissions(mode,defaults={}){
  const sendKeys=['can_send_messages','can_send_audios','can_send_documents','can_send_photos','can_send_videos','can_send_video_notes','can_send_voice_notes','can_send_polls','can_send_other_messages','can_add_web_page_previews'];
  const permissions={};
  for(const key of sendKeys){
    if(mode==='mute')permissions[key]=false;
    else if(mode==='restrict')permissions[key]=key==='can_send_messages' && defaults[key]!==false;
    else permissions[key]=defaults[key]!==false;
  }
  for(const key of ['can_invite_users','can_change_info','can_pin_messages','can_manage_topics']){
    permissions[key]=mode==='restore' ? defaults[key]===true : false;
  }
  return permissions;
}
