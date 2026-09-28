"use client";

import { useMemo } from "react";
import { useVoiceRoom, type VoiceRoomState } from "@/hooks/useVoiceRoom";

const BARS = 40;

interface VoiceBarProps {
  /** Shared live room state (command center passes its hook instance). */
  voice?: VoiceRoomState;
  /**
   * Legacy passive mode: fixed amplitude display with no mic button.
   * Kept so the desk route renders untouched.
   */
  amplitude?: number;
}

/**
 * Interactive in-page voice chat: mic button joins the LiveKit room
 * (auto-dispatching the Friday voice worker), waveform bars follow the
 * live mic level, label follows the real agent-speaking state.
 */
export default function VoiceBar({ voice: externalVoice, amplitude: legacyAmplitude }: VoiceBarProps) {
  const internalVoice = useVoiceRoom();
  const voice = externalVoice ?? internalVoice;
  const passive = externalVoice === undefined && legacyAmplitude !== undefined;
  const level = passive ? (legacyAmplitude ?? 0.12) : voice.micLevel;

  const bars = useMemo(
    () =>
      Array.from({ length: BARS }, (_, i) => {
        const envelope = Math.sin((i / BARS) * Math.PI);
        const base = envelope * 16 + 4 + Math.sin(i * 1.7) * 2;
        const energy = 1 + Math.min(1, Math.max(0, level)) * 2.2 * envelope;
        return Math.max(3, base * energy);
      }),
    [level]
  );

  const activeCount = Math.round(Math.min(1, Math.max(0, level * 2.2)) * BARS);

  if (passive) {
    return (
      <div
        className="flex w-full items-center gap-3 rounded-3xl border border-white/10 bg-[#1A1A24] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
        aria-label="Voice amplitude"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
          </svg>
        </div>
        <div className="relative flex h-6 w-full flex-1 items-center gap-[2px] opacity-80" aria-hidden>
          {bars.map((h, i) => (
            <div
              key={i}
              className={`w-1 rounded-full transition-colors duration-150 ${
                i < activeCount ? "bg-blue-400" : "bg-gray-600"
              }`}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <div className="w-12 text-right font-mono text-xs text-gray-400">
          {(Math.min(1, Math.max(0, level)) * 100).toFixed(0)}%
        </div>
      </div>
    );
  }

  const live = voice.status === "live";
  const connecting = voice.status === "connecting";
  const label =
    voice.status === "idle"
      ? "Tap to talk"
      : connecting
        ? "Connecting…"
        : voice.status === "error"
          ? "Voice offline"
          : voice.agentSpeaking
            ? "Friday speaking…"
            : "Listening…";

  function toggle() {
    if (connecting) return;
    if (live) {
      voice.disconnect();
    } else {
      void voice.connect();
    }
  }

  return (
    <div
      className="flex w-full flex-col gap-2 rounded-3xl border border-white/10 bg-[#1A1A24] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
      aria-label="Friday voice chat"
    >
      <div className="flex w-full items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={connecting}
          aria-label={live ? "Leave voice chat" : "Join voice chat"}
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:opacity-60 ${
            live
              ? voice.agentSpeaking
                ? "cc-mic-pulse bg-emerald-500"
                : "bg-rose-500 hover:bg-rose-400"
              : "bg-blue-500 hover:bg-blue-400"
          }`}
        >
          {connecting ? (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 animate-spin" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : live ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M6 6h12v12H6z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p
            aria-live="polite"
            className={`truncate text-[12px] font-semibold ${
              live
                ? voice.agentSpeaking
                  ? "text-emerald-300"
                  : "text-cyan-200"
                : "text-white/70"
            }`}
          >
            {label}
          </p>
          <div className="relative flex h-6 w-full flex-1 items-center gap-[2px] opacity-80" aria-hidden>
            {bars.map((h, i) => (
              <div
                key={i}
                className={`w-1 rounded-full transition-colors duration-150 ${
                  i < activeCount ? (voice.agentSpeaking ? "bg-emerald-400" : "bg-blue-400") : "bg-gray-600"
                }`}
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
        </div>
        <div className="w-12 shrink-0 text-right font-mono text-xs text-gray-400">
          {(Math.min(1, Math.max(0, level)) * 100).toFixed(0)}%
        </div>
      </div>
      {voice.error && (
        <p role="alert" className="text-[11px] leading-snug text-rose-300">
          {voice.error}
        </p>
      )}
    </div>
  );
}
