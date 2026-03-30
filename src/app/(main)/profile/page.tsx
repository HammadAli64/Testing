"use client";

import { TopBar } from "@/components/layout/TopBar";
import { CATEGORY_LABELS } from "@/lib/mock-data";
import { useAppState } from "@/context/AppStateProvider";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

export default function ProfilePage() {
  const {
    todayPointsEarned,
    progress,
    createStreakRestoreInvite,
    acceptStreakRestoreInvite,
  } = useAppState();
  const points = progress?.lifetimePoints ?? todayPointsEarned;
  const streak = progress?.streak ?? 0;

  const [inviteCode, setInviteCode] = useState<string>("");
  const [inviteError, setInviteError] = useState<string>("");
  const [acceptCode, setAcceptCode] = useState<string>("");
  const [acceptStatus, setAcceptStatus] = useState<string>("");

  const canRestore = useMemo(() => streak === 0, [streak]);

  return (
    <>
      <TopBar
        title="Profile"
        subtitle="Your stats and streak tools (live)"
      />
      <div className="space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        <section className="flex flex-col gap-6 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-xl font-bold text-white shadow-lg shadow-violet-500/25">
              JD
            </div>
            <div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Jordan Demo
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                jordan@client-preview.local
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  Streak {streak} days
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  Total {points.toLocaleString()} pts
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Today {todayPointsEarned.toLocaleString()} pts
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200">
            <p className="font-semibold">Categories</p>
            <p className="mt-1 text-zinc-700 dark:text-zinc-300">
              {Object.values(CATEGORY_LABELS).join(" · ")}.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Streak restore
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            If you miss a day, your streak becomes 0. You can restore it by inviting a friend.
          </p>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/30">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Invite a friend
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {canRestore
                  ? "Generate an invite code. Your friend can enter it on their device after they open the app."
                  : "Your streak is not broken right now."}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!canRestore}
                  onClick={async () => {
                    setInviteError("");
                    setInviteCode("");
                    const res = await createStreakRestoreInvite();
                    if (!res.ok) {
                      setInviteError(res.error);
                      return;
                    }
                    setInviteCode(res.code);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-semibold",
                    canRestore
                      ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                      : "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
                  )}
                >
                  Get invite code
                </button>
                {inviteCode ? (
                  <span className="rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
                    {inviteCode}
                  </span>
                ) : null}
              </div>
              {inviteError ? (
                <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                  {inviteError}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/30">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Friend: enter code
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                If a friend shared a code with you, enter it to restore their streak.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={acceptCode}
                  onChange={(e) => setAcceptCode(e.target.value)}
                  placeholder="CODE"
                  className="w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setAcceptStatus("");
                    const res = await acceptStreakRestoreInvite(acceptCode);
                    if (!res.ok) {
                      setAcceptStatus(res.error);
                      return;
                    }
                    setAcceptStatus(
                      `Accepted. Restored streak for owner ${res.ownerUserId.slice(0, 8)}…`,
                    );
                  }}
                  className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-400"
                >
                  Submit code
                </button>
              </div>
              {acceptStatus ? (
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                  {acceptStatus}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Badges + leaderboard were demo-only; removed for backend-only mode. */}
      </div>
    </>
  );
}
