"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders chart children only after mount so ResponsiveContainer always
 * measures a non-zero box (avoids Recharts width/height -1 console warnings).
 */
export function ChartMount({
  height,
  children,
}: {
  height: number;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="w-full min-w-[200px] shrink-0 overflow-hidden"
      style={{ height, minHeight: height }}
    >
      {ready ? (
        children
      ) : (
        <div className="h-full w-full rounded-lg bg-zinc-950/25" aria-hidden />
      )}
    </div>
  );
}
