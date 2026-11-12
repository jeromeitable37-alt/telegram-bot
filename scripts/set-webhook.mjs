const host = process.argv[2]?.replace(/\/$/, '');
const {BOT_TOKEN,BOT_USERNAME,TELEGRAM_WEBHOOK_SECRET} = process.env;
if (!host || !/^https:\/\/[a-zA-Z0-9.-]+$/.test(host)) {
  console.error('Usage: npm run webhook:set -- https://YOUR-PRODUCTION-PROJECT.vercel.app');
  process.exit(1);
}
if (!BOT_TOKEN || !BOT_USERNAME || !TELEGRAM_WEBHOOK_SECRET || !/^[A-Za-z0-9_-]{1,256}$/.test(TELEGRAM_WEBHOOK_SECRET)) {
  console.error('Configure BOT_TOKEN, BOT_USERNAME and a valid TELEGRAM_WEBHOOK_SECRET in .env.local');
  process.exit(1);
}
const result = await fetch('https://api.telegram.org/bot'+BOT_TOKEN+'/setWebhook',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({
    url:host+'/api/telegram',secret_token:TELEGRAM_WEBHOOK_SECRET,
    allowed_updates:['message','edited_message','my_chat_member','chat_member','chat_join_request','callback_query'],
    drop_pending_updates:false
  })
}).then(r=>r.json());
console.log(result.ok ? 'Webhook configured: '+host+'/api/telegram' : 'Telegram error: '+result.description);
if (!result.ok) process.exitCode=1;
