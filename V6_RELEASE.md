
# YAJETZY V6 — Community OS Release Guide

This release extends YAJETZY's existing Telegram bot. It does **not** replace or delete existing notes, groups, topics, menu messages, or moderation settings.

## What's implemented

- **Telegram Mini App:** `/mini` at the existing production host; launch it from a **private** chat with `@yaje37_bot` by sending `/hub`, or press **V6 Admin Dashboard** in the private `/panel`.
- **Authentication:** backend verifies Telegram's signed WebApp `initData` using the existing server-only `BOT_TOKEN`; rejects stale or forged data. Each request checks current membership with `getChatMember`; all write actions additionally check current administrator role.
- **Smart File Center:** new document posts in opt-in topics join the pending review queue. Admins may approve/reject after examining the original Telegram message. Approved posts become searchable via `/find`, `/smart` and Mini App and can be sent using Telegram `copyMessage` (existing direct-send feature).
- **Bulk importing older files:** V6 admin File Center accepts up to 30 lines of `https://t.me/c/GROUP/TOPIC/MESSAGE | filename`. All imported entries remain **pending** until an admin checks each original post. The Bot API does not expose the group's historical message library, so fully automatic old-history import is not supported.
- **Advanced Moderation:** `/report reason` as a reply in the group sends a report to a manual admin review queue. The Mini App shows reports, timestamps, target IDs if known, and review/dismiss controls; reports do not auto-ban anyone. Existing `/ban`, `/mute`, `/restrict`, `/warn`, `/modcheck` remain available in Telegram and use Telegram admin rights.
- **Member Hub:** read and acknowledge community rules, open support tickets, view your own ticket replies, and privately report concerns.
- **Smart Search:** `/smart keyword` or the Mini App searches approved files and matching saved notes with partial/fuzzy filename matching.
- **Admin Console:** file review, report queue, support replies, topic visibility/indexing switches, announcement posts, metrics and recent moderation logs. Topic menu visibility changes need a **Publish / Refresh General menu** action from the bot's private `/panel`.

## Phased smoke-test checklist

1. Open **@yaje37_bot** privately and send `/hub`. The bot should send an **Open YAJETZY V6** button. A normal browser outside Telegram should show an **Open in Telegram** notice instead of silently authenticating.
2. Confirm you can select **YAJE Discussions** and see its existing topics and notes. Non-members must not see its private data; regular members must not access Admin Console or admin-only API writes.
3. As an administrator, open **Modules Files** and upload a harmless test PDF. It should appear as **Pending** in V6 File Center; its link is viewable for admins to verify.
4. Approve the PDF. In **General** send `/find filename` and `/smart filename`. Search should produce the original Telegram link. `📥 Send File Here` should copy it if Telegram permits.
5. As a regular member, acknowledge the rules and open a test support ticket. In Admin Console, answer it. The answer appears on the member's ticket; direct Telegram DM may fail until the user starts the bot.
6. Reply to a test message with `/report test reason`. Verify it appears in the admin review queue. Mark it reviewed; confirm no member was automatically banned.
7. Run `/modcheck` to verify both the bot and your administrator account have the **Ban Users / Restrict Members** right before testing mute/ban commands.
8. In Admin Console, test a harmless announcement. Be sure you want it posted: the tool posts it immediately in the group.

## Important safety and platform constraints

- YAJETZY **does not scan** APK, ZIP, or module contents. Do not approve unknown downloads or device/security modifications; never auto-deliver unreviewed files.
- The Telegram Bot API cannot enumerate every existing group member or retrieve all old messages. Do not claim a complete backfill without explicit post IDs or forwarded files.
- All file links refer to Telegram messages in the selected group. Telegram access controls still apply; people outside the group cannot open private group file posts.
- The Mini App deliberately requires Telegram-signed authorization; there is no insecure public dashboard login, no Telegram OTP collection, and no exposed bot token.
- Report records and support messages are available to group administrators only; ordinary users see their own tickets.
- These features are admin-controlled and have test coverage, but actual Telegram upload, in-app authentication, and Telegram moderation permissions still require a real chat smoke test.

## Production references

GitHub repository: `jeromeitable37-alt/telegram-bot`

Production host: `https://telegram-bot-theta-nine.vercel.app/`

Mini App route: `https://telegram-bot-theta-nine.vercel.app/mini`

Neon: TG bot project `bitter-moon-04220766`, database `neondb`. **Do not run V6 migrations on any other Neon project.**
