
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { getValidGoogleToken } from "./utils/oauth.js";
import { encryptToken, decryptToken } from "./utils/tokens.js";

// Load environment variables for local execution
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials in .env file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search_memories") {
    const { query, limit = 5 } = request.params.arguments as { query: string; limit?: number };

    try {
      // 1. In a real implementation, we would call the embedding API here.
      // For the V1 MCP, we'll assume the client might provide context or we'll fetch via a helper.
      // For simplicity in this bridge, we hit the EYES API or the DB directly if we have the key.
      
      // Note: Generating embeddings requires an API call to OpenAI.
      const embRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ input: query, model: "text-embedding-3-small" }),
      });

      if (!embRes.ok) throw new Error("Failed to generate embedding for search.");
      const { data } = await embRes.json();
      const embedding = data[0].embedding;

      // 2. Search Supabase
      const { data: matches, error } = await supabase.rpc("match_embeddings", {
        query_embedding: embedding,
        match_threshold: 0.4,
        match_count: limit,
        user_id_arg: process.env.MCP_DEFAULT_USER_ID, // Local MCP often runs for a single owner
      });

      if (error) throw error;

      const formattedResults = (matches || []).map((m: any) => 
        `[Memory] ${m.content}\n(Similarity: ${Math.round(m.similarity * 100)}%)`
      ).join("\n---\n");

      return {
        content: [{ type: "text", text: formattedResults || "No matching memories found." }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error searching memories: ${err.message}` }],
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
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error managing calendar: ${err.message}` }],
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
    const { data, error } = await supabase
      .from("raw_events")
      .select("platform, title, content, timestamp")
      .eq("user_id", process.env.MCP_DEFAULT_USER_ID)
      .order("timestamp", { ascending: false })
      .limit(10);

    if (error) throw error;

    const text = (data || []).map(d => 
      `[${d.platform}] ${d.title}\n${d.content}\nDate: ${d.timestamp}`
    ).join("\n\n");

    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "text/plain",
        text,
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
