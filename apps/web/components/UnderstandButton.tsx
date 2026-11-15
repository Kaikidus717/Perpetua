"use client";

import { BUTTON_PRIMARY } from "@/lib/ui";
import { WALKTHROUGH_COOKIE, WALKTHROUGH_COOKIE_VALUE } from "@/lib/walkthrough";

/// Only the first visit renders this. It writes the one cookie the gate reads, then does a full
/// navigation so the server sees the cookie on the very next request.
export function UnderstandButton() {
  function understand() {
    document.cookie = `${WALKTHROUGH_COOKIE}=${WALKTHROUGH_COOKIE_VALUE}; path=/; max-age=31536000; samesite=lax`;
    window.location.assign("/");
  }

  return (
    <button type="button" onClick={understand} className={BUTTON_PRIMARY}>
      I understand — continue to Perpetua
    </button>
  );
}
