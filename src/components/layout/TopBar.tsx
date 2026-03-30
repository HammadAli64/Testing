"use client";

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="anim-fade-up cyber-surface flex flex-col gap-4 border-b px-4 py-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 max-w-3xl text-sm text-zinc-500 dark:text-zinc-300 sm:text-base">
            {subtitle}
          </p>
        ) : null}
      </div>
    </header>
  );
}
