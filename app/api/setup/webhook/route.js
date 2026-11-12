import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stable canonical production URL, not inferred from an incoming Host header.
const WEBHOOK_URL = 'https://telegram-bot-theta-nine.vercel.app/api/telegram';

function authorized(request) {
  const expectedValue = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') || '';
  if (!expectedValue || expectedValue.length < 20 || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7), 'utf8');
  const expected = Buffer.from(expectedValue, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function reply(payload, status = 200) {
  return Response.json(payload, { status, headers: {'Cache-Control':'private, no-store, max-age=0'} });
}
async function telegram(method, body = {}) {
  if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN is missing in Vercel Production.');
  const response = await fetch('https://api.telegram.org/bot' + process.env.BOT_TOKEN + '/' + method, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(9000),
    cache:'no-store'
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(method + ' failed: ' + (result.description || response.status));
  return result.result;
}
async function status() {
  const bot = await telegram('getMe');
  const webhook = await telegram('getWebhookInfo');
  return {
    bot:{username:bot.username,displayName:bot.first_name},
    webhookUrl:webhook.url || null,
    expectedWebhookUrl:WEBHOOK_URL,
    active:webhook.url === WEBHOOK_URL,
    pendingUpdates:webhook.pending_update_count || 0,
    lastError:webhook.last_error_message || null
  };
}
async function handle(request, activate) {
  if (!authorized(request)) return reply({ok:false,error:'Unauthorized. Enter the CRON_SECRET saved in Vercel.'},401);
  try {
    if (activate) {
      const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
      if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret))
        return reply({ok:false,error:'TELEGRAM_WEBHOOK_SECRET is missing or invalid. Use letters, numbers, _ or -.'},503);
      const bot=await telegram('getMe');
      if (process.env.BOT_USERNAME && bot.username?.toLowerCase() !== process.env.BOT_USERNAME.replace(/^@/,'').toLowerCase())
        return reply({ok:false,error:'BOT_USERNAME does not match the BotFather token. Check Vercel.'},409);
      await telegram('setWebhook',{
        url:WEBHOOK_URL,
        secret_token:secret,
        allowed_updates:['message','edited_message','my_chat_member','chat_member','chat_join_request','callback_query'],
        drop_pending_updates:false
      });
    }
    return reply({ok:true,...(await status())});
  } catch(error) {
    return reply({ok:false,error:String(error.message || error).slice(0,350)},502);
  }
}
export async function GET(request) { return handle(request,false); }
export async function POST(request) { return handle(request,true); }
