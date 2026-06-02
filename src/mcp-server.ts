
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials in .env file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Gemini embedding client — must match main app (gemini-embedding-001, 1024d)
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS = 1024; // Must match vector(1024) column in memories table

/**
 * Generates a 1024-dimensional embedding using Gemini — matches the main app's vector store.
 */
async function generateGeminiEmbedding(text: string): Promise<number[] | null> {
  if (!genAI) {
    console.error('[MCP] GEMINI_API_KEY not set — cannot generate embeddings.');
    return null;
  }
  try {
    const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
    const result = await model.embedContent({
      content: { role: 'user', parts: [{ text: text.slice(0, 8000) }] },
      taskType: TaskType.RETRIEVAL_QUERY,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outputDimensionality: EMBED_DIMS,
    } as Parameters<typeof model.embedContent>[0]);
    return Array.from(result.embedding.values);
  } catch (err) {
    console.error('[MCP] Gemini embedding failed:', err instanceof Error ? err.message : err);
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
  interface OAuthTokenRow { access_token: string | null; }
  const { data, error } = await client
    .from('oauth_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', service)
    .maybeSingle() as { data: OAuthTokenRow | null; error: unknown };

  if (error || !data?.access_token) return null;
  return data.access_token;
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
      // 1. Generate embedding using Gemini (1024d) — matches the main app's vector store.
      // DO NOT use OpenAI here: the memories table uses vector(1024) from Gemini gemini-embedding-001.
      const embedding = await generateGeminiEmbedding(query);
      if (!embedding) throw new Error('Gemini embedding failed. Check GEMINI_API_KEY in .env.');

      // 2. Search Supabase via match_memories RPC (match_embeddings was dropped in migration 030)
      // match_memories: vector(1024), threshold, count, user_id_arg
      const { data: matches, error } = await supabase.rpc("match_memories", {
        query_embedding: embedding,
        match_threshold: 0.4,
        match_count: limit,
        user_id_arg: process.env.MCP_DEFAULT_USER_ID, // Local MCP runs for a single owner
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
    // Use 'memories' table (the canonical store) — 'raw_events' table does not exist.
    const { data, error } = await supabase
      .from("memories")
      .select("platform, title, content, timestamp, event_type")
      .eq("user_id", process.env.MCP_DEFAULT_USER_ID)
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
