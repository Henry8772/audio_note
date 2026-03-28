import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the Stripe Customer ID mapped to this user
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.stripe_customer_id) {
      return NextResponse.json({ 
        error: 'No active Stripe customer found. Please upgrade to Pro first.' 
      }, { status: 400 });
    }

    const { url } = await stripe.billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/app`,
    });

    return NextResponse.json({ url });
  } catch (err: any) {
    console.error('Stripe Portal Error:', err);
    return NextResponse.json({ error: 'Internal server error while creating portal session.' }, { status: 500 });
  }
}
