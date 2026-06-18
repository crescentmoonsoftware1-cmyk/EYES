import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * POST /api/actions/approve
 *
 * Atomic approval pipeline — replaces the 3-call fan-out in the client.
 * Sequence (all server-side):
 *   1. Verify action belongs to authenticated user
 *   2. PATCH status → 'approved'  (records user intent, safe even if step 3 fails)
 *   3. POST /api/actions/execute  (internal call to the existing executor)
 *   4. PATCH status → 'executed' | 'failed'  based on result
 *
 * Returns { success, finalStatus, executionResult? } so the client can
 * react to the exact outcome without needing its own follow-up calls.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json() as {
      id: string;
      title?: string;
      suggested_action?: string;
      [key: string]: unknown;
    };

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // ── Step 1: Verify ownership ──────────────────────────────────────────────
    const { data: action, error: fetchError } = await supabase
      .from('action_queue')
      .select('*')
      .eq('id', body.id)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!action) {
      return NextResponse.json({ error: 'Action not found or already handled' }, { status: 404 });
    }

    // ── Step 2: PATCH → approved (record intent) ──────────────────────────────
    const patchApproved: Record<string, unknown> = {
      status: 'approved',
      executed_at: new Date().toISOString(),
    };
    if (body.title) patchApproved.title = body.title;
    if (body.suggested_action) patchApproved.suggested_action = body.suggested_action;

    const { error: approveError } = await supabase
      .from('action_queue')
      .update(patchApproved)
      .eq('id', body.id)
      .eq('user_id', user.id);

    if (approveError) throw approveError;

    // ── Step 3: Execute via internal handler ──────────────────────────────────
    const executePayload = {
      ...action,            // carry over all original fields (memory_id, platform, etc.)
      ...body,              // apply any user edits (title, suggested_action)
      id: body.id,
      actionId: body.id,
      action_type: action.action_type,
      actionType: action.action_type,
    };

    let finalStatus: 'executed' | 'failed' = 'failed';
    let executionResult: Record<string, unknown> | null = null;

    try {
      // Build internal absolute URL (works in both dev and prod via NEXT_PUBLIC_BASE_URL)
      const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const execRes = await fetch(`${base}/api/actions/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward the session cookie so the execute route can authenticate
          Cookie: req.headers.get('cookie') || '',
        },
        body: JSON.stringify(executePayload),
      });

      executionResult = await execRes.json();
      finalStatus = execRes.ok ? 'executed' : 'failed';
    } catch (execErr) {
      console.error('[Approve] Execution call failed:', execErr);
      finalStatus = 'failed';
    }

    // ── Step 4: PATCH final status ────────────────────────────────────────────
    await supabase
      .from('action_queue')
      .update({ status: finalStatus })
      .eq('id', body.id)
      .eq('user_id', user.id);

    return NextResponse.json({
      success: finalStatus === 'executed',
      finalStatus,
      executionResult,
    });
  } catch (err) {
    console.error('[Approve] Fatal error:', err);
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
  }
}
