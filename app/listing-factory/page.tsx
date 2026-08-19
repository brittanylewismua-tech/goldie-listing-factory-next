import ListingFactory from "@/app/page";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { billingState } from "@/app/billing";
import { mastermindState } from "@/app/mastermind/access";
import SignupClient from "@/app/signup/signup-client";
import "@/app/signup/signup.css";
import "@/app/signup/signup-copy.css";
import "@/app/signup/signup-polish.css";

export default async function ListingFactoryRoute({searchParams}:{searchParams:Promise<{offer?:string}>}){
  const offerValue = (await searchParams).offer;
  const initialOffer = offerValue === "trial" || offerValue === "goldie" || offerValue === "pro" || offerValue === "scale" ? offerValue : undefined;
  const user = await getChatGPTUser();
  if (!user) return <SignupClient signedIn={false} returnTo="/listing-factory" initialOffer={initialOffer}/>;

  const [billing, mastermind] = await Promise.all([
    billingState(user),
    mastermindState(user),
  ]);
  const hasAccess = billing.active || mastermind.owner || (mastermind.active && mastermind.redeemed);
  if (!hasAccess) return <SignupClient signedIn returnTo="/listing-factory" initialOffer={initialOffer}/>;

  return <ListingFactory/>;
}
