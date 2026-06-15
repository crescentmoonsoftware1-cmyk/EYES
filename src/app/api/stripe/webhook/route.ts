import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { AuditAnalysisService } from '@/services/audit/analysis-pipeline';
import { waitUntil } from '@vercel/functions';

/**
 * Stripe Webhook Handler (K5)
 * Handles checkout.session.completed with real signature verification.
 * Test mode: STRIPE_WEBHOOK_SECRET points to Stripe CLI secret (whsec_...).
 * Live mode: swap to live webhook secret on Friday.
 */

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

/** Stripe signature verification — no Stripe SDK needed (K1 compliant). */
async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!sigHeader || !secret) return false;

  // Stripe signature format: t=<timestamp>,v1=<hmac>
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Reject events older than 5 minutes (replay protection)
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const payload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const computed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const computedHex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, '0')).join('');

  return computedHex === signature;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sigHeader = request.headers.get('stripe-signature');

  // Signature verification (K5)
  if (STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      console.warn('[Stripe Webhook] Signature verification failed.');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  } else {
    console.warn('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set — skipping verification (dev only).');
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Handle checkout.session.completed (K5)
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session['metadata'] as Record<string, string> | undefined;
      const userId  = metadata?.['userId'];
      const lensId  = metadata?.['lensId'] ?? 'reputation';
      const stripeSessionId = session['id'] as string;

      if (!userId) {
        return NextResponse.json({ error: 'Missing userId in metadata' }, { status: 400 });
      }

      const supabase = await createAdminClient();

      // Idempotency: skip if this session was already processed
      const { data: existing } = await supabase
        .from('reputation_audits')
        .select('id')
        .eq('stripe_session_id', stripeSessionId)
        .maybeSingle();

      if (existing) {
        console.log(`[Stripe Webhook] Already processed session ${stripeSessionId} — skipping.`);
        return NextResponse.json({ received: true, idempotent: true });
      }

      const { data: audit, error: createError } = await supabase
        .from('reputation_audits')
        .insert({
          user_id: userId,
          status: 'pending',
          stripe_session_id: stripeSessionId,
          metadata: { audit_type: lensId },
        })
        .select()
        .single();

      if (createError) throw createError;

      // Update status to 'analysis' to match the original behavior and trigger UI transition
      await supabase
        .from('reputation_audits')
        .update({ status: 'analysis' })
        .eq('id', audit.id);

      // Non-blocking background analysis via Vercel waitUntil (prevents serverless function termination)
      waitUntil(
        AuditAnalysisService.runAnalysis(audit.id, userId).catch(err => {
          console.error('[Stripe Webhook] Background analysis failed:', err);
        })
      );

      console.log(`[Stripe Webhook] Audit ${audit.id} created for user ${userId} (lens: ${lensId})`);
      return NextResponse.json({ received: true, auditId: audit.id });
    }

    // Legacy event type (kept for backward compatibility)
    if (event.type === 'audit.purchase.completed') {
      const session = event.data.object;
      const userId = (session['metadata'] as Record<string, string>)?.['userId'];
      if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

      const supabase = await createAdminClient();
      const { data: audit, error } = await supabase
        .from('reputation_audits')
        .insert({ user_id: userId, status: 'pending' })
        .select()
        .single();
      if (error) throw error;

      waitUntil(
        AuditAnalysisService.runAnalysis(audit.id, userId).catch(err =>
          console.error('[Stripe Webhook] Background analysis failed:', err))
      );

      return NextResponse.json({ received: true, auditId: audit.id });
    }

    return NextResponse.json({ received: true, ignored: true });

  } catch (err) {
    console.error('[Stripe Webhook] Error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
