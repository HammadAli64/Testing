"use client";

import { AppStateProvider } from "@/context/AppStateProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AppStateProvider>{children}</AppStateProvider>;
}
