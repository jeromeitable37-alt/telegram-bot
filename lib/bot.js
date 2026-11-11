import { db, ensureGroup, getGroup, logAction } from './db.js';
import { tg, send, isAdmin, mute, unmute } from './telegram.js';
import { parseCommand, hasLink, fillWelcome, parseDuration } from './parsing.mjs';
import { discoverTopic, topicLinksBlocked, registerTopicCommand, handleTopicReply, handleTopicCallback } from './topics.js';

const HELP = `MULTI-GROUP MANAGER\n\nFor everyone:\n/help - available commands\n/myid - your Telegram numeric ID\n/id - current chat ID\n/rules - current group rules\n\nFor GROUP ADMINS (use inside each group):\n/settings - show configuration\n/panel - interactive admin buttons\n/welcome on|off\n/setwelcome Welcome {name} to {group}!\n/setrules Your rules here\n/links on|off - delete URLs (off initially)\n/flood on|off - 8+ posts/10 sec => 5m mute (off initially)\n/maxwarn 1..10 - warnings before auto-mute\n/warn - reply to a member\n/warnings - reply to a member\n/resetwarns - reply to a member\n/mute 10m - reply (also 1h or 1d)\n/unmute - reply to a member\n/ban - reply to a member\n/unban 123456789 - Telegram user ID\n/announce message - post now\n/daily message - daily announcement ~9AM Manila\n/daily off - disable daily announcement\n/queue on|off - track join requests\n/invitelink - make an approval-required invite link\n/pending - review requests securely in bot DM via /pending CHAT_ID\n/stats - moderation summary\n/topicregister Name | Description - run once inside each forum topic\n\nOnly group admins can change their group's settings. Bot must be an administrator with the required rights. Anonymous admin mode is not supported. Auto moderation is off until enabled.`;

function chatIsGroup(chat) {
  return chat && (chat.type === 'group' || chat.type === 'supergroup');
}
function displayName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').slice(0, 100) || 'Member';
}
function yesNo(v) { return v ? 'ON' : 'OFF'; }
function panelText(settings) {
  return `ADMIN PANEL — ${settings.title}\n\nWelcome: ${yesNo(settings.welcome_enabled)}\nBlock links: ${yesNo(settings.anti_links)}\nAnti-flood: ${yesNo(settings.anti_flood)}\nJoin request queue: ${yesNo(settings.join_queue)}\nDaily reminder: ${yesNo(settings.daily_enabled)}\n\nTap below to toggle settings, or use /help for all commands.`;
}
function panelButtons(settings) {
  const options = [
    ['Welcome', 'welcome', settings.welcome_enabled],
    ['Block links', 'links', settings.anti_links],
    ['Anti-flood', 'flood', settings.anti_flood],
    ['Join queue', 'queue', settings.join_queue],
    ['Daily', 'daily', settings.daily_enabled]
  ];
  return { inline_keyboard:options.map(([label,code,on])=>[{ text:`${on ? '✅' : '⬜'} ${label}`, callback_data:`cfg:${code}:${settings.chat_id}` }]) };
}

const PRIVATE_HELP = `🔐 PRIVATE GROUP MANAGEMENT

Send /panel or /groups to select a Telegram group you administer.\nUse Topics & Main Menu to register topics and publish a directory in General.
Tap a group, then use private buttons to toggle protections, edit welcome text and rules, review pending join requests, or send an announcement.

Admins are verified using Telegram's actual group permissions.
Only messages intended for the group (like announcements and welcomes) are posted there.`;

