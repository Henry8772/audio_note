import { NextResponse } from "next/server";

// Mints a short-lived temporary Soniox API key so the browser can connect
// directly to the Soniox real-time WebSocket without ever seeing the
// long-lived SONIOX_API_KEY.
export async function POST() {
  const apiKey = process.env.SONIOX_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Soniox API key not configured" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.soniox.com/v1/auth/temporary-api-key", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        usage_type: "transcribe_websocket",
        expires_in_seconds: 300,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Failed to mint Soniox temporary key:", res.status, detail);
      return NextResponse.json({ error: "Failed to create temporary key" }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ apiKey: data.api_key, expiresAt: data.expires_at });
  } catch (e) {
    console.error("Soniox token error:", e);
    return NextResponse.json({ error: "Failed to create temporary key" }, { status: 500 });
  }
}
