import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";

const WEB3FORMS_ACCESS_KEY = "5b639ca5-fea3-4f99-bf3e-a08f6e9482c2";
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to contact support." }, { status: 401 });
  const launchBlock = await customerLaunchBlock(user);
  if (launchBlock) return NextResponse.json({ error: launchBlock }, { status: 403 });
  try {
    const input = await request.formData();
    const email = String(input.get("email") ?? "").trim().slice(0, 254);
    const message = String(input.get("message") ?? "").trim().slice(0, 6000);
    const page = String(input.get("page") ?? "").slice(0, 500);
    const conversation = String(input.get("conversation") ?? "").slice(-12000);
    const screenshot = input.get("attachment");
    if (!/^\S+@\S+\.\S+$/.test(email) || message.length < 5) return NextResponse.json({ error: "Enter a valid email and describe what happened." }, { status: 400 });
    if (screenshot instanceof File && (screenshot.size > MAX_SCREENSHOT_BYTES || !/^image\/(png|jpeg|webp)$/i.test(screenshot.type))) {
      return NextResponse.json({ error: "The optional screenshot must be a PNG, JPG or WebP no larger than 5 MB." }, { status: 400 });
    }
    const outbound = new FormData();
    outbound.append("access_key", WEB3FORMS_ACCESS_KEY);
    outbound.append("subject", `Goldie Listing Factory support: ${email}`);
    outbound.append("from_name", "Goldie Listing Factory Support");
    outbound.append("replyto", email);
    outbound.append("email", email);
    outbound.append("message", message);
    outbound.append("page", page);
    outbound.append("conversation", conversation);
    outbound.append("authenticated_member", user.email);
    if (screenshot instanceof File && screenshot.size) outbound.append("attachment", screenshot, screenshot.name.slice(0, 200));
    const response = await fetch("https://api.web3forms.com/submit", { method: "POST", body: outbound });
    const result = await response.json().catch(() => ({})) as { success?: boolean; message?: string };
    if (!response.ok || !result.success) throw new Error(result.message || "Support submission failed.");
    return NextResponse.json({ sent: true });
  } catch {
    return NextResponse.json({ error: "That message did not send. Email goldie@beawolfbiz.com directly." }, { status: 502 });
  }
}
