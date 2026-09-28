"use client";

import { useEffect, useRef, useState } from "react";
import { useMarketStream } from "@/hooks/useMarketStream";

/** Polling helper in the spirit of CITYPULSE usePoll: immediate + interval, pause on hidden tab. */
function usePoll(fn: () => void, intervalMs: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ref.current();
    const id = setInterval(() => ref.current(), intervalMs);
    const onVis = () => {
      if (!document.hidden) ref.current();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs]);
}

function StatCard({
  title,
  value,
  sub,
  index = 0,
}: {
  title: string;
  value: string;
  sub?: string;
  index?: number;
}) {
  // Motion-free StatCard (CITYPULSE StatCard pattern without framer-motion dep).
  return (
    <div
      className="glass-card flex items-center justify-between p-4"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-white/50">{title}</p>
        <h3 className="truncate text-2xl font-bold tabular-nums text-white">{value}</h3>
        {sub && <p className="mt-0.5 text-xs text-white/40">{sub}</p>}
      </div>
      <div className="ml-3 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/20">
        <span className="text-blue-400">◈</span>
      </div>
    </div>
  );
}

/**
 * MarketPulse: StatCard + recharts + usePoll pattern from OfficerDashboard.
 * Never invents numbers — em-dash when feed is down.
 */
export default function MarketPulse() {
  const { snapshot, state, connected } = useMarketStream();
  const [tick, setTick] = useState(0);
  usePoll(() => setTick((t) => t + 1), 10000);
  void tick;

  const quotes = snapshot.symbols.slice(0, 3);
  const head = quotes[0];

  return (
    <section className="glass-card p-4" aria-label="Market pulse">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Market Pulse</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            state === "live"
              ? "bg-emerald-500/15 text-emerald-300"
              : state === "stale" || state === "snapshot"
                ? "bg-amber-500/15 text-amber-300"
                : "bg-white/5 text-white/40"
          }`}
        >
          {state}
          {connected ? "" : " · reconnecting"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <StatCard
          title={head?.symbol ?? "Feed"}
          value={head?.price != null ? String(head.price) : "—"}
          sub={head?.asOf ? `as of ${head.asOf}` : "feed unavailable — no invented numbers"}
          index={0}
        />
      </div>
      {quotes.length > 1 && (
        <ul className="mt-3 space-y-1.5">
          {quotes.slice(1).map((q) => (
            <li
              key={q.symbol}
              className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
            >
              <span className="font-mono text-indigo-200">{q.symbol}</span>
              <span className="tabular-nums text-white/80">{q.price != null ? q.price : "—"}</span>
            </li>
          ))}
        </ul>
      )}
      {quotes.length === 0 && (
        <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/40">
          Waiting for market feed — placeholders shown as — until a real snapshot arrives.
        </p>
      )}
    </section>
  );
}
