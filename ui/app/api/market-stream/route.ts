import type { NextRequest } from "next/server";
import type { MarketSnapshot } from "@/lib/market/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** SSE stub: prime snapshot + heartbeat. Never invents numbers — emits waiting state until a real feed exists. */
export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();

  const prime: MarketSnapshot = {
    state: "waiting",
    symbols: [],
    asOf: null,
    note: "feed unavailable — showing em-dash placeholders",
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (!closed) {
          try {
            controller.enqueue(chunk);
          } catch {
            closed = true;
          }
        }
      };
      const send = (event: string, data: unknown) => {
        safeEnqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Prime snapshot immediately so clients leave "waiting" deterministically
      send("snapshot", prime);

      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      }, 15000);

      // Abort cleanup
      _req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      // client disconnected — no resources to hold
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
