"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import VoiceBar from "@/components/hud/VoiceBar";
import { useVoiceRoom } from "@/hooks/useVoiceRoom";

const OrbScene = dynamic(() => import("@/components/orb/OrbScene"), {
  ssr: false,
  loading: () => null,
});

/* ---------------------------------- data ---------------------------------- */

const NAV = [
  { label: "Command Center", active: true, icon: "M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z" },
  { label: "AI Core", active: false, icon: "M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" },
  { label: "Agents", active: false, icon: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1M16 8a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-3-4.6" },
  { label: "Tasks", active: false, icon: "M9 12l2 2 4-5M5 4h14v16H5z" },
  { label: "Calendar", active: false, icon: "M5 5h14v15H5zM5 9h14M9 3v4M15 3v4" },
  { label: "Memory", active: false, icon: "M12 3a7 7 0 0 0-4 12.7V18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 3zM9 21h6" },
  { label: "Conversations", active: false, icon: "M4 5h16v10H9l-5 4z" },
  { label: "Knowledge Base", active: false, icon: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h4" },
  { label: "Tools & Skills", active: false, icon: "M14 7a4 4 0 0 1 5.6 5L11 20.6 3.4 13 12 4.4A4 4 0 0 1 14 7zM14 7l3 3" },
  { label: "Workflows", active: false, icon: "M4 6h6v6H4zM14 4h6v8h-6zM4 16h6v4H4zM10 9h4M17 12v3a3 3 0 0 1-3 3H10" },
];

const CORE_ROWS = [
  { label: "AI Core", value: "Online", dot: "bg-emerald-400" },
  { label: "Memory", value: "82%", dot: "bg-cyan-400" },
  { label: "Voice", value: "Active", dot: "bg-emerald-400" },
  { label: "Agents", value: "6 Running", dot: "bg-cyan-400" },
  { label: "LLM", value: "Connected", dot: "bg-emerald-400" },
  { label: "System", value: "Optimal", dot: "bg-emerald-400" },
];

const AGENTS = [
  { name: "Friday Master", line: "Orchestrating", pct: 92, icon: "M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z" },
  { name: "News Recon", line: "Scanning feeds", pct: 64, icon: "M4 5h16v12H4zM4 5l8 7 8-7" },
  { name: "Memory Keeper", line: "Indexing vectors", pct: 82, icon: "M12 3a7 7 0 0 0-4 12.7V18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 3z" },
  { name: "Browser Pilot", line: "Navigating", pct: 47, icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" },
  { name: "Task Runner", line: "Executing queue", pct: 71, icon: "M9 12l2 2 4-5M5 4h14v16H5z" },
  { name: "Risk Sentinel", line: "Watching threats", pct: 58, icon: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" },
];

const GAUGES = [
  { label: "CPU", pct: 83, color: "#22d3ee" },
  { label: "MEM", pct: 64, color: "#34d399" },
  { label: "DISK", pct: 45, color: "#a78bfa" },
];

const TIMELINE = [
  { time: "09:00", text: "Executive briefing sync", dot: "bg-cyan-400" },
  { time: "11:30", text: "News recon digest review", dot: "bg-emerald-400" },
  { time: "13:00", text: "Memory consolidation window", dot: "bg-violet-400" },
  { time: "15:45", text: "Workflow audit: outreach pipeline", dot: "bg-amber-400" },
  { time: "18:20", text: "End-of-day intelligence summary", dot: "bg-rose-400" },
];

const FEED = [
  { title: "Markets rally on tech earnings", sub: "Global desk · 2m ago", tag: "New", hot: true, icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { title: "New agent skill published", sub: "Tools registry · 18m ago", tag: "View", hot: false, icon: "M12 5v14M5 12h14" },
  { title: "Memory map grew +214 vectors", sub: "Memory Keeper · 42m ago", tag: "View", hot: false, icon: "M12 3a7 7 0 0 0-4 12.7V18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 3z" },
  { title: "Overnight risk scan complete", sub: "Risk Sentinel · 1h ago", tag: "View", hot: false, icon: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" },
  { title: "Workflow run finished: digest", sub: "Task Runner · 2h ago", tag: "View", hot: false, icon: "M9 12l2 2 4-5M5 4h14v16H5z" },
  { title: "Voice relay latency nominal", sub: "Browser Pilot · 3h ago", tag: "View", hot: false, icon: "M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zM5 11a7 7 0 0 0 14 0" },
];

const PROVIDERS = [
  { name: "OpenRouter", state: "Operational", pill: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30" },
  { name: "ElevenLabs", state: "Operational", pill: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30" },
  { name: "LiveKit", state: "Connected", pill: "bg-sky-400/10 text-sky-300 border-sky-400/30" },
  { name: "Sarvam", state: "Limited", pill: "bg-amber-400/10 text-amber-300 border-amber-400/30" },
  { name: "MCP Server", state: "Operational", pill: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30" },
  { name: "Opencode Brain", state: "Standby", pill: "bg-white/5 text-white/40 border-white/15" },
];

const QUICK = ["Start New Task", "Open Calendar", "Start Voice Chat", "Run Workflow"];

/* ------------------------------ small pieces ------------------------------ */

function Glyph({ d, className = "h-3.5 w-3.5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

function CardLabel({ children }: { children: string }) {
  return <p className="hud-label">{children}</p>;
}

function Gauge({ label, pct, color }: { label: string; pct: number; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-[72px] w-[72px]">
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">{pct}%</span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{label}</span>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) {
    return (
      <div className="text-center" aria-label="Clock loading">
        <p className="text-[11px] font-medium capitalize tracking-wide text-white/50">—</p>
        <p className="font-mono text-sm font-bold tabular-nums text-cyan-300">--:--:--</p>
      </div>
    );
  }
  return (
    <div className="text-center">
      <p className="text-[11px] font-medium capitalize tracking-wide text-white/50">{dateFmt.format(now)}</p>
      <p className="font-mono text-sm font-bold tabular-nums text-cyan-300">{timeFmt.format(now)}</p>
    </div>
  );
}

type Msg = { role: "user" | "assistant"; content: string; ts: string };

/* --------------------------------- page ----------------------------------- */

export default function CommandCenter() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Systems online, boss. Type below \u2014 I answer through the live brain.", ts: "" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState("\u2014");
  const [model, setModel] = useState("ling-3.0-flash-fin:free");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const voice = useVoiceRoom();
  const voiceActive = voice.agentSpeaking || voice.micLevel > 0.02;

  /* Live brain model label (never during render). */
  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d: { model?: string }) => {
        if (typeof d.model === "string" && d.model.length > 0) setModel(d.model);
      })
      .catch(() => {});
  }, []);

  /* Hydration-safe: stamp the welcome bubble only after mount (never during render). */
  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].ts === ""
        ? [{ ...prev[0], ts: timeFmt.format(new Date()) }]
        : prev
    );
  }, []);

  /* Auto-grow composer (1-6 rows). */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 144; /* ~6 rows */
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, sending]);

  function stop() {
    abortRef.current?.abort();
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const stamp = timeFmt.format(new Date());
    const next: Msg[] = [...messages, { role: "user" as const, content: trimmed, ts: stamp }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = performance.now();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: ctrl.signal,
      });
      const data = (await res.json()) as {
        reply?: string;
        error?: string;
        hint?: string;
        model?: string;
      };
      if (data.model) setModel(data.model);
      if (!res.ok || !data.reply) {
        const serverText = data.error ?? "Brain unreachable";
        const hinted =
          data.hint && !serverText.includes(data.hint)
            ? `${serverText} — ${data.hint}`
            : serverText;
        throw new Error(hinted);
      }
      const dt = (performance.now() - t0) / 1000;
      setLatency(`${dt.toFixed(1)}s`);
      setMessages([...next, { role: "assistant", content: data.reply, ts: timeFmt.format(new Date()) }]);
    } catch (e) {
      if (ctrl.signal.aborted) {
        setMessages([...next, { role: "assistant", content: "stopped", ts: timeFmt.format(new Date()) }]);
        return;
      }
      const msg = e instanceof Error ? e.message : "Brain offline \u2014 start :8001";
      setError(msg);
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  function quick(label: string) {
    if (label === "Start Voice Chat") {
      void voice.connect();
      return;
    }
    void send(label);
  }

  return (
    <div className="flex min-h-screen bg-[#030710] text-[13px] text-white/85">
      {/* ------------------------------- sidebar ------------------------------ */}
      <aside className="hidden w-[210px] shrink-0 flex-col border-r border-white/10 bg-black/30 lg:flex">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 font-mono text-sm font-bold text-cyan-300">F</span>
          <div>
            <p className="text-[13px] font-bold leading-tight text-white">Command Center</p>
            <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-400/70">Friday OS</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Primary">
          {NAV.map((n) => (
            <a
              key={n.label}
              href={n.label === "Command Center" ? "/" : "/desk"}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors ${
                n.active
                  ? "border border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                  : "border border-transparent text-white/55 hover:bg-white/5 hover:text-white/85"
              }`}
            >
              <Glyph d={n.icon} className="h-4 w-4 shrink-0 opacity-80" />
              <span className="truncate">{n.label}</span>
              {n.active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300" />}
            </a>
          ))}
        </nav>
        <div className="p-3">
          <div className="hud-panel p-3">
            <CardLabel>Voice Status</CardLabel>
            <div className="mt-2">
              <VoiceBar voice={voice} />
            </div>
          </div>
        </div>
      </aside>

      {/* -------------------------------- main -------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-black/20 px-3 py-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            System Status: <span className="text-emerald-300">Optimal</span>
          </p>
          <div className="mx-auto hidden md:block">
            <LiveClock />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 sm:flex">
              <Glyph d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5" className="h-3.5 w-3.5 text-white/40" />
              <input
                placeholder="Search ops..."
                aria-label="Search"
                className="w-32 bg-transparent text-[12px] text-white/80 placeholder:text-white/30 focus:outline-none"
              />
            </div>
            <button aria-label="Notifications" className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 hover:text-white">
              <Glyph d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" />
            </button>
            <button aria-label="Settings" className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 hover:text-white">
              <Glyph d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
            </button>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400/20 text-[10px] font-bold text-cyan-200">OP</span>
              <span className="text-[12px] font-medium text-white/80">Operator</span>
            </span>
          </div>
        </header>

        {/* 3-column grid */}
        <main className="grid flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          {/* Col A */}
          <div className="flex min-w-0 flex-col gap-3">
            <section className="hud-panel p-3" aria-label="AI core overview">
              <CardLabel>AI Core Overview</CardLabel>
              <dl className="mt-2 space-y-1.5">
                {CORE_ROWS.map((r) => (
                  <div key={r.label} className="flex items-center justify-between text-[12px]">
                    <dt className="flex items-center gap-2 text-white/55">
                      <span className={`h-1.5 w-1.5 rounded-full ${r.dot}`} />
                      {r.label}
                    </dt>
                    <dd className="font-semibold text-white/90">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="hud-panel p-3" aria-label="Active agents">
              <div className="flex items-center justify-between">
                <CardLabel>Active Agents</CardLabel>
                <span className="text-[10px] text-white/35">6 running</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {AGENTS.map((a) => (
                  <div key={a.name} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <Glyph d={a.icon} className="h-4 w-4 text-cyan-300/90" />
                    <p className="mt-1.5 truncate text-[12px] font-semibold text-white/90">{a.name}</p>
                    <p className="flex items-center gap-1 text-[10px] text-emerald-300/90">
                      <span className="h-1 w-1 rounded-full bg-emerald-400" />
                      {a.line}
                    </p>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-cyan-400/80" style={{ width: `${a.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="hud-panel p-3" aria-label="System monitor">
              <CardLabel>System Monitor</CardLabel>
              <div className="mt-2 flex items-start justify-around">
                {GAUGES.map((g) => (
                  <Gauge key={g.label} label={g.label} pct={g.pct} color={g.color} />
                ))}
              </div>
              <p className="mt-2 text-center text-[10px] text-white/30">Static demo values</p>
            </section>

            <section className="hud-panel p-3" aria-label="Memory insights">
              <CardLabel>Memory Insights</CardLabel>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-white">3,380</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">vectors</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">22</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">sessions</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">16</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">facts</p>
                </div>
              </div>
              <a href="/desk" className="mt-2 block text-center text-[11px] font-medium text-cyan-300 hover:text-cyan-200">
                View Memory Map
              </a>
            </section>
          </div>

          {/* Col B (center, widest) */}
          <div className="flex min-w-0 flex-col gap-3">
            <section className="hud-panel relative overflow-hidden" aria-label="Jarvis AI core">
              <div className="flex items-center justify-between px-4 pt-3">
                <CardLabel>Jarvis AI Core v5.0</CardLabel>
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  ONLINE
                </span>
              </div>
              <div className="relative h-[380px] sm:h-[440px]">
                {/* CSS fallback globe (always rendered behind canvas) */}
                <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
                  <div className="relative h-64 w-64 sm:h-72 sm:w-72">
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background:
                          "radial-gradient(circle at 35% 30%, rgba(103,232,249,0.55), rgba(34,211,238,0.18) 38%, rgba(3,7,16,0.9) 72%)",
                        boxShadow: "0 0 80px rgba(34,211,238,0.35), 0 0 160px rgba(34,211,238,0.15), inset 0 0 60px rgba(34,211,238,0.25)",
                      }}
                    />
                    <div className="cc-orbit absolute -inset-6 rounded-full border border-dashed border-cyan-400/30">
                      <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
                    </div>
                    <div className="cc-orbit-rev absolute -inset-12 rounded-full border border-white/10">
                      <span className="absolute left-1/4 top-0 h-1.5 w-1.5 rounded-full bg-violet-300/90" />
                      <span className="absolute bottom-2 right-1/4 h-1 w-1 rounded-full bg-emerald-300/90" />
                    </div>
                  </div>
                </div>
                <div
                  className={`absolute inset-0 transition-[filter] duration-500 ${
                    voiceActive ? "[filter:drop-shadow(0_0_45px_rgba(52,211,153,0.45))]" : ""
                  }`}
                >
                  <OrbScene amplitude={voice.amplitude} />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-8 text-center">
                  <p className="text-sm font-bold tracking-[0.35em] text-white/90">JARVIS AI CORE</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">v5.0 · neural lattice stable</p>
                </div>
              </div>
              <div className="relative border-t border-white/10 px-4 py-3">
                <VoiceBar voice={voice} />
              </div>
            </section>

            <section className="hud-panel p-3" aria-label="Mission timeline">
              <div className="flex items-center justify-between">
                <CardLabel>Mission Timeline · Today</CardLabel>
                <span className="text-[10px] text-white/35">5 events</span>
              </div>
              <ul className="mt-2 space-y-1">
                {TIMELINE.map((t) => (
                  <li key={t.time} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                    <span className="font-mono text-[11px] tabular-nums text-cyan-200/90">{t.time}</span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
                    <span className="truncate text-[12px] text-white/75">{t.text}</span>
                  </li>
                ))}
              </ul>
              <button className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-[11px] font-medium text-white/60 hover:text-white">
                View Full Schedule
              </button>
            </section>
          </div>

          {/* Col C */}
          <div className="flex min-w-0 flex-col gap-3 md:col-span-2 xl:col-span-1">
            <section className="hud-panel p-3" aria-label="Live intelligence feed">
              <CardLabel>Live Intelligence Feed</CardLabel>
              <ul className="mt-2 space-y-1.5">
                {FEED.map((f) => (
                  <li key={f.title} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] p-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-cyan-300">
                      <Glyph d={f.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-white/85">{f.title}</span>
                      <span className="block truncate text-[10px] text-white/40">{f.sub}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        f.hot ? "border-rose-400/40 bg-rose-400/10 text-rose-300" : "border-white/15 bg-white/5 text-white/50"
                      }`}
                    >
                      {f.tag}
                    </span>
                  </li>
                ))}
              </ul>
              <button className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-[11px] font-medium text-white/60 hover:text-white">
                View All Intelligence
              </button>
            </section>

            <section className="hud-panel p-3" aria-label="Quick commands">
              <CardLabel>Quick Commands</CardLabel>
              <div className="mt-2 space-y-1.5">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    onClick={() => quick(q)}
                    className="w-full rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2 text-left text-[12px] font-medium text-cyan-100 transition-colors hover:bg-cyan-400/[0.12]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </section>

            <section className="hud-panel p-3" aria-label="LLM status">
              <CardLabel>LLM Status</CardLabel>
              <ul className="mt-2 space-y-1.5">
                {PROVIDERS.map((p) => (
                  <li key={p.name} className="flex items-center justify-between text-[12px]">
                    <span className="text-white/65">{p.name}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${p.pill}`}>{p.state}</span>
                  </li>
                ))}
              </ul>
              <button className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-[11px] font-medium text-white/60 hover:text-white">
                Manage Providers
              </button>
            </section>
          </div>
        </main>

        {/* bottom command bar + chat thread */}
        <footer className="sticky bottom-0 border-t border-white/10 bg-[#030710]/95 px-3 pb-3 pt-2 backdrop-blur">
          <div className="mx-auto w-full max-w-4xl">
            <div
              ref={threadRef}
              className="cc-scroll mb-2 max-h-80 space-y-2 overflow-y-auto"
              aria-live="polite"
              aria-label="Chat thread"
            >
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-br-sm border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5">
                      <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-cyan-50">{m.content}</p>
                      {m.ts !== "" && (
                        <p className="mt-0.5 text-right font-mono text-[10px] tabular-nums text-cyan-200/50">{m.ts}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3 py-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-cyan-300/70">Friday</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-white/80">{m.content}</p>
                      {m.ts !== "" && (
                        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-white/35">{m.ts}</p>
                      )}
                    </div>
                  </div>
                )
              )}
              {sending && (
                <div className="flex justify-start">
                  <div
                    className="flex items-center gap-1.5 rounded-xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3 py-2"
                    aria-label="Friday is typing"
                  >
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" style={{ animationDelay: "0s" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" style={{ animationDelay: "0.15s" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" style={{ animationDelay: "0.3s" }} />
                  </div>
                </div>
              )}
              {error && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-xl rounded-bl-sm border border-rose-400/30 bg-rose-400/10 px-3 py-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-rose-300/80">Error</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-rose-200">{error}</p>
                  </div>
                </div>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="hud-panel rounded-2xl p-3 shadow-[0_0_24px_rgba(34,211,238,0.12)]"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-[#030710]" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
                  </svg>
                </span>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    } else if (e.key === "Escape" && !sending) {
                      setInput("");
                    }
                  }}
                  placeholder="TALK TO FRIDAY \u2014 I am listening..."
                  aria-label="Talk to Friday"
                  rows={1}
                  className="cc-scroll max-h-36 min-h-[36px] w-full resize-none bg-transparent text-[12px] font-medium leading-relaxed tracking-wide text-white placeholder:text-cyan-200/60 focus:outline-none"
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
                <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-white/60">
                  {model}
                </span>
                <span
                  className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[10px] tabular-nums text-white/60"
                  aria-label="Last reply latency"
                >
                  {latency}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {sending && (
                    <button
                      type="button"
                      onClick={stop}
                      className="rounded-full border border-rose-400/40 bg-rose-400/10 px-3 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-400/20"
                    >
                      Stop
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    className="rounded-full bg-cyan-400 px-4 py-1.5 text-[11px] font-bold text-[#030710] disabled:opacity-40"
                  >
                    {sending ? "\u2026" : "Send"}
                  </button>
                </span>
              </div>
            </form>
          </div>
        </footer>
      </div>
    </div>
  );
}
