import { withErrorLog } from "@/app/error-log";
import { NextResponse } from "next/server";
import { clean, normalize } from "../../keyword-ranking.ts";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { excludedProductNouns, namesExcludedProduct } from "@/app/product-type-utils";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { boundedVisionFetch } from "@/app/paid-vision";
import { cachedVisionFetch } from "@/app/vision-request-cache";
import { setFalUsageRecorder } from "@/app/paid-vision";
import { recordFalUsage } from "@/app/fal-usage";

/* Wire the usage store into the injectable recorder. Paid vision cannot
   import it directly: the test runner loads that module on its own. */
setFalUsageRecorder(recordFalUsage);
import { env } from "cloudflare:workers";
import { canaryFor } from "@/app/listing-flow-canary";
import { ensureDesign, ensureFamilyCopy } from "@/app/listing-flow";
import { classifyBlueprint } from "@/app/blueprint-registry";
import { productFactsFor } from "@/app/product-facts";
import { productFamily } from "@/app/product-type-utils";
import { strictFitFromBank } from "@/app/keyword-ranking";
import { LISTING_FIELD_FOR_PROPERTY } from "@/app/pod-listing-fields";
import { composeTags } from "@/app/listing-composition";

/**
 * THE LAYERED PATH, REACHED FROM THE MEMBER'S OWN INTERFACE.
 *
 * This route is what the Listing Factory workflow actually calls — twice per
 * listing, historically: once to pick title phrases from the bank against the
 * design, once to prefill Etsy details. Both sent the image. Twenty products
 * from one design meant forty image calls, the title call was excluded from
 * the cache entirely, and neither went through the spend guard.
 *
 * The layered architecture was proven on a canary route, which is not the same
 * as being in the product: a route nobody's workflow calls is a measurement,
 * not a path. So the branch is here, at the door the workflow already knocks
 * on. A canary member gets the layered behaviour with no change to the
 * interface; everybody else gets exactly what they got before, which is what
 * makes the flag a rollback rather than a deploy.
 *
 * WHAT CHANGES FOR THE MEMBER:
 *   the design is analysed ONCE per artwork, ever, and reused for every
 *   product and for both modes — so the title mode stops calling a model at
 *   all once the design is known;
 *   the category and the required attributes come from the product tables,
 *   never from a model looking at a picture of a shirt;
 *   the description comes from one text-only call covering every family.
 */
const ARTWORK_HASH_VERSION = 1;

