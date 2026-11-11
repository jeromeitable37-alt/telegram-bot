if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN missing from .env.local');
const data = await fetch('https://api.telegram.org/bot'+process.env.BOT_TOKEN+'/getWebhookInfo').then(r=>r.json());
if (!data.ok) throw new Error(data.description);
const {url,pending_update_count,last_error_message} = data.result;
console.log(JSON.stringify({url,pending_update_count,last_error_message},null,2));
