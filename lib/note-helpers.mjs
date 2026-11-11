export const NOTE_MAX_CONTENT=3500;
export const NOTE_MAX_SLUG=48;
export function normalizeNoteSlug(raw='') {
  const slug=String(raw).trim().toLowerCase();
  return /^[a-z][a-z0-9_]{0,47}$/.test(slug) ? slug : null;
}
export function noteHashtag(text='') {
  const match=String(text).trim().match(/^#([a-z][a-z0-9_]{0,47})$/i);
  return match ? normalizeNoteSlug(match[1]) : null;
}
export function noteCreateReply(text='') {
  const raw=String(text);
  const separator=raw.indexOf('|');
  if(separator<1)return null;
  const slug=normalizeNoteSlug(raw.slice(0,separator));
  const content=raw.slice(separator+1).trim();
  if(!slug || !content || content.length>NOTE_MAX_CONTENT)return null;
  return {slug,content};
}
export function notePrompt(text='') {
  const match=String(text).match(/^NOTE (ADD|EDIT) (-?\d+)(?: (\d+))?\n/);
  if(!match)return null;
  const chatId=Number(match[2]);
  const noteId=match[3] ? Number(match[3]) : null;
  if(!Number.isSafeInteger(chatId)||chatId>=0|| (noteId!==null && (!Number.isSafeInteger(noteId)||noteId<1)))return null;
  if(match[1]==='EDIT' && noteId===null)return null;
  if(match[1]==='ADD' && noteId!==null)return null;
  return {mode:match[1].toLowerCase(),chatId,noteId};
}
export function noteView(title,slug,content) {
  const header='📝 '+String(slug).slice(0,NOTE_MAX_SLUG)+'\n'+String(title).slice(0,100)+'\n\n';
  return (header+String(content)).slice(0,4096);
}
export function noteListText(title,notes) {
  const lines=notes.map(x=>'- '+x.slug).slice(0,100);
  return '📚 NOTES — '+String(title).slice(0,90)+'\n\n'+(lines.join('\n')||'No notes saved yet.')+
    '\n\nUse /get notename or #notename to open a note.\nOnly group admins can create or edit notes.';
}
