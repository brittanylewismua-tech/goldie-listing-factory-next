import { redirect } from "next/navigation";
import { isQaReviewer } from "@/app/qa-reviewer";
import MobileQaClient from "./mobile-qa-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goldie mobile reviewer check" };

export default async function MobileQaPage() {
  if (!(await isQaReviewer())) redirect("/account/sign-in?return_to=%2Fshop-map");
  return <MobileQaClient />;
}
