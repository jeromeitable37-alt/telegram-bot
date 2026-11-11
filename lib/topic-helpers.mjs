export function topicIdFromMessage(message = {}) {
  const threadId = Number(message.message_thread_id);
  if (Number.isSafeInteger(threadId) && threadId > 0) return threadId;
  // Telegram may omit message_thread_id for a message in the General topic.
  if (message.chat?.is_forum) return 1;
  return null;
}

export function topicUrl(chatId, threadId) {
  const match = String(chatId).match(/^-100([1-9]\d+)$/);
  const topicId = Number(threadId);
  if (!match || !Number.isSafeInteger(topicId) || topicId < 1) return null;
  return `https://t.me/c/${match[1]}/${topicId}`;
}

export function parseTopicRegistration(text = '') {
  const raw = String(text).trim();
  const separator = raw.indexOf('|');
  const name = (separator === -1 ? raw : raw.slice(0, separator)).trim();
  const description = (separator === -1 ? '' : raw.slice(separator + 1)).trim();
  if (!name || name.length > 100 || description.length > 350) return null;
  return { name, description };
}

export function parseTopicReply(text = '') {
  const match = String(text).match(/^TOPIC EDIT (name|description) (-?\d+) (\d+)\n/);
  if (!match) return null;
  const chatId = Number(match[2]), threadId = Number(match[3]);
  if (!Number.isSafeInteger(chatId) || chatId >= 0 ||
      !Number.isSafeInteger(threadId) || threadId < 1) return null;
  return { field:match[1], chatId, threadId };
}

export function menuContent(title, topics = []) {
  const published = topics.filter(t=>t.listed).slice(0, 24);
  const lines = [`📌 ${String(title).slice(0,120)} — MAIN MENU`, '', 'Welcome to the community! Choose a topic using the buttons below.', '', '🗂️ TOPIC DIRECTORY'];
  for (const topic of published) {
    const name = String(topic.title).slice(0,100);
    const description = String(topic.description || '').slice(0,120);
    lines.push(`• ${name}${description ? ' — ' + description : ''}`);
  }
  lines.push('', '📜 Please respect the community rules. For help, contact a group admin.');
  return lines.join('\n').slice(0,3900);
}