function privatePanelButtons(settings) {
  const id = settings.chat_id;
  return { inline_keyboard: [
    ...panelButtons(settings).inline_keyboard,
    [{text:'✏️ Edit welcome text',callback_data:`dm:edit:welcome:${id}`}],
    [{text:'📜 Edit group rules',callback_data:`dm:edit:rules:${id}`}],
    [{text:'🕘 Set daily reminder',callback_data:`dm:edit:daily:${id}`}],
    [{text:'📣 Send announcement',callback_data:`dm:edit:announce:${id}`}],
    [{text:'👥 Review join requests',callback_data:`dm:pending:${id}`}],
    [{text:'🗂 Topics & Main Menu',callback_data:`topic:list:${id}`}],
    [{text:'↩️ Choose another group',callback_data:'dm:groups'}]
  ] };
}
async function authorizedGroup(chatId, userId) {
  if (!Number.isSafeInteger(chatId) || chatId >= 0 || !userId) return null;
  const rows = await db()`SELECT * FROM groups WHERE chat_id=${chatId} AND enabled=TRUE`;
  if (!rows.length) return null;
  if (!await isAdmin(chatId,userId)) return null;
  return rows[0];
}
async function showPrivateGroups(m) {
  const userId = m.from?.id;
  if (!userId) return;
  const all = await db()`SELECT chat_id,title FROM groups WHERE enabled=TRUE ORDER BY title LIMIT 50`;
  const checked = await Promise.allSettled(all.map(group => isAdmin(Number(group.chat_id),userId)));
  const groups = all.filter((group,i)=>checked[i].status==='fulfilled' && checked[i].value);
  if (!groups.length) {
    return say(m,'No managed groups found yet. Add me as administrator in your Telegram group, then send /panel here again.');
  }
  return say(m,'🔐 Choose which Telegram group to manage:',{
    reply_markup:{inline_keyboard:groups.map(group=>[{
      text:String(group.title).slice(0,55),
      callback_data:`dm:open:${group.chat_id}`
    }])}
  });
}
async function showPrivatePanel(m, chatId) {
  const settings = await authorizedGroup(chatId,m.from?.id);
  if (!settings) return say(m,'You are not an administrator of that registered group, or the group is unavailable.');
  return say(m,'🔐 PRIVATE ADMIN CONTROLS\n\n'+panelText(settings),{reply_markup:privatePanelButtons(settings)});
}
async function handlePrivateReply(m) {
  if (!m.text || !m.reply_to_message?.from?.is_bot) return false;
  const botName=(process.env.BOT_USERNAME || '').replace(/^@/,'').toLowerCase();
  if (!botName || m.reply_to_message.from.username?.toLowerCase() !== botName) return false;
  const match=String(m.reply_to_message.text || '').match(/^EDIT (WELCOME|RULES|DAILY|ANNOUNCE) (-?\d+)\n/);
  if (!match) return false;
  const type=match[1].toLowerCase();
  const chatId=Number(match[2]);
  const settings=await authorizedGroup(chatId,m.from?.id);
  if (!settings) {
    await say(m,'You no longer have admin access to that group.');
    return true;
  }
  const value=m.text.trim();
  const limits={welcome:1000,rules:2000,daily:3000,announce:3500};
  if (!value || value.length>limits[type]) {
    await say(m,`Please reply with 1-${limits[type]} characters.`);
    return true;
  }
  const sql=db();
  if (type==='welcome') {
    await sql`UPDATE groups SET welcome_text=${value},updated_at=NOW() WHERE chat_id=${chatId}`;
  }
  if (type==='rules') {
    await sql`UPDATE groups SET rules_text=${value},updated_at=NOW() WHERE chat_id=${chatId}`;
  }
  if (type==='daily') {
    if (value.toLowerCase()==='off') {
      await sql`UPDATE groups SET daily_enabled=FALSE,updated_at=NOW() WHERE chat_id=${chatId}`;
    } else {
      await sql`UPDATE groups SET daily_text=${value},daily_enabled=TRUE,updated_at=NOW() WHERE chat_id=${chatId}`;
    }
  }
  if (type==='announce') {
    await send(chatId,'📢 ANNOUNCEMENT\n\n'+value);
  }
  await audit(chatId,m.from.id,null,'private_'+type);
  await say(m,`✅ ${type==='announce'?'Announcement posted':type==='daily'&&value.toLowerCase()==='off'?'Daily reminder disabled':type+' updated'} for ${settings.title}.`);
  return true;
}

function replyTarget(m) { return m.reply_to_message?.from?.id; }
function messageIdOption(m) {
  return m.message_thread_id ? { message_thread_id: m.message_thread_id } : {};
}
async function say(m, text, extra = {}) {
  return send(m.chat.id, text, { ...messageIdOption(m), ...extra });
}
async function sayUsage(m, usage) { return say(m, `Usage: ${usage}`); }
async function audit(chatId, actorId, targetId, action) {
  await logAction(chatId, actorId, targetId, action);
}
async function incrementWarnings(chatId, userId) {
  const rows = await db()`
    INSERT INTO member_warnings(chat_id, user_id, count) VALUES (${chatId}, ${userId}, 1)
    ON CONFLICT(chat_id, user_id) DO UPDATE SET count = member_warnings.count + 1
    RETURNING count
  `;
  return Number(rows[0].count);
}

