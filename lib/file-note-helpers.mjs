export function linkedNoteText(slug, filename, url, previous='') {
  const base=String(previous||'').trim();
  const name=String(filename||'Shared file').trim().slice(0,160);
  const safeUrl=String(url||'');
  if(!/^https:\/\/t\.me\/c\/\d+\/(?:\d+\/)?\d+$/.test(safeUrl))return null;
  if(base.includes(safeUrl))return base;
  const item=`📎 Shared Telegram post\nFile: ${name}\nPost: ${safeUrl}\n\n⚠️ Community uploads are not security-scanned or verified by YAJETZY.`;
  const pending=base.includes('Status: Link pending verification.') ||
    base.includes('Link pending verification');
  const header=`🗂️ YAJE NOTES — ${slug}\n\n`;
  if(!base || pending)return header+item;
  if(base.length+item.length+2<=3500)return base+'\n\n'+item;
  return null;
}
export function validLinkNoteSlug(raw='') {
  const slug=String(raw).trim().toLowerCase();
  return /^[a-z][a-z0-9_]{0,47}$/.test(slug) && !['rules','notes','help','menu','start','status'].includes(slug) ? slug : null;
}
