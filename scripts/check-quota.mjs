// Asks Cloudflare Workers AI for a 1-token reply from a tiny model (~0.05 neurons) to see
// whether the free allowance is available right now. The dashboard's "used today" number
// can say 0/10k while the API is still blocked: the limit behaves like a rolling 24 hours.
// Usage: npm run quota
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/meta/llama-3.2-1b-instruct`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
});
const body = await res.json().catch(() => null);
const time = new Date().toISOString().slice(11, 16) + " UTC";
if (res.ok) console.log(`${time}  OK: the AI is available.`);
else console.log(`${time}  BLOCKED (HTTP ${res.status}): ${body?.errors?.[0]?.message ?? "unknown error"}`);
