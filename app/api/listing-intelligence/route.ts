import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { excludedProductNouns, namesExcludedProduct } from "@/app/product-type-utils";

type Details={category:string;attributes:Record<string,string>;optional:Record<string,string>;blurb:string;confidence:"high"|"review"};
const validImage=(value:unknown):value is string=>typeof value==="string"&&/^data:image\/(png|jpeg|webp);base64,/i.test(value)&&value.length<18*1024*1024;
const clean=(value:unknown)=>String(value||"").replace(/[<>]/g,"").trim().slice(0,300);
const normalize=(value:string)=>value.toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const DESIGN_TEXT_STOPWORDS=new Set(["the","and","for","with","this","that","bride","bridal","party","bachelorette","wedding","shirt","tee"]);
/* D403 - "fits" and "cannot tell" were both reported as true, so the caller could
   not distinguish a bank that matches from a design with no readable text. A
   mismatch is now refused outright; only the unverifiable case gets a warning. */
export function bankFitForDesign(keywords:string[],designText:string[]):"fits"|"mismatch"|"unknown"{
  const phrases=designText.map(clean).map(normalize).filter(text=>text.length>=4);
  if(!phrases.length)return "unknown";
  return bankMatchesDesignText(keywords,designText)?"fits":"mismatch";
}

