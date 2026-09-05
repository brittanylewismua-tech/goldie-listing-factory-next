/** A batch-wide choice changes only this owner's run, never saved product defaults. */
export const APPLY_BUNDLE_KEYWORD_BANK=`
WITH target(bank,owner,run) AS (VALUES (?,?,?))
UPDATE listing_batches SET state_json=json_set(state_json,
  '$.autoTitleBankId',(SELECT bank FROM target),
  '$.manualKeywordBankId',(SELECT bank FROM target),
  '$.activeRecipe.keywordListId',(SELECT bank FROM target),
  '$.bundleRecipes',json((SELECT json_group_array(json_set(value,'$.keywordListId',(SELECT bank FROM target))) FROM json_each(state_json,'$.bundleRecipes')))
),updated_at=CURRENT_TIMESTAMP
WHERE user_id=(SELECT owner FROM target)
  AND (id=(SELECT run FROM target) OR parent_batch_id=(SELECT run FROM target))
  AND EXISTS (SELECT 1 FROM keyword_lists WHERE id=(SELECT bank FROM target) AND user_id=(SELECT owner FROM target))
RETURNING id`;
