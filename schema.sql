-- Use a NEW separate Neon PostgreSQL database for this Telegram bot.
CREATE TABLE IF NOT EXISTS groups (
  chat_id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  welcome_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  welcome_text TEXT NOT NULL DEFAULT 'Welcome {name} to {group}! Please read /rules.',
  rules_text TEXT NOT NULL DEFAULT 'Be respectful. No spam, scams, or harassment.',
  anti_links BOOLEAN NOT NULL DEFAULT FALSE,
  anti_flood BOOLEAN NOT NULL DEFAULT FALSE,
  join_queue BOOLEAN NOT NULL DEFAULT FALSE,
  max_warnings INTEGER NOT NULL DEFAULT 3,
  daily_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  daily_text TEXT NOT NULL DEFAULT '',
  daily_last_sent DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS member_warnings (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);
CREATE TABLE IF NOT EXISTS flood_counters (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  window_started TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (chat_id, user_id)
);
CREATE TABLE IF NOT EXISTS join_requests (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  display_name TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  PRIMARY KEY (chat_id, user_id)
);
CREATE TABLE IF NOT EXISTS moderation_logs (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  actor_id BIGINT,
  target_id BIGINT,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS moderation_logs_recent_idx ON moderation_logs(chat_id, created_at DESC);
CREATE TABLE IF NOT EXISTS processed_updates (
  update_id BIGINT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS processed_updates_time_idx ON processed_updates(processed_at);

-- Topic directory and General main-menu state (additive migration)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS menu_message_id BIGINT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS menu_updated_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS group_topics (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  thread_id BIGINT NOT NULL CHECK (thread_id > 0),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  description TEXT NOT NULL DEFAULT '',
  link_policy TEXT NOT NULL DEFAULT 'inherit' CHECK (link_policy IN ('inherit','allow','block')),
  listed BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chat_id,thread_id)
);
CREATE INDEX IF NOT EXISTS group_topics_menu_idx ON group_topics(chat_id,listed,sort_order,thread_id);

-- YAJETZY v3: Optional branded welcome photo and member shortcut buttons.
-- Store Telegram file_id only. Photos and secret tokens are never committed to GitHub.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS welcome_photo_file_id TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS welcome_buttons BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS welcome_last_configured_at TIMESTAMPTZ;

-- YAJETZY v4: opt-in, group-only file finder.
-- Stores filenames, short captions, and Telegram message IDs, never file contents.
ALTER TABLE group_topics ADD COLUMN IF NOT EXISTS file_index_enabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS indexed_files (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL CHECK(message_id > 0),
  thread_id BIGINT NOT NULL CHECK(thread_id > 0),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 200),
  file_name TEXT NOT NULL DEFAULT '',
  caption_text TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  manually_added BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY(chat_id,message_id)
);
CREATE INDEX IF NOT EXISTS indexed_files_chat_recent_idx ON indexed_files(chat_id,indexed_at DESC);
CREATE TABLE IF NOT EXISTS file_search_cooldowns (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chat_id,user_id)
);
CREATE INDEX IF NOT EXISTS file_search_cooldowns_time_idx ON file_search_cooldowns(last_used_at);


-- YAJETZY v5: independent, admin-managed note libraries for Telegram groups.
CREATE TABLE IF NOT EXISTS group_notes (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK(length(slug) BETWEEN 1 AND 48 AND slug ~ '^[a-z][a-z0-9_]*$'),
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 3500),
  created_by BIGINT,
  updated_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chat_id,slug)
);
ALTER TABLE group_notes ADD COLUMN IF NOT EXISTS note_id BIGINT GENERATED BY DEFAULT AS IDENTITY;
CREATE UNIQUE INDEX IF NOT EXISTS group_notes_id_idx ON group_notes(note_id);
CREATE INDEX IF NOT EXISTS group_notes_updated_idx ON group_notes(chat_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS note_cooldowns (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chat_id,user_id)
);
CREATE INDEX IF NOT EXISTS note_cooldowns_time_idx ON note_cooldowns(last_used_at);


-- YAJETZY V6: Member Hub, managed file reviews, report queue and support center.
-- Additive migration; preserves all existing Telegram topics, notes and uploads.
ALTER TABLE indexed_files ADD COLUMN IF NOT EXISTS delivery_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE indexed_files ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (review_status IN ('pending','approved','rejected'));
ALTER TABLE indexed_files ADD COLUMN IF NOT EXISTS reviewed_by BIGINT;
ALTER TABLE indexed_files ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS indexed_files_review_idx ON indexed_files(chat_id,review_status,indexed_at DESC);
CREATE TABLE IF NOT EXISTS file_delivery_cooldowns (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chat_id,user_id)
);
CREATE TABLE IF NOT EXISTS member_reports (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  reporter_id BIGINT NOT NULL,
  target_user_id BIGINT,
  target_message_id BIGINT,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','reviewed','dismissed')),
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS member_reports_queue_idx
  ON member_reports(chat_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  message TEXT NOT NULL CHECK(length(message) BETWEEN 5 AND 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','closed')),
  admin_reply TEXT,
  reviewed_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_tickets_queue_idx
  ON support_tickets(chat_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS member_onboarding (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  rules_ack_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chat_id,user_id)
);


-- YAJETZY welcome topic routing: opt-in per group.
-- A configured welcome_thread_id routes existing banners to that forum topic.
-- Delete General join service notices where the Telegram bot has Delete Messages rights.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS welcome_thread_id BIGINT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS welcome_clear_join_event BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS groups_welcome_thread_idx
  ON groups(chat_id,welcome_thread_id) WHERE welcome_thread_id IS NOT NULL;


-- YAJETZY V6 Security Shield (disabled by default for other groups).
-- No private message contents stored; only hashes/counters and security action metadata.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS security_shield_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS security_block_bots BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS security_newcomer_links BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS security_newcomer_media BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS security_sensitive_spam BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS security_auto_mute BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS security_recent_joins (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chat_id,user_id)
);
CREATE TABLE IF NOT EXISTS security_user_windows (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count INTEGER NOT NULL DEFAULT 0,
  last_fingerprint TEXT NOT NULL DEFAULT '',
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(chat_id,user_id)
);
CREATE TABLE IF NOT EXISTS security_strikes (
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  strike_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(chat_id,user_id)
);
CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES groups(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  reason TEXT NOT NULL,
  action TEXT NOT NULL,
  message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_events_recent_idx ON security_events(chat_id,created_at DESC);


-- YAJETZY V7: per-user interactive /find and /how prompts, with hourly/daily anti-abuse limits.
CREATE TABLE IF NOT EXISTS bot_prompt_sessions (
  chat_id BIGINT NOT NULL,
  prompt_message_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('find','how')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT(NOW()+INTERVAL '10 minutes'),
  PRIMARY KEY(chat_id,prompt_message_id)
);
CREATE INDEX IF NOT EXISTS bot_prompt_sessions_expiry_idx ON bot_prompt_sessions(expires_at);
CREATE TABLE IF NOT EXISTS ai_question_limits (
  chat_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  last_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quota_day DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::DATE,
  daily_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(chat_id,user_id)
);


-- YAJETZY Multi-Group File Federation: opt-in per supergroup.
-- Only live Telegram-confirmed members of source group can search its approved file metadata.
-- Cross-group search never copies content into a different Telegram group.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS federated_search_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS file_autoindex_enabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS groups_federated_idx ON groups(chat_id)
  WHERE enabled=TRUE AND federated_search_enabled=TRUE;
CREATE TABLE IF NOT EXISTS federated_search_cooldowns (
  user_id BIGINT PRIMARY KEY,
  last_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
