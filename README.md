# Telegram Multi-Group Manager

A Telegram bot for managing multiple groups, with per-group settings, moderation controls, welcome messages, member warnings, join-request review, announcements, and daily reminders.

## Stack
- Next.js API routes on Vercel
- Telegram Bot API (authenticated webhook)
- Neon Postgres

## Setup overview
1. Create a bot with [@BotFather](https://t.me/BotFather).
2. Create a **separate** Neon database and run `schema.sql`.
3. Set the environment variables shown in `.env.example` on Vercel.
4. Deploy this repo as a Next.js Vercel project.
5. Register the webhook using `npm run webhook:set -- https://YOUR-DOMAIN.vercel.app`.
6. Add your bot as a group admin, then send `/help`, `/id`, and `/panel`.

Never commit your bot token or database credentials. See `START_HERE_TAGLISH.md` for details.

> Bot features are not live until database, Vercel environment variables, deployment and Telegram webhook are configured.
