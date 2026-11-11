export function linkedNoteText(slug, filename, url, previous='') {
  const base=String(previous||'').trim();
  const name=String(filename||'Shared file').trim().slice(0,160);
  const safeUrl=String(url||'');
  if(!/^https:\/\/t\.me\/c\/\d+\/(?:\d+\/)?\d+$/.test(safeUrl))return null;
  if(base.includes(safeUrl))return base;
  const item=`📎 Shared Telegram post\nFile: ${name}\nPost: ${safeUrl}\n\n⚠️ Community uploads are not security-scanned or verified by YAJETZY.`;
  const genericPending=base.includes('Status: Link pending verification.') ||
    base.includes('Link pending verification');
  const header=`🗂️ YAJE NOTES — ${slug}\n\n`;
  if(!base || genericPending)return header+item;
  // Keep filename catalogs and official sources, but remove stale "pending" notices
  // after a real Telegram file post is linked by an admin.
  const cleaned=base
    .replace(/^Status: Original Telegram post link pending\\.[^\\n]*\\n?/gm,'')
    .replace(/^Original Telegram file post link pending\\.[^\\n]*\\n?/gm,'')
    .replace(/^To link a suitable, reviewed file post,[^\\n]*\\n?/gm,'')
    .trim();
  const updated=cleaned+'\n\n'+item;
  return updated.length<=3500?updated:null;
}
export function validLinkNoteSlug(raw='') {
  const slug=String(raw).trim().toLowerCase();
  return /^[a-z][a-z0-9_]{0,47}$/.test(slug) && !['rules','notes','help','menu','start','status'].includes(slug) ? slug : null;
}
