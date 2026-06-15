import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type = 'full' } = await request.json();
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // Build form data for Stripe API application/x-www-form-urlencoded
    const params = new URLSearchParams();
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][product_data][name]', `EYES Reputation Audit (${type.toUpperCase()})`);
    params.append('line_items[0][price_data][product_data][description]', 'Comprehensive deep analysis of your digital footprint and risk vectors.');
    params.append('line_items[0][price_data][unit_amount]', '9900'); // $99.00
    params.append('line_items[0][quantity]', '1');
    params.append('mode', 'payment');
    params.append('success_url', `${origin}/?audit=success`);
    params.append('cancel_url', `${origin}/?audit=cancelled`);
    params.append('client_reference_id', user.id);
    params.append('metadata[userId]', user.id);
    params.append('metadata[lensId]', type);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString()
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.text();
      console.error('Stripe API error:', err);
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }

    const session = await stripeRes.json();
    return NextResponse.json({ url: session.url });

  } catch (err) {
    console.error('Stripe Checkout Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
