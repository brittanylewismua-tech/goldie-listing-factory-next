import { getChatGPTUser } from "@/app/chatgpt-auth";
import SignupClient from "./signup-client";
import "./signup.css";
import "./signup-copy.css";
import "./signup-polish.css";
import "./signup-pricing.css";

export default async function SignupPage({searchParams}:{searchParams:Promise<{checkout?:string;offer?:string;interval?:string}>}){const[user,query]=await Promise.all([getChatGPTUser(),searchParams]),offer=query.offer==="trial"||query.offer==="goldie"||query.offer==="pro"||query.offer==="scale"?query.offer:undefined;return <SignupClient signedIn={Boolean(user)} signedInEmail={user?.email} checkout={query.checkout} initialOffer={offer} initialInterval={query.interval === "year" ? "year" : "month"} returnTo="/listing-factory"/>}
