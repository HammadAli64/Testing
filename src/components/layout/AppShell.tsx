"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { useCallback, useState } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden lg:flex-row">
      <Sidebar mobileOpen={mobileMenuOpen} onClose={closeMobileMenu} />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-72">
        <div className="sticky top-0 z-30 flex h-14 items-center border-b border-zinc-200/80 bg-white/95 px-3 backdrop-blur-md dark:border-cyan-900/40 dark:bg-[#0b1020]/90 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-300/70 bg-gradient-to-r from-violet-400/95 via-fuchsia-400/90 to-cyan-300/85 px-3 py-2 text-sm font-semibold text-zinc-950 shadow-[0_0_22px_rgba(168,85,247,0.45)] transition hover:brightness-110 dark:border-violet-300/60 dark:from-violet-500/40 dark:via-fuchsia-500/35 dark:to-cyan-400/35 dark:text-violet-100 dark:shadow-[0_0_24px_rgba(168,85,247,0.42)]"
            aria-label="Open menu"
          >
            <MenuIcon className="h-4 w-4" />
            Menu
          </button>
        </div>
        <main className="min-w-0 flex-1 backdrop-blur-[1px]">{children}</main>
      </div>
    </div>
  );
}

function MenuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}
