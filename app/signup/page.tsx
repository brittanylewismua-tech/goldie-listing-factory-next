import { getChatGPTUser } from "@/app/chatgpt-auth";
import SignupClient from "./signup-client";
import "./signup.css";

export default async function SignupPage({searchParams}:{searchParams:Promise<{checkout?:string}>}){const[user,query]=await Promise.all([getChatGPTUser(),searchParams]);return <SignupClient signedIn={Boolean(user)} checkout={query.checkout} returnTo="/listing-factory"/>}
