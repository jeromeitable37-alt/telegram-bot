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
