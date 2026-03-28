import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let tier = 'free';

    const { data: subData } = await supabaseAdmin
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (subData) {
      const isActive = ['active', 'trialing'].includes(subData.status);
      const isNotExpired = new Date(subData.current_period_end).getTime() > Date.now();
      
      if (isActive && isNotExpired) {
        tier = 'pro';
      }
    }

    // Get usage from usage_logs
    const { data: usageData, error: usageError } = await supabaseAdmin
      .from('usage_logs')
      .select('amount')
      .eq('user_id', user.id)
      .eq('feature', 'transcription_seconds');

    let totalSeconds = 0;
    if (!usageError && usageData) {
      totalSeconds = usageData.reduce((acc, row) => acc + row.amount, 0);
    }

    return NextResponse.json({ tier, usageSeconds: totalSeconds });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { amount } = body;

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const { error: insertError } = await supabaseAdmin
      .from('usage_logs')
      .insert({
        user_id: user.id,
        amount,
        feature: 'transcription_seconds'
      });

    if (insertError) {
      console.error('Error inserting usage log:', insertError);
      return NextResponse.json({ error: 'Failed to update usage' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
