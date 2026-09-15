/**
 * THE TRAP: TWO STORES, ONE NAME.
 *
 * A member had two Printify stores both named HousePanthers - one Etsy, one
 * storefront. Goldie built her drafts into the Etsy one, correctly. Printify's
 * own links carry no store, so its interface resolved them against whichever
 * store her session had selected, and she got "this listing isn't available in
 * the selected store" on drafts that were perfectly fine.
 *
 * The identical names are what made it undiagnosable: the store switcher gave
 * her nothing to tell them apart, so there was no way to discover the problem
 * from the screen she was on.
 *
 * Goldie knows all of this at connect time and said none of it. That is what
 * this fixes - the warning goes out BEFORE the member builds anything, not
 * after they are already confused.
 */
export type StoreSummary = { id: number; title: string; salesChannel: string };

export type StoreWarning = {
  /* Nothing to say when there is only one store: no switcher, no confusion. */
  warn: boolean;
  duplicateName: boolean;
  buildingIn: { id: number; title: string; salesChannel: string } | null;
  others: StoreSummary[];
  headline: string;
  detail: string;
};

const channelLabel = (channel: string) =>
  channel === "etsy" ? "Etsy store"
    : channel === "storefront" ? "Printify storefront"
    : channel ? `${channel} store` : "store";

export function storeWarning(stores: StoreSummary[], buildShopId: number): StoreWarning {
  const buildingIn = stores.find(store => store.id === buildShopId) ?? null;
  const others = stores.filter(store => store.id !== buildShopId);
  const quiet: StoreWarning = {
    warn: false, duplicateName: false, buildingIn, others: [],
    headline: "", detail: "",
  };
  if (stores.length < 2 || !buildingIn) return quiet;

  const duplicateName = others.some(store =>
    store.title.trim().toLowerCase() === buildingIn.title.trim().toLowerCase());

  /*
    Naming the channel is what makes two identically-named stores separable.
    "HousePanthers" twice is useless; "HousePanthers (Etsy store)" is not.
  */
  const label = `${buildingIn.title} (${channelLabel(buildingIn.salesChannel)})`;

  return {
    warn: true,
    duplicateName,
    buildingIn,
    others,
    headline: duplicateName
      ? `You have ${stores.length} Printify stores with the same name`
      : `You have ${stores.length} Printify stores`,
    detail: duplicateName
      ? `Goldie builds into ${label}. Your other store shares that name, so `
        + `Printify's store switcher looks identical either way — check the store `
        + `is set to the ${channelLabel(buildingIn.salesChannel)} before opening a draft, `
        + `or Printify will say the listing isn't available.`
      : `Goldie builds into ${label}. Switch to it in Printify before opening a `
        + `draft, or Printify will say the listing isn't available.`,
  };
}
