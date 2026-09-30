import type { AttentionMap } from "./shop-map-attention";

export type ShopOpportunity = {
  worldId: string;
  label: string;
  rank: number;
  state: "underbuilt" | "aligned" | "overbuilt";
  headline: string;
  explanation: string;
  action: string;
  mirrorBotPrompt: string | null;
};

const signalName=(basis:AttentionMap["basis"])=>basis==="favorites"?"favorites"
  :basis==="sales-90"?"recent sales"
  :basis==="sales-lifetime"?"sales":"customer response";

export function opportunitiesFromAttention(attention:AttentionMap):ShopOpportunity[]{
  const signal=signalName(attention.basis);
  return attention.worlds.filter(world=>world.signal>0).slice(0,5).map(world=>{
    if(world.state==="underbuilt"){
      return {
        worldId:world.worldId,label:world.label,rank:world.rank,state:world.state,
        headline:`${world.label} deserves more of your next build cycle.`,
        explanation:`${world.label} is earning ${world.attentionPercent}% of your ${signal}, but only ${world.catalogPercent}% of your active catalog is built around it.`,
        action:"Build deeper into this customer world before spending the same energy on weaker ideas.",
        mirrorBotPrompt:`Research the ${world.label} customer world for me. It currently accounts for ${world.attentionPercent}% of my ${signal}, but only ${world.catalogPercent}% of my active Etsy catalog, so I want to build deeper into what is already working. Identify the strongest audience identities, recurring language, emotional themes, rituals, inside jokes, adjacent sub-niches, and fresh design territories I can explore next. Stay close to the proven customer instead of sending me into unrelated niches.`,
      };
    }
    if(world.state==="overbuilt"){
      return {
        worldId:world.worldId,label:world.label,rank:world.rank,state:world.state,
        headline:`Stop giving ${world.label} more catalog space than customers are earning for it.`,
        explanation:`${world.label} is ${world.catalogPercent}% of your active catalog but only ${world.attentionPercent}% of your ${signal}.`,
        action:"Maintain the listings that already work, but pause expansion here until customer response catches up.",
        mirrorBotPrompt:null,
      };
    }
    return {
      worldId:world.worldId,label:world.label,rank:world.rank,state:world.state,
      headline:`${world.label} is roughly in proportion.`,
      explanation:`${world.label} is earning ${world.attentionPercent}% of your ${signal} and represents ${world.catalogPercent}% of your active catalog.`,
      action:"Keep it in the mix at about its current share, without taking attention away from stronger underbuilt priorities.",
      mirrorBotPrompt:`Help me go deeper on the ${world.label} customer world without drifting away from what is already working. My Etsy shop currently gives this theme about the same share of catalog attention as the customer response it earns. Identify deeper sub-niches, language, identities, rituals, and fresh design directions that would expand this world rather than broaden me into unrelated audiences.`,
    };
  });
}
