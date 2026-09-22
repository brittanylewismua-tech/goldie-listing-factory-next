/** Search the entire saved history before paging; never search just the loaded page. */
export function batchHistoryQuery(params:URLSearchParams){
 const query=(params.get("query")||"").trim().slice(0,200);
 const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get("page"))||1)));
 const sort=params.get("sort")==="oldest"?"oldest":"recent";
 const limit=20,offset=(page-1)*limit;
 const where="user_id=? AND parent_batch_id IS NULL"+(query?" AND (instr(lower(setup_name),lower(?))>0 OR instr(lower(product_title),lower(?))>0 OR instr(lower(CASE WHEN json_valid(state_json) THEN coalesce(json_extract(state_json,'$.batchDisplayName'),'') || ' ' || coalesce(json_extract(state_json,'$.run.bundleName'),'') || ' ' || coalesce(json_extract(state_json,'$.activeBundle.name'),'') || ' ' || coalesce(json_extract(state_json,'$.bundleRecipes'),'') ELSE '' END),lower(?))>0)":"");
 const order=sort==="oldest"?"updated_at ASC,id ASC":"updated_at DESC,id DESC";
 const selectSql=`SELECT id,status,step,setup_name,product_title,design_count,state_json,created_at,updated_at FROM listing_batches WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`;
 const countSql=`SELECT COUNT(*) AS total FROM listing_batches WHERE ${where}`;
 return {query,page,sort,limit,offset,where,searchBindings:query?[query,query,query]:[],order,selectSql,countSql};
}
