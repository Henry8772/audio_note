import { NextRequest, NextResponse } from 'next/server';

// In-memory store for rate limiting: IP -> { attempts: number, lockUntil: number }
const rateLimitStore = new Map<string, { attempts: number; lockUntil: number }>();

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: NextRequest) {
  try {
    // Basic IP extraction for rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
    const now = Date.now();

    // Check if IP is currently locked out
    const record = rateLimitStore.get(ip);
    if (record && record.lockUntil > now) {
      const remainingMinutes = Math.ceil((record.lockUntil - now) / 60000);
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${remainingMinutes} minutes.` },
        { status: 429 }
      );
    }

    const { password } = await req.json();
    const correctPassword = process.env.APP_PASSWORD;

    if (!correctPassword) {
      console.warn("APP_PASSWORD environment variable is not set. Allowing access by default for testing.");
      return NextResponse.json({ success: true });
    }

    if (password === correctPassword) {
      // Success: Reset rate limit for this IP
      rateLimitStore.delete(ip);
      return NextResponse.json({ success: true });
    } else {
      // Failure: Increment attempts
      let attempts = record ? record.attempts + 1 : 1;
      let lockUntil = 0;

      if (attempts >= MAX_ATTEMPTS) {
        lockUntil = now + LOCKOUT_DURATION_MS;
      }

      rateLimitStore.set(ip, { attempts, lockUntil });

      const remaining = MAX_ATTEMPTS - attempts;
      if (remaining <= 0) {
        return NextResponse.json(
          { error: `Too many failed attempts. Try again in 15 minutes.` },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: `Incorrect password. ${remaining} attempts remaining.` },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
