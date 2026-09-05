-- Charge a creation in the month it succeeded, never the month it was edited.
ALTER TABLE printify_draft_results ADD COLUMN created_at TEXT;
UPDATE printify_draft_results SET created_at=updated_at WHERE status='succeeded' AND created_at IS NULL;
CREATE TRIGGER IF NOT EXISTS stamp_successful_draft_creation
AFTER UPDATE OF status ON printify_draft_results
WHEN NEW.status='succeeded' AND NEW.created_at IS NULL
BEGIN
  UPDATE printify_draft_results SET created_at=CURRENT_TIMESTAMP WHERE request_key=NEW.request_key;
END;
CREATE INDEX IF NOT EXISTS idx_draft_creation_usage ON printify_draft_results(user_id,status,created_at);
