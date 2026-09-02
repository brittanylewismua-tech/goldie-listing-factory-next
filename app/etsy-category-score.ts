export function drinkwareCategoryScore(productFacts:string,path:string):number|null{
  const facts=productFacts.toLowerCase(),candidate=path.toLowerCase(),leaf=candidate.split("›").at(-1)?.trim()||candidate;
  const fallback=/(drinkware|barware)/.test(leaf)?1200:-5000;
  if(/\bmug\b|\bcup\b/.test(facts)&&!/tumbler/.test(facts))return /\bmugs?\b/.test(leaf)?7000:fallback;
  if(/tumbler/.test(facts))return /\btumblers?\b/.test(leaf)?7000:fallback;
  if(/wine glass/.test(facts))return /wine glasses?/.test(leaf)?7000:fallback;
  if(/water bottle/.test(facts))return /water bottles?/.test(leaf)?7000:fallback;
  return null;
}
