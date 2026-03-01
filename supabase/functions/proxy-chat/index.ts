// supabase/functions/proxy-chat/index.ts
//
// Supabase Edge Function — Claude API Proxy
//
// Flow:
//   1. Verify JWT (Supabase Auth)
//   2. Query user subscription + plan
//   3. Check daily usage quota
//   4. Validate requested model is in plan.allowed_models
//   5. Forward request to Anthropic API with company API key
//   6. Stream SSE response back to client
//   7. Update daily_usage after stream completes
//
// Environment variables required:
//   ANTHROPIC_API_KEY — company's Anthropic API key (set in Supabase dashboard)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Max timeout for the Anthropic API call (5 minutes)
const STREAM_TIMEOUT_MS = 5 * 60 * 1000;

interface ChatRequest {
  model: string;
  max_tokens: number;
  stream: boolean;
  messages: Array<{ role: string; content: unknown }>;
  system?: string;
  thinking?: { type: string; budget_tokens: number };
  tools?: unknown;
}

Deno.serve(async (req: Request) => {
  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    // ── 1. Authenticate user ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonError("Missing or invalid Authorization header", 401);
    }
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicApiKey) {
      console.error("ANTHROPIC_API_KEY not configured");
      return jsonError("Server configuration error", 500);
    }

    // Use service role client for DB queries (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the JWT and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return jsonError("Invalid or expired token", 401);
    }

    const userId = user.id;

    // ── 2. Get subscription + plan ──
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("*, plan:plans(*)")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (subError || !subscription) {
      // No active subscription — auto-assign free plan
      const { data: freePlan } = await supabase
        .from("plans")
        .select("*")
        .eq("name", "free")
        .single();

      if (!freePlan) {
        return jsonError("No subscription plan available", 403);
      }

      // Auto-create free subscription
      const { data: newSub, error: createError } = await supabase
        .from("subscriptions")
        .upsert(
          {
            user_id: userId,
            plan_id: freePlan.id,
            status: "active",
          },
          { onConflict: "user_id" }
        )
        .select("*, plan:plans(*)")
        .single();

      if (createError || !newSub) {
        return jsonError("Failed to initialize subscription", 500);
      }

      // Use the newly created subscription
      return await handleProxyRequest(
        req,
        supabase,
        userId,
        newSub,
        anthropicApiKey
      );
    }

    // Check subscription expiry
    if (
      subscription.expires_at &&
      new Date(subscription.expires_at) < new Date()
    ) {
      return jsonError("Subscription expired. Please renew your plan.", 403);
    }

    return await handleProxyRequest(
      req,
      supabase,
      userId,
      subscription,
      anthropicApiKey
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return jsonError("Internal server error", 500);
  }
});

// ── Core proxy logic ──
async function handleProxyRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  subscription: Record<string, unknown>,
  anthropicApiKey: string
): Promise<Response> {
  const plan = subscription.plan as Record<string, unknown>;

  // ── 3. Check daily usage ──
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const { data: usage } = await supabase
    .from("daily_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  const currentMessageCount = usage?.message_count ?? 0;
  const maxMessages = (plan.max_messages_per_day as number) ?? 20;

  if (currentMessageCount >= maxMessages) {
    return jsonError(
      `Daily message limit reached (${maxMessages}/day). Upgrade your plan for more.`,
      429
    );
  }

  // ── 4. Parse and validate request body ──
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  // Validate model is allowed by plan
  const allowedModels = (plan.allowed_models as string[]) ?? [];
  if (allowedModels.length > 0 && !allowedModels.includes(body.model)) {
    return jsonError(
      `Model "${body.model}" is not available in your plan. Allowed: ${allowedModels.join(", ")}`,
      403
    );
  }

  // ── 5. Forward to Anthropic API ──
  const anthropicBody: Record<string, unknown> = {
    model: body.model,
    max_tokens: body.max_tokens,
    stream: body.stream !== false, // default true
    messages: body.messages,
  };

  if (body.system) {
    anthropicBody.system = body.system;
  }
  if (body.thinking) {
    anthropicBody.thinking = body.thinking;
  }
  if (body.tools) {
    anthropicBody.tools = body.tools;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(anthropicBody),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    console.error("Anthropic API fetch error:", fetchErr);
    return jsonError("Failed to connect to AI service", 502);
  }

  // If Anthropic returns an error, pass it through
  if (!anthropicResponse.ok) {
    clearTimeout(timeoutId);
    const errorText = await anthropicResponse.text();
    console.error(
      `Anthropic API error ${anthropicResponse.status}:`,
      errorText
    );
    return new Response(errorText, {
      status: anthropicResponse.status,
      headers: {
        ...Object.fromEntries(corsHeaders().entries()),
        "Content-Type":
          anthropicResponse.headers.get("Content-Type") ?? "application/json",
      },
    });
  }

  // ── 6. Stream SSE response back to client ──
  if (!anthropicResponse.body) {
    clearTimeout(timeoutId);
    return jsonError("No response body from AI service", 502);
  }

  // Track tokens for usage update
  let inputTokens = 0;
  let outputTokens = 0;

  const sourceStream = anthropicResponse.body;
  const { readable, writable } = new TransformStream();

  // Pipe with usage tracking in background
  const pipePromise = (async () => {
    const reader = sourceStream.getReader();
    const writer = writable.getWriter();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Pass through the SSE chunk
        await writer.write(value);

        // Try to extract usage from SSE events (best-effort)
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "message_delta" && data.usage) {
                outputTokens = data.usage.output_tokens ?? outputTokens;
              }
              if (data.type === "message_start" && data.message?.usage) {
                inputTokens =
                  data.message.usage.input_tokens ?? inputTokens;
              }
            } catch {
              // Not JSON or partial chunk — ignore
            }
          }
        }
      }
    } catch (err) {
      console.error("Stream pipe error:", err);
    } finally {
      try {
        await writer.close();
      } catch {
        // Already closed
      }
      clearTimeout(timeoutId);

      // ── 7. Update daily usage (fire-and-forget) ──
      try {
        await updateDailyUsage(
          supabase,
          userId,
          today,
          inputTokens,
          outputTokens
        );
      } catch (usageErr) {
        console.error("Failed to update usage:", usageErr);
      }
    }
  })();

  // Don't await the pipe — let it stream
  void pipePromise;

  return new Response(readable, {
    status: 200,
    headers: {
      ...Object.fromEntries(corsHeaders().entries()),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ── Usage tracking ──
async function updateDailyUsage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  // Upsert: create if not exists, increment if exists
  const { data: existing } = await supabase
    .from("daily_usage")
    .select("id, message_count, input_tokens, output_tokens")
    .eq("user_id", userId)
    .eq("date", date)
    .single();

  if (existing) {
    await supabase
      .from("daily_usage")
      .update({
        message_count: (existing.message_count ?? 0) + 1,
        input_tokens: (existing.input_tokens ?? 0) + inputTokens,
        output_tokens: (existing.output_tokens ?? 0) + outputTokens,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("daily_usage").insert({
      user_id: userId,
      date: date,
      message_count: 1,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    });
  }
}

// ── Helpers ──
function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, x-client-info",
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      error: { type: "proxy_error", message },
    }),
    {
      status,
      headers: {
        ...Object.fromEntries(corsHeaders().entries()),
        "Content-Type": "application/json",
      },
    }
  );
}
