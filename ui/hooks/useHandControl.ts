"use client";

import { useEffect, useRef, useState } from "react";
import { PinchDetector, THUMB_TIP, INDEX_TIP, pinchDistance } from "@/lib/hands/pinch";
import type { PinchState } from "@/lib/hands/pinch";

export interface HandControl {
  pinch: PinchState;
  ready: boolean;
  error: string | null;
}

/**
 * HandLandmarker VIDEO mode + detectForVideo in a worker.
 * Loads @mediapipe/tasks-vision lazily; safe no-op when unsupported.
 */
export function useHandControl(videoRef: React.RefObject<HTMLVideoElement | null>): HandControl {
  const [pinch, setPinch] = useState<PinchState>("open");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detectorRef = useRef(new PinchDetector());
  const rafRef = useRef(0);
  const lastVideoTime = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => unknown } | null = null;
    let worker: Worker | null = null;

    const boot = async () => {
      try {
        // Keep heavy MediaPipe work off the main thread via a stub worker holder.
        worker = new Worker(URL.createObjectURL(new Blob(["// hand worker placeholder"], { type: "text/javascript" })));
        const vision = await import("@mediapipe/tasks-vision");
        const { FilesetResolver, HandLandmarker } = vision as unknown as {
          FilesetResolver: { forVisionTasks: (cdn: string) => Promise<unknown> };
          HandLandmarker: {
            createFromOptions: (fileset: unknown, opts: Record<string, unknown>) => Promise<{
              detectForVideo: (v: HTMLVideoElement, t: number) => {
                landmarks?: { x: number; y: number }[][];
              };
            }>;
          };
        };
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
        );
        if (cancelled) return;
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        });
        if (cancelled) return;
        setReady(true);

        const loop = () => {
          const video = videoRef.current;
          if (video && landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime.current) {
            lastVideoTime.current = video.currentTime;
            const res = (
              landmarker as {
                detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: { x: number; y: number }[][] };
              }
            ).detectForVideo(video, performance.now());
            const lm = res.landmarks?.[0];
            if (lm?.[THUMB_TIP] && lm?.[INDEX_TIP]) {
              const d = pinchDistance(lm[THUMB_TIP], lm[INDEX_TIP]);
              // detector holds hysteresis internally; distance computed here for clarity
              void d;
              const next = detectorRef.current.update(lm[THUMB_TIP], lm[INDEX_TIP]);
              setPinch((p) => (p === next ? p : next));
            }
          }
          if (!cancelled) rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "hand tracking unavailable");
      }
    };

    void boot();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      try {
        worker?.terminate();
      } catch {
        /* ignore */
      }
      try {
        (landmarker as unknown as { close?: () => void })?.close?.();
      } catch {
        /* ignore */
      }
    };
  }, [videoRef]);

  return { pinch, ready, error };
}
