/*
  Buyers' own words. The model only proposes phrases; counting is done here
  against the review text, so every number shown is a real count.
*/
import {decode} from "./opportunity-engine-model.ts";

export const BUYER_WORDS_PROMPT=`These are customer reviews from one Etsy shop.
List up to 10 short phrases (2 to 5 words) that several buyers use, copied exactly as buyers wrote them.
Prefer phrases about who they bought it for, why they bought it, how they wear or use it, and how it makes them feel.
Skip generic praise such as "love it", "great quality", "fast shipping", "as described".
Return one JSON object and nothing else: {"phrases":["",""]}`;

const GENERIC=/^(love (it|this|the shirt)|great (quality|shirt|product)|fast shipping|as described|so cute|very happy|highly recommend|thank you)$/i;

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
  return phrases.map(phrase=>{const needle=" "+phrase.toLowerCase()+" ";return {phrase,reviews:texts.filter(text=>text.includes(needle)).length}})
    .filter(row=>row.reviews>=2).sort((a,b)=>b.reviews-a.reviews).slice(0,6);
}
