import { NextResponse } from "next/server";

export async function GET() {
  // Make sure to add SONIOX_API_KEY to your .env.local file!
  const apiKey = process.env.SONIOX_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({ error: "Soniox API key not configured" }, { status: 500 });
  }

  return NextResponse.json({ apiKey });
}
