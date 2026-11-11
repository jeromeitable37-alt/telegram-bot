import { neon } from '@neondatabase/serverless';

let query;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  if (!query) query = neon(process.env.DATABASE_URL);
  return query;
}
export async function ensureGroup(chat) {
  if (!chat || !['group','supergroup'].includes(chat.type)) return;
  await db()`INSERT INTO groups(chat_id,title,enabled)
    VALUES(${chat.id},${chat.title || 'Telegram Group'},TRUE)
    ON CONFLICT(chat_id) DO UPDATE SET title=EXCLUDED.title,enabled=TRUE,updated_at=NOW()`;
}
export async function getGroup(chat) {
  await ensureGroup(chat);
  const rows = await db()`SELECT * FROM groups WHERE chat_id=${chat.id}`;
  return rows[0];
}
export async function logAction(chatId, actorId, targetId, action) {
  await db()`INSERT INTO moderation_logs(chat_id,actor_id,target_id,action)
    VALUES(${chatId},${actorId ?? null},${targetId ?? null},${action})`;
}
