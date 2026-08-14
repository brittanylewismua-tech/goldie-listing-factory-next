import { env } from "cloudflare:workers";

export async function ensureMockupStorage(){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mockup_templates (id text PRIMARY KEY NOT NULL,user_id text NOT NULL,theme text NOT NULL,name text NOT NULL,surface_kind text NOT NULL,corners_json text NOT NULL,object_key text NOT NULL,content_type text NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mockup_templates_user_theme ON mockup_templates (user_id,theme)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mockup_render_usage (user_day text PRIMARY KEY NOT NULL,user_id text NOT NULL,day text NOT NULL,count integer DEFAULT 0 NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`),
  ]);
}