async function handleGroupCommand(m, cmd) {
  const chat = m.chat;
  const actorId = m.from?.id;
  if (!actorId) return; // Telegram anonymous admin messages have no reliable human actor.
  const settings = await getGroup(chat);
  if (cmd.name === 'rules') {
    await say(m, settings.rules_text);
    return;
  }
  const admin = await isAdmin(chat.id, actorId);
  if (!admin) {
    await say(m, 'Only a Telegram administrator of this group can run that command.');
    return;
  }
  if (cmd.name === 'topicregister') return registerTopicCommand(m,cmd.args);
  if (cmd.name === 'panel') {
    return say(m, panelText(settings), {reply_markup:panelButtons(settings)});
  }
  if (cmd.name === 'settings') {
    await say(m, `Settings: ${chat.title}\nGroup: ${chat.id}\nWelcome: ${yesNo(settings.welcome_enabled)}\nLink blocking: ${yesNo(settings.anti_links)}\nFlood control: ${yesNo(settings.anti_flood)}\nJoin queue: ${yesNo(settings.join_queue)}\nMax warnings: ${settings.max_warnings}\nDaily announcement: ${yesNo(settings.daily_enabled)} (~9AM Manila)\n\nUse /help for commands.`);
    return;
  }
  if (['links', 'flood', 'welcome', 'queue'].includes(cmd.name)) {
    if (!['on', 'off'].includes(cmd.args.toLowerCase())) return sayUsage(m, `/${cmd.name} on|off`);
    const enabled = cmd.args.toLowerCase() === 'on';
    const sql = db();
    if (cmd.name === 'links') await sql`UPDATE groups SET anti_links=${enabled}, updated_at=NOW() WHERE chat_id=${chat.id}`;
    if (cmd.name === 'flood') await sql`UPDATE groups SET anti_flood=${enabled}, updated_at=NOW() WHERE chat_id=${chat.id}`;
    if (cmd.name === 'welcome') await sql`UPDATE groups SET welcome_enabled=${enabled}, updated_at=NOW() WHERE chat_id=${chat.id}`;
    if (cmd.name === 'queue') await sql`UPDATE groups SET join_queue=${enabled}, updated_at=NOW() WHERE chat_id=${chat.id}`;
    await audit(chat.id, actorId, null, `${cmd.name}_${enabled ? 'on' : 'off'}`);
    await say(m, `${cmd.name.toUpperCase()}: ${yesNo(enabled)}`);
    return;
  }
  if (cmd.name === 'setwelcome') {
    if (!cmd.args || cmd.args.length > 1000) return sayUsage(m, '/setwelcome Welcome {name} to {group}! (max 1000 characters)');
    await db()`UPDATE groups SET welcome_text=${cmd.args}, updated_at=NOW() WHERE chat_id=${chat.id}`;
    await say(m, 'Welcome message updated. Placeholders: {name}, {group}.');
    return;
  }
  if (cmd.name === 'setrules') {
    if (!cmd.args || cmd.args.length > 2000) return sayUsage(m, '/setrules Your group rules (max 2000 characters)');
    await db()`UPDATE groups SET rules_text=${cmd.args}, updated_at=NOW() WHERE chat_id=${chat.id}`;
    await say(m, 'Group rules updated. Members can use /rules.');
    return;
  }
  if (cmd.name === 'maxwarn') {
    const value = Number(cmd.args);
    if (!Number.isInteger(value) || value < 1 || value > 10) return sayUsage(m, '/maxwarn 3 (range: 1 to 10)');
    await db()`UPDATE groups SET max_warnings=${value}, updated_at=NOW() WHERE chat_id=${chat.id}`;
    await say(m, `Auto-mute threshold: ${value} warnings.`);
    return;
  }
  if (['warn', 'warnings', 'resetwarns', 'mute', 'unmute', 'ban'].includes(cmd.name)) {
    const target = replyTarget(m);
    if (!target) return say(m, `Reply to the member's message with /${cmd.name}${cmd.name === 'mute' ? ' 10m' : ''}.`);
    if (cmd.name !== 'warnings' && (target === actorId || await isAdmin(chat.id, target))) {
      return say(m, 'Cannot moderate yourself or another group admin.');
    }
    if (cmd.name === 'warnings') {
      const result = await db()`SELECT count FROM member_warnings WHERE chat_id=${chat.id} AND user_id=${target}`;
      return say(m, `User ${target}: ${result[0]?.count || 0} warnings.`);
    }
    if (cmd.name === 'resetwarns') {
      await db()`DELETE FROM member_warnings WHERE chat_id=${chat.id} AND user_id=${target}`;
      await audit(chat.id, actorId, target, 'resetwarns');
      return say(m, `Warnings cleared for ${target}.`);
    }
    if (cmd.name === 'warn') {
      const count = await incrementWarnings(chat.id, target);
      await audit(chat.id, actorId, target, 'warn');
      if (count >= settings.max_warnings) {
        await mute(chat.id, target, 10);
        await db()`DELETE FROM member_warnings WHERE chat_id=${chat.id} AND user_id=${target}`;
        await audit(chat.id, 0, target, 'auto_mute_10m');
        return say(m, `User ${target} reached ${count} warnings: muted for 10 minutes. Warnings reset.`);
      }
      return say(m, `User ${target} warned (${count}/${settings.max_warnings}).`);
    }
    if (cmd.name === 'mute') {
      const minutes = parseDuration(cmd.args);
      if (!minutes) return sayUsage(m, '/mute 10m (allowed: 1m to 7d; reply to user)');
      await mute(chat.id, target, minutes);
      await audit(chat.id, actorId, target, `mute_${minutes}m`);
      return say(m, `User ${target} muted for ${minutes} minutes.`);
    }
    if (cmd.name === 'unmute') {
      await unmute(chat.id, target);
      await audit(chat.id, actorId, target, 'unmute');
      return say(m, `User ${target} unmuted.`);
    }
    if (cmd.name === 'ban') {
      await tg('banChatMember', {chat_id:chat.id,user_id:target});
      await audit(chat.id, actorId, target, 'ban');
      return say(m, `User ${target} banned.`);
    }
  }
  if (cmd.name === 'unban') {
    const userId = Number(cmd.args);
    if (!Number.isSafeInteger(userId) || userId <= 0) return sayUsage(m, '/unban 123456789');
    await tg('unbanChatMember', { chat_id:chat.id, user_id:userId, only_if_banned:true });
    await audit(chat.id, actorId, userId, 'unban');
    return say(m, `User ${userId} unbanned.`);
  }
  if (cmd.name === 'announce') {
    if (!cmd.args || cmd.args.length > 3500) return sayUsage(m, '/announce Your message (max 3500 characters)');
    await say(m, `📢 ANNOUNCEMENT\n\n${cmd.args}`);
    await audit(chat.id, actorId, null, 'announce');
    return;
  }
  if (cmd.name === 'daily') {
    if (cmd.args.toLowerCase() === 'off') {
      await db()`UPDATE groups SET daily_enabled=FALSE,updated_at=NOW() WHERE chat_id=${chat.id}`;
      return say(m, 'Daily announcement disabled.');
    }
    if (!cmd.args || cmd.args.length > 3000) return sayUsage(m, '/daily Your 9AM Manila daily message (max 3000 characters) OR /daily off');
    await db()`UPDATE groups SET daily_enabled=TRUE,daily_text=${cmd.args},updated_at=NOW() WHERE chat_id=${chat.id}`;
    return say(m, 'Daily announcement enabled (~9AM Philippine time, production Cron). Timing can vary on Vercel Hobby.');
  }
  if (cmd.name === 'invitelink') {
    if (!settings.join_queue) return say(m, 'Enable /queue on first.');
    const link = await tg('createChatInviteLink', { chat_id:chat.id, name:'Bot-reviewed requests', creates_join_request:true });
    return say(m, `Join-request invite link:\n${link.invite_link}\n\nShare this with prospective members. Review them using /pending.`);
  }
  if (cmd.name === 'pending') {
    return say(m, `For privacy, join-request names are reviewed in a direct chat with the bot. Open the bot privately, send /start, then send /pending ${chat.id}`);
  }
  if (cmd.name === 'stats') {
    const actions = await db()`SELECT action, COUNT(*)::int AS total FROM moderation_logs WHERE chat_id=${chat.id} AND created_at >= NOW() - INTERVAL '7 days' GROUP BY action ORDER BY total DESC LIMIT 8`;
    const pending = await db()`SELECT COUNT(*)::int AS total FROM join_requests WHERE chat_id=${chat.id} AND status='pending'`;
    const formatted = actions.length ? actions.map(x => `${x.action}: ${x.total}`).join('\n') : 'No logged actions';
    return say(m, `Group stats (last 7 days)\n${formatted}\nPending join requests: ${pending[0]?.total ?? 0}`);
  }
  return say(m, 'Unknown admin command. Use /help.');
}

