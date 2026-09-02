export type AssignableArtwork={id:string;side:string;colorIds:number[]};

export function assignSideColor<T extends AssignableArtwork>(versions:T[],side:string,colorId:number,artworkId:string):T[]{
  return versions.map(artwork=>artwork.side!==side?artwork:{...artwork,colorIds:artwork.id===artworkId?[...new Set([...artwork.colorIds,colorId])]:artwork.colorIds.filter(id=>id!==colorId)});
}

export function sideAssignmentFor(versions:AssignableArtwork[],side:string,colorId:number){
  return versions.find(artwork=>artwork.side===side&&artwork.colorIds.includes(colorId))?.id||"primary";
}

/** One garment colour can point at exactly one alternate front file. "primary"
 * means no alternate owns it, so the original design is used. */
export function assignFrontColor<T extends AssignableArtwork>(versions:T[],colorId:number,artworkId:string):T[]{
  return assignSideColor(versions,"front",colorId,artworkId);
}

export function frontAssignmentFor(versions:AssignableArtwork[],colorId:number){
  return sideAssignmentFor(versions,"front",colorId);
}
