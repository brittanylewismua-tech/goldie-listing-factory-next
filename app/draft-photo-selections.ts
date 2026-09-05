/** Resolve each product's defaults before merging bundle members. An explicit
 * empty array is a seller decision, not a request to fall back to defaults. */
export function draftPhotoSelections(
  drafts:ReadonlyArray<{id?:string}>,
  selections:Record<string,number[]>,
  defaults:readonly number[],
):Record<string,number[]>{
  return Object.fromEntries(drafts.filter(draft=>draft.id).map(draft=>[
    draft.id!,[...(selections[draft.id!]??defaults)],
  ]));
}