async function showPendingInDM(m, cmd) {
  const chatId = Number(cmd.args);
  if (!Number.isSafeInteger(chatId) || chatId >= 0) return sayUsage(m, '/pending -1001234567890 (use /id in the group)');
  const groupRows = await db()`SELECT title, join_queue, enabled FROM groups WHERE chat_id=${chatId}`;
  if (!groupRows.length || !groupRows[0].enabled) return say(m, 'Group not registered. Add the bot as admin in that group first.');
  if (!await isAdmin(chatId,m.from?.id)) return say(m, 'You must be an administrator of that group.');
  if (!groupRows[0].join_queue) return say(m, 'Join queue is OFF in that group. Turn it on with /queue on.');
  const rows = await db()`SELECT user_id, display_name FROM join_requests WHERE chat_id=${chatId} AND status='pending' ORDER BY requested_at ASC LIMIT 10`;
  if (!rows.length) return say(m, 'No pending requests recorded.');
  await say(m, `Pending join requests — ${groupRows[0].title} (up to 10 shown)`);
  for (const row of rows) {
    await say(m, `${row.display_name}\nTelegram user ID: ${row.user_id}`, {
      reply_markup: { inline_keyboard: [[
        { text:'✅ Approve', callback_data:`join:a:${chatId}:${row.user_id}` },
        { text:'❌ Decline', callback_data:`join:d:${chatId}:${row.user_id}` }
      ]] }
    });
  }
}

