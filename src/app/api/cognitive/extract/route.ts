import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getOrCreateNodeId } from '@/utils/supabase/graph';


export const dynamic = 'force-dynamic';

/**
 * POST /api/cognitive/extract
 *
 * TypeScript → Python Engine bridge.
 * Accepts a { memoryId } in the request body, fetches the memory content,
 * calls the GLiNER FastAPI engine at CHRONIC_ENGINE_URL/extract,
 * and writes the resulting entities and relations to chronic_edges.
 *
 * Called automatically after platform syncs (via platform-sync.ts) or
 * manually triggered from the dashboard for specific memories.
 *
 * H-NEW-1 fix: this is the missing bridge that activates the Chronic Layer end-to-end.
 */

const CHRONIC_ENGINE_URL = (process.env.CHRONIC_ENGINE_URL || 'http://localhost:8000').replace(/\/$/, '');
const CHRONIC_ENGINE_SECRET = process.env.CHRONIC_ENGINE_SECRET || '';

interface EngineEntity {
  label: string;
  text: string;
  score: number;
  start: number;
  end: number;
}

interface EngineRelation {
  head: string;
  label: string;
  tail: string;
  score: number;
}

interface EngineResponse {
  entities: EngineEntity[];
  relations: EngineRelation[];
}

export async function POST(request: Request) {
  try {
    // ── 1. Auth check ───────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { memoryId, text: rawText } = body as { memoryId?: string; text?: string };

    if (!memoryId && !rawText) {
      return NextResponse.json(
        { error: 'Provide either memoryId or text in the request body.' },
        { status: 400 }
      );
    }

    // ── 2. Fetch memory content if memoryId was provided ────────────────────
    const admin = createAdminClient();
    let contentToExtract = rawText || '';
    let platform = 'manual';
    const sourceMemoryId = memoryId || null;

    if (memoryId) {
      const { data: memory, error: memErr } = await admin
        .from('memories')
        .select('id, content, title, platform, user_id')
        .eq('id', memoryId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memErr || !memory) {
        return NextResponse.json({ error: 'Memory not found or access denied.' }, { status: 404 });
      }

      contentToExtract = [memory.title, memory.content].filter(Boolean).join('\n').slice(0, 4000);
      platform = memory.platform || 'unknown';
    }

    if (!contentToExtract.trim()) {
      return NextResponse.json({ error: 'No content to extract from.' }, { status: 400 });
    }

    // ── 3. Call the Python GLiNER engine ────────────────────────────────────
    const engineHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (CHRONIC_ENGINE_SECRET) {
      engineHeaders['X-Engine-Secret'] = CHRONIC_ENGINE_SECRET;
    }

    let engineResult: EngineResponse;
    try {
      const engineRes = await fetch(`${CHRONIC_ENGINE_URL}/extract`, {
        method: 'POST',
        headers: engineHeaders,
        body: JSON.stringify({
          user_id: user.id,
          platform_id: platform,
          text: contentToExtract,
        }),
        signal: AbortSignal.timeout(20_000), // 20s engine call timeout
      });

      if (!engineRes.ok) {
        const errText = await engineRes.text().catch(() => '');
        console.error(`[Cognitive/Extract] Engine error ${engineRes.status}:`, errText.slice(0, 200));
        return NextResponse.json(
          { error: `Engine returned ${engineRes.status}`, detail: errText.slice(0, 200) },
          { status: 502 }
        );
      }

      engineResult = await engineRes.json() as EngineResponse;
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error('[Cognitive/Extract] Engine unreachable:', msg);
      return NextResponse.json(
        { error: 'Chronic engine unreachable. Check CHRONIC_ENGINE_URL and ensure the engine is running.', detail: msg },
        { status: 503 }
      );
    }

    const { entities = [], relations = [] } = engineResult;

    // ── 4. Write relations to chronic_edges ─────────────────────────────────
    // The Python engine already handles contradictions internally,
    // but we also persist new edges here so the graph is always up to date.
    let edgesWritten = 0;
    const edgeErrors: string[] = [];

    // Helper function to find entity label
    const findEntityLabel = (text: string): string => {
      const cleanText = text.toLowerCase().trim();
      const match = entities.find((e) => e.text.toLowerCase().trim() === cleanText);
      return match ? match.label : 'other';
    };

    for (const rel of relations) {
      if (!rel.head || !rel.label || !rel.tail) continue;

      try {
        const headLabel = findEntityLabel(rel.head);
        const tailLabel = findEntityLabel(rel.tail);

        const headNodeId = await getOrCreateNodeId(admin, user.id, rel.head, headLabel);
        const tailNodeId = await getOrCreateNodeId(admin, user.id, rel.tail, tailLabel);

        const recordId = sourceMemoryId || 'manual';
        const startChar = 0;
        const endChar = 0;

        // Check if this exact edge already exists (active)
        const { data: existing } = await admin
          .from('chronic_edges')
          .select('id, tail_node_id')
          .eq('user_id', user.id)
          .eq('head_node_id', headNodeId)
          .eq('relation_label', rel.label)
          .is('valid_to', null)
          .maybeSingle();

        if (existing) {
          if (existing.tail_node_id === tailNodeId) {
            // Identical edge — skip (already in graph)
            continue;
          }
          // Contradiction detected — invalidate the old edge
        }

        // Insert the new edge
        const { data: newEdge, error: insertErr } = await admin
          .from('chronic_edges')
          .insert({
            user_id: user.id,
            head_node_id: headNodeId,
            relation_label: rel.label,
            tail_node_id: tailNodeId,
            confidence: Math.min(1, Math.max(0, rel.score || 0.7)),
            source_record_id: recordId,
            chunk_start_char: startChar,
            chunk_end_char: endChar,
            valid_from: new Date().toISOString(),
            valid_to: null,
            is_contradicted_by: null,
          })
          .select('id')
          .single();

        if (insertErr) {
          edgeErrors.push(`${rel.head}→${rel.tail}: ${insertErr.message}`);
        } else {
          edgesWritten++;

          // If there was an existing contradicting edge, update it to point to the new edge
          if (existing) {
            await admin
              .from('chronic_edges')
              .update({
                valid_to: new Date().toISOString(),
                is_contradicted_by: newEdge.id,
              })
              .eq('id', existing.id);
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        edgeErrors.push(`${rel.head}→${rel.tail}: ${errMsg}`);
      }
    }

    // ── 5. Mark memory as cognitively processed ─────────────────────────────
    if (sourceMemoryId) {
      await admin
        .from('memories')
        .update({ cognitive_processed_at: new Date().toISOString() })
        .eq('id', sourceMemoryId)
        .eq('user_id', user.id);
    }

    console.log(
      `[Cognitive/Extract] user=${user.id.slice(0, 8)} ` +
      `entities=${entities.length} relations=${relations.length} ` +
      `edges_written=${edgesWritten} errors=${edgeErrors.length}`
    );

    return NextResponse.json({
      ok: true,
      memoryId: sourceMemoryId,
      entities_found: entities.length,
      relations_found: relations.length,
      edges_written: edgesWritten,
      edge_errors: edgeErrors.length > 0 ? edgeErrors : undefined,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Cognitive/Extract] Fatal error:', msg);
    return NextResponse.json({ error: 'Internal server error', detail: msg }, { status: 500 });
  }
}
