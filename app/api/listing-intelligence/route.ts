import { withErrorLog } from "@/app/error-log";
import { NextResponse } from "next/server";
import { clean, normalize } from "../../keyword-ranking.ts";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { excludedProductNouns, namesExcludedProduct } from "@/app/product-type-utils";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { boundedVisionFetch } from "@/app/paid-vision";
import { cachedVisionFetch } from "@/app/vision-request-cache";
import { env } from "cloudflare:workers";

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
  if(!validImage(body.image))return NextResponse.json({error:"The Listing Factory could not read this design safely."},{status:400});
  const key=process.env.FAL_KEY;if(!key)return NextResponse.json({error:"Automatic Etsy details are temporarily unavailable."},{status:503});
  // Explicitly asking for a different title must remain a fresh generation.
  const fetch=body.mode==="title"?boundedVisionFetch:cachedVisionFetch(user.userId,env.DB,boundedVisionFetch);
  if(body.mode==="title"){
    const keywords=[...new Set((body.keywords||[]).map(clean).filter(Boolean))].slice(0,100);if(!keywords.length)return NextResponse.json({error:"Choose a keyword bank before asking The Listing Factory to build the title."},{status:400});
    const excludedNouns=excludedProductNouns(body.product?.blueprintTitle||"");
    const titleCandidates=keywords.filter(keyword=>!namesExcludedProduct(keyword,excludedNouns));
    const tagCandidates=keywords.filter(keyword=>keyword.length<=20&&!namesExcludedProduct(keyword,excludedNouns));
    async function requestSelection(){
      const titleResponse=await fetch("https://fal.run/openrouter/router/vision",{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify({image_urls:[body.image],model:"google/gemini-2.5-flash",temperature:0,system_prompt:"Return only compact valid JSON. Never use markdown.",prompt:`Inspect this specific design. First transcribe its meaningful visible wording as exact lines. Then select the exact phrases from this seller-validated keyword bank that best fit it: ${JSON.stringify(keywords)}. Product: ${JSON.stringify(body.product||{})}.

PRODUCT TYPE RULE (most important): this listing is for the physical product named above. Reject every phrase that names any different product type. For this exact Printify blueprint, the excluded product nouns are: ${JSON.stringify(excludedNouns)}. A phrase containing any excluded noun is always wrong, no matter how strong its search data.

HOW MANY: order the accurate title selections most relevant first. Return only phrases that describe this design. A short accurate list is correct. Never choose a merely related or loose-fit phrase to make the title longer. The seller's phrases will be joined into one Etsy title with a 140 character limit.

ETSY TAGS ARE A SEPARATE FIELD: rank these tag-length phrases from most to least relevant to this design: ${JSON.stringify(tagCandidates)}. Return every fitting candidate in ranked order, up to 13. Never split, shorten, combine, rewrite, or invent a tag. Tags do not need to appear in the title.

Select only phrases a shopper looking at THIS artwork would call accurate. If a phrase names an animal, identity, object, place, occasion or activity that is not actually shown in the artwork, do not select it, however well it suits the bank's general theme. Returning two or three phrases is a correct answer. Never pad the list to reach a count. Avoid duplicate meaning. Do not rewrite, combine, expand, correct, or invent any phrase. Copy each phrase exactly as it appears in the bank. Also describe what the artwork DEPICTS in design_subjects: 3 to 8 short plain words or phrases covering the subject, motifs, setting, occasion, and style. These are your own words, not phrases from the bank, and they are how The Listing Factory checks that the selected bank fits art that carries little or no text. Return only {"design_text":["exact visible line from the design"],"design_subjects":["short description of what the art shows"],"selected_keywords":["exact title phrase copied from the bank"],"tag_keywords":["exact tag phrase copied from the supplied tag candidates"]}.`})});
      const titlePayload=await titleResponse.json() as {output?:string;detail?:string};if(!titleResponse.ok)throw new Error(titlePayload.detail||"The Listing Factory could not build this title.");const match=titlePayload.output?.match(/\{[\s\S]*\}/);if(!match)throw new Error("The Listing Factory could not read the prepared title.");const parsed=JSON.parse(match[0]) as {selected_keywords?:string[];tag_keywords?:string[];design_text?:string[];design_subjects?:string[]},allowedByLower=new Map(titleCandidates.map(keyword=>[keyword.toLocaleLowerCase(),keyword])),selected=[...new Set((parsed.selected_keywords||[]).map(value=>allowedByLower.get(clean(value).toLocaleLowerCase())).filter((value):value is string=>Boolean(value)))].slice(0,13),tagAllowedByLower=new Map(tagCandidates.map(keyword=>[keyword.toLocaleLowerCase(),keyword])),tags=[...new Set((parsed.tag_keywords||[]).map(value=>tagAllowedByLower.get(clean(value).toLocaleLowerCase())).filter((value):value is string=>Boolean(value)))].slice(0,13),designText=(parsed.design_text||[]).map(clean).filter(Boolean).slice(0,12),designSubjects=(parsed.design_subjects||[]).map(clean).filter(Boolean).slice(0,8);return {selected,tags,designText,designSubjects};
    }
    /* One vision pass decides relevance. Retrying because it returned fewer than
       thirteen phrases pressured the model to fill space and doubled the wait.
       Fewer accurate phrases are a valid result. */
    let selection;try{selection=await requestSelection()}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"The Listing Factory could not build this title."},{status:502})}
    const {selected,tags,designText,designSubjects}=selection;
    
    /* Check both readable words and what the vision pass saw. A mixed bank may
       contain one matching topic alongside unrelated phrases, so validate each
       selected phrase too; a whole-bank pass is not enough. */
    const designSignals=[...designText,...designSubjects];
    const bankFit=bankFitForDesign(titleCandidates,designSignals);
    if(bankFit==="mismatch")return NextResponse.json({error:"This keyword bank does not match this design. Choose a bank that describes the artwork, or write the title yourself."},{status:422});
    const picked=selected.filter(phrase=>bankFitForDesign([phrase],designSignals)!=="mismatch");
    /* D453 - Etsy refuses two tags that differ only by case, and a bank may hold
       both on purpose: exact duplicates are removed from a bank, case variants
       are not, because a plural or a deliberate misspelling is a separate
       keyword with its own data. The collision is resolved here, on the way
       out, rather than by editing what she typed. */
    const withoutCaseCollisions=(list:string[])=>{const seen=new Set<string>();return list.filter(phrase=>{const key=phrase.toLocaleLowerCase();if(seen.has(key))return false;seen.add(key);return true})};
    const pickedTags=withoutCaseCollisions(tags.filter(phrase=>bankFitForDesign([phrase],designSignals)!=="mismatch")).slice(0,13);
    if(!picked.length)return NextResponse.json({error:"No phrase in this keyword bank accurately describes the design. Choose another bank, or write the title yourself."},{status:422});
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
    if(!title)return NextResponse.json({error:"The Listing Factory could not build a usable title."},{status:502});
    /* A short accurate title is kept and labelled. Length never authorizes
       filling it with phrases the relevance pass did not select. */
    const TITLE_FILL_FLOOR=90;
    const couldHaveDoneBetter=titleCandidates.length>=8;
    const titleIsShort=couldHaveDoneBetter&&title.length<TITLE_FILL_FLOOR;
    const titleWarning=titleIsShort?"Short title \u2014 only a few phrases in this bank accurately match this design."
      :bankFit==="unknown"?"The Listing Factory could not read any text in this design, so it could not check the bank. Check the title.":"";
    return NextResponse.json({title,keywords:included,tags:pickedTags.length?pickedTags:tags,titleWarning,designText});
  }
  const response=await fetch("https://fal.run/openrouter/router/vision",{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify({image_urls:[body.image],model:"google/gemini-2.5-flash",temperature:0,system_prompt:"Return only compact valid JSON. Never use markdown.",prompt:`Pre-fill Etsy listing details for this specific print-on-demand product. Product facts: ${JSON.stringify(body.product||{})}. Final title: ${clean(body.title)}. Selected tags: ${JSON.stringify((body.tags||[]).slice(0,13))}. Choose the closest Etsy category from the physical Printify product facts only. The artwork, design wording, title, and tags must never change the product category, age group, garment type, or department. Two designs placed on the same Printify template must receive the same product category. Include every physical or product attribute you can confidently support from the product name, brand, model, and description. Do not stop at required fields. Use product facts, not the artwork, for material, garment, size, shape, room, orientation, neckline, sleeve, and other physical attributes. Inspect the artwork only for contextual fields. Fill holiday, occasion, recipient, or style only when the design, title, or tags clearly support that exact choice; otherwise leave those optional fields out. Never guess simply to make a field non-empty. Write a natural 1-2 sentence design-specific introduction using at most 2 exact keyword phrases from the title or tags, without keyword stuffing or unsupported claims. Return {"category":"...","attributes":{"Sleeve length":"..."},"optional":{"Holiday":"..."},"blurb":"...","confidence":"high"|"review"}. Use concise Etsy-style field names and values. Attribute names must suit this product type; tote, mug, poster, shirt, and sweatshirt fields differ.`})});
  const payload=await response.json().catch(()=>({})) as {output?:string;detail?:string};
  /* Visual analysis improves the prefill, but it is not allowed to strand the
     listing.  Etsy's real taxonomy endpoint remains authoritative on the next
     call, so a provider outage falls back to a conservative product category
     and an explicit review state. */
  if(!response.ok)return NextResponse.json({details:reviewFallback(body.product)});
  const match=payload.output?.match(/\{[\s\S]*\}/);if(!match)return NextResponse.json({details:reviewFallback(body.product)});
  let raw:Partial<Details>;try{raw=JSON.parse(match[0]) as Partial<Details>}catch{return NextResponse.json({details:reviewFallback(body.product)})}
  const contextualText=[body.title,...(body.tags||[])].map(clean).join(" ");
  const attributes=supportedOptional(raw.attributes,contextualText),optional=supportedOptional(raw.optional,contextualText);
  return NextResponse.json({details:{category:clean(raw.category)||"Needs review",attributes,optional,blurb:clean(raw.blurb),confidence:raw.confidence==="high"?"high":"review"} satisfies Details},{headers:{"X-Goldie-AI-Reused":response.headers.get("X-Goldie-AI-Reused")||"false"}});
}

export const POST = withErrorLog("listing-intelligence", handlePOST);
