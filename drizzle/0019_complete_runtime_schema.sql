CREATE TABLE IF NOT EXISTS mockup_render_jobs (id text PRIMARY KEY NOT NULL,user_id text NOT NULL,request_id text NOT NULL,model text NOT NULL,status text DEFAULT 'queued' NOT NULL,usage_key text NOT NULL,object_key text,content_type text,last_error text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);
CREATE TABLE IF NOT EXISTS mockup_set_preferences (user_id text NOT NULL,source_theme text NOT NULL,display_name text NOT NULL,hidden integer DEFAULT 0 NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY (user_id,source_theme));
CREATE TABLE IF NOT EXISTS stripe_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS trial_reminder_emails (user_id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, resend_email_id TEXT NOT NULL, scheduled_for INTEGER NOT NULL, canceled_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- The preparation columns are added defensively by ensureMockupStorage().
-- SQLite has no portable `ADD COLUMN IF NOT EXISTS`, and older deployments may
-- already have these columns from that runtime guard. Keeping the ALTERs here
-- makes an otherwise safe deployment fail with "duplicate column name".
