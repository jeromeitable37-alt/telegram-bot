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
