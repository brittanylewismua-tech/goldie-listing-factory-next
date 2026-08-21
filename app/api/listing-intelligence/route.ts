import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { excludedProductNouns, namesExcludedProduct } from "@/app/product-type-utils";

type Details={category:string;attributes:Record<string,string>;optional:Record<string,string>;blurb:string;confidence:"high"|"review"};
const validImage=(value:unknown):value is string=>typeof value==="string"&&/^data:image\/(png|jpeg|webp);base64,/i.test(value)&&value.length<18*1024*1024;
const clean=(value:unknown)=>String(value||"").replace(/[<>]/g,"").trim().slice(0,300);
const normalize=(value:string)=>value.toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim();
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
    const titleResponse=await fetch("https://fal.run/openrouter/router/vision",{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify({image_urls:[body.image],model:"google/gemini-2.5-flash",temperature:0,system_prompt:"Return only compact valid JSON. Never use markdown.",prompt:`Inspect this specific design and select the exact phrases from this seller-validated keyword bank that best fit it: ${JSON.stringify(keywords)}. Product: ${JSON.stringify(body.product||{})}.

PRODUCT TYPE RULE (most important): this listing is for the physical product named above. Reject every phrase that names any different product type. For this exact Printify blueprint, the excluded product nouns are: ${JSON.stringify(excludedNouns)}. A phrase containing any excluded noun is always wrong, no matter how strong its search data.

HOW MANY: order your selections most relevant first, then keep going. Select between 8 and 13 phrases when the bank contains that many that genuinely fit the design and the product type. The seller's phrases will be joined into one Etsy title with a 140 character limit, so aim to give enough phrases to use most of that limit. Quality still wins: never pad with a phrase that does not fit the design or names the wrong product.

Avoid duplicate meaning. Do not rewrite, combine, expand, correct, or invent any phrase. Copy each phrase exactly as it appears in the bank. Return only {"selected_keywords":["exact phrase copied from the bank"]}.`})});
    const titlePayload=await titleResponse.json() as {output?:string;detail?:string};if(!titleResponse.ok)return NextResponse.json({error:titlePayload.detail||"Goldie could not build this title."},{status:502});const match=titlePayload.output?.match(/\{[\s\S]*\}/);if(!match)return NextResponse.json({error:"Goldie could not read the prepared title."},{status:502});const parsed=JSON.parse(match[0]) as {selected_keywords?:string[]},allowedByLower=new Map(keywords.map(keyword=>[keyword.toLocaleLowerCase(),keyword])),selected=[...new Set((parsed.selected_keywords||[]).map(value=>allowedByLower.get(clean(value).toLocaleLowerCase())).filter((value):value is string=>Boolean(value)&&!namesExcludedProduct(value,excludedNouns)))].slice(0,13);
    // Previously: chosen = selected.length ? selected : keywords.slice(0,13)
    // That fallback silently took the first 13 phrases in bank order (banks are
    // stored alphabetically), so a design the model could not match produced a
    // confident-looking title built from arbitrary phrases. Fail loudly instead.
    if(!selected.length)return NextResponse.json({error:"Goldie could not find phrases in this bank that match this design. Pick a different keyword bank, or build this title yourself."},{status:422});
    const chosen=selected,joiner=body.useCommas?", ":" ";let title="";const included:string[]=[];for(const phrase of chosen){const candidate=title?`${title}${joiner}${phrase}`:phrase;if(candidate.length>140)continue;title=candidate;included.push(phrase)}if(!title)return NextResponse.json({error:"Goldie could not build a usable title."},{status:502});return NextResponse.json({title,keywords:included});
  }
  const response=await fetch("https://fal.run/openrouter/router/vision",{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify({image_urls:[body.image],model:"google/gemini-2.5-flash",temperature:0,system_prompt:"Return only compact valid JSON. Never use markdown.",prompt:`Pre-fill Etsy listing details for this specific print-on-demand product. Product facts: ${JSON.stringify(body.product||{})}. Final title: ${clean(body.title)}. Selected tags: ${JSON.stringify((body.tags||[]).slice(0,13))}. Choose the closest Etsy category from the physical Printify product facts only. The artwork, design wording, title, and tags must never change the product category, age group, garment type, or department. Two designs placed on the same Printify template must receive the same product category. Include every physical or product attribute you can confidently support from the product name, brand, model, and description. Do not stop at required fields. Use product facts, not the artwork, for material, garment, size, shape, room, orientation, neckline, sleeve, and other physical attributes. Inspect the artwork only for contextual fields. Fill holiday, occasion, recipient, or style only when the design, title, or tags clearly support that exact choice; otherwise leave those optional fields out. Never guess simply to make a field non-empty. Write a natural 1-2 sentence design-specific introduction using at most 2 exact keyword phrases from the title or tags, without keyword stuffing or unsupported claims. Return {"category":"...","attributes":{"Sleeve length":"..."},"optional":{"Holiday":"..."},"blurb":"...","confidence":"high"|"review"}. Use concise Etsy-style field names and values. Attribute names must suit this product type; tote, mug, poster, shirt, and sweatshirt fields differ.`})});
  const payload=await response.json() as {output?:string;detail?:string};if(!response.ok)return NextResponse.json({error:payload.detail||"Goldie could not prepare Etsy details."},{status:502});
  const match=payload.output?.match(/\{[\s\S]*\}/);if(!match)return NextResponse.json({error:"Goldie could not read the prepared Etsy details."},{status:502});
  const raw=JSON.parse(match[0]) as Partial<Details>;
  const contextualText=[body.title,...(body.tags||[])].map(clean).join(" ");
  const attributes=supportedOptional(raw.attributes,contextualText),optional=supportedOptional(raw.optional,contextualText);
  return NextResponse.json({details:{category:clean(raw.category)||"Needs review",attributes,optional,blurb:clean(raw.blurb),confidence:raw.confidence==="high"?"high":"review"} satisfies Details});
}
