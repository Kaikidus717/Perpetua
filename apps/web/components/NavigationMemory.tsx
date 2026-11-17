"use client";

import { PREVIOUS_PATH_KEY } from "@/lib/navigation";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/// Remembers the last route in this tab so a page can offer a real "back" destination.
export function NavigationMemory() {
  const pathname = usePathname();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    try {
      window.sessionStorage.setItem(PREVIOUS_PATH_KEY, previous.current);
    } catch {
      /// Private mode can refuse storage. The close control falls back to the home page.
    }
    previous.current = pathname;
  }, [pathname]);

  return null;
}
