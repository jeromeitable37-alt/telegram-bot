import { timingSafeEqual } from 'node:crypto';
import { db } from '../../../../lib/db.js';
import {publishAnnouncement} from '../../../../lib/announcements.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function authorized(value,secret) {
  if (!secret || !value?.startsWith('Bearer ')) return false;
  const a=Buffer.from(value.slice(7)), b=Buffer.from(secret);
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function GET(request) {
  if (!authorized(request.headers.get('authorization'),process.env.CRON_SECRET)) {
    return Response.json({error:'Unauthorized'},{status:401});
  }
  const sql=db();
  const groups=await sql`
    UPDATE groups SET daily_last_sent=(NOW() AT TIME ZONE 'Asia/Manila')::date
    WHERE chat_id IN (
      SELECT chat_id FROM groups WHERE enabled=TRUE AND daily_enabled=TRUE
        AND daily_text<>''
        AND (daily_last_sent IS NULL OR daily_last_sent < (NOW() AT TIME ZONE 'Asia/Manila')::date)
      ORDER BY chat_id LIMIT 30
    )
    RETURNING chat_id,daily_text
  `;
  let sent=0,failed=0;
  for (const group of groups) {
    try {
      const result=await publishAnnouncement(group.chat_id,'📢 DAILY REMINDER\\n\\n'+group.daily_text);
      if(result.general||result.announcement)sent++;
      if(result.errors.length){
        failed++;
        console.warn('Daily announcement partially failed:',String(group.chat_id),result.errors.join(','));
      }
      if(!result.general&&!result.announcement)await sql`UPDATE groups SET daily_last_sent=NULL WHERE chat_id=${group.chat_id}`;
    }
    catch(error) {
      failed++;
      console.error('Daily send failed:',String(group.chat_id),error.message);
      await sql`UPDATE groups SET daily_last_sent=NULL WHERE chat_id=${group.chat_id}`;
    }
  }
  await sql`DELETE FROM processed_updates WHERE processed_at < NOW() - INTERVAL '7 days'`;
  await sql`DELETE FROM flood_counters WHERE window_started < NOW() - INTERVAL '1 day'`;
  await sql`DELETE FROM moderation_logs WHERE created_at < NOW() - INTERVAL '30 days'`;
  return Response.json({ok:true,groups:groups.length,sent,failed});
}
