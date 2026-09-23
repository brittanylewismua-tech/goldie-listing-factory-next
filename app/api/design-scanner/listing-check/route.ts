import {NextResponse} from 'next/server';
import {withErrorLog} from '@/app/error-log';
import {requireFeatureApi} from '@/app/require-feature';
import {crossSiteWrite,CROSS_SITE_REFUSAL} from '@/app/same-site-only';
import {etsyApiCredential,recordEtsyCall,waitForEtsyCapacity} from '@/app/api/etsy/client';
import {listingPrice,type EtsyDisplayListing} from '@/app/etsy-listing-display';
import {decodeEntities} from '@/app/shop-map-worlds';
import {scanParams,rankScan,SCAN_PAGE} from '@/app/keyword-scan';
import {profileWinners} from '@/app/keyword-profile';
import {checkListing,type Draft} from '@/app/listing-check';

/**
 * GRADE A DRAFT AGAINST WHAT IS WINNING ITS PHRASE, RIGHT NOW.
 *
 * The Design Scanner used to require a cohort assembled from recorded sales
 * activity - twelve listings, eight shops, five with repeat movement - which
 * for any phrase nobody had been watching meant it refused. A member scanning
 * a doodle shirt was told there was "not enough buyer activity to compare
 * designs", which reads as a verdict on their work and is actually a
 * statement about an empty database.
 *
 * Nothing here waits for a database. Three hundred live listings, ranked by
 * favorites, described, and the draft measured against the top fifty. Four
 * Etsy calls, answered on the first click.
 */
export const maxDuration = 120;

export const POST = withErrorLog('listing-check', async (request: Request) => {
  if (crossSiteWrite(request)) return NextResponse.json(CROSS_SITE_REFUSAL, {status: 403});
  const access = await requireFeatureApi('designScanner');
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null) as
    {phrase?: string; title?: string; tags?: string[]; priceCents?: number;
     currency?: string; personalizable?: boolean} | null;
  const phrase = String(body?.phrase ?? '').trim().slice(0, 80);
  if (!phrase) return NextResponse.json({error: 'Say which search this listing is entering.'}, {status: 400});
  const draft: Draft = {
    title: String(body?.title ?? '').slice(0, 200),
    tags: Array.isArray(body?.tags) ? body.tags.slice(0, 20).map(tag => String(tag).slice(0, 40)) : [],
    priceCents: Number.isFinite(Number(body?.priceCents)) ? Number(body?.priceCents) : null,
    currency: String(body?.currency ?? 'USD'),
    personalizable: typeof body?.personalizable === 'boolean' ? body.personalizable : null,
  };
  if (!draft.title.trim() && !draft.tags.length)
    return NextResponse.json({error: 'Give the draft a title or some tags to check.'}, {status: 400});

  const page = async (offset: number) => {
    await waitForEtsyCapacity();
    const response = await fetch(
      `https://openapi.etsy.com/v3/application/listings/active?${scanParams(phrase, offset)}`,
      {headers: {'x-api-key': etsyApiCredential()}, signal: AbortSignal.timeout(25_000)});
    await recordEtsyCall(response, 'search');
    if (!response.ok) throw new Error('Etsy could not be reached for this check. Try again.');
    const payload = await response.json() as {results?: EtsyDisplayListing[]};
    return payload.results ?? [];
  };

  try {
    const first = await page(0);
    /* Three hundred is enough for a stable price band and a stable word list,
       and keeps the check inside the few seconds a member will wait. */
    const rest = await Promise.all([1, 2].map(index =>
      page(index * SCAN_PAGE).catch(() => [] as EtsyDisplayListing[])));
    const now = Math.floor(Date.now() / 1000);
    const rows = [...first, ...rest.flat()].map(row => ({
      listingId: Number(row.listing_id), title: decodeEntities(String(row.title ?? '')),
      priceCents: listingPrice(row), currency: row.price?.currency_code ?? 'USD',
      favorites: row.num_favorers ?? null, views: row.views ?? null,
      ageDays: row.original_creation_timestamp
        ? Math.max(0, Math.floor((now - row.original_creation_timestamp) / 86_400)) : null,
      tags: (row.tags ?? []).map(tag => String(tag)),
      isPersonalizable: typeof row.is_personalizable === 'boolean' ? row.is_personalizable : null,
      shopSold: null as number | null,
    }));
    if (!rows.length)
      return NextResponse.json({error: 'Etsy returned no listings for that search.'}, {status: 502});
    const ranked = rankScan(rows, 'favorites');
    const profile = {...profileWinners(ranked.slice(0, 50), ranked), phrase};
    return NextResponse.json({phrase, profile, findings: checkListing(draft, profile)},
      {headers: {'Cache-Control': 'private, no-store'}});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'This check could not be completed. Try again.'},
      {status: 502});
  }
});
