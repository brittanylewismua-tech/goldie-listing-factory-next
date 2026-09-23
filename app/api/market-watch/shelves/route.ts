import {NextResponse} from 'next/server';
import {withErrorLog} from '@/app/error-log';
import {requireFeatureApi} from '@/app/require-feature';
import {shelfIds} from '@/app/sold-overnight';

/**
 * THE PRODUCT TYPES A PRINT-ON-DEMAND SELLER MAKES.
 *
 * Etsy files one shelf under several taxonomy ids - there is a T-shirts node
 * under men's, women's, unisex and kids, and a seller choosing a blank does
 * not care which sub-department Etsy filed it in. They are grouped back into
 * the shelf a seller recognises, with every id kept, because the scan divides
 * its pages across them rather than picking one and silently dropping the
 * rest.
 */
export const GET = withErrorLog('market-watch-shelves', async () => {
  const access = await requireFeatureApi('marketWatch');
  if (!access.ok) return access.response;
  const rows = await shelfIds().catch(() => []);
  const grouped = new Map<string, number[]>();
  for (const row of rows) grouped.set(row.label, [...(grouped.get(row.label) ?? []), row.id]);
  /* Alphabetical, so the list does not reorder itself between visits as the
     corpus changes underneath it. */
  const shelves = [...grouped.entries()]
    .map(([label, ids]) => ({label, ids}))
    .sort((a, b) => a.label.localeCompare(b.label));
  return NextResponse.json({shelves}, {headers: {'Cache-Control': 'private, max-age=3600'}});
});
