"use client";

import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState<T>(value);

  useEffect(() => {
    if (value === settled) return;
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, settled, ms]);

  return settled;
}
