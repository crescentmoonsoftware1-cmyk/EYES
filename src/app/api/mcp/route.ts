import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * MCP Server — Exposes EYES memory to external AI clients (Claude Desktop, Cursor).
 * Fixed: uses memories table (not detected_commitments), direct in-process search.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { method, params } = body;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    switch (method) {
      case 'list_tools':
        return handleListTools();
      case 'call_tool':
        return handleCallTool(params.name, params.arguments, user.id, supabase);
      default:
        return NextResponse.json({ error: `Method ${method} not found` }, { status: 404 });
    }

  } catch (err) {
    console.error('[MCP Server] Failure:', err);
    return NextResponse.json({ error: 'Internal MCP Error' }, { status: 500 });
  }
}

function handleListTools() {
  return NextResponse.json({
    tools: [
      {
        name: 'query_my_history',
        description: 'Search through the user\'s synchronized memories (Gmail, Slack, GitHub, etc.).',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The natural language search query.' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_recent_commitments',
        description: 'Retrieve the latest unfulfilled commitments detected from the user\'s memories.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of tasks to return (default: 5).' }
          }
        }
      },
      {
        name: 'get_recent_memories',
        description: 'Fetch the most recent memories across all connected platforms.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of memories to return (default: 10).' },
            platform: { type: 'string', description: 'Optional platform filter (github, gmail, slack, etc.).' }
          }
        }
      }
    ]
  });
}

async function handleCallTool(name: string, args: any, userId: string, supabase: any) {

  // Tool 1: Semantic search over memories (in-process, no HTTP loop-back)
  if (name === 'query_my_history') {
    const query = args?.query || '';
    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

    // Full-text search directly on memories table
    const { data, error } = await supabase
      .from('memories')
      .select('platform, title, content, author, timestamp')
      .eq('user_id', userId)
      .textSearch('content', query.replace(/\s+/g, ' & '), { config: 'english' })
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[MCP] query_my_history error:', error);
      return NextResponse.json({ error: 'Search failed.' }, { status: 500 });
    }

    const text = (data ?? []).length === 0
      ? 'No matching records found in your synced archive.'
      : (data ?? []).map((m: any, i: number) =>
          `${i + 1}. [${m.platform}] ${new Date(m.timestamp).toLocaleDateString()} — ${m.title ?? ''}: ${m.content?.slice(0, 200)}`
        ).join('\n');

    return NextResponse.json({ content: [{ type: 'text', text }] });
  }

  // Tool 2: Recent unfulfilled commitments from memories
  if (name === 'get_recent_commitments') {
    const limit = Math.min(Number(args?.limit) || 5, 20);

    const { data, error } = await supabase
      .from('memories')
      .select('platform, title, content, timestamp')
      .eq('user_id', userId)
      .eq('is_flagged', true)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch commitments.' }, { status: 500 });
    }

    const text = (data ?? []).length === 0
      ? 'No flagged commitments found.'
      : (data ?? []).map((c: any) =>
          `- [${c.platform}] ${c.title ?? 'Untitled'} (${new Date(c.timestamp).toLocaleDateString()}): ${c.content?.slice(0, 150)}`
        ).join('\n');

    return NextResponse.json({ content: [{ type: 'text', text }] });
  }

  // Tool 3: Recent memories with optional platform filter
  if (name === 'get_recent_memories') {
    const limit = Math.min(Number(args?.limit) || 10, 50);
    const platform = args?.platform;

    let query = supabase
      .from('memories')
      .select('platform, event_type, title, content, author, timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (platform) query = query.eq('platform', platform);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch memories.' }, { status: 500 });
    }

    const text = (data ?? []).length === 0
      ? 'No memories found.'
      : (data ?? []).map((m: any) =>
          `[${m.platform}] ${new Date(m.timestamp).toLocaleDateString()} — ${m.title ?? m.event_type ?? 'Event'}: ${m.content?.slice(0, 200)}`
        ).join('\n');

    return NextResponse.json({ content: [{ type: 'text', text }] });
  }

  return NextResponse.json({ error: `Tool '${name}' not found` }, { status: 404 });
}
