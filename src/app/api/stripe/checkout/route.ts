import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/utils/supabase/server';
import { getPriceId, PlanKey } from '@/config/stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { planId } = await req.json();

    if (!planId) {
      return new NextResponse('Plan ID required', { status: 400 });
    }

    const resolvedPriceId = getPriceId(planId as PlanKey);

    if (!resolvedPriceId) {
      return new NextResponse('Invalid Plan ID', { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      billing_address_collection: 'required',
      customer_email: user.email,
      line_items: [
        {
          price: resolvedPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        metadata: {
          user_id: user.id
        }
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/app?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/app?canceled=true`,
      client_reference_id: user.id, 
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error(err);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
