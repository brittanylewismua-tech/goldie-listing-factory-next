import { getChatGPTUser } from "@/app/chatgpt-auth";
import SignupClient from "./signup-client";
import "./signup.css";
import "./signup-copy.css";

export default async function SignupPage({searchParams}:{searchParams:Promise<{checkout?:string;offer?:string}>}){const[user,query]=await Promise.all([getChatGPTUser(),searchParams]),offer=query.offer==="trial"||query.offer==="goldie"||query.offer==="scale"?query.offer:undefined;return <SignupClient signedIn={Boolean(user)} checkout={query.checkout} initialOffer={offer} returnTo="/listing-factory"/>}
