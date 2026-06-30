
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "./services/auth/tokens.js";
// No provider SDK — embedding via Gemini REST (K1)
import * as dotenv from "dotenv";


import * as fs from "fs";

// Load environment variables for local execution (Next.js typically uses .env.local)
if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
} else {
  dotenv.config();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LITELLM_BASE_URL = (process.env.LITELLM_BASE_URL || '').replace(/\/$/, '');
const LITELLM_KEY = process.env.EYES_GATEWAY_KEY || process.env.LITELLM_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials in .env file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EMBED_DIMS = 1024; // Voyage/Gemini 1024-dim — aligned with migration 032 & ai.ts

async function generateGatewayEmbedding(text: string): Promise<number[] | null> {
  if (!LITELLM_BASE_URL || !LITELLM_KEY) {
    console.error('[MCP] LITELLM_BASE_URL or LITELLM_KEY not set — cannot generate embeddings.');
    return null;
  }
  try {
    const res = await fetch(`${LITELLM_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LITELLM_KEY}`,
      },
      body: JSON.stringify({
        model: 'auto-embed',
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) {
      console.error('[MCP] LiteLLM Gateway embed REST error:', res.status);
      return null;
    }
    const data = await res.json();
    const values: number[] = data?.data?.[0]?.embedding;
    if (values?.length !== EMBED_DIMS) return null;
    return values;
  } catch (err) {
    console.error('[MCP] LiteLLM Gateway embedding failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fetches a stored Google OAuth access token for the given user and service.
 * Reads directly from the oauth_tokens table — mirrors the production sync pattern.
 */
async function getValidGoogleToken(
  client: SupabaseClient,
  userId: string,
  service: string
): Promise<string | null> {
  interface OAuthTokenRow { access_token: string | null; refresh_token: string | null; expires_at: string | null; }
  const { data: tokenRow, error } = await client
    .from('oauth_tokens')
    .select('access_token,refresh_token,expires_at')
    .eq('user_id', userId)
    .eq('platform', service)
    .maybeSingle() as { data: OAuthTokenRow | null; error: unknown };

  if (error || !tokenRow || !tokenRow.access_token) return null;

  const now = new Date();
  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null;

  // Use current token if valid for at least 5 minutes
  if (expiresAt && (expiresAt.getTime() - now.getTime()) > 5 * 60 * 1000) {
    try {
      return decryptToken(tokenRow.access_token);
    } catch {
      return null;
    }
  }

  // Otherwise, refresh token
  if (!tokenRow.refresh_token) {
    try {
      return decryptToken(tokenRow.access_token);
    } catch {
      return null;
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    try {
      return decryptToken(tokenRow.access_token);
    } catch {
      return null;
    }
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: decryptToken(tokenRow.refresh_token),
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      return decryptToken(tokenRow.access_token);
    }

    const payload = await response.json();
    if (!payload?.access_token) {
      return decryptToken(tokenRow.access_token);
    }

    const encryptedAccess = encryptToken(payload.access_token);
    const newExpires = payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : null;

    // Write back to DB so the web app has the refreshed token too
    await client
      .from('oauth_tokens')
      .update({
        access_token: encryptedAccess,
        expires_at: newExpires,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', service);

    return payload.access_token;
  } catch (err) {
    console.error('[MCP] Token refresh failed:', err);
    try {
      return decryptToken(tokenRow.access_token);
    } catch {
      return null;
    }
  }
}


/**
 * EYES MCP Server
 * Bridges local AI clients (Claude Desktop, etc.) with your personal digital memory.
 */
const server = new Server(
  {
    name: "eyes-memory-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// --- TOOLS DEFINITION ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_memories",
        description: "Search the user's digital memory (Gmail, Calendar, Reddit, etc.) using semantic similarity.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query (e.g., 'What did I say about the seed round?')" },
            limit: { type: "number", description: "Number of results to return", default: 5 },
          },
          required: ["query"],
        },
      },
      {
        name: "manage_calendar_event",
        description: "Create, Update, or Delete an event in the user's Google Calendar.",
        inputSchema: {
          type: "object",
          properties: {
            method: { type: "string", enum: ["POST", "PATCH", "DELETE"], description: "The operation: POST (create), PATCH (update), DELETE (remove)" },
            eventId: { type: "string", description: "The ID of the event (required for PATCH and DELETE)" },
            title: { type: "string", description: "Event title" },
            description: { type: "string", description: "Event description" },
            date: { type: "string", description: "ISO 8601 date string for the event" },
          },
          required: ["method"],
        },
      },
      {
        name: "get_recent_commitments",
        description: "Retrieve the latest unfulfilled commitments detected from the user's memories.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of tasks to return (default: 5)" },
          },
        },
      },
      {
        name: "get_recent_memories",
        description: "Fetch the most recent memories across all connected platforms.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of memories to return (default: 10)" },
            platform: { type: "string", description: "Optional platform filter (e.g. github, gmail, slack)" },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search_memories") {
    const { query, limit = 5 } = request.params.arguments as { query: string; limit?: number };

    try {
      const userId = process.env.MCP_DEFAULT_USER_ID;
      if (!userId) throw new Error("MCP_DEFAULT_USER_ID is not configured in environment variables.");

      // 1. Generate embedding using LiteLLM Gateway (1024d) — matches the main app's vector store.
      const embedding = await generateGatewayEmbedding(query);
      if (!embedding) throw new Error('Gateway embedding failed. Check LITELLM_BASE_URL and LITELLM_KEY in .env.');

      // 2. Search Supabase via match_memories RPC (match_embeddings was dropped in migration 030)
      // match_memories: vector(1024), threshold, count, user_id_arg
      const { data: matches, error } = await supabase.rpc("match_memories", {
        query_embedding: embedding,
        match_threshold: 0.25, // L-NEW-3 fix: calibrated for 1024-dim (Voyage/Gemini) — 0.35 was set for old 1536-dim embeddings
        match_count: limit,
        user_id_arg: userId, // Local MCP runs for a single owner
      });

      if (error) throw error;

      interface MemoryMatch { content: string; title: string | null; platform: string; similarity: number; event_timestamp: string | null; }
      const formattedResults = (matches as MemoryMatch[] || []).map((m) =>
        `[${m.platform?.toUpperCase() ?? 'MEMORY'}] ${m.title ? m.title + '\n' : ''}${m.content}\n(Similarity: ${Math.round(m.similarity * 100)}%)`
      ).join("\n---\n");

      return {
        content: [{ type: "text", text: formattedResults || "No matching memories found." }],
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error searching memories: ${errMsg}` }],
        isError: true,
      };
    }
  }

  if (request.params.name === "manage_calendar_event") {
    const { method, eventId, title, description, date } = request.params.arguments as { 
      method: 'POST' | 'PATCH' | 'DELETE'; 
      eventId?: string;
      title?: string;
      description?: string;
      date?: string;
    };

    try {
      const userId = process.env.MCP_DEFAULT_USER_ID;
      if (!userId) throw new Error("MCP_DEFAULT_USER_ID not configured.");

      const accessToken = await getValidGoogleToken(supabase, userId, 'google_calendar');
      if (!accessToken) throw new Error("Google Calendar not connected or token expired.");

      let url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
      if (eventId) url += `/${eventId}`;

      const payload = method !== 'DELETE' ? {
        summary: title,
        description: description,
        start: date ? { dateTime: new Date(date).toISOString() } : undefined,
        end: date ? { dateTime: new Date(new Date(date).getTime() + 3600000).toISOString() } : undefined,
      } : undefined;

      const response = await fetch(url, {
        method: method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Calendar API Error: ${errorText}`);
      }

      return {
        content: [{ type: "text", text: `Successfully ${method === 'POST' ? 'created' : method === 'PATCH' ? 'updated' : 'deleted'} calendar event.` }],
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error managing calendar: ${errMsg}` }],
        isError: true,
      };
    }
  }

  if (request.params.name === "get_recent_commitments") {
    const { limit = 5 } = request.params.arguments as { limit?: number };
    try {
      const userId = process.env.MCP_DEFAULT_USER_ID;
      if (!userId) throw new Error("MCP_DEFAULT_USER_ID not configured.");

      const { data, error } = await supabase
        .from('memories')
        .select('platform, title, content, timestamp')
        .eq('user_id', userId)
        .eq('is_flagged', true)
        .order('timestamp', { ascending: false })
        .limit(Math.min(limit, 20));

      if (error) throw error;

      interface MemoryRow { platform: string; title: string | null; content: string | null; timestamp: string; }
      const text = (!data || data.length === 0)
        ? 'No flagged commitments found.'
        : (data as MemoryRow[]).map(c =>
            `- [${c.platform}] ${c.title ?? 'Untitled'} (${new Date(c.timestamp).toLocaleDateString()}): ${c.content?.slice(0, 150)}`
          ).join('\n');

      return {
        content: [{ type: "text", text }],
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error fetching commitments: ${errMsg}` }],
        isError: true,
      };
    }
  }

  if (request.params.name === "get_recent_memories") {
    const { limit = 10, platform } = request.params.arguments as { limit?: number; platform?: string };
    try {
      const userId = process.env.MCP_DEFAULT_USER_ID;
      if (!userId) throw new Error("MCP_DEFAULT_USER_ID not configured.");

      let query = supabase
        .from('memories')
        .select('platform, event_type, title, content, author, timestamp')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(Math.min(limit, 50));

      if (platform) {
        query = query.eq('platform', platform);
      }

      const { data, error } = await query;

      if (error) throw error;

      interface MemoryRow2 { platform: string; event_type: string | null; title: string | null; content: string | null; timestamp: string; }
      const text = (!data || data.length === 0)
        ? 'No memories found.'
        : (data as MemoryRow2[]).map(m =>
            `[${m.platform}] ${new Date(m.timestamp).toLocaleDateString()} — ${m.title ?? m.event_type ?? 'Event'}: ${m.content?.slice(0, 200)}`
          ).join('\n');

      return {
        content: [{ type: "text", text }],
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error fetching memories: ${errMsg}` }],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

// --- RESOURCES DEFINITION ---
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "eyes://recent-memories",
        name: "Recent Memories",
        description: "The 10 most recently indexed items in your digital memory.",
        mimeType: "text/plain",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "eyes://recent-memories") {
    const userId = process.env.MCP_DEFAULT_USER_ID;
    if (!userId) throw new Error("MCP_DEFAULT_USER_ID is not configured in environment variables.");

    // Use 'memories' table (the canonical store) — 'raw_events' table does not exist.
    const { data, error } = await supabase
      .from("memories")
      .select("platform, title, content, timestamp, event_type")
      .eq("user_id", userId)
      .not("content", "is", null)
      .order("timestamp", { ascending: false })
      .limit(10);

    if (error) throw error;

    const text = (data || []).map(d => 
      `[${d.platform?.toUpperCase()}] ${d.title ?? '(no title)'}\n${d.content}\nDate: ${d.timestamp}`
    ).join("\n\n");

    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "text/plain",
        text: text || 'No memories indexed yet.',
      }],
    };
  }

  throw new Error(`Unknown resource: ${request.params.uri}`);
});

// --- START SERVER ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("EYES MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
