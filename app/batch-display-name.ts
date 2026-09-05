/** Rename the owned run and its children together; never product defaults. */
export const RENAME_BATCH=`
WITH target(name,owner,batch) AS (VALUES (?,?,?)), root(id) AS (
 SELECT COALESCE(parent_batch_id,id) FROM listing_batches
 WHERE id=(SELECT batch FROM target) AND user_id=(SELECT owner FROM target)
)
UPDATE listing_batches SET state_json=json_set(state_json,'$.batchDisplayName',(SELECT name FROM target)),updated_at=CURRENT_TIMESTAMP
WHERE user_id=(SELECT owner FROM target) AND (id=(SELECT id FROM root) OR parent_batch_id=(SELECT id FROM root))
RETURNING id`;
