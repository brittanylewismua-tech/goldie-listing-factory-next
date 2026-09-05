CREATE INDEX IF NOT EXISTS idx_printify_draft_owned_product
ON printify_draft_results(user_id,json_extract(response_json,'$.id'))
WHERE status='succeeded';

CREATE INDEX IF NOT EXISTS idx_printify_draft_user_client_status
ON printify_draft_results(user_id,client_id,status);
