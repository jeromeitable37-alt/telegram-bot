export function parseCommand(text = '', username = '') {
  const match = String(text).match(/^\/(\w+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  if (match[2] && match[2].toLowerCase() !== username.toLowerCase()) return null;
  return {name:match[1].toLowerCase(),args:(match[3] || '').trim()};
}
export function hasLink(message = {}) {
  const text = [message.text,message.caption].filter(Boolean).join(' ');
  const entities = [...(message.entities || []),...(message.caption_entities || [])];
  return entities.some(x=>['url','text_link'].includes(x.type)) ||
    /(?:https?:\/\/|www\.|t\.me\/|discord\.gg\/|(?:[\w-]+\.)+(?:com|net|org|ph|io|gg)\b)/i.test(text);
}
export function fillWelcome(template,person,group) {
  return String(template).replaceAll('{name}',person).replaceAll('{group}',group);
}
export function parseDuration(raw) {
  const match = String(raw).trim().match(/^(\d+)(m|h|d)$/i);
  if (!match) return null;
  const factor = {m:1,h:60,d:1440}[match[2].toLowerCase()];
  const minutes = Number(match[1])*factor;
  return Number.isSafeInteger(minutes) && minutes>=1 && minutes<=10080 ? minutes : null;
}
