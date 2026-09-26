import {env} from 'cloudflare:workers';
import {briefDay,editionDay,UPDATE_SOURCES,type UpdateItem} from './platform-update-model';
export const updateDb=()=> (env as unknown as {DB:D1Database}).DB;
export async function ensureUpdateTables(){const db=updateDb();await db.batch([
 db.prepare(`CREATE TABLE IF NOT EXISTS platform_update_sources(id TEXT PRIMARY KEY,content TEXT NOT NULL DEFAULT '',checked_at INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '')`),
 db.prepare(`CREATE TABLE IF NOT EXISTS platform_update_items(id TEXT PRIMARY KEY,day TEXT NOT NULL,topic TEXT NOT NULL,content TEXT NOT NULL,published_at INTEGER NOT NULL)`),
 db.prepare(`CREATE INDEX IF NOT EXISTS platform_updates_by_day ON platform_update_items(day)`),
 db.prepare(`CREATE TABLE IF NOT EXISTS platform_update_runs(id TEXT PRIMARY KEY,started_at INTEGER NOT NULL,finished_at INTEGER NOT NULL DEFAULT 0,checked INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '')`)
]);}
export async function readDailyUpdate(){await ensureUpdateTables();const db=updateDb(),now=new Date(),day=editionDay(now);const [items,rows,first]=await Promise.all([
 db.prepare(`SELECT content FROM platform_update_items WHERE day=? ORDER BY published_at DESC`).bind(day).all<{content:string}>(),
 db.prepare(`SELECT id,checked_at,last_error FROM platform_update_sources`).all<{id:string;checked_at:number;last_error:string}>(),
 db.prepare(`SELECT MIN(started_at) started FROM platform_update_runs WHERE finished_at>0 AND checked>0`).first<{started:number}>()
]);const sources=UPDATE_SOURCES.map(s=>rows.results.find(r=>r.id===s.id));const current=sources.every(s=>s&&s.checked_at>Date.now()/1000-28*3600&&!s.last_error);const checkedAt=Math.min(...sources.map(s=>s?.checked_at||0));return{day,items:items.results.map(row=>JSON.parse(row.content) as UpdateItem).sort((a,b)=>Number(b.priority==='ACTION REQUIRED')-Number(a.priority==='ACTION REQUIRED')),status:current?'ready':rows.results.length?'partial':'pending',baseline:!!first?.started&&briefDay(new Date(first.started*1000))===day,checkedAt,sources:UPDATE_SOURCES.map(s=>({name:s.name,url:s.url}))};}
