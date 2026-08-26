import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";

export async function GET() {
  const user = await getChatGPTUser();
  /* `owner` is decided on the server from the signed-in account, never from
     anything the browser can set. It is what gates the unreleased placement
     editor: the client uses it to decide whether to render the control, and
     every endpoint the editor calls checks isOwner again for itself, because
     hiding a button is not access control. */
  return NextResponse.json({ signedIn: Boolean(user), owner: Boolean(user && isOwner(user)) });
}
