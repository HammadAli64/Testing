import { SparklesIcon } from "@/components/icons/SparklesIcon";

export function AIFeedback({ quote }: { quote: string }) {
  return (
    <section className="anim-fade-up coach-space-neon hover-lift relative overflow-hidden rounded-2xl p-5 sm:p-7">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-400/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-sky-400/22 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-200/55 bg-cyan-950/45 text-cyan-200 shadow-[0_0_28px_rgba(49,243,255,0.45)]">
          <SparklesIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 max-w-5xl">
          <h2 className="text-base font-extrabold uppercase tracking-wider text-cyan-200 sm:text-lg">
            Daily quote
          </h2>
          <p className="mt-1 text-sm text-cyan-100/85 sm:text-base">
            One clear line for today—short, readable, and meant to stick.
          </p>
          <blockquote className="mt-4 text-balance text-lg font-medium not-italic leading-relaxed text-zinc-50 sm:text-xl">
            {quote}
          </blockquote>
          <p className="mt-4 text-sm text-zinc-400 sm:text-base">
            Refreshes with your day plan; written to be easy to understand at a glance.
          </p>
        </div>
      </div>
    </section>
  );
}
