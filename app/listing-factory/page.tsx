import ListingFactoryClientEntry from "./client-entry";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { billingState } from "@/app/billing";
import { isOwner, mastermindState } from "@/app/mastermind/access";
import SignupClient from "@/app/signup/signup-client";
import "@/app/signup/signup.css";
import "@/app/signup/signup-copy.css";
import "@/app/signup/signup-polish.css";

export default async function ListingFactoryRoute({searchParams}:{searchParams:Promise<{offer?:string}>}){
  const offerValue = (await searchParams).offer;
  const initialOffer = offerValue === "trial" || offerValue === "goldie" || offerValue === "pro" || offerValue === "scale" ? offerValue : undefined;
  if (process.env.NODE_ENV === "development") return <ListingFactoryClientEntry/>;
  let user;
  try {
    user = await getChatGPTUser();
  } catch (error) {
    console.error("[listing-factory-server-startup] authentication", error);
    return <SignupClient signedIn={false} returnTo="/listing-factory" initialOffer={initialOffer}/>;
  }
  if (!user) return <SignupClient signedIn={false} returnTo="/listing-factory" initialOffer={initialOffer}/>;

  // Owner access is authoritative and must not depend on the billing database.
  // Running billingState in parallel used to make the owner route fail with a
  // 500 whenever billing initialization hit a transient D1 error.
  if (isOwner(user)) return <ListingFactoryClientEntry/>;

  let mastermind;
  try {
    mastermind = await mastermindState(user);
  } catch (error) {
    console.error("[listing-factory-server-startup] mastermind access", error);
    mastermind = { active: false, redeemed: false, owner: false };
  }

  let billing;
  try {
    billing = await billingState(user);
  } catch (error) {
    console.error("[listing-factory-server-startup] billing access", error);
    // Access checks must fail closed without taking down the public route.
    return <SignupClient signedIn signedInEmail={user.email} returnTo="/listing-factory" initialOffer={initialOffer}/>;
  }
  const hasAccess = billing.active || mastermind.owner || (mastermind.active && mastermind.redeemed);
  if (!hasAccess) return <SignupClient signedIn signedInEmail={user.email} returnTo="/listing-factory" initialOffer={initialOffer}/>;

  return <ListingFactoryClientEntry/>;
}
