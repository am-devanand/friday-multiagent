"use client";

import { useEffect, useRef, useState } from "react";
import { MarketStreamManager } from "@/lib/market/stream-manager";
import type { MarketSnapshot, QuoteState } from "@/lib/market/types";

const WAITING: MarketSnapshot = { state: "waiting", symbols: [], asOf: null };

/** SSE client: new EventSource(/api/market-stream) with backoff via MarketStreamManager. */
export function useMarketStream() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot>(WAITING);
  const [connected, setConnected] = useState(false);
  const [retries, setRetries] = useState(0);
  const mgrRef = useRef<MarketStreamManager | null>(null);

  useEffect(() => {
    const mgr = new MarketStreamManager({
      onSnapshot: setSnapshot,
      onStatus: (ok, n) => {
        setConnected(ok);
        setRetries(n);
      },
    });
    mgrRef.current = mgr;
    mgr.start();
    const onHidden = () => {
      if (document.hidden) mgr.stop();
      else mgr.start();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      mgr.stop();
    };
  }, []);

  const state: QuoteState = !connected && snapshot.symbols.length === 0 ? "waiting" : snapshot.state;

  return { snapshot, state, connected, retries };
}
