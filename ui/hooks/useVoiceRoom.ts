"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LocalAudioTrack,
  Participant,
  RemoteAudioTrack,
  Room,
  Track,
} from "livekit-client";

export type VoiceStatus = "idle" | "connecting" | "live" | "error";

export interface VoiceConnectOptions {
  identity?: string;
  room?: string;
}

export interface VoiceRoomState {
  /** Connection lifecycle */
  status: VoiceStatus;
  /** True while the agent participant is the active speaker */
  agentSpeaking: boolean;
  /** 0..1 live mic RMS level */
  micLevel: number;
  /** 0..1 amplitude driving the Orb prop (mic-driven when live, breathing stub when idle) */
  amplitude: number;
  /** Human-readable error, null when healthy */
  error: string | null;
  connect: (opts?: VoiceConnectOptions) => Promise<void>;
  disconnect: () => void;
}

interface TokenResponse {
  token?: string;
  url?: string;
  room?: string;
  error?: string;
}

/**
 * Real LiveKit voice room. livekit-client is lazy-imported inside connect()
 * so the initial page load stays light. Mic + AudioContext are only touched
 * inside the tap handler — never during render.
 */
export function useVoiceRoom(): VoiceRoomState {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [amplitude, setAmplitude] = useState(0.12);
  const [error, setError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const attachedAudioRef = useRef<HTMLMediaElement[]>([]);
  const mountedRef = useRef(true);

  const cleanupAudioGraph = useCallback(() => {
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    analyserBufRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    for (const el of attachedAudioRef.current) {
      el.pause();
      el.removeAttribute("src");
      el.remove();
    }
    attachedAudioRef.current = [];
  }, []);

  const teardownRoom = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      room.disconnect();
    }
    cleanupAudioGraph();
  }, [cleanupAudioGraph]);

  const disconnect = useCallback(() => {
    connectingRef.current = false;
    teardownRoom();
    if (!mountedRef.current) return;
    setAgentSpeaking(false);
    setMicLevel(0);
    setError(null);
    setStatus("idle");
  }, [teardownRoom]);

  const connect = useCallback(
    async (opts?: VoiceConnectOptions) => {
      if (connectingRef.current || roomRef.current) return;
      connectingRef.current = true;
      setStatus("connecting");
      setError(null);
      setAgentSpeaking(false);
      setMicLevel(0);

      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity: opts?.identity ?? "boss",
            room: opts?.room ?? "friday-desk",
          }),
        });
        const data = (await res.json()) as TokenResponse;
        if (!res.ok || !data.token || !data.url) {
          throw new Error(data.error ?? "Voice token request failed");
        }

        const lk = await import("livekit-client");
        const room = new lk.Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(lk.RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          if (!mountedRef.current) return;
          setAgentSpeaking(speakers.some((p) => !p.isLocal));
        });

        const attachRemoteAudio = (track: Track, participant: Participant) => {
          if (track.kind !== lk.Track.Kind.Audio || participant.isLocal) return;
          const remote = track as RemoteAudioTrack;
          const el = remote.attach();
          el.style.display = "none";
          document.body.appendChild(el);
          attachedAudioRef.current.push(el);
        };

        room.on(
          lk.RoomEvent.TrackSubscribed,
          (track: Track, _pub: unknown, participant: Participant) => {
            attachRemoteAudio(track, participant);
          }
        );
        room.on(lk.RoomEvent.TrackUnsubscribed, (track: Track) => {
          track.detach().forEach((el) => {
            el.remove();
            attachedAudioRef.current = attachedAudioRef.current.filter((a) => a !== el);
          });
        });
        room.on(lk.RoomEvent.ParticipantDisconnected, (participant: Participant) => {
          if (!participant.isLocal && mountedRef.current) setAgentSpeaking(false);
        });

        await room.connect(data.url, data.token);

        // Unlock browser audio after the tap gesture so her replies are audible.
        await room.startAudio().catch(() => {});

        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (micErr) {
          const denied =
            micErr instanceof Error &&
            (micErr.name === "NotAllowedError" || micErr.name === "NotFoundError");
          throw new Error(
            denied
              ? "Microphone blocked — allow mic access in the browser address bar, then tap again."
              : "Could not start the microphone — check it is plugged in, then tap again."
          );
        }

        // Mic level tap: AnalyserNode over the local mic MediaStreamTrack.
        let mediaTrack: MediaStreamTrack | null = null;
        room.localParticipant.audioTrackPublications.forEach((pub) => {
          const local = (pub.track ?? pub.audioTrack) as LocalAudioTrack | undefined;
          const mst = local?.mediaStreamTrack;
          if (mst && !mediaTrack) mediaTrack = mst;
        });
        if (mediaTrack) {
          const Ctx =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (Ctx) {
            const ctx = new Ctx();
            audioCtxRef.current = ctx;
            await ctx.resume().catch(() => {});
            const src = ctx.createMediaStreamSource(new MediaStream([mediaTrack]));
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.4;
            src.connect(analyser);
            analyserRef.current = analyser;
            analyserBufRef.current = new Uint8Array(analyser.fftSize);
          }
        }

        if (!mountedRef.current) return;
        setStatus("live");
      } catch (e) {
        teardownRoom();
        if (!mountedRef.current) return;
        const msg =
          e instanceof Error && e.message.length > 0
            ? e.message
            : "Voice connection failed — try again.";
        setError(msg);
        setStatus("error");
      } finally {
        connectingRef.current = false;
      }
    },
    [teardownRoom]
  );

  /* Level meter + orb amplitude driver (10 Hz; breathing stub when not live). */
  useEffect(() => {
    mountedRef.current = true;
    const t0 = Date.now();
    const id = setInterval(() => {
      if (!mountedRef.current) return;
      const analyser = analyserRef.current;
      const buf = analyserBufRef.current;
      if (analyser && buf && roomRef.current) {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.min(1, Math.sqrt(sum / buf.length) * 3);
        setMicLevel(rms);
        setAmplitude(Math.min(1, 0.14 + rms * 0.9));
      } else {
        const t = (Date.now() - t0) / 1000;
        setAmplitude(0.12 + 0.06 * Math.sin(t * 1.4) + 0.03 * Math.sin(t * 3.7));
        setMicLevel(0);
      }
    }, 100);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  /* Leave the room when the page unmounts. */
  useEffect(() => {
    return () => {
      teardownRoom();
    };
  }, [teardownRoom]);

  return { status, agentSpeaking, micLevel, amplitude, error, connect, disconnect };
}

/** Legacy alias kept so older imports keep compiling. */
export type VoiceRoom = VoiceRoomState;
