import http from 'http';

async function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function verify() {
  console.log("=== Testing BYOK Persistence and State Retention ===");
  
  // 1. Save keys via POST /api/byok
  const saveRes = await request("http://localhost:3000/api/byok", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }, JSON.stringify({
    sessionId: "persisted-user-session",
    groqKeys: [
      "gsk_persistedKeyAlpha11111111111111111111111111111111",
      "gsk_persistedKeyBeta222222222222222222222222222222222"
    ],
  }));

  const setCookie = saveRes.headers['set-cookie'];
  console.log(`1. Saved keys response: ${saveRes.status}`);
  const cookieHeader = Array.isArray(setCookie) ? setCookie.map(c => c.split(';')[0]).join('; ') : (setCookie ? setCookie.split(';')[0] : '');
  console.log(`2. Cookie set header received: ${Boolean(cookieHeader)}`);

  // 2. Simulate refresh / reload (GET /api/byok with the saved cookie)
  const reloadRes = await request("http://localhost:3000/api/byok?sessionId=persisted-user-session", {
    headers: { Cookie: cookieHeader },
  });
  console.log(`3. Reload / refresh status: ${reloadRes.status}`);
  const reloadData = JSON.parse(reloadRes.body);
  console.log(`   Configured: ${reloadData.configured}`);
  console.log(`   Source: ${reloadData.source}`);
  console.log(`   Keys restored: ${reloadData.quota.keys.length}`);
  console.log(`   Active key: ${reloadData.quota.activeKeyId}`);
  console.log(`   Key slots: ${reloadData.quota.keys.map(k => `Slot ${k.slot} (${k.masked})`).join(', ')}`);

  if (!reloadData.configured || reloadData.source !== "byok" || reloadData.quota.keys.length !== 2) {
    console.error("FAILED: Keys were not properly restored upon simulated reload!");
    process.exit(1);
  }

  console.log("\n=== SUCCESS: Persistence across reloads and sessions verified! ===");
}

verify().catch(console.error);
