"use client";

import dynamic from "next/dynamic";
import { useVoiceRoom } from "@/hooks/useVoiceRoom";
import MarketPulse from "@/components/hud/MarketPulse";
import SignalLog from "@/components/hud/SignalLog";
import SessionClock from "@/components/hud/SessionClock";
import AgentRoster from "@/components/hud/AgentRoster";
import VoiceBar from "@/components/hud/VoiceBar";

const OrbScene = dynamic(() => import("@/components/orb/OrbScene"), { ssr: false });

const SEATS = Array.from({ length: 9 }, (_, i) => ({
  id: `seat-${i + 1}`,
  angle: (i / 9) * Math.PI * 2,
}));

/**
 * Desk grid: left-rail pulse+signals | center orb 9 seats radial | right-rail clock+roster.
 * Sidebar + topnav pattern adapted from CITYPULSE DashboardLayout (sidebar + TopNavbar).
 */
export default function DeskIsland() {
  const { amplitude, status } = useVoiceRoom();

  return (
    <div className="min-h-screen bg-[#06040A]">
      {/* Topnav */}
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div>
          <h1 className="text-xl font-bold text-white md:text-2xl">FRIDAY Desk</h1>
          <p className="mt-0.5 text-xs text-blue-400/60">Multi-agent HUD shell</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/60">
            voice: {status}
          </span>
          <SessionClock compact />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-[300px_1fr_300px]">
        {/* Left rail */}
        <aside className="flex flex-col gap-4">
          <MarketPulse />
          <SignalLog />
        </aside>

        {/* Center orb with 9 radial seats */}
        <section className="glass-card relative min-h-[560px] overflow-hidden">
          <div className="absolute inset-0">
            <OrbScene amplitude={amplitude} />
          </div>
          {/* Radial seat markers */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {SEATS.map((s) => {
              const x = 50 + 38 * Math.cos(s.angle);
              const y = 50 + 38 * Math.sin(s.angle);
              return (
                <span
                  key={s.id}
                  className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/50"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  title={s.id}
                />
              );
            })}
          </div>
          <div className="absolute bottom-4 left-1/2 w-full max-w-md -translate-x-1/2 px-4">
            <VoiceBar amplitude={amplitude} />
          </div>
        </section>

        {/* Right rail */}
        <aside className="flex flex-col gap-4">
          <SessionClock />
          <AgentRoster />
        </aside>
      </div>
    </div>
  );
}
