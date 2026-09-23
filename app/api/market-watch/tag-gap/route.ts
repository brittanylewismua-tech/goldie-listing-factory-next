import {NextResponse} from 'next/server';
import {withErrorLog} from '@/app/error-log';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {isOwner} from '@/app/mastermind/access';
import {etsyApiCredential,recordEtsyCall,waitForEtsyCapacity} from '@/app/api/etsy/client';
import {listingDisplay,type EtsyDisplayListing} from '@/app/etsy-listing-display';
import {scanParams,SCAN_PAGE} from '@/app/keyword-scan';

/**
 * DOES A WINNING LISTING WEAR DIFFERENT TAGS? MEASURED, NOT ASSUMED.
 *
 * Owner-only, read-only, and temporary. The proposed centrepiece of the
 * rebuilt Command Center is that the 13 tags on a listing are public, and
 * that the ones which appear far more often among listings buyers favorite
 * than among listings they ignore are worth copying. That is a claim about
 * the world, so it gets tested before anything is designed on it.
 *
 * Method: scan a phrase, hydrate tags, score each listing by favorites per
 * day on sale, then compare tag frequency in the top fifth against the
 * bottom half. A tag is reported with the lift between the two.
 */
export const GET = withErrorLog('tag-gap', async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user)) return NextResponse.json({error: 'Not authorized.'}, {status: 403});
  const phrase = (new URL(request.url).searchParams.get('phrase') ?? '').trim().slice(0, 80);
  if (!phrase) return NextResponse.json({error: 'Give a phrase.'}, {status: 400});

  const page = async (offset: number) => {
    await waitForEtsyCapacity();
    const response = await fetch(`https://openapi.etsy.com/v3/application/listings/active?${scanParams(phrase, offset)}`,
      {headers: {'x-api-key': etsyApiCredential()}, signal: AbortSignal.timeout(25_000)});
    await recordEtsyCall(response, 'qa');
    if (!response.ok) return {rows: [] as EtsyDisplayListing[], total: null as number | null};
    const body = await response.json() as {count?: number; results?: EtsyDisplayListing[]};
    return {rows: body.results ?? [], total: typeof body.count === 'number' ? body.count : null};
  };

  const first = await page(0);
  const more = await Promise.all([1, 2].map(index => page(index * SCAN_PAGE).then(result => result.rows).catch(() => [])));
  const rows = [...first.rows, ...more.flat()];
  const ids = [...new Set(rows.map(row => Number(row.listing_id)).filter(Boolean))];

  /* Whether the search response already carries tags decides whether the real
     feature costs ten calls or twenty. Reported either way. */
  const tagsOnSearch = rows.filter(row => Array.isArray(row.tags) && row.tags.length).length;

  const detail = new Map<number, EtsyDisplayListing>();
  for (let start = 0; start < ids.length; start += 100) {
    const batch = await listingDisplay(ids.slice(start, start + 100), 'qa').catch(() => null);
    if (batch) for (const [id, row] of batch) detail.set(id, row);
  }

  const now = Math.floor(Date.now() / 1000);
  const scored = ids.map(id => {
    const row = {...rows.find(entry => Number(entry.listing_id) === id), ...detail.get(id)} as EtsyDisplayListing;
    const age = row.original_creation_timestamp
      ? Math.max(1, Math.floor((now - row.original_creation_timestamp) / 86_400)) : null;
    return {
      id, tags: (row.tags ?? []).map(tag => String(tag).toLowerCase().trim()).filter(Boolean),
      favorites: row.num_favorers ?? null, age,
      rate: row.num_favorers != null && age && age >= 7 ? row.num_favorers / age : null,
    };
  }).filter(entry => entry.rate !== null && entry.tags.length);

  scored.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const top = scored.slice(0, Math.max(1, Math.floor(scored.length * 0.2)));
  const bottom = scored.slice(Math.floor(scored.length * 0.5));
  const share = (group: typeof scored, tag: string) =>
    group.filter(entry => entry.tags.includes(tag)).length / Math.max(1, group.length);

  const universe = [...new Set(scored.flatMap(entry => entry.tags))];
  const lift = universe.map(tag => ({
    tag, top: +share(top, tag).toFixed(3), bottom: +share(bottom, tag).toFixed(3),
    topCount: top.filter(entry => entry.tags.includes(tag)).length,
  })).filter(entry => entry.topCount >= 3)
    .map(entry => ({...entry, lift: +((entry.top + 0.01) / (entry.bottom + 0.01)).toFixed(2)}))
    .sort((a, b) => b.lift - a.lift);

  return NextResponse.json({
    phrase, total: first.total, scanned: rows.length, scored: scored.length,
    tagsOnSearch, topGroup: top.length, bottomGroup: bottom.length,
    medianTopRate: top.length ? +(top[Math.floor(top.length / 2)].rate ?? 0).toFixed(2) : null,
    overrepresented: lift.slice(0, 15),
    underrepresented: lift.slice(-8).reverse(),
  }, {headers: {'Cache-Control': 'private, no-store'}});
});
