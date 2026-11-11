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
4. For each existing topic (Feedbacks, Modules Files, Announcements, etc.), **private registration is recommended**:
   - Open the topic in Telegram and use **Copy Topic Link** (not Copy Message Link).
   - In your **private YAJETZY chat**, send `/topicadd https://t.me/c/4476272910/123 | Feedbacks | Suggestions and improvement ideas`.
   - Replace `123` with the real topic ID from the link, and replace the title and description.
   - The bot validates that you are an administrator of the linked group and confirms privately.
   - Alternative: inside that topic send `/topicregister Feedbacks | Suggestions and improvement ideas`; the bot tries to delete the command and send confirmation in DM.
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


## YAJETZY v3 — Illustrated Welcome & Telegram Command Menu

Inspired by professional Telegram forum welcome bots, but with YAJE Discussions branding and private admin controls.

### Enable image welcome (no public setup spam)
1. Open [@yaje37_bot](https://t.me/yaje37_bot) **private chat**, send `/panel`, choose **YAJE Discussions**.
2. Click **🖼 Set welcome photo**.
3. Reply to the bot's `WELCOME PHOTO ...` message with a regular Telegram **photo**. Use your own logo, poster, or graphic. Send it as a Photo, not a document.
4. The bot saves Telegram's `file_id` in the existing Neon database. It does **not** publish immediately.
5. Click **👀 Preview welcome** privately. If okay, future members who join will see the configured image and the original customized welcome caption.
6. **🗑 Remove welcome photo** restores the text-only welcome. The welcome image feature is optional.
7. **Welcome buttons** toggles Rules, Topic Directory and Help links below the welcome.

### Helpful commands for members
- `/menu` — A clickable topic directory.
- `/rules` or `#rules` — Show the rules.
- `/status` — Check bot response and group moderation status.
- `/help` — Short public guide. Group administration stays private.

To show these commands in Telegram's **slash command autocomplete**:
1. In YAJETZY private `/panel`, choose the group.
2. Press **⌨️ Install Telegram commands**. This registers commands for ALL groups using the bot and private chats. You only need to do this once.
3. In a group, type `/` to view command suggestions.

### Rule buttons on welcome
- The **Read Rules** button links to the bot's private chat with a signed-format start parameter (not a secret). Member access is checked through Telegram `getChatMember` to reduce casual sharing outside the group.
- **Topic Directory** opens the already published menu in General (if one exists). Otherwise it links to the General topic.
- **Help** opens the bot's private guide.

Note: No image from the reference group has been copied. Your own uploaded photo supplies the visual. Existing group rules, topic rules, link moderation and join-approval settings remain intact. The code is deployment-tested by GitHub Actions; the first real new-member welcome must be tested inside Telegram.


## YAJETZY v4 — File Finder (search for existing Telegram file posts)

**Search in the same Telegram group only.** YAJETZY replies with clickable links to the original file messages in that group; it does NOT download, scan, or host those files. Group membership is still required to open private group links.

### Member commands
- `/find example.zip` — search indexed filenames and captions.
- `/search setup guide` — same search.
- `hanap setup guide` or `find setup guide` — chat phrases (not normal chat keywords alone).
- Bot returns up to 5 buttons linking to the original post in the same group.
- An 8-second cooldown per member limits repeated search spam.
- Slash command autocomplete: private `/panel` → YAJE Discussions → **⌨️ Install Telegram commands** again to refresh the list after this upgrade.

### Enable automatic indexing per topic (OFF by default)
1. Open **@yaje37_bot private chat**, send `/panel`.
2. Select the group, then **🗂 Topics & Main Menu**.
3. Register each desired topic first (if not yet listed) by copying its Topic Link and using `/topicadd LINK | Topic Name | Description` privately.
4. Tap a topic → **⬜ Auto-index new files** → turn it ON.
5. From that point on, new **document uploads** in that topic are indexed by filename and caption; old posts are NOT backfilled.
6. Only enable indexing for topics where shared files are intended for member discovery. Tell members which topics are indexed.

### Add old file posts manually
- **Option A: Reply in group.** Reply directly to an existing Telegram **document/file post** with `/index` or `/index Custom searchable name`. Only group admins can do this. The bot will try to delete the command and confirm in your private DM. Run `/start` privately first.
- **Option B: In private DM.** Copy **Message Link** from the original file post, then send:
  `/fileadd https://t.me/c/4476272910/TOPIC_ID/MESSAGE_ID | File display name`
  (Replace IDs with actual message link values. General messages may have a shorter URL.)
  The bot verifies you are a group admin but cannot verify content of historical links. Please check it manually.

### Remove an unwanted search result
- Reply to the original indexed file post with `/unindex` as an admin.
- Deleting a file message in Telegram does not automatically remove its index record; admins should unindex files that were removed.

### Notes
- Telegram Bot API cannot download/search an entire existing group history through normal bot access. Searching begins when a topic is enabled and new documents arrive, or when admins index old posts.
- Never treat an indexed file as verified safe. Review unfamiliar files, especially executable software, before trusting them.
- File index and search cooldown records are scoped by Telegram group ID. They include only filenames, small captions, Telegram message IDs, and metadata—never uploaded file bytes.
- Indexing settings for existing topics start OFF. Enabling them does not change the existing Welcome, Rules, moderation, or Join Request settings.


## YAJETZY v5 — Notes Library (like /get notename and #notename)

This is a separate system from `/find` File Finder.

### For group members
- `/notes` — See the saved note names for **this group**.
- `/get welcome_guide` — Ask YAJETZY for saved text or a URL.
- `#welcome_guide` — Quick shortcut; the bot replies to the hashtag with the saved note.
- Unknown `#hashtags` are ignored, so regular discussion is not interrupted.
- There is a short 4-second cooldown per member to limit repeated bot responses.
- Notes do not grant access to private group files or prove an external download is safe.

### For admins: add a note entirely in private DM
1. Open [@yaje37_bot](https://t.me/yaje37_bot) privately and send `/panel` (or `/notes`).
2. Select the group you actually administer.
3. Click **📚 Notes Library**.
4. Click **➕ Add note**.
5. **Reply to the bot's NOTE ADD prompt** with a name, vertical bar, and content:

   `welcome_guide | Welcome! Read our rules using /rules, then open /menu to browse topics.`

   Or use a carefully verified external URL as the note content.
6. YAJETZY confirms saving. In the group, members can now type `#welcome_guide` or `/get welcome_guide`.

### Editing and removing notes
- In private **Notes Library**, choose the note name.
- **✏️ Edit note** prompts you to reply with replacement content.
- **🗑 Delete note** asks for confirmation. Members can no longer retrieve it afterward.
- Notes are stored separately by `chat_id` in Neon.
- Only administrators with current Telegram group admin permissions can modify notes.

### Name limits and safety
- Names use **lowercase a-z, 0-9, and underscores**, starting with a letter (1–48 characters). Examples: `welcome_guide`, `module_faq`, `feedback`.
- Keep note text within 3,500 characters. URLs are clickable as normal Telegram plain text.
- Built-in names such as `rules`, `help`, `menu`, `start`, `status`, and `notes` are reserved.
- Do not paste credentials, private links, malware, or unverified downloads into public notes. Admins should check external resources before sharing.
- We intentionally DO NOT copy the contents or links of another community's private notes.

### Enable slash command suggestions
The /get and /notes commands are added to the bot's source menu definition. In YAJETZY private `/panel` → choose group → **⌨️ Install Telegram commands** to update the Telegram command menu.
