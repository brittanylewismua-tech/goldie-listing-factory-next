import ListingFactoryApp from "@/app/listing-factory-app";
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

  // Owner access is authoritative and must not depend on the billing database.
  // Running billingState in parallel used to make the owner route fail with a
  // 500 whenever billing initialization hit a transient D1 error.
  const mastermind = await mastermindState(user);
  if (mastermind.owner) return <ListingFactoryApp/>;

  let billing;
  try {
    billing = await billingState(user);
  } catch {
    // Access checks must fail closed without taking down the public route.
    return <SignupClient signedIn returnTo="/listing-factory" initialOffer={initialOffer}/>;
  }
  const hasAccess = billing.active || mastermind.owner || (mastermind.active && mastermind.redeemed);
  if (!hasAccess) return <SignupClient signedIn returnTo="/listing-factory" initialOffer={initialOffer}/>;

  return <ListingFactoryApp/>;
}
