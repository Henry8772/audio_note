const WebSocket = require('ws');

async function test() {
  const tokenRes = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "verse",
    }),
  });

  const { client_secret } = await tokenRes.json();
  const token = client_secret.value;

  console.log("Token:", token.substring(0, 10) + "...");

  // Test 1: standard Authorization header (works in Node, not browser)
  const ws1 = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  ws1.on('open', () => console.log('WS1 OPEN (with header)'));
  ws1.on('error', (e) => console.log('WS1 ERROR:', e.message));

  // Test 2: no auth (should fail)
  const ws2 = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17");
  ws2.on('error', (e) => console.log('WS2 ERROR (no auth):', e.message));

  // Test 3: subprotocol trick
  const ws3 = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", ["realtime", "openai-insecure-api", "openai-beta.realtime-v1", `bearer-${token}`]);
  ws3.on('open', () => console.log('WS3 OPEN (subprotocol)'));
  ws3.on('error', (e) => console.log('WS3 ERROR (subprotocol):', e.message));
  
  // Test 4: query param
  const ws4 = new WebSocket(`wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17&api_key=${token}`);
  ws4.on('open', () => console.log('WS4 OPEN (query param)'));
  ws4.on('error', (e) => console.log('WS4 ERROR (query param):', e.message));
}

require('dotenv').config();
test();
