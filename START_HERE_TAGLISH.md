# Telegram Multi-Group Manager — Taglish Setup

**Goal:** Iisang Telegram bot para sa maraming groups, pero independent ang rules, welcome messages, moderation at announcements ng bawat group.

## Steps

1. Open [@BotFather](https://t.me/BotFather). Send `/newbot`, then choose a name and username. Keep the token private.
2. Open [Neon](https://console.neon.tech/). Create a **separate database** for this bot. Paste and run `schema.sql` in its SQL Editor.
3. Open [Vercel](https://vercel.com/new), import `jeromeitable37-alt/telegram-bot`, choose Next.js and deploy to Production.
4. In Vercel Project Settings > Environment Variables, add these variables with your **real values**:
   - `BOT_TOKEN` (BotFather's secret token)
   - `BOT_USERNAME` (without @)
   - `DATABASE_URL` (Neon's Postgres connection string)
   - `TELEGRAM_WEBHOOK_SECRET` (random letters, numbers, `_` or `-`)
   - `CRON_SECRET` (a different strong random string)
   - Optional `OWNER_TELEGRAM_ID` (get it by sending `/myid` to the bot after setup)
5. Redeploy after saving the environment variables. Open `https://YOUR-VERCEL-DOMAIN/api/health` — the page should return `ok: true`.
6. On your own PC, create `.env.local` using `.env.example` as a reference. Do **not** upload `.env.local` to GitHub.
7. Run `npm install` and then `npm run webhook:set -- https://YOUR-VERCEL-DOMAIN`. Check with `npm run webhook:check`.
8. Add the bot as admin to every Telegram group. Grant **delete messages**, **restrict/ban users**, and **invite users/manage requests** only.
9. In each group, send `/id`, `/help`, `/settings`, and `/panel`.

## Useful commands

- `/panel` — group admin setting buttons
- `/setrules Respect everyone` — save rules
- `/setwelcome Welcome {name} to {group}!` — customize welcome
- `/links on` — enable anti-link filtering (OFF by default)
- `/flood on` — enable flood protection (OFF by default)
- `/warn` — reply to someone's message to warn
- `/mute 10m` — reply to a member to mute temporarily
- `/announce Meeting at 8 PM` — send group announcement
- `/daily Check the pinned notice` — daily reminder (~9 AM Manila)
- `/queue on` then `/invitelink` — invite link requiring join-request approval
- `/pending CHAT_ID` — in a **private DM with the bot** for an authorized admin to approve requests

## Important notes

- The GitHub repository is **public**. Never commit BotFather token, Neon credentials, or secret values.
- The web page is an informational landing page, **not** an authenticated web dashboard. The actual admin panel uses `/panel` **inside Telegram**.
- Start in a test group. Admin moderation permissions can delete messages and restrict members when switches are turned ON.
- Group link `t.me/c/...` is not enough for the bot to join automatically. You must add it through Telegram.
- The source code is not a live bot until deployed with database, environment variables, and webhook.


## YAJETZY v2 — Topic Management at Main Menu

**Safe by default:** Deployment itself does NOT send any message into your group.
The topic directory is posted only when an authorized administrator presses Publish / Refresh in the bot's private chat.

1. Open [@yaje37_bot](https://t.me/yaje37_bot) and send `/panel`.
2. Select **YAJE Discussions**, then click **🗂 Topics & Main Menu**.
3. The **General** topic is already registered as topic ID 1.
4. For each existing topic (Feedbacks, Modules Files, Announcements, etc.):
   - Open that topic in the Telegram group.
   - Send `/topicregister Feedbacks | Suggestions and improvement ideas` (replace name/description).
   - The bot tries to delete the registration command to avoid clutter.
   - Your bot should send a registration confirmation **in your private DM**. If not, send `/start` privately first.
5. Return to private `/panel` → **Topics & Main Menu**. Choose a topic to edit its directory title, description, visible status, or link rules.
6. Click **Preview main menu** first. Then click **📌 Publish / Refresh General menu**. This sends or edits one menu in the group's General topic, and attempts to pin it (bot needs **Pin Messages** permission).
7. Whenever you change topic details, click **Publish / Refresh** again to update the posted directory.

### Topic-specific link rules

Each topic defaults to **INHERIT** (uses existing global Link blocking setting). Tap the private panel's Link Policy button to cycle:
- **ALLOW**: permit links only in that topic, even if group blocking is ON.
- **BLOCK**: remove links only in that topic, even if group blocking is OFF.
- **INHERIT**: use the existing group-wide setting.

The bot needs **Delete Messages** for blocking to work. Be careful using BLOCK in a resources-focused topic; do not share or endorse untrusted files.

### Why topic registration is needed

Telegram's Bot API does not expose a complete list of existing topics. It provides a `message_thread_id` on topic messages and topic creation events for new topics. Registration is a one-time step to obtain the correct topic ID and name for old topics. The bot can discover topic IDs when members post in existing topics, but those are hidden from the public directory until named/activated by an admin.

Current group: YAJE Discussions `-1004476272910`. This group has **Topics** enabled. Your public invite link is not necessary for bot registration.

### Troubleshooting

- The topic is not listed: send `/topicregister Name | Description` **inside that topic** and reopen the private menu.
- Bot did not delete the command: enable Telegram **Delete Messages** admin permission.
- Bot did not pin main menu: enable **Pin Messages**, or pin the new menu manually.
- Bot did not send DM: open the bot privately and send `/start`, then retry.
- Main menu shows old descriptions: press **Publish / Refresh General menu** again.
- Publishing returns `not enough rights`: verify that the bot can send messages and pin messages in the group.
