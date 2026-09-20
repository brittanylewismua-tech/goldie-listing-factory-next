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
  /* D786 · The top rail rendered "BL" and "Brittany" as literal text, so every
     seller who signed in was greeted by the owner's name. It needs the signed-in
     account, and only the parts it displays: a name and its initials. The email
     is not returned - the rail does not show one, and an endpoint should not
     hand the browser more than the screen uses. */
  const displayName = user?.fullName || user?.displayName || null;
  const initials = displayName
    ? displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()
    : null;
  return NextResponse.json({
    signedIn: Boolean(user),
    owner: Boolean(user && isOwner(user)),
    name: displayName,
    initials,
  });
}
