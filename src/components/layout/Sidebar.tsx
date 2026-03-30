"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Syndicate Mode", icon: LayoutIcon },
  { href: "/mock-mode", label: "Challenges/Tasks", icon: PlayIcon },
  { href: "/personality-mode", label: "Personality", icon: SparkIcon },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/progress", label: "Progress", icon: ChartIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

export function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const logoCandidates = useMemo(
    () => ["/logo.webp", "/logo.jpg", "/logo.jpeg", "/logo.svg", "/globe.svg"],
    [],
  );
  const [logoIndex, setLogoIndex] = useState(0);
  const logoSrc = logoCandidates[Math.min(logoIndex, logoCandidates.length - 1)];

  useEffect(() => {
    onClose?.();
  }, [pathname, onClose]);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu backdrop"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "cyber-surface fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r backdrop-blur-md transition-transform duration-300 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-72",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-zinc-200/80 px-3 dark:border-cyan-900/40 lg:h-24 lg:justify-center lg:px-6">
          <div className="flex h-12 w-32 items-center justify-center overflow-hidden lg:h-16 lg:w-40">
            <Image
              src={logoSrc}
              alt="Syndicate logo"
              width={160}
              height={64}
              loading="eager"
              className="h-10 w-28 object-contain lg:h-16 lg:w-40"
              onError={() => {
                setLogoIndex((i) => i + 1);
              }}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:hidden"
            aria-label="Close menu"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3 lg:p-5">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-[#be9e4b] text-zinc-950 shadow-[0_0_20px_rgba(190,158,75,0.3)]"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-[#121d38] dark:hover:shadow-[0_0_14px_rgba(49,243,255,0.22)]",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0 opacity-90" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-zinc-200/80 p-4 text-xs text-zinc-500 dark:border-cyan-900/40 dark:text-zinc-300">
          <p className="font-medium text-[#be9e4b]">Client preview build</p>
          <p className="mt-1 leading-relaxed">
            The Syndicate is a high-accountability coaching framework focused on
            consistency, discipline, and daily measurable wins.
          </p>
        </div>
      </aside>
    </>
  );
}
   
function LayoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5H4V5zM14 4h5a1 1 0 011 1v6h-7V4zM4 13h7v7H5a1 1 0 01-1-1v-6zm11 0h5a1 1 0 011 1v5a1 1 0 01-1 1h-5v-7z"
      />
    </svg>
  );
}

function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 5v14l11-7-11-7z"
      />
    </svg>
  );
}

function HistoryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 19V5m4 14V9m4 10v-6m4 6V7"
      />
    </svg>
  );
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-1a5 5 0 015-5h6a5 5 0 015 5v1"
      />
    </svg>
  );
}

function SparkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3L12 3zM18.5 15.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z"
      />
    </svg>
  );
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 6l12 12M18 6l-12 12"
      />
    </svg>
  );
}