async function handleModeration(m, settings) {
  if (!m.from || m.from.is_bot || !settings) return;
  if (!settings.anti_links && !settings.anti_flood && !hasLink(m)) return;
  if (m.new_chat_members || m.left_chat_member) return;
  if (m.text?.startsWith('/')) return;
  if (await isAdmin(m.chat.id, m.from.id)) return;
  if (hasLink(m) && await topicLinksBlocked(m,settings.anti_links)) {
    await tg('deleteMessage', {chat_id:m.chat.id, message_id:m.message_id});
    await audit(m.chat.id, 0, m.from.id, 'link_deleted');
    return;
  }
  if (settings.anti_flood) {
    const rows = await db()`
      INSERT INTO flood_counters(chat_id,user_id,window_started,message_count)
      VALUES(${m.chat.id},${m.from.id},NOW(),1)
      ON CONFLICT(chat_id,user_id) DO UPDATE SET
        message_count = CASE WHEN flood_counters.window_started < NOW() - INTERVAL '10 seconds' THEN 1 ELSE flood_counters.message_count + 1 END,
        window_started = CASE WHEN flood_counters.window_started < NOW() - INTERVAL '10 seconds' THEN NOW() ELSE flood_counters.window_started END
      RETURNING message_count
    `;
    if (rows[0].message_count >= 8) {
      await tg('deleteMessage', {chat_id:m.chat.id,message_id:m.message_id});
      await mute(m.chat.id, m.from.id, 5);
      await db()`DELETE FROM flood_counters WHERE chat_id=${m.chat.id} AND user_id=${m.from.id}`;
      await audit(m.chat.id, 0, m.from.id, 'flood_mute_5m');
      await say(m, `Flood control: user ${m.from.id} muted for 5 minutes.`);
    }
  }
}

