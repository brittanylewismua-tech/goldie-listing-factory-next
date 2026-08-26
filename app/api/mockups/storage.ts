import { env } from "cloudflare:workers";

export async function ensureMockupStorage(){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mockup_templates (id text PRIMARY KEY NOT NULL,user_id text NOT NULL,theme text NOT NULL,name text NOT NULL,surface_kind text NOT NULL,corners_json text NOT NULL,object_key text NOT NULL,content_type text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mockup_templates_user_theme ON mockup_templates (user_id,theme)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mockup_render_usage (user_day text PRIMARY KEY NOT NULL,user_id text NOT NULL,day text NOT NULL,count integer DEFAULT 0 NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mockup_render_jobs (id text PRIMARY KEY NOT NULL,user_id text NOT NULL,request_id text NOT NULL,model text NOT NULL,status text DEFAULT 'queued' NOT NULL,usage_key text NOT NULL,object_key text,content_type text,last_error text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mockup_render_jobs_user ON mockup_render_jobs (user_id,created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mockup_set_preferences (user_id text NOT NULL,source_theme text NOT NULL,display_name text NOT NULL,hidden integer DEFAULT 0 NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY (user_id,source_theme))`),
  ]);
  /* D573 - the scene placement contract. CREATE TABLE IF NOT EXISTS above will
     not add columns to a table that already exists, so these run separately and
     each one is allowed to fail: on a database that already has the column, D1
     raises "duplicate column name" and that is the success case. */
  for (const column of [
    `ALTER TABLE mockup_templates ADD COLUMN print_side text NOT NULL DEFAULT 'front'`,
    `ALTER TABLE mockup_templates ADD COLUMN quad_means text NOT NULL DEFAULT 'garment'`,
    `ALTER TABLE mockup_templates ADD COLUMN occlusion_key text`,
    `ALTER TABLE mockup_templates ADD COLUMN occlusion_confirmed integer NOT NULL DEFAULT 0`,
  ]) await env.DB.prepare(column).run().catch(() => undefined);
}
