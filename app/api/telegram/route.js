import { timingSafeEqual } from 'node:crypto';
import { db } from '../../../lib/db.js';
import { handleUpdate } from '../../../lib/bot.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validSecret(actual,expected) {
  if (!actual || !expected) return false;
  const a=Buffer.from(actual), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function POST(request) {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) return Response.json({error:'Server not configured'},{status:503});
  if (!validSecret(request.headers.get('x-telegram-bot-api-secret-token'),process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return Response.json({error:'Unauthorized'},{status:401});
  }
  let update;
  try { update=await request.json(); }
  catch { return Response.json({error:'Invalid JSON'},{status:400}); }
  if (!Number.isSafeInteger(update?.update_id)) return Response.json({error:'Invalid update'},{status:400});
  let claimed=false;
  try {
    const rows=await db()`INSERT INTO processed_updates(update_id) VALUES(${update.update_id}) ON CONFLICT DO NOTHING RETURNING update_id`;
    if (!rows.length) return Response.json({ok:true,duplicate:true});
    claimed=true;
    await handleUpdate(update);
    return Response.json({ok:true});
  } catch (error) {
    console.error('Telegram webhook processing failed:',error.message);
    if (claimed) {
      try { await db()`DELETE FROM processed_updates WHERE update_id=${update.update_id}`; }
      catch(e) { console.error('Webhook claim cleanup failed:',e.message); }
    }
    return Response.json({error:'Processing failed'},{status:500});
  }
}
