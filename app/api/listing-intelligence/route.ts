import { withErrorLog } from "@/app/error-log";
import { NextResponse } from "next/server";
import { bestFitFromBank, clean, normalize } from "../../keyword-ranking.ts";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { excludedProductNouns, namesExcludedProduct } from "@/app/product-type-utils";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { boundedVisionFetch as fetch } from "@/app/paid-vision";

type Details={category:string;attributes:Record<string,string>;optional:Record<string,string>;blurb:string;confidence:"high"|"review"};
const validImage=(value:unknown):value is string=>typeof value==="string"&&/^data:image\/(png|jpeg|webp);base64,/i.test(value)&&value.length<18*1024*1024;

function reviewableCategory(product: { blueprintTitle?: string; brand?: string; model?: string } | undefined) {
  const name = `${product?.blueprintTitle ?? ""} ${product?.brand ?? ""} ${product?.model ?? ""}`.toLocaleLowerCase();
  if (/phone\s*case|cell\s*phone\s*case/.test(name)) return "Phone Cases";
  if (/tote|shopping\s*bag/.test(name)) return "Tote Bags";
  if (/mug|tumbler|cup/.test(name)) return "Mugs";
  if (/hoodie|hooded|sweatshirt/.test(name)) return "Sweatshirts";
  if (/\b(t-?shirt|tee)\b/.test(name)) return "T-Shirts";
  if (/poster|wall\s*print|art\s*print/.test(name)) return "Prints";
  if (/canvas/.test(name)) return "Wall Decor";
  return "Handmade Items";
}
function reviewFallback(product:{blueprintTitle?:string;brand?:string;model?:string}|undefined):Details{
  return {category:reviewableCategory(product),attributes:{},optional:{},blurb:"",confidence:"review"};
}

const DESIGN_TEXT_STOPWORDS=new Set(["the","and","for","with","this","that","bride","bridal","party","bachelorette","wedding","shirt","tee"]);
/* D403 - "fits" and "cannot tell" were both reported as true, so the caller could
   not distinguish a bank that matches from a design with no readable text. A
   mismatch is now refused outright; only the unverifiable case gets a warning. */
/* D414 - Rank a bank against what is actually on the design, so "closest match"
   means something measurable rather than alphabetical order. A phrase scores for
   every distinctive word it shares with the design's own text or the product
   name; ties keep the bank's order so the result is stable. */
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
async function handlePOST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to prepare Etsy details."},{status:401});
  const blocked=await customerLaunchBlock(user);
  if(blocked)return NextResponse.json({error:blocked},{status:403});
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

HOW MANY: order your title selections most relevant first, then keep going. Select between 8 and 13 title phrases: the CLOSEST MATCHING phrases in the bank, ranked best first. The seller chose this bank on purpose, so always return the best available matches even when the fit is loose - rank by how well each phrase fits and let the weaker ones fall to the end. Only return fewer than 8 if the bank genuinely holds fewer usable phrases than that. The seller's phrases will be joined into one Etsy title with a 140 character limit, so aim to give enough phrases to use most of that limit. Quality still wins: never pad the title with a phrase that does not fit the design or names the wrong product.

ETSY TAGS ARE A SEPARATE FIELD: rank these tag-length phrases from most to least relevant to this design: ${JSON.stringify(tagCandidates)}. Return every fitting candidate in ranked order, up to 13. Never split, shorten, combine, rewrite, or invent a tag. Tags do not need to appear in the title.

