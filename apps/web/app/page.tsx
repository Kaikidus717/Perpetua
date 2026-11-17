import { OnboardingPrompt } from "@/components/OnboardingPrompt";
import { VaultsPage } from "@/components/VaultsPage";
import { WALKTHROUGH_COOKIE, walkthroughSeen } from "@/lib/walkthrough";
import { cookies } from "next/headers";

/// The tour is available, not required. A first-time visitor sees one small prompt they can close.
export default async function Page() {
  const store = await cookies();
  const showTour = !walkthroughSeen(store.get(WALKTHROUGH_COOKIE)?.value);
  return (
    <>
      <VaultsPage />
      <OnboardingPrompt show={showTour} />
    </>
  );
}