async function handleMessage(m, edited = false) {
  if (!m?.chat) return;
  const group = chatIsGroup(m.chat);
  if (group) {
    await ensureGroup(m.chat);
    if (!edited) await discoverTopic(m);
  }

  if (!edited && group && Array.isArray(m.new_chat_members) && m.new_chat_members.length) {
    const settings = await getGroup(m.chat);
    if (settings.welcome_enabled) {
      for (const member of m.new_chat_members.filter(x => !x.is_bot).slice(0, 10)) {
        await say(m, fillWelcome(settings.welcome_text, displayName(member), m.chat.title || 'our group'));
      }
    }
    return;
  }
  if (!edited) {
    const command = parseCommand(m.text, process.env.BOT_USERNAME || '');
    if (command) {
      if (command.name === 'myid') return say(m, `Your Telegram user ID: ${m.from?.id ?? 'unavailable'}`);
      if (command.name === 'id') return say(m, `Chat ID: ${m.chat.id}`);
      if (command.name === 'help' || command.name === 'start') {
        if (!group) {
          await say(m, PRIVATE_HELP);
          return showPrivateGroups(m);
        }
        return say(m, HELP);
      }
      if (!group) {
        if (command.name === 'pending') return showPendingInDM(m, command);
        if (['panel','groups'].includes(command.name)) return showPrivateGroups(m);
        if (command.name === 'settings') {
          const chatId=Number(command.args);
          if (Number.isSafeInteger(chatId) && chatId<0) return showPrivatePanel(m, chatId);
          return showPrivateGroups(m);
        }
        return say(m, 'Use /panel to manage your groups privately.');
      }
      return handleGroupCommand(m, command);
    }
  }
  if (!edited && !group && m.chat.type==='private' && await handleTopicReply(m)) return;
  if (!edited && !group && m.chat.type==='private' && await handlePrivateReply(m)) return;
  if (group) return handleModeration(m, await getGroup(m.chat));
}

async function handleJoinRequest(req) {
  if (!chatIsGroup(req.chat) || !req.from?.id) return;
  const settings = await getGroup(req.chat);
  if (!settings.join_queue) return;
  await db()`
    INSERT INTO join_requests(chat_id,user_id,display_name,status,requested_at)
    VALUES(${req.chat.id},${req.from.id},${displayName(req.from)},'pending',NOW())
    ON CONFLICT(chat_id,user_id) DO UPDATE SET
      display_name=EXCLUDED.display_name,status='pending',requested_at=NOW()
  `;
}

