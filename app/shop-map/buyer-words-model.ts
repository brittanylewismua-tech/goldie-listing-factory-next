/*
  Buyers' own words. The model only proposes phrases; counting is done here
  against the review text, so every number shown is a real count.
*/
import {decode} from "./opportunity-engine-model.ts";

export const BUYER_WORDS_PROMPT=`These are customer reviews from one Etsy shop.
List up to 10 short phrases (2 to 5 words) that several buyers use, copied exactly as buyers wrote them.
Prefer phrases about who they bought it for, why they bought it, how they wear or use it, and how it makes them feel.
Skip praise for the product itself, such as "love this shirt", "love this hoodie", "great quality", "so soft", "fast shipping", "true to size".
Return one JSON object and nothing else: {"phrases":["",""]}`;

/* Praise for the product itself says nothing about who buys or why. */
const GENERIC=/^(love (it|this|my|the (shirt|hoodie|sweatshirt|tee|sweater|product|quality|fit|design|print))\b.*|great (quality|shirt|product|fit)|fast shipping|as described|so cute|so soft|very happy|highly recommend|thank you|fits (great|perfectly|well)|true to size)$/i;

export function parsePhrases(text:string):string[]{
  const start=text.indexOf("{"),end=text.lastIndexOf("}");
  if(start<0||end<=start)return [];
  try{
    const raw=JSON.parse(text.slice(start,end+1)) as {phrases?:unknown};
    return [...new Set((Array.isArray(raw.phrases)?raw.phrases:[]).map(value=>String(value).trim().toLowerCase().replace(/[“”"'.!,]+/g,"").replace(/\s+/g," "))
      .filter(phrase=>{const words=phrase.split(" ").length;return words>=2&&words<=6&&phrase.length<=48&&!GENERIC.test(phrase)}))].slice(0,10);
  }catch{return []}
}

const normal=(text:string)=>" "+decode(text).toLowerCase().replace(/[“”"'’.!,?;:()]+/g," ").replace(/\s+/g," ")+" ";

/** Reviews containing each phrase. Only phrases in two or more reviews are kept. */
export function countPhrases(phrases:string[],reviews:string[]){
  const texts=reviews.map(normal);
  return phrases.filter(phrase=>!GENERIC.test(phrase)).map(phrase=>{const needle=" "+phrase.toLowerCase()+" ";return {phrase,reviews:texts.filter(text=>text.includes(needle)).length}})
    .filter(row=>row.reviews>=2).sort((a,b)=>b.reviews-a.reviews).slice(0,6);
}
