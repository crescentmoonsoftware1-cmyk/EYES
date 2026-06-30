import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AuditAnalysisService } from '@/services/audit/analysis-pipeline';
import { Client } from '@upstash/qstash';

/**
 * API Route to initiate a Reputation Audit.
 * Uses the Admin Client to bypass RLS and ensure background persistence.
 */
export async function POST(request: Request) {
  console.log('[Audit API] Received request to create audit...');
  
  try {
    // 1. Authenticate the user session using the standard client
    const userClient = await createClient();
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      console.warn('[Audit API] Unauthorized attempt detected.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Audit API] Authenticated User: ${user.id}`);

    // 1b. Payment gate — set AUDIT_REQUIRE_PAYMENT=true when Stripe is live.
    // Until then, leave it unset (or false) to keep audits open during development.
    if (process.env.AUDIT_REQUIRE_PAYMENT === 'true') {
      const { data: profile } = await userClient
        .from('user_profiles')
        .select('plan')
        .eq('user_id', user.id)
        .maybeSingle();

      const hasPaidPlan = profile?.plan && profile.plan !== 'free';
      if (!hasPaidPlan) {
        console.warn(`[Audit API] Payment required — user ${user.id.slice(0, 8)} on free plan.`);
        return NextResponse.json(
          { error: 'Payment required. Please upgrade your plan to generate a Reputation Audit.' },
          { status: 402 }
        );
      }
    }

    // 2. Switch to Admin Client for database operations (RLS bypass)
    const supabase = await createAdminClient();

    let type = 'full';
    try {
      const body = await request.json();
      if (body?.type) type = body.type;
    } catch {}

    // 3. Create the pending audit record
    const { data: audit, error: createError } = await supabase
      .from('reputation_audits')
      .insert({
        user_id: user.id,
        status: 'pending',
        metadata: { audit_type: type }
      })
      .select()
      .single();

    if (createError || !audit) {
      console.error('[Audit API] Database Insert Failed:', createError);
      throw new Error(`Failed to create audit record: ${createError?.message}`);
    }

    console.log(`[Audit API] Record Created: ${audit.id}. Moving to analysis stage...`);

    // 4. Update status to 'analysis' 
    await supabase
      .from('reputation_audits')
      .update({ status: 'analysis' })
      .eq('id', audit.id);

    // 5. RUN ANALYSIS (Background - fire and forget via Upstash QStash)
    const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
    
    // Fallback to localhost for dev, but in production use the real SITE_URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    await qstash.publishJSON({
      url: `${baseUrl}/api/queue/audit`,
      body: {
        auditId: audit.id,
        userId: user.id
      },
      // Give it up to 5 minutes to complete (though QStash supports up to 2 hours)
      retries: 3
    });

    return NextResponse.json({
      success: true,
      auditId: audit.id,
      status: 'analysis',
      message: 'Reputation audit initiated successfully.'
    });

  } catch (err) {
    console.error('[Audit API] PRODUCTION CRASH:', err);
    return NextResponse.json({ 
      error: 'Execution failed.', 
      detail: err instanceof Error ? err.message : String(err) 
    }, { status: 500 });
  }
}
