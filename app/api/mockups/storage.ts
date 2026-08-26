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
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mockup_scene_geometry (id text PRIMARY KEY NOT NULL,user_id text NOT NULL,scene_id text NOT NULL,product_family text NOT NULL,print_side text NOT NULL,blueprint_id integer,print_provider_id integer,rendering_mode text NOT NULL,surface_json text NOT NULL,curvature text DEFAULT '0' NOT NULL,fabric_strength text DEFAULT '0' NOT NULL,blend_mode text DEFAULT 'normal' NOT NULL,foreground_key text,preparation_version integer,source_width integer DEFAULT 0 NOT NULL,source_height integer DEFAULT 0 NOT NULL,origin text DEFAULT 'automatic' NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_scene_geometry_user_scene ON mockup_scene_geometry (user_id,scene_id)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mockup_artwork_overrides (id text PRIMARY KEY NOT NULL,user_id text NOT NULL,listing_id text NOT NULL,design_key text NOT NULL,scene_id text NOT NULL,offset_u text DEFAULT '0' NOT NULL,offset_v text DEFAULT '0' NOT NULL,scale_multiplier text DEFAULT '1' NOT NULL,rotation text DEFAULT '0' NOT NULL,skew_x text DEFAULT '0' NOT NULL,skew_y text DEFAULT '0' NOT NULL,flip_x integer DEFAULT 0 NOT NULL,flip_y integer DEFAULT 0 NOT NULL,opacity text DEFAULT '1' NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_artwork_override_listing ON mockup_artwork_overrides (user_id,listing_id,design_key)`),
  ]);
  /* D596 - added to the override after the table shipped. */
  for (const column of [
    `ALTER TABLE mockup_artwork_overrides ADD COLUMN batch_id text NOT NULL DEFAULT ''`,
    `ALTER TABLE mockup_artwork_overrides ADD COLUMN corner_adjust_json text`,
    `ALTER TABLE mockup_artwork_overrides ADD COLUMN blend_mode text`,
    `ALTER TABLE mockup_artwork_overrides ADD COLUMN fabric_strength text`,
    `ALTER TABLE mockup_artwork_overrides ADD COLUMN curvature text`,
  ]) await env.DB.prepare(column).run().catch(() => undefined);
  /* D573 - the scene placement contract. CREATE TABLE IF NOT EXISTS above will
     not add columns to a table that already exists, so these run separately and
     each one is allowed to fail: on a database that already has the column, D1
     raises "duplicate column name" and that is the success case. */
  for (const column of [
    `ALTER TABLE mockup_templates ADD COLUMN print_side text NOT NULL DEFAULT 'front'`,
    `ALTER TABLE mockup_templates ADD COLUMN quad_means text NOT NULL DEFAULT 'garment'`,
    `ALTER TABLE mockup_templates ADD COLUMN occlusion_key text`,
    `ALTER TABLE mockup_templates ADD COLUMN occlusion_confirmed integer NOT NULL DEFAULT 0`,
    `ALTER TABLE mockup_templates ADD COLUMN preparation_status text NOT NULL DEFAULT 'queued'`,
    `ALTER TABLE mockup_templates ADD COLUMN preparation_json text`,
    `ALTER TABLE mockup_templates ADD COLUMN preparation_error text NOT NULL DEFAULT ''`,
    `ALTER TABLE mockup_templates ADD COLUMN preparation_attempts integer NOT NULL DEFAULT 0`,
  ]) await env.DB.prepare(column).run().catch(() => undefined);
}
