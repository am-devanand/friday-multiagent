import { NextResponse } from "next/server";
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";

interface TokenRequestBody {
  identity?: string;
  room?: string;
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !url) {
      return NextResponse.json(
        { error: "Voice service not configured" },
        { status: 502 }
      );
    }

    let body: TokenRequestBody = {};
    try {
      body = (await req.json()) as TokenRequestBody;
    } catch {
      body = {};
    }

    const identity = safeString(body.identity, "boss");
    const room = safeString(body.room, "friday-desk");

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: "10m",
    });
    token.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    });
    // Empty agentName matches the dev worker registered with no explicit
    // name — this exact shape is proven working against this worker.
    token.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName: "" })],
    });

    const jwt = await token.toJwt();
    return NextResponse.json({ token: jwt, url, room });
  } catch {
    return NextResponse.json(
      { error: "Failed to mint voice token" },
      { status: 502 }
    );
  }
}
