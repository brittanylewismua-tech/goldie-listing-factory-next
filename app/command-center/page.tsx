import { requireFeaturePage } from "@/app/require-feature";
import FactoryShell from "@/app/factory-shell";
import CommandCenterClient from "./command-center-client";
import "./command-center.css";

export const metadata = { title: "Command Center" };

/*
  The group heading in the rail used to be a button that opened a list. This
  is what it opens now: the four tools presented by what they answer, over the
  standing state of what is already being watched.
*/
export default async function CommandCenterPage() {
  await requireFeaturePage("marketWatch", "/command-center");
  return (
    <FactoryShell active="command-center" title="Command Center" desktopOnly={false}>
      <CommandCenterClient />
    </FactoryShell>
  );
}
