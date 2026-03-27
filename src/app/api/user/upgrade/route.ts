import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { password } = await req.json();

    const expectedPassword = process.env.APP_PASSWORD;
    
    if (!expectedPassword || password !== expectedPassword) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
    }

    // Update user metadata to 'pro' tier
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { user_metadata: { tier: 'pro' } }
    );

    if (updateError) {
      console.error('Error updating user tier:', updateError);
      return NextResponse.json({ error: 'Failed to upgrade account' }, { status: 500 });
    }

    return NextResponse.json({ success: true, tier: 'pro' });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