/** The artwork's identity: the image bytes, not the request around them. */
async function artworkHashOf(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `a${ARTWORK_HASH_VERSION}-` + [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/* Everything the bank is ranked against, in the design's own words. */
const designTextOf = (design: {
  wording: string[]; audienceCues: string[]; occasionCues: string[];
  recipientCues: string[]; illustrationCategory: string; tone: string;
}) => [...design.wording, ...design.audienceCues, ...design.occasionCues,
  ...design.recipientCues, design.illustrationCategory, design.tone]
  .map(clean).filter(Boolean);


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
  /* The layered path is opt-in per account and off globally: rolling back is
     deleting a row, not shipping a deploy. */
  const canary=await canaryFor(user.userId);
  const artworkHash=canary.useNewFlow?await artworkHashOf(body.image!):"";
  // Explicitly asking for a different title must remain a fresh generation.
  const fetch=body.mode==="title"?boundedVisionFetch:cachedVisionFetch(user.userId,env.DB,boundedVisionFetch);
  if(body.mode==="title"){
    const keywords=[...new Set((body.keywords||[]).map(clean).filter(Boolean))].slice(0,100);if(!keywords.length)return NextResponse.json({error:"Choose a keyword bank before asking The Listing Factory to build the title."},{status:400});
    const excludedNouns=excludedProductNouns(body.product?.blueprintTitle||"");
    const titleCandidates=keywords.filter(keyword=>!namesExcludedProduct(keyword,excludedNouns));
    const tagCandidates=keywords.filter(keyword=>keyword.length<=20&&!namesExcludedProduct(keyword,excludedNouns));
    /*
      THE TITLE STOPS BEING A PAID CALL.

      The legacy selection sent the design image to a model and asked it to
      pick phrases from the seller's bank. Every one of those was a fresh
      call — this mode was excluded from the cache on purpose, so asking for a
      different title would re-generate.

      The design is already understood: its wording is transcribed and its
      audience, occasion and recipient cues are stored against the artwork
      hash. Ranking the bank against that is string work, and the layered path
      ranks it strictly — a phrase appears only if it shares a stem with
      something actually in the design, and returning two phrases or none is a
      correct answer. Padding the title with bank-order phrases is what D544
      and D414 were about.
      So on the layered path the title costs one design analysis the FIRST time
      this artwork is seen, and nothing after that.
    */
    async function layeredSelection(){
      const design=await ensureDesign(user!.userId,artworkHash,body.image!);
      if(!design.ok)throw new Error(design.memberMessage);
      const designText=designTextOf(design.design);
      return {
        selected:strictFitFromBank(titleCandidates,designText,body.product).slice(0,13),
        tags:strictFitFromBank(tagCandidates,designText,body.product).slice(0,13),
        designText,
        designSubjects:[design.design.illustrationCategory,design.design.composition,
          ...design.design.audienceCues].map(clean).filter(Boolean).slice(0,8),
      };
    }
    async function requestSelection(){
      if(canary.useNewFlow)return layeredSelection();
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
  /*
    ETSY DETAILS, WITHOUT ASKING A MODEL WHAT THE PRODUCT IS.

    The legacy details call sent the design image and then instructed the model
    that the artwork "must never change the product category, age group,
    garment type or department" — it paid to look at a picture it had ruled out
    of the answer. Category, department and required attributes follow from the
    Printify blueprint alone, which makes them a table lookup.

    What genuinely needs writing is the description, and that needs no image:
    everything it knows about the artwork is in the stored design intelligence.
    One text-only call covers every product family for this design.
  */
  if(canary.useNewFlow){
    const blueprintTitle=body.product?.blueprintTitle||"";
    const family=productFamily(blueprintTitle)||"";
    const classification=classifyBlueprint(blueprintTitle);
    const facts=productFactsFor(blueprintTitle);
    /* An unsupported blueprint is never given a guessed category. It falls to
       the reviewable placeholder the existing flow already uses, so the member
       keeps working and nothing is invented. */
    if(!family||!facts.mapped||!classification.etsyTaxonomyNodeId)
      return NextResponse.json({details:reviewFallback(body.product)});

    const design=await ensureDesign(user.userId,artworkHash,body.image!);
    if(!design.ok)return NextResponse.json({details:reviewFallback(body.product)});

    const copy=await ensureFamilyCopy(user.userId,artworkHash,design.design,[family],
      ()=>classification.productNoun||family);

    /* Required taxonomy properties from the table. Listing fields such as
       "Who made it" are not property values and are set on the payload
       itself, so they are skipped here. */
    const attributes:Record<string,string>={};
    for(const property of classification.requiredProperties){
      if(LISTING_FIELD_FOR_PROPERTY[property])continue;
      const fromFacts=(facts.mapped?facts.attributes:{})[property];
      const allowed=classification.allowedValues[property];
      if(fromFacts)attributes[property]=fromFacts;
      else if(allowed?.length)attributes[property]=allowed[0];
    }

    return NextResponse.json({details:{
      category:classification.category,
      attributes,
      /* Nothing invented: an empty set is honest where a guessed holiday is
         not. The member fills these in if they want them. */
      optional:{},
      blurb:clean(copy.copy[family]?.blurb||""),
      /* The category came from a table rather than a model's impression of a
         photograph, so it is not a thing to review. */
      confidence:"high",
    } satisfies Details});
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
