export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAIN_URL =
  process.env.FRIDAY_BRAIN_URL ?? "http://127.0.0.1:8001/v1/chat/completions";
const BRAIN_MODEL =
  process.env.FRIDAY_BRAIN_MODEL ?? "inclusionai/ling-3.0-flash-fin:free";
const MCP_URL = process.env.FRIDAY_MCP_URL ?? "http://127.0.0.1:8000/sse";
const MAX_STEPS = 4;

type ChatMsg = { role: string; content: string };

const SYSTEM = [
  "You are F.R.I.D.A.Y. — Fully Responsive Intelligent Digital Assistant for You.",
  "Tone: calm, sharp, warm when it fits, a little dry. Address the user as boss.",
  "Keep replies short: two to four sentences, spoken style, no markdown lists.",
  "You have tools. Use get_current_time for time questions, get_system_info",
  "for system questions, get_world_news for news briefs (then one short spoken",
  "summary, biggest stories only). Never narrate tool calls; just answer.",
].join(" ");

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

type McpTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

async function loadMcp() {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { SSEClientTransport } =
    await import("@modelcontextprotocol/sdk/client/sse.js");
  const transport = new SSEClientTransport(new URL(MCP_URL));
  const client = new Client({ name: "friday-hud", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

export async function GET() {
  return Response.json({ model: BRAIN_MODEL });
}

function classifyBrainError(status: number, text: string): { error: string; hint: string; status: number } {
  if (status === 429 || /rate.limit|quota|429/i.test(text)) {
    return {
      error: "Brain rate-limited (free quota exhausted)",
      hint: "retry in a minute — no setup needed",
      status: 429,
    };
  }
  return {
    error: `Brain proxy ${status}: ${text.slice(0, 200)}`,
    hint: "",
    status: 502,
  };
}
export async function POST(req: Request) {
  let messages: ChatMsg[] = [];
  try {
    const body = (await req.json()) as { messages?: ChatMsg[] };
    if (Array.isArray(body.messages)) messages = body.messages;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (messages.length === 0) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  const transcript: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const toolsUsed: string[] = [];
  let client: Awaited<ReturnType<typeof loadMcp>> | null = null;

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const isSmallTalk =
    messages.length <= 2 &&
    !!lastUser &&
    /^(hi+|hii+|hello+|hey+|yo|sup|howdy|good\s?(morning|afternoon|evening|day)|greetings?)[!.…\s]*$/i.test(
      lastUser.content.trim()
    );

  try {
    if (isSmallTalk) {
      const res = await fetchWithTimeout(
        BRAIN_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: BRAIN_MODEL, messages: transcript }),
        },
        100_000
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const classified = classifyBrainError(res.status, text);
        return Response.json(
          { ...classified, model: BRAIN_MODEL },
          { status: classified.status }
        );
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const reply = (data.choices?.[0]?.message?.content ?? "").trim();
      if (!reply) {
        return Response.json(
          {
            error: "Brain returned empty reply",
            hint: "free model hiccup — retry your message",
            model: BRAIN_MODEL,
          },
          { status: 502 }
        );
      }
      return Response.json({ reply, toolsUsed, model: BRAIN_MODEL });
    }
    client = await loadMcp();
    const listed = (await client.listTools()) as unknown as {
      tools: McpTool[];
    };
    const tools = listed.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description ?? t.name,
        parameters: t.inputSchema,
      },
    }));

    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await fetchWithTimeout(
        BRAIN_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: BRAIN_MODEL,
            messages: transcript,
            tools: tools.length > 0 ? tools : undefined,
          }),
        },
        100_000
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const classified = classifyBrainError(res.status, text);
        return Response.json(
          { ...classified, model: BRAIN_MODEL },
          { status: classified.status }
        );
      }
      const data = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };
      const msg = data.choices?.[0]?.message;
      const calls = msg?.tool_calls ?? [];
      if (calls.length === 0) {
        const reply = (msg?.content ?? "").trim();
        if (!reply) {
          return Response.json(
            {
              error: "Brain returned empty reply",
              hint: "free model hiccup — retry your message",
              model: BRAIN_MODEL,
            },
            { status: 502 }
          );
        }
        return Response.json({ reply, toolsUsed, model: BRAIN_MODEL });
      }
      transcript.push({
        role: "assistant",
        content: msg?.content ?? null,
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: "function",
          function: c.function,
        })),
      });
      for (const c of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(c.function.arguments || "{}") as Record<
            string,
            unknown
          >;
        } catch {
          args = {};
        }
        const out = (await client.callTool({
          name: c.function.name,
          arguments: args,
        })) as unknown as {
          content?: Array<{ type?: string; text?: string }>;
        };
        const text = (out.content ?? [])
          .map((p) => (typeof p.text === "string" ? p.text : ""))
          .join("\n");
        toolsUsed.push(c.function.name);
        transcript.push({
          role: "tool",
          tool_call_id: c.id,
          content: text.slice(0, 4000),
        });
      }
    }
    return Response.json(
      {
        error: "Tool loop did not settle — try a simpler question",
        hint: "",
        model: BRAIN_MODEL,
      },
      { status: 502 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "proxy unreachable";
    const hint = msg.includes(":8000")
      ? "Is the MCP server on :8000 running?"
      : "Brain offline — start :8001";
    return Response.json({ error: msg, hint, model: BRAIN_MODEL }, { status: 502 });
  } finally {
    try {
      await client?.close();
    } catch {
      /* ignore close errors */
    }
  }
}
