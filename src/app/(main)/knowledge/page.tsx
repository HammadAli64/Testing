"use client";

import { TopBar } from "@/components/layout/TopBar";
import { useAppState } from "@/context/AppStateProvider";
import { useState } from "react";

export default function KnowledgePage() {
  const { dateKey } = useAppState();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <TopBar
        title="Knowledge upload"
        subtitle="Upload your file text for RAG-generated challenges"
      />
      <div className="space-y-4 px-4 py-6 sm:px-8 sm:py-8">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Paste your document text here (for now). The backend will auto-chunk,
            embed, and store it. Then your daily plan will be generated strictly
            from this knowledge.
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-4 h-64 w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-50"
            placeholder="Paste your file text…"
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !content.trim()}
              onClick={async () => {
                const baseUrl =
                  process.env.NEXT_PUBLIC_COACH_API_BASE_URL ??
                  "http://localhost:8000";
                const userId = localStorage.getItem("mmls-user-id") ?? "";
                if (!userId) {
                  setStatus("Missing user id (reload the app once).");
                  return;
                }
                setBusy(true);
                setStatus("");
                try {
                  const res = await fetch(`${baseUrl}/api/coach/rag/upload`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      userId,
                      source: `user-upload-${dateKey}.txt`,
                      content,
                    }),
                  });
                  const json = (await res.json()) as
                    | {
                        ok: true;
                        chunksIndexed: number;
                        embeddingModel: string;
                      }
                    | { ok: false; error: string };
                  if (!res.ok || !json.ok) {
                    setStatus(
                      "error" in json ? json.error : "Upload failed (unknown)",
                    );
                  } else {
                    setStatus(
                      `Indexed ${json.chunksIndexed} chunks using ${json.embeddingModel}. Now go to Dashboard and press Next day.`,
                    );
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  setStatus(msg);
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Upload & index"}
            </button>
            {status ? (
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {status}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

