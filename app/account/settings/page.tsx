import { requireChatGPTUser } from "@/app/chatgpt-auth";
import FactoryShell from "@/app/factory-shell";
import AccountClient from "./account-client";
import "@/app/account/settings/account.css";

/*
  THE ACCOUNT DESTINATION.

  There was not one. "Plan and limits" showed an allowance and a plan name, and
  everything else a member might want to know about their own account —  which
  address they are signed in as, whether access is active or expiring, what
  data is held about them, how to leave — was either somewhere else or nowhere.

  Tools & settings listed a link called Account that went to a usage meter,
  which is the shape of a product that grew features faster than it grew a
  place to keep them.
*/
export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireChatGPTUser("/account/settings");
  return (
    <FactoryShell active="more" title="Account" desktopOnly={false}>
      <AccountClient email={user.email} />
    </FactoryShell>
  );
}
