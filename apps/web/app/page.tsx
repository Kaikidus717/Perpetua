import { VaultsPage } from "@/components/VaultsPage";
import { WALKTHROUGH_COOKIE, walkthroughSeen } from "@/lib/walkthrough";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/// The landing page is gated once. `proxy.ts` catches most first visits before this renders; this
/// check is the server-side backstop if a deployment does not run the proxy.
export default async function Page() {
  const store = await cookies();
  if (!walkthroughSeen(store.get(WALKTHROUGH_COOKIE)?.value)) {
    redirect("/walkthrough?welcome=1");
  }
  return <VaultsPage />;
}
