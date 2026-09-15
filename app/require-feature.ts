import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getChatGPTUser, accountSignInPath, type ChatGPTUser } from "@/app/chatgpt-auth";
import { gate } from "@/app/entitlements";
import type { Feature } from "@/app/suite-plans";

/**
 * THE GATE, APPLIED.
 *
 * Two helpers because there are two surfaces, and both have to refuse. A page
 * that hides its navigation while its API still answers is not gated — it is
 * decorated.
 *
 * WHAT A REFUSAL RETURNS. 403 with a reason and an upgrade target, never
 * partial feature data and never a redirect loop. The member is signed in and
 * their account works; it is this feature they cannot reach, and the response
 * says so.
 */
export async function requireFeatureApi(feature: Feature): Promise<
  { ok: true; user: ChatGPTUser } | { ok: false; response: Response }
> {
  const user = await getChatGPTUser();
  const verdict = await gate(user, feature);
  if (verdict.ok) return { ok: true, user: user! };
  const signedOut = verdict.reason === "signed-out";
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: verdict.because,
        /* Enough for the interface to offer the right next step, and nothing
           about anybody else's account. */
        upgradeTo: signedOut ? null : verdict.upgrade,
        state: signedOut ? "signed-out" : verdict.entitlement.state,
      },
      { status: signedOut ? 401 : 403 }),
  };
}

/**
 * For pages. A signed-out visitor goes to sign-in carrying where they were
 * going; a signed-in member without the feature goes to the upgrade screen,
 * which is `open` in the matrix so it can never redirect back here.
 */
export async function requireFeaturePage(feature: Feature, here: string) {
  const user = await getChatGPTUser();
  if (!user) redirect(accountSignInPath(here));
  const verdict = await gate(user, feature);
  if (!verdict.ok) redirect(`/more?needs=${encodeURIComponent(feature)}`);
  return user;
}
