/* D875 · The rail's mark is Brittany's Listing Factory lockup - an outlined
   gear, "listing" set solid, "factory" in a dot matrix. It was a text lockup
   spelling "Goldie" with a star over the i, which belonged to the old palette
   and could not be reproduced in type once the rail went black.
   The asset carries its own black field, and the rail is black, so it needs no
   knockout - which also avoids a halo around the glow. */
export default function GoldieWordmark({className=""}:{className?:string}) {
  return <div className={`goldie-wordmark-lockup ${className}`.trim()}>
    <img src="/listing-factory-lockup.png" alt="Listing Factory" width={720} height={125} decoding="async"/>
  </div>;
}
