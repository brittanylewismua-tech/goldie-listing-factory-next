// How Goldie ranks a seller's keyword bank against one design.
//
// Lifted out of the route so it can be tested on its own: the route imports
// next/server, and a pure ranking function should not need a web framework
// loaded to prove it works.

export const clean=(value:unknown)=>String(value||"").replace(/[<>]/g,"").trim().slice(0,300);
export const normalize=(value:string)=>value.toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim();

const DESIGN_TEXT_STOPWORDS=new Set(["the","and","for","with","this","that","bride","bridal","party","bachelorette","wedding","shirt","tee"]);

export function bestFitFromBank(candidates:string[],designText:string[],product?:{blueprintTitle?:string;brand?:string;model?:string}):string[]{
  const haystack=[...designText,product?.blueprintTitle||"",product?.brand||"",product?.model||""]
    .map(clean).map(normalize).join(" ");
  const words=[...new Set(haystack.split(" ").filter(word=>word.length>=4&&!DESIGN_TEXT_STOPWORDS.has(word)))];
  /* D429 - exact word equality missed the obvious: a design the vision model
     described as a "sailboat" scored zero against "sailing", "boat" and "sail".
     Match on shared stems in both directions so related words count. */
  const touches=(part:string)=>part.length>=4&&words.some(word=>word===part||word.includes(part)||part.includes(word));
  const scored=candidates.map((phrase,index)=>{
    const parts=normalize(clean(phrase)).split(" ").filter(Boolean);
    const hits=parts.filter(touches).length;
    /* Absolute hits, not a fraction: a fraction let a short vague phrase with one
       loose match outrank a longer phrase that matched several times. Ties go to
       the more specific phrase, then to bank order. */
    return {phrase,index,score:hits,parts:parts.length};
  });
  scored.sort((a,b)=>b.score-a.score||a.parts-b.parts||a.index-b.index);
  const matched=scored.filter(item=>item.score>0);
  /* D429 - this used to return thirteen phrases no matter what. When nothing
     matched, every score was zero, ties fell back to bank order, and a sailboat
     design was confidently tagged with manatees, lobsters and octopuses purely
     because those sat near the top of the bank. Fewer accurate phrases beat a
     full thirteen that describe someone else's artwork.

     Bank order is still the fallback when genuinely nothing matches, because the
     seller chose this bank on purpose and being handed nothing is not an answer. */
  const source=matched.length>=3?matched:scored;
  return source.slice(0,13).map(item=>item.phrase);
}
