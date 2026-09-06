type PricedDraft = {
  id?: string;
  priceEdits?: Record<string, number>;
  costReview?: { approved: boolean; variants: Array<{id: number; price: number}> };
};

// Printify variant IDs identify sizes/colors, not a listing's print costs.
// Front-only and front/back listings can share every ID but need different prices.
export function draftPriceEdits(draft: PricedDraft): Record<string, number> {
  return Object.fromEntries((draft.costReview?.variants || []).map(variant =>
    [String(variant.id), draft.priceEdits?.[String(variant.id)] ?? variant.price]));
}

export function updateDraftPriceEdits<T extends PricedDraft>(drafts: T[], ids: Set<string>, prices: Record<string, number>): T[] {
  let changed = false;
  const next = drafts.map(draft => {
    if (!draft.id || !ids.has(draft.id) || !draft.costReview) return draft;
    const edits = Object.fromEntries(draft.costReview.variants.map(variant =>
      [String(variant.id), prices[String(variant.id)] ?? draft.priceEdits?.[String(variant.id)] ?? variant.price]));
    if (draft.priceEdits && Object.keys(edits).length === Object.keys(draft.priceEdits).length &&
        Object.entries(edits).every(([id, price]) => draft.priceEdits?.[id] === price)) return draft;
    changed = true;
    return {...draft, priceEdits: edits, costReview: {...draft.costReview, approved: false}};
  });
  return changed ? next : drafts;
}

/** Reconcile a stale batch flag only from explicit finished-product price receipts. */
export function finalPriceApproval(drafts:Array<{status?:string;costReview?:{required?:boolean;verified?:boolean;approved?:boolean}}>):boolean|null{
  const created=drafts.filter(draft=>draft.status==='Created');
  if(created.some(draft=>draft.costReview?.required&&(!draft.costReview.approved||!draft.costReview.verified)))return false;
  if(created.length&&created.every(draft=>draft.costReview?.required&&draft.costReview.verified&&draft.costReview.approved))return true;
  return null;
}