async function handleCallback(query) {
  if (!query.from?.id) return;
  if (await handleTopicCallback(query)) return;
  const dm = query.message?.chat?.type === 'private' && query.message.chat.id === query.from.id;
  if (dm && query.data === 'dm:groups') {
    await tg('answerCallbackQuery',{callback_query_id:query.id});
    return showPrivateGroups({chat:query.message.chat,from:query.from});
  }
  const open=String(query.data || '').match(/^dm:open:(-?\d+)$/);
  if (dm && open) {
    await tg('answerCallbackQuery',{callback_query_id:query.id});
    return showPrivatePanel({chat:query.message.chat,from:query.from},Number(open[1]));
  }
  const dmPending=String(query.data || '').match(/^dm:pending:(-?\d+)$/);
  if (dm && dmPending) {
    await tg('answerCallbackQuery',{callback_query_id:query.id});
    return showPendingInDM({chat:query.message.chat,from:query.from},{args:dmPending[1]});
  }
  const edit=String(query.data || '').match(/^dm:edit:(welcome|rules|daily|announce):(-?\d+)$/);
  if (dm && edit) {
    const chatId=Number(edit[2]);
    const group=await authorizedGroup(chatId,query.from.id);
    if (!group) return tg('answerCallbackQuery',{callback_query_id:query.id,text:'You are not a group administrator.',show_alert:true});
    await tg('answerCallbackQuery',{callback_query_id:query.id});
    const prompts={
      welcome:'Reply with your new welcome text. Use {name} and {group} for automatic names.',
      rules:'Reply with the new group rules.',
      daily:'Reply with the new daily announcement (~9AM Manila), or reply off to disable.',
      announce:'Reply with an announcement to publish in the selected group.'
    };
    return send(query.from.id,`EDIT ${edit[1].toUpperCase()} ${chatId}\n${group.title}\n\n${prompts[edit[1]]}`,{
      reply_markup:{force_reply:true,input_field_placeholder:'Type your message here...'}
    });
  }

  const settingMatch = String(query.data || '').match(/^cfg:(welcome|links|flood|queue|daily):(-?\d+)$/);
  if (settingMatch) {
    const code = settingMatch[1];
    const chatId = Number(settingMatch[2]);
    const isPrivatePanel = query.message?.chat?.type === 'private' && query.message?.chat?.id === query.from.id;
    if ((query.message?.chat?.id !== chatId && !isPrivatePanel) || !Number.isSafeInteger(chatId)) return;
    if (!await isAdmin(chatId, query.from.id)) {
      return tg('answerCallbackQuery',{callback_query_id:query.id,text:'Group admins only.',show_alert:true});
    }
    const rows = await db()`SELECT * FROM groups WHERE chat_id=${chatId}`;
    if (!rows.length) return;
    const old = rows[0];
    const columns = {welcome:'welcome_enabled',links:'anti_links',flood:'anti_flood',queue:'join_queue',daily:'daily_enabled'};
    const column = columns[code];
    const next = !old[column];
    if (code === 'daily' && next && !old.daily_text) {
      return tg('answerCallbackQuery',{callback_query_id:query.id,text:'Set a message first: /daily Your message',show_alert:true});
    }
    const sql = db();
    if (code === 'welcome') await sql`UPDATE groups SET welcome_enabled=${next} WHERE chat_id=${chatId}`;
    if (code === 'links') await sql`UPDATE groups SET anti_links=${next} WHERE chat_id=${chatId}`;
    if (code === 'flood') await sql`UPDATE groups SET anti_flood=${next} WHERE chat_id=${chatId}`;
    if (code === 'queue') await sql`UPDATE groups SET join_queue=${next} WHERE chat_id=${chatId}`;
    if (code === 'daily') await sql`UPDATE groups SET daily_enabled=${next} WHERE chat_id=${chatId}`;
    await audit(chatId,query.from.id,null,`panel_${code}_${next ? 'on':'off'}`);
    const updated = await sql`SELECT * FROM groups WHERE chat_id=${chatId}`;
    await tg('editMessageText',{
      chat_id:query.message.chat.id,message_id:query.message.message_id,
      text:(isPrivatePanel ? '🔐 PRIVATE ADMIN CONTROLS\n\n' : '')+panelText(updated[0]),
      reply_markup:isPrivatePanel ? privatePanelButtons(updated[0]) : panelButtons(updated[0])
    });
    return tg('answerCallbackQuery',{callback_query_id:query.id,text:`${code}: ${yesNo(next)}`});
  }
  const match = String(query.data || '').match(/^join:([ad]):(-?\d+):(\d+)$/);
  if (!match) return;
  const chatId = Number(match[2]);
  const targetId = Number(match[3]);
  if (!Number.isSafeInteger(chatId) || !Number.isSafeInteger(targetId)) return;
  if (query.message?.chat?.type !== 'private' || query.message.chat.id !== query.from.id) return;
  if (!await isAdmin(chatId, query.from.id)) {
    await tg('answerCallbackQuery',{callback_query_id:query.id,text:'Only group admins can review join requests.',show_alert:true});
    return;
  }
  const pending = await db()`SELECT status FROM join_requests WHERE chat_id=${chatId} AND user_id=${targetId}`;
  if (!pending.length || pending[0].status !== 'pending') {
    return tg('answerCallbackQuery',{callback_query_id:query.id,text:'This request was already reviewed or is unavailable.'});
  }
  const approved = match[1] === 'a';
  await tg(approved ? 'approveChatJoinRequest' : 'declineChatJoinRequest', { chat_id:chatId, user_id:targetId });
  await db()`UPDATE join_requests SET status=${approved ? 'approved' : 'declined'} WHERE chat_id=${chatId} AND user_id=${targetId}`;
  await audit(chatId,query.from.id,targetId,approved ? 'join_approved' : 'join_declined');
  await tg('answerCallbackQuery',{callback_query_id:query.id,text:approved ? 'Approved' : 'Declined'});
  if (query.message?.message_id) {
    await tg('editMessageReplyMarkup',{chat_id:query.from.id,message_id:query.message.message_id,reply_markup:{inline_keyboard:[]}});
  }
}

async function handleMyChatMember(update) {
  if (!chatIsGroup(update.chat)) return;
  const status = update.new_chat_member?.status;
  if (status === 'member' || status === 'administrator') {
    await ensureGroup(update.chat);
  } else if (status === 'left' || status === 'kicked') {
    await db()`UPDATE groups SET enabled=FALSE, updated_at=NOW() WHERE chat_id=${update.chat.id}`;
  }
}

export async function handleUpdate(update) {
  if (update.my_chat_member) return handleMyChatMember(update.my_chat_member);
  if (update.chat_join_request) return handleJoinRequest(update.chat_join_request);
  if (update.callback_query) return handleCallback(update.callback_query);
  if (update.message) return handleMessage(update.message, false);
  if (update.edited_message) return handleMessage(update.edited_message, true);
}
