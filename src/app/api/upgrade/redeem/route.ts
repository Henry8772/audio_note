import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const expectedToken = process.env.PRO_ACCESS_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    // Token is valid. Grant Lifetime Pro by upserting a subscription record.
    const fakeSubscriptionId = `lifetime_pro_${user.id}`;
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 100); // 100 years from now

    // Check if subscription exists
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    let subError = null;

    if (existingSub) {
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_end: futureDate.toISOString()
        })
        .eq('id', existingSub.id);
      subError = error;
    } else {
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: user.id,
          stripe_subscription_id: fakeSubscriptionId,
          status: 'active',
          price_id: 'price_lifetime_token',
          current_period_end: futureDate.toISOString()
        });
      subError = error;
    }

    if (subError) {
        console.error("Error creating lifetime sub:", subError);
        return NextResponse.json({ error: 'Failed to apply Pro access' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
