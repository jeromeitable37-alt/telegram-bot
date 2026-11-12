// Security Shield classification is metadata/text-only; it does not inspect image/video contents.
const promotion=/\b(?:leaked?|scandal|nudes?|xxx|18\+|private\s+(?:video|clip)|adult\s+(?:video|content))\b/i;
const solicitation=/\b(?:watch|download|join|dm|link|click|full|free|subscribe|here|sale|buy|access)\b|(?:https?:\/\/|t\.me\/|bit\.ly\/|tinyurl\.com\/)/i;
const scam=/\b(?:claim\s+(?:your\s+)?prize|guaranteed\s+profit|double\s+your\s+(?:money|coins)|free\s+money|easy\s+money|crypto\s+giveaway|airdrop\s+reward)\b/i;
const url=/(?:https?:\/\/|www\.|t\.me\/|bit\.ly\/|tinyurl\.com\/|cutt\.ly\/|discord\.gg\/)/i;

export function classifySecuritySpam(message={}){
  const text=[message.text,message.caption].filter(Boolean).join(' ').slice(0,1800);
  // "scandal" in a safety discussion alone is not enough to delete the conversation.
  if(promotion.test(text)&&solicitation.test(text))return 'suspicious_private_media_promo';
  if(scam.test(text)&&url.test(text))return 'scam_link_promo';
  return null;
}
export function fingerprintSource(message={}){
  const content=[message.text,message.caption].filter(Boolean).join(' ').replace(/\s+/g,' ').trim().toLowerCase().slice(0,500);
  if(content.length>=12)return 'text:'+content;
  const file=message.document||message.video||message.animation||message.photo?.at?.(-1)||message.audio;
  if(file?.file_unique_id)return 'media:'+file.file_unique_id;
  return '';
}
export function containsVideo(message={}){
  const doc=message.document;
  return Boolean(message.video||message.animation||
    (doc&&(String(doc.mime_type||'').toLowerCase().startsWith('video/')||
      /\.(mp4|mov|mkv|avi|webm)$/i.test(String(doc.file_name||'')))));
}
export function hasExternalLink(message={}){
  const text=[message.text,message.caption].filter(Boolean).join(' ');
  if(url.test(text))return true;
  const entities=[...(message.entities||[]),...(message.caption_entities||[])];
  return entities.some(x=>['url','text_link'].includes(x.type));
}
export function securityDecision({message,joinedMinutes=null,windowCount=0,duplicateCount=0,settings={}}){
  if(!settings.security_shield_enabled)return null;
  const classified=settings.security_sensitive_spam!==false?classifySecuritySpam(message):null;
  if(classified)return classified;
  if(settings.security_newcomer_links!==false&&joinedMinutes!==null&&joinedMinutes>=0&&joinedMinutes<360&&hasExternalLink(message))return 'new_member_external_link';
  // Newly joined users cannot post video promotions immediately. ZIP/PDF uploads remain available.
  if(settings.security_newcomer_media!==false&&joinedMinutes!==null&&joinedMinutes>=0&&joinedMinutes<60&&containsVideo(message))return 'new_member_video';
  if(windowCount>=8)return 'flood_10_seconds';
  if(duplicateCount>=3)return 'repeated_message';
  return null;
}
export function nextPenalty(strikes,reason,autoMute=true){
  if(!autoMute)return {action:'delete',minutes:0};
  if(strikes>=5&&['scam_link_promo','suspicious_private_media_promo','repeated_message','flood_10_seconds'].includes(reason))return {action:'ban',minutes:0};
  if(strikes>=3)return {action:'mute',minutes:30};
  if(strikes>=2&&['flood_10_seconds','repeated_message','scam_link_promo','suspicious_private_media_promo'].includes(reason))return {action:'mute',minutes:10};
  return {action:'delete',minutes:0};
}
