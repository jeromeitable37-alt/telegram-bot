export const groupCommands = [
  { command: 'start', description: 'Open YAJETZY quick help' },
  { command: 'menu', description: 'Browse group topics and links' },
  { command: 'find', description: 'Search indexed files by name' },
  { command: 'rules', description: 'Read this group’s rules' },
  { command: 'help', description: 'View useful commands' },
  { command: 'status', description: 'Check bot status' },
  { command: 'myid', description: 'View your Telegram user ID' },
  { command: 'id', description: 'View the current group ID' }
];
export const privateCommands = [
  { command: 'start', description: 'Start YAJETZY' },
  { command: 'panel', description: 'Manage your Telegram groups privately' },
  { command: 'groups', description: 'Select a group to manage' },
  { command: 'topicadd', description: 'Register a topic link' },
  { command: 'fileadd', description: 'Add a file post link to search' },
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
hanap name — Also searches indexed files
/rules — Read group guidelines
/status — Check bot and group status
/help — Show this quick guide
/myid — Your Telegram user ID

🔐 Admins: send /panel in a PRIVATE chat with @yaje37_bot to manage welcome, rules, topics, and announcements.

Stay respectful and use the correct topics.`;
