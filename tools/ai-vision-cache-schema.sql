CREATE TABLE IF NOT EXISTS ai_vision_requests (
  request_key TEXT PRIMARY KEY NOT NULL,
  lease_id TEXT NOT NULL,
  response_json TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_vision_requests_expiry ON ai_vision_requests(expires_at);
