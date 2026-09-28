"use client";

import { useState } from "react";

interface Signal {
  id: number;
  title: string;
  detail: string;
  severity: "info" | "warn" | "critical";
  timeAgo: string;
}

const SEED: Signal[] = [
  { id: 1, title: "Desk shell online", detail: "HUD scaffold mounted — waiting for agent events", severity: "info", timeAgo: "now" },
  { id: 2, title: "Market feed stub", detail: "SSE route primed with waiting snapshot", severity: "warn", timeAgo: "1m" },
  { id: 3, title: "Voice room standby", detail: "LiveKit hook idle until credentials land", severity: "info", timeAgo: "2m" },
];

const STYLES: Record<Signal["severity"], string> = {
  info: "bg-blue-50 text-blue-700",
  warn: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700",
};

/** Signal queue adapted from portfolio-premium MechanicView job-queue pattern. */
export default function SignalLog() {
  const [signals] = useState<Signal[]>(SEED);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const visible = signals.filter((s) => !dismissed.has(s.id));

  return (
    <section className="glass-card flex flex-col gap-2 p-4" aria-label="Signal log">
      <h2 className="text-sm font-bold text-white">Signal Log</h2>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {visible.map((s) => (
          <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-white/90">{s.title}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STYLES[s.severity]}`}>
                  {s.severity}
                </span>
                <span className="whitespace-nowrap text-xs text-white/40">{s.timeAgo}</span>
              </span>
            </div>
            <p className="truncate text-xs text-white/50">{s.detail}</p>
            <button
              type="button"
              onClick={() => setDismissed((d) => new Set(d).add(s.id))}
              className="mt-1 text-[11px] text-white/40 hover:text-white/70"
              aria-label={`Dismiss ${s.title}`}
            >
              Dismiss
            </button>
          </div>
        ))}
        {visible.length === 0 && <p className="text-xs text-white/40">No signals — queue clear.</p>}
      </div>
    </section>
  );
}
