"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function SessionClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  if (compact) {
    return (
      <span className="font-mono text-sm tabular-nums text-white/70" suppressHydrationWarning>
        {time}
      </span>
    );
  }

  return (
    <section className="glass-card p-4" aria-label="Session clock">
      <p className="text-xs font-medium uppercase tracking-wider text-white/50">Session</p>
      <p className="font-mono text-3xl font-bold tabular-nums text-white" suppressHydrationWarning>
        {time}
      </p>
      <p className="mt-1 text-xs text-white/40" suppressHydrationWarning>
        {now.toLocaleDateString()}
      </p>
    </section>
  );
}