function bankMatchesDesignText(keywords:string[],designText:string[]){
  const bank=keywords.map(normalize).filter(Boolean);
  const phrases=designText.map(clean).map(normalize).filter(text=>text.length>=4);
  if(!phrases.length)return true;
  return phrases.some(phrase=>{
    if(bank.some(keyword=>keyword.includes(phrase)||phrase.includes(keyword)))return true;
    const distinctive=phrase.split(" ").filter(word=>word.length>=4&&!DESIGN_TEXT_STOPWORDS.has(word));
    return distinctive.some(word=>bank.some(keyword=>new RegExp(`(^| )${word}( |$)`).test(keyword)));
  });
}
const TEXT_SUPPORTED_OPTIONAL=/^(room|holiday|occasion|recipient)$/i;
function supportedOptional(input:unknown,context:string){
  const entries=Object.entries(input&&typeof input==="object"?input:{}).map(([key,value])=>[clean(key).slice(0,60),clean(value).slice(0,120)] as const).filter(([key,value])=>key&&value);
  const normalizedContext=` ${normalize(context)} `;
  return Object.fromEntries(entries.filter(([key,value])=>{
    if(!TEXT_SUPPORTED_OPTIONAL.test(key))return true;
    const phrase=normalize(value);if(!phrase)return false;
    return normalizedContext.includes(` ${phrase} `);
  }));
}
export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to prepare Etsy details."},{status:401});
  const body=await request.json() as {mode?:"details"|"title";image?:string;product?:{blueprintTitle?:string;brand?:string;model?:string;description?:string};title?:string;tags?:string[];keywords?:string[];useCommas?:boolean};
  if(!validImage(body.image))return NextResponse.json({error:"Goldie could not read this design safely."},{status:400});
  const key=process.env.FAL_KEY;if(!key)return NextResponse.json({error:"Automatic Etsy details are temporarily unavailable."},{status:503});
  if(body.mode==="title"){
    const keywords=[...new Set((body.keywords||[]).map(clean).filter(Boolean))].slice(0,100);if(!keywords.length)return NextResponse.json({error:"Choose a keyword bank before asking Goldie to build the title."},{status:400});
    const excludedNouns=excludedProductNouns(body.product?.blueprintTitle||"");
    const titleCandidates=keywords.filter(keyword=>!namesExcludedProduct(keyword,excludedNouns));
    const tagCandidates=keywords.filter(keyword=>keyword.length<=20&&!namesExcludedProduct(keyword,excludedNouns));
    const minimumTitlePhrases=titleCandidates.length>=8?8:1,requiredTagCount=Math.min(13,tagCandidates.length);
    async function requestSelection(attempt:number){
      const correction=attempt===1?`\nCORRECTION: Your first response returned too few validated phrases. Return at least ${minimumTitlePhrases} title phrases and exactly ${requiredTagCount} tag phrases from the supplied candidates. If you cannot do that accurately, still return your best exact candidates; the server will reject this row instead of publishing thin or mismatched SEO.`:"";
      const titleResponse=await fetch("https://fal.run/openrouter/router/vision",{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify({image_urls:[body.image],model:"google/gemini-2.5-flash",temperature:0,system_prompt:"Return only compact valid JSON. Never use markdown.",prompt:`Inspect this specific design. First transcribe its meaningful visible wording as exact lines. Then select the exact phrases from this seller-validated keyword bank that best fit it: ${JSON.stringify(keywords)}. Product: ${JSON.stringify(body.product||{})}.

PRODUCT TYPE RULE (most important): this listing is for the physical product named above. Reject every phrase that names any different product type. For this exact Printify blueprint, the excluded product nouns are: ${JSON.stringify(excludedNouns)}. A phrase containing any excluded noun is always wrong, no matter how strong its search data.

HOW MANY: order your title selections most relevant first, then keep going. Select between 8 and 13 title phrases when the bank contains that many that genuinely fit the design and the product type. The seller's phrases will be joined into one Etsy title with a 140 character limit, so aim to give enough phrases to use most of that limit. Quality still wins: never pad the title with a phrase that does not fit the design or names the wrong product.

ETSY TAGS ARE A SEPARATE FIELD: rank these tag-length phrases from most to least relevant to this design: ${JSON.stringify(tagCandidates)}. Return every fitting candidate in ranked order, up to 13. Never split, shorten, combine, rewrite, or invent a tag. Tags do not need to appear in the title.

Avoid duplicate meaning. Do not rewrite, combine, expand, correct, or invent any phrase. Copy each phrase exactly as it appears in the bank. Return only {"design_text":["exact visible line from the design"],"selected_keywords":["exact title phrase copied from the bank"],"tag_keywords":["exact tag phrase copied from the supplied tag candidates"]}.${correction}`})});
      const titlePayload=await titleResponse.json() as {output?:string;detail?:string};if(!titleResponse.ok)throw new Error(titlePayload.detail||"Goldie could not build this title.");const match=titlePayload.output?.match(/\{[\s\S]*\}/);if(!match)throw new Error("Goldie could not read the prepared title.");const parsed=JSON.parse(match[0]) as {selected_keywords?:string[];tag_keywords?:string[];design_text?:string[]},allowedByLower=new Map(titleCandidates.map(keyword=>[keyword.toLocaleLowerCase(),keyword])),selected=[...new Set((parsed.selected_keywords||[]).map(value=>allowedByLower.get(clean(value).toLocaleLowerCase())).filter((value):value is string=>Boolean(value)))].slice(0,13),tagAllowedByLower=new Map(tagCandidates.map(keyword=>[keyword.toLocaleLowerCase(),keyword])),tags=[...new Set((parsed.tag_keywords||[]).map(value=>tagAllowedByLower.get(clean(value).toLocaleLowerCase())).filter((value):value is string=>Boolean(value)))].slice(0,13),designText=(parsed.design_text||[]).map(clean).filter(Boolean).slice(0,12);return {selected,tags,designText};
    }
    let selection;try{selection=await requestSelection(0);if(selection.selected.length<minimumTitlePhrases||selection.tags.length<requiredTagCount)selection=await requestSelection(1)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Goldie could not build this title."},{status:502})}
    const {selected,tags,designText}=selection;
    
    // Previously: chosen = selected.length ? selected : keywords.slice(0,13)
    // That fallback silently took the first 13 phrases in bank order (banks are
    // stored alphabetically), so a design the model could not match produced a
    // confident-looking title built from arbitrary phrases. Fail loudly instead.
    /* D403 - Two faith designs against a bachelorette bank: one returned nothing
       and was refused, the other returned everything and was titled from it. The
       outcome depended entirely on whether the vision model happened to select
       phrases, because the bank-relevance check ran afterwards and only added a
       soft warning. Same bank, same kind of design, opposite results.

       The relevance check decides, and it decides before anything is accepted, so
       a bank that does not describe the design is refused every time rather than
       once in two. bankMatchesDesignText still returns true when the design has
       no readable text, which keeps text-free art working. */
    const bankFit=bankFitForDesign(titleCandidates,designText);
    if(!selected.length||bankFit==="mismatch")return NextResponse.json({error:"Goldie could not find phrases in this bank that match this design. Pick a different keyword bank, or build this title yourself."},{status:422});
    /* D157: `selected` is de-duplicated for exact matches only, so a bank holding
     * both "girls gone mild" and "bachelorette girls gone mild" put BOTH in the
     * title — one row literally read "Bachelorette Girls Gone Mild, Girls Gone
     * Mild, ...", and "off the market" appeared inside three separate phrases.
     * Drop any phrase wholly contained in a longer selected phrase: the longer one
     * still carries the shorter as a substring, so no keyword coverage is lost,
     * and the freed characters let a genuinely new phrase in. */
    const normalisePhrase=(value:string)=>value.toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const chosen=selected.filter(phrase=>{const inner=normalisePhrase(phrase);
      return !selected.some(other=>{if(other===phrase)return false;const outer=normalisePhrase(other);
        return outer.length>inner.length&&outer.includes(inner)})}),
      joiner=body.useCommas?", ":" ";let title="";const included:string[]=[];for(const phrase of chosen){const candidate=title?`${title}${joiner}${phrase}`:phrase;if(candidate.length>140)continue;title=candidate;included.push(phrase)}if(!title)return NextResponse.json({error:"Goldie could not build a usable title."},{status:502});
    /* D77 is about listings that come out thin — one row got 45 of 140
     * characters while its siblings got 130. Judge that directly.
     *
     * The first attempt at this gated on phrase count (>=8) and failed a row
     * that returned 7 phrases and all 13 tags. Seven good phrases is a good
     * listing; refusing to build it is worse than the defect. What matters is
     * whether the finished title uses the space Etsy gives it. */
    const TITLE_FILL_FLOOR=90;
    const couldHaveDoneBetter=titleCandidates.length>=8;
    if(couldHaveDoneBetter&&title.length<TITLE_FILL_FLOOR)return NextResponse.json({error:`Goldie built only ${title.length} of 140 title characters for this design from ${included.length} phrase${included.length===1?"":"s"}. This bank has ${titleCandidates.length} phrases that fit this product, so the design likely does not match them. Choose a better-matched keyword bank, or write this title yourself.`},{status:422});/* D230 · This fires when the bank does not match the ARTWORK, but a title has
       already been built from that bank — so "No phrase in this bank matches this
       design" was printed directly beneath a finished title made of nine of its
       phrases. Measured live on a nautical design titled from a Jane Austen bank.
       Say what is actually true: the title exists, and it may not describe the art. */
    /* D403 - A verified mismatch is refused above. This warning is now only for the
       case Goldie cannot check: a design with no readable text. */
    const titleWarning=bankFit==="unknown"?"Goldie could not read any text in this design, so it could not check the bank against it. Read the title before publishing.":"";return NextResponse.json({title,keywords:included,tags,titleWarning,designText});
  }
  const response=await fetch("https://fal.run/openrouter/router/vision",{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify({image_urls:[body.image],model:"google/gemini-2.5-flash",temperature:0,system_prompt:"Return only compact valid JSON. Never use markdown.",prompt:`Pre-fill Etsy listing details for this specific print-on-demand product. Product facts: ${JSON.stringify(body.product||{})}. Final title: ${clean(body.title)}. Selected tags: ${JSON.stringify((body.tags||[]).slice(0,13))}. Choose the closest Etsy category from the physical Printify product facts only. The artwork, design wording, title, and tags must never change the product category, age group, garment type, or department. Two designs placed on the same Printify template must receive the same product category. Include every physical or product attribute you can confidently support from the product name, brand, model, and description. Do not stop at required fields. Use product facts, not the artwork, for material, garment, size, shape, room, orientation, neckline, sleeve, and other physical attributes. Inspect the artwork only for contextual fields. Fill holiday, occasion, recipient, or style only when the design, title, or tags clearly support that exact choice; otherwise leave those optional fields out. Never guess simply to make a field non-empty. Write a natural 1-2 sentence design-specific introduction using at most 2 exact keyword phrases from the title or tags, without keyword stuffing or unsupported claims. Return {"category":"...","attributes":{"Sleeve length":"..."},"optional":{"Holiday":"..."},"blurb":"...","confidence":"high"|"review"}. Use concise Etsy-style field names and values. Attribute names must suit this product type; tote, mug, poster, shirt, and sweatshirt fields differ.`})});
  const payload=await response.json() as {output?:string;detail?:string};if(!response.ok)return NextResponse.json({error:payload.detail||"Goldie could not prepare Etsy details."},{status:502});
  const match=payload.output?.match(/\{[\s\S]*\}/);if(!match)return NextResponse.json({error:"Goldie could not read the prepared Etsy details."},{status:502});
  const raw=JSON.parse(match[0]) as Partial<Details>;
  const contextualText=[body.title,...(body.tags||[])].map(clean).join(" ");
  const attributes=supportedOptional(raw.attributes,contextualText),optional=supportedOptional(raw.optional,contextualText);
  return NextResponse.json({details:{category:clean(raw.category)||"Needs review",attributes,optional,blurb:clean(raw.blurb),confidence:raw.confidence==="high"?"high":"review"} satisfies Details});
}
