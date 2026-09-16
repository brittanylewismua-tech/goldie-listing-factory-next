/* D875 · The rail's mark is Brittany's Listing Factory lockup - an outlined
   gear, "listing" set solid, "factory" in a dot matrix. It was a text lockup
   spelling "Goldie" with a star over the i, which belonged to the old palette
   and could not be reproduced in type once the rail went black.
   The asset carries its own black field, and the rail is black, so it needs no
   knockout - which also avoids a halo around the glow. */
/*
  RENAMED IN MEANING, NOT IN FILE.

  This renders the LISTING FACTORY's lockup — it always did; the component
  name was left over from the era when that mark stood for the whole product.
  It is a feature's mark now and appears only on the Listing Factory's own
  pages. The file keeps its path because renaming files is churn, and the
  instruction was to change what a member sees, not the plumbing.
*/
export default function ListingFactoryWordmark({className=""}:{className?:string}) {
  return <div className={`goldie-wordmark-lockup ${className}`.trim()}>
    <img src="/listing-factory-lockup.png" alt="Listing Factory" width={720} height={125} decoding="async"/>
  </div>;
}
