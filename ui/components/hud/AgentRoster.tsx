"use client";

interface Agent {
  name: string;
  role: string;
  initials: string;
  online: boolean;
  tasks: number;
}

const TEAM: Agent[] = [
  { name: "Friday Core", role: "Orchestrator", initials: "FC", online: true, tasks: 2 },
  { name: "Market Scout", role: "Quotes Agent", initials: "MS", online: false, tasks: 0 },
  { name: "Voice Relay", role: "LiveKit Agent", initials: "VR", online: true, tasks: 1 },
  { name: "Hand Tracker", role: "Vision Agent", initials: "HT", online: false, tasks: 0 },
];

/** Roster adapted from portfolio-premium GarageView team section. */
export default function AgentRoster() {
  const online = TEAM.filter((m) => m.online).length;
  return (
    <section className="glass-card p-4" aria-label="Agent roster">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Agents</h2>
        <span className="text-xs text-white/40">
          {online}/{TEAM.length} online
        </span>
      </div>
      <div className="space-y-1.5">
        {TEAM.map((m) => (
          <div
            key={m.name}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-medium text-blue-300">
              {m.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white/90">{m.name}</p>
              <p className="text-xs text-white/40">{m.role}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">{m.tasks} tasks</span>
              <span
                className={`h-2 w-2 rounded-full ${m.online ? "bg-emerald-400" : "bg-white/20"}`}
                aria-label={m.online ? "Online" : "Offline"}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
