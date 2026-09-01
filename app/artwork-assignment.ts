export type AssignableArtwork={id:string;side:"front"|"back";colorIds:number[]};

/** One garment colour can point at exactly one alternate front file. "primary"
 * means no alternate owns it, so the original design is used. */
export function assignFrontColor<T extends AssignableArtwork>(versions:T[],colorId:number,artworkId:string):T[]{
  return versions.map(artwork=>artwork.side!=="front"?artwork:{...artwork,colorIds:artwork.id===artworkId?[...new Set([...artwork.colorIds,colorId])]:artwork.colorIds.filter(id=>id!==colorId)});
}

export function frontAssignmentFor(versions:AssignableArtwork[],colorId:number){
  return versions.find(artwork=>artwork.side==="front"&&artwork.colorIds.includes(colorId))?.id||"primary";
}
