export const groupCommands = [
  { command: 'start', description: 'Open YAJETZY quick help' },
  { command: 'menu', description: 'Browse group topics and links' },
  { command: 'find', description: 'Search indexed files by name' },
  { command: 'get', description: 'Retrieve a saved community note' },
  { command: 'notes', description: 'List available community notes' },
  { command: 'rules', description: 'Read this group’s rules' },
  { command: 'help', description: 'View useful commands' },
  { command: 'status', description: 'Check bot status' },
  { command: 'myid', description: 'View your Telegram user ID' },
  { command: 'id', description: 'View the current group ID' },
  { command: 'modcheck', description: 'Check moderation permissions (admins)' },
  { command: 'ban', description: 'Ban member (reply or ID; admins)' },
  { command: 'unban', description: 'Unban member by ID (admins)' },
  { command: 'mute', description: 'Mute member for a duration (admins)' },
  { command: 'unmute', description: 'Restore member permissions (admins)' },
  { command: 'restrict', description: 'Restrict media temporarily (admins)' },
  { command: 'unrestrict', description: 'Lift member restrictions (admins)' },
  { command: 'warn', description: 'Warn a member (admins)' }
];
export const privateCommands = [
  { command: 'start', description: 'Start YAJETZY' },
  { command: 'panel', description: 'Manage your Telegram groups privately' },
  { command: 'groups', description: 'Select a group to manage' },
  { command: 'topicadd', description: 'Register a topic link' },
  { command: 'fileadd', description: 'Add a file post link to search' },
  { command: 'notes', description: 'Manage group notes from /panel' },
  { command: 'help', description: 'How to use this bot' },
  { command: 'status', description: 'Check bot status' },
  { command: 'myid', description: 'View your Telegram user ID' }
];
export function parseStartTarget(args = '') {
  const match = String(args).trim().match(/^(rules|menu|help)_([1-9]\d{5,17})$/);
  if (!match) return null;
  const chatId = -Number(match[2]);
  if (!Number.isSafeInteger(chatId)) return null;
  return { action: match[1], chatId };
}
export function parsePhotoPrompt(text='') {
  const match = String(text).match(/^WELCOME PHOTO (-?\d+)\n/);
  if (!match) return null;
  const chatId = Number(match[1]);
  return Number.isSafeInteger(chatId) && chatId<0 ? chatId : null;
}
export function makePhotoPrompt(chatId, title) {
  return `WELCOME PHOTO ${chatId}\n${String(title).slice(0,100)}\n\nReply to THIS message with your welcome image. YAJETZY will store its Telegram photo ID and use it for future member welcomes. Send a normal photo, not a document.`;
}
export function welcomeLinks(chatId, menuMessageId, username='') {
  const bot = String(username).replace(/^@/,'').trim();
  if (!/^[a-z0-9_]{5,32}$/i.test(bot)) return null;
  const groupMatch=String(chatId).match(/^-100([1-9]\d+)$/);
  if (!groupMatch) return null;
  const groupId=String(chatId).slice(1);
  const rules=`https://t.me/${bot}?start=rules_${groupId}`;
  const help=`https://t.me/${bot}?start=help_${groupId}`;
  const thread=Number(menuMessageId);
  const topics=Number.isSafeInteger(thread) && thread>0 ?
    `https://t.me/c/${groupMatch[1]}/${thread}` : `https://t.me/c/${groupMatch[1]}/1`;
  return {rules,topics,help};
}
export function welcomeMarkup(chatId,menuMessageId,username) {
  const links=welcomeLinks(chatId,menuMessageId,username);
  if (!links) return undefined;
  return {inline_keyboard:[
    [{text:'📜 Read Rules',url:links.rules},{text:'🗂️ Topic Directory',url:links.topics}],
    [{text:'ℹ️ Help',url:links.help}]
  ]};
}
export function welcomeCaption(text='') {
  const value=String(text);
  return value.length>1000?value.slice(0,997)+'…':value;
}
export const publicHelp = `🤖 YAJETZY — QUICK COMMANDS

/menu — Open group topic directory
/find name — Find a shared file post by filename
/get notename — Retrieve a saved community note
/notes — List available community notes
#notename — Quick note shortcut
hanap name — Also searches indexed files
/rules — Read group guidelines
/status — Check bot and group status
/help — Show this quick guide
/myid — Your Telegram user ID

🛡️ ADMIN MODERATION (reply to a member's message):
/modcheck — Check bot/admin Ban Users rights
/ban — Ban a member
/unban 123456789 — Unban by numeric user ID
/mute 10m — Stop messages for 10 minutes
/unmute — Restore normal group permissions
/restrict 10m — Text only; block media/files temporarily
/unrestrict — Restore normal group permissions
/warn — Record a warning
/warnings — See warning count
/resetwarns — Clear warnings

You can use numeric user IDs instead of replies, e.g. /mute 123456789 10m.
Valid times: 1m–7d. Mute/restrict default to 10m.
If an action fails, send /modcheck and ensure YAJETZY has Ban Users / Restrict Members in Telegram group admin settings.

🔐 Admins can also send /panel in a PRIVATE chat with @yaje37_bot to manage welcome, rules, topics, and announcements.

Stay respectful and use the correct topics.`;