Select only phrases a shopper looking at THIS artwork would call accurate. If a phrase names an animal, object, place, occasion or activity that is not actually shown in the artwork, do not select it, however well it suits the bank's general theme. Returning two or three phrases is a correct answer. Never pad the list to reach a count. Avoid duplicate meaning. Do not rewrite, combine, expand, correct, or invent any phrase. Copy each phrase exactly as it appears in the bank. Also describe what the artwork DEPICTS in design_subjects: 3 to 8 short plain words or phrases covering the subject, motifs, setting, occasion, and style. These are your own words, not phrases from the bank, and they are how Goldie ranks a bank against art that carries little or no text. Return only {"design_text":["exact visible line from the design"],"design_subjects":["short description of what the art shows"],"selected_keywords":["exact title phrase copied from the bank"],"tag_keywords":["exact tag phrase copied from the supplied tag candidates"]}.${correction}`})});
      const titlePayload=await titleResponse.json() as {output?:string;detail?:string};if(!titleResponse.ok)throw new Error(titlePayload.detail||"Goldie could not build this title.");const match=titlePayload.output?.match(/\{[\s\S]*\}/);if(!match)throw new Error("Goldie could not read the prepared title.");const parsed=JSON.parse(match[0]) as {selected_keywords?:string[];tag_keywords?:string[];design_text?:string[];design_subjects?:string[]},allowedByLower=new Map(titleCandidates.map(keyword=>[keyword.toLocaleLowerCase(),keyword])),selected=[...new Set((parsed.selected_keywords||[]).map(value=>allowedByLower.get(clean(value).toLocaleLowerCase())).filter((value):value is string=>Boolean(value)))].slice(0,13),tagAllowedByLower=new Map(tagCandidates.map(keyword=>[keyword.toLocaleLowerCase(),keyword])),tags=[...new Set((parsed.tag_keywords||[]).map(value=>tagAllowedByLower.get(clean(value).toLocaleLowerCase())).filter((value):value is string=>Boolean(value)))].slice(0,13),designText=(parsed.design_text||[]).map(clean).filter(Boolean).slice(0,12),designSubjects=(parsed.design_subjects||[]).map(clean).filter(Boolean).slice(0,8);return {selected,tags,designText,designSubjects};
    }
    /* D544 - measured on her own batch, two listings from the same bank and the
       same run: one came back with three title phrases and three tags, the other
       with thirteen tags. The retry existed already, but its result was used
       unconditionally - so a second attempt that came back worse replaced a
       better first one, and nothing checked. Keep whichever attempt actually
       returned more. */
    type Selection={selected:string[];tags:string[];designText:string[];designSubjects:string[]};
    const richer=(a:Selection,b:Selection):Selection=>
      (b.selected.length+b.tags.length)>(a.selected.length+a.tags.length)?b:a;
    let selection;try{selection=await requestSelection(0);if(selection.selected.length<minimumTitlePhrases||selection.tags.length<requiredTagCount)selection=richer(selection,await requestSelection(1))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Goldie could not build this title."},{status:502})}
    const {selected,tags,designText,designSubjects}=selection;
    
    /* D414 - This has swung between two bad extremes. It used to fall back to
       keywords.slice(0,13) - the first thirteen phrases in alphabetical order -
       which produced a confident title built from arbitrary phrases. D403 then
       refused outright whenever the bank did not verifiably describe the design,
       which made the feature useless: the seller picks a bank deliberately, and
       being told "no" is not an answer.

       Neither. The seller chose the bank; Goldie picks the closest matches in it,
       ranked, and says so when the fit looks weak. Refusing is reserved for the
       one case where there is genuinely nothing to choose from. */
    /* D415 - Ranking on visible text alone left art-only designs unrankable, and the
       vision model is already looking at the picture - asking it to name what the
       art depicts costs nothing extra, it is the same call. Rank on what it saw. */
    const designSignals=[...designText,...designSubjects];
    const bankFit=bankFitForDesign(titleCandidates,designSignals);
    const picked=selected.length?selected:bestFitFromBank(titleCandidates,designSignals,body.product);
    /* D453 - Etsy refuses two tags that differ only by case, and a bank may hold
       both on purpose: exact duplicates are removed from a bank, case variants
       are not, because a plural or a deliberate misspelling is a separate
       keyword with its own data. The collision is resolved here, on the way
       out, rather than by editing what she typed. */
    const withoutCaseCollisions=(list:string[])=>{const seen=new Set<string>();return list.filter(phrase=>{const key=phrase.toLocaleLowerCase();if(seen.has(key))return false;seen.add(key);return true})};
    /* D544 - this only fell back when the model returned NO tags. Three tags out
       of thirteen was accepted in silence, and Etsy gives thirteen slots: on her
       run one listing shipped with three, so ten slots of search coverage were
       left empty for no reason. The model's ranking still leads; the bank fills
       what it left behind, in bank-fit order, so the slots are used whenever the
       bank can fill them. */
    const rankedTagFallback=bestFitFromBank(tagCandidates,designSignals,body.product);
    const pickedTags=withoutCaseCollisions([...tags,...rankedTagFallback]).slice(0,requiredTagCount||13);
    if(!picked.length)return NextResponse.json({error:"This keyword bank is empty, so there is nothing to build a title from. Pick a bank with phrases in it, or write this title yourself."},{status:422});
    /* D157: `selected` is de-duplicated for exact matches only, so a bank holding
     * both "girls gone mild" and "bachelorette girls gone mild" put BOTH in the
     * title — one row literally read "Bachelorette Girls Gone Mild, Girls Gone
     * Mild, ...", and "off the market" appeared inside three separate phrases.
     * Drop any phrase wholly contained in a longer selected phrase: the longer one
     * still carries the shorter as a substring, so no keyword coverage is lost,
     * and the freed characters let a genuinely new phrase in. */
    const normalisePhrase=(value:string)=>value.toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const chosen=picked.filter(phrase=>{const inner=normalisePhrase(phrase);
      return !picked.some(other=>{if(other===phrase)return false;const outer=normalisePhrase(other);
        return outer.length>inner.length&&outer.includes(inner)})}),
      joiner=body.useCommas?", ":" ";let title="";const included:string[]=[];
    const addPhrase=(phrase:string)=>{const candidate=title?`${title}${joiner}${phrase}`:phrase;if(candidate.length>140)return;title=candidate;included.push(phrase)};
    for(const phrase of chosen)addPhrase(phrase);
    /* D544 - one of her two listings came back with a twelve character title,
       "Bride Hoodie", out of the 140 Etsy allows and a bank with dozens of
       fitting phrases. TITLE_FILL_FLOOR below already noticed and printed a
       warning; it never did anything about it. The model's ranking still leads,
       and the bank's own fit ranking fills the rest of the space rather than
       leaving nine tenths of the title empty and telling her about it. */
    if(title.length<90){
      const already=new Set(included.map(phrase=>phrase.toLocaleLowerCase()));
      const contained=(phrase:string)=>{const inner=normalisePhrase(phrase);return included.some(other=>{const outer=normalisePhrase(other);return outer.includes(inner)||inner.includes(outer)})};
      for(const phrase of bestFitFromBank(titleCandidates,designSignals,body.product)){
        if(title.length>=90)break;
        if(already.has(phrase.toLocaleLowerCase())||contained(phrase))continue;
        addPhrase(phrase);already.add(phrase.toLocaleLowerCase());
      }
    }
    if(!title)return NextResponse.json({error:"Goldie could not build a usable title."},{status:502});
    /* D77 is about listings that come out thin — one row got 45 of 140
     * characters while its siblings got 130. Judge that directly.
     *
     * The first attempt at this gated on phrase count (>=8) and failed a row
     * that returned 7 phrases and all 13 tags. Seven good phrases is a good
     * listing; refusing to build it is worse than the defect. What matters is
     * whether the finished title uses the space Etsy gives it. */
    const TITLE_FILL_FLOOR=90;
    const couldHaveDoneBetter=titleCandidates.length>=8;
    /* D438 - this used to refuse. It built an 81 character title from five of her
       phrases, threw it away, and returned a paragraph explaining why. A short
       title is a warning, not a failure: she can read it, edit it, or change the
       bank, and none of that is possible if the field is left empty. */
    const titleIsShort=couldHaveDoneBetter&&title.length<TITLE_FILL_FLOOR;/* D230 · This fires when the bank does not match the ARTWORK, but a title has
       already been built from that bank — so "No phrase in this bank matches this
       design" was printed directly beneath a finished title made of nine of its
       phrases. Measured live on a nautical design titled from a Jane Austen bank.
       Say what is actually true: the title exists, and it may not describe the art. */
    /* D403 - A verified mismatch is refused above. This warning is now only for the
       case Goldie cannot check: a design with no readable text. */
    /* D414 - Goldie always builds from the bank the seller chose. It says when the
       fit looks weak, and when it could not check - it does not refuse. */
    /* D438 - these explained themselves three times over. What she needs is what
       is wrong and what to do about it, in one line. */
    const titleWarning=bankFit==="mismatch"?"This bank may not match this design. Check the title, or pick a different bank."
      :titleIsShort?"Short title \u2014 few phrases in this bank match this design."
      :bankFit==="unknown"?"Goldie could not read any text in this design, so it could not check the bank. Check the title.":"";
    return NextResponse.json({title,keywords:included,tags:pickedTags.length?pickedTags:tags,titleWarning,designText});
  }
  const response=await fetch("https://fal.run/openrouter/router/vision",{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify({image_urls:[body.image],model:"google/gemini-2.5-flash",temperature:0,system_prompt:"Return only compact valid JSON. Never use markdown.",prompt:`Pre-fill Etsy listing details for this specific print-on-demand product. Product facts: ${JSON.stringify(body.product||{})}. Final title: ${clean(body.title)}. Selected tags: ${JSON.stringify((body.tags||[]).slice(0,13))}. Choose the closest Etsy category from the physical Printify product facts only. The artwork, design wording, title, and tags must never change the product category, age group, garment type, or department. Two designs placed on the same Printify template must receive the same product category. Include every physical or product attribute you can confidently support from the product name, brand, model, and description. Do not stop at required fields. Use product facts, not the artwork, for material, garment, size, shape, room, orientation, neckline, sleeve, and other physical attributes. Inspect the artwork only for contextual fields. Fill holiday, occasion, recipient, or style only when the design, title, or tags clearly support that exact choice; otherwise leave those optional fields out. Never guess simply to make a field non-empty. Write a natural 1-2 sentence design-specific introduction using at most 2 exact keyword phrases from the title or tags, without keyword stuffing or unsupported claims. Return {"category":"...","attributes":{"Sleeve length":"..."},"optional":{"Holiday":"..."},"blurb":"...","confidence":"high"|"review"}. Use concise Etsy-style field names and values. Attribute names must suit this product type; tote, mug, poster, shirt, and sweatshirt fields differ.`})});
  const payload=await response.json() as {output?:string;detail?:string};
  /* Visual analysis improves the prefill, but it is not allowed to strand the
     listing.  Etsy's real taxonomy endpoint remains authoritative on the next
     call, so a provider outage falls back to a conservative product category
     and an explicit review state. */
  if(!response.ok)return NextResponse.json({details:reviewFallback(body.product)});
  const match=payload.output?.match(/\{[\s\S]*\}/);if(!match)return NextResponse.json({details:reviewFallback(body.product)});
  let raw:Partial<Details>;try{raw=JSON.parse(match[0]) as Partial<Details>}catch{return NextResponse.json({details:reviewFallback(body.product)})}
  const contextualText=[body.title,...(body.tags||[])].map(clean).join(" ");
  const attributes=supportedOptional(raw.attributes,contextualText),optional=supportedOptional(raw.optional,contextualText);
  return NextResponse.json({details:{category:clean(raw.category)||"Needs review",attributes,optional,blurb:clean(raw.blurb),confidence:raw.confidence==="high"?"high":"review"} satisfies Details});
}

export const POST = withErrorLog("listing-intelligence", handlePOST);
