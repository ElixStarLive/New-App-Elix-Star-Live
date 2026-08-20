import fs from "fs";

const extract = fs.readFileSync(
  "C:/Users/Absm Construction/Desktop/New App Elix Star Live/docs/old-spec/_extract-out.txt",
  "utf8",
);

const rest = [];
const inbound = [];
const outbound = [];
const tables = [];
let section = null;
for (const line of extract.split(/\r?\n/)) {
  if (line.startsWith("REST_COUNT=")) {
    section = "rest";
    continue;
  }
  if (line.startsWith("WS_INBOUND_COUNT=")) {
    section = "in";
    continue;
  }
  if (line.startsWith("WS_OUTBOUND_COUNT=")) {
    section = "out";
    continue;
  }
  if (line.startsWith("MIGRATION_FILES=")) {
    section = null;
    continue;
  }
  if (line.startsWith("CREATE_TABLES=")) {
    section = "tables";
    continue;
  }
  if (!line.trim()) continue;
  if (section === "rest") rest.push(line);
  else if (section === "in") inbound.push(line);
  else if (section === "out") outbound.push(line);
  else if (section === "tables" && line !== "IF") tables.push(line);
}

if (!outbound.includes("live_share")) outbound.push("live_share");
outbound.sort();

const clientLocal = ["ws_error", "ws_reconnect_exhausted"];

const md = `# OLD production proof inventories

Frozen OLD commit \`a1c9b11ed3cc47c8a858430076864ac9e7ebbc84\`.
Enumerated from OLD \`server/routes\`, \`server/websocket\`, \`server/migrations\`.
Do not copy OLD source. This file proves counts in the master ledger.

NEW product code was not inspected for this audit.

---

## REST endpoints (${rest.length} unique method + path)

Each line is one production HTTP contract.

${rest.map((r, i) => `${i + 1}. \`${r}\``).join("\n")}

Plus static (not counted in REST ${rest.length}): \`GET /gifts/*\`, \`GET /env.js\`, \`GET /.well-known/assetlinks.json\`, \`GET /.well-known/apple-app-site-association\`.

---

## WebSocket contracts

### Client → server (${inbound.length})

${inbound.map((e, i) => `${i + 1}. \`${e}\``).join("\n")}

### Server → client (${outbound.length})

Includes \`live_share\` (global notify helper) in addition to sendToClient / broadcastToRoom / sendToUserGlobal / feed presence.

${outbound.map((e, i) => `${i + 1}. \`${e}\``).join("\n")}

### Client-local (not server events, still a reconnect contract) (${clientLocal.length})

${clientLocal.map((e, i) => `${i + 1}. \`${e}\``).join("\n")}

**Directional total:** ${inbound.length} + ${outbound.length} + ${clientLocal.length} = ${inbound.length + outbound.length + clientLocal.length}

Join order (server → joining socket): \`connected\` → \`room_state\` → \`cohost_layout_sync\` → queued \`cohost_request\` → \`battle_state_sync\` → \`gift_goal_sync\` → \`engagement_sync\`.

Paid gifts: REST \`POST /api/gifts/send\` settles first. WS \`gift_sent\` is fan-out after settlement. Client WS \`gift_sent\` is not the paid money path.

---

## Neon tables (${tables.length} unique CREATE TABLE names from 65 migration files)

${tables.map((t, i) => `${i + 1}. \`${t}\``).join("\n")}

---

## Valkey contracts (62 unique prefixes / named keys)

Keys and locks (pattern, not copied implementation):

1. \`elix:health:cache\`
2. \`elix:jobs\` (queue)
3. \`elix:jobs:dlq\`
4. \`elix:jobs:leader\` (leader lock)
5. \`lock:{cacheKey}\` (cache populate NX)
6. \`sess:{tokenHash}\`
7. \`sessidx:{userId}\`
8. \`auth:login:fail:{hash}\` (lockout; unreadable → refuse login)
9. \`email_confirm_sent:{email}\`
10. \`rl:{key}\` (HTTP rate)
11. \`elix:ratelimit:feed_view:{key}\`
12. \`fraud:gift_rest:{userId}\`
13. \`fraud:rs_vote:{userId}\`
14. \`fraud:iap_verify:{userId}\`
15. \`wsrl:{userId}:{event}\`
16. \`stream:{roomId}\` (live session hash)
17. \`elix:http:live_streams:v1\`
18. \`room:members:{roomId}\`
19. \`room:meta:{roomId}\` (\`live_likes\`)
20. \`room:audience:{roomId}\`
21. \`room:presence:{roomId}:{userId}\`
22. \`room:{roomId}\` (pubsub)
23. \`user:{userId}\` (pubsub)
24. \`feed:global\` (presence pubsub)
25. \`txn:{transactionId}\` (WS gift dedupe)
26. \`cohost:{roomId}\` (seat JSON)
27. \`cohost:lock:{room}\` (8+1 seat lock)
28. \`cohost:req:{roomId}\`
29. \`gift_goal:{roomId}\`
30. \`booster:pm:{roomId}:{userId}\`
31. \`engage:room:{roomId}\`
32. \`engage:activeRoom:{userId}\`
33. \`engage:tick:{roomId}:{userId}:{bucket}\`
34. \`engage:action:{roomId}:{userId}:{type}:{window}\`
35. \`engage:pollvote:{roomId}:{pollId}:{userId}\`
36. \`battle:{roomId}\` (session)
37. \`battle:tick:{roomId}\` (1s clock lock)
38. \`battle:scores:{roomId}\`
39. \`battle:seat_lock:{roomId}\`
40. \`battle:pending_invites:{roomId}\`
41. \`battle:final:{battleId}\`
42. \`battle:result_pending:{battleId}\`
43. \`battle:result_flush\`
44. \`battles:active\`
45. \`battles:result_outbox\`
46. \`battle_invite:{roomId}:{targetUserId}\`
47. \`battle_accept:{roomId}:{userId}\`
48. \`battle_vote_once:{battleId}:{userId}\`
49. \`ubr:{userId}\` (user-battle-room)
50. \`test_coins:balances\`
51. \`test_coins:fail:{scope}:{id}\`
52. \`test_coins:mint:req:{userId}:{requestId}\`
53. \`elix:http:gifts_catalog:v4\`
54. \`elix:http:coin_packages\`
55. \`elix:feed:foryou:epoch\`
56. \`elix:feed:foryou:{epoch}:{page}:{limit}\`
57. \`elix:profiles:list:epoch\`
58. \`elix:profiles:list:{epoch}\`
59. \`profile:{ownerUserId}\`
60. \`elix:music:{kind}:{id}\`
61. \`elix:music:preview:v2:{trackId}\`
62. \`elix:audiocan:{videoId}\`

Production without Valkey: rate limits and locks fail closed. Test-coin debit fail closed. Login lockout unreadable → refuse.

---

## LiveKit flows (12)

1. Host publish start (identity = userId, \`GET /api/live/token?publish=1\`)
2. Spectator subscribe (identity \`{userId}__v_{12hex}\`, publish=0)
3. Token refresh (AccessToken TTL 6h)
4. Co-host grant publish after accept (Valkey seat is membership; LiveKit is media)
5. Co-host revoke publish on leave / release / seats_clear
6. Battle seated participant publish (host/opponent/player3/player4 rooms)
7. Video call room \`call_*\` — both parties publish
8. For You inline live preview subscribe-only (no auto-join)
9. LiveKit webhook room/participant end — idempotent; not process-local 20s as authority
10. List rooms / publisher check for \`GET /api/live/streams\` presence
11. Host/spectator media reconnect after network or thermal drop
12. Publish authority re-verification on join (unauthorized publish refused)

---

## Webhooks and background jobs (15)

### Webhooks (4)

1. \`POST /api/stripe-webhook\` — shop + Connect payouts (raw body)
2. \`POST /api/livekit/webhook\` — room/participant lifecycle (raw)
3. \`POST /api/webhooks/google-play\` — Play RTDN refunds/subs/consume
4. \`POST /api/webhooks/apple-iap\` — App Store Server Notifications

### Queued job types (4) — Valkey \`elix:jobs\` / DLQ

5. \`cleanup_retention\`
6. \`push_notify\`
7. \`email_send\`
8. \`google_play_consume\`

### Leader / always-on timers (7)

9. Mature creator Diamond earnings (5 min)
10. Mature GBP pending earnings (5 min, hold hours from monetisation config)
11. Creator reward period open/close (hourly)
12. Wallet ledger reconciliation (6 h)
13. For You lifecycle sweep (15 min)
14. Daily enqueue \`cleanup_retention\`
15. Battle tick scheduler (1 s, lock \`battle:tick:{roomId}\`) + result outbox flush

---

## Count block used by the master ledger

- REST: ${rest.length}
- WS directional: ${inbound.length + outbound.length + clientLocal.length}
- LiveKit flows: 12
- Migration files: 65
- Tables: ${tables.length}
- DB/migration dependencies: ${65 + tables.length}
- Valkey contracts: 62
- Webhooks/background jobs: 15
`;

fs.writeFileSync(
  "C:/Users/Absm Construction/Desktop/New App Elix Star Live/docs/old-spec/PROOF-INVENTORIES.md",
  md,
);
console.log("wrote proof", {
  rest: rest.length,
  in: inbound.length,
  out: outbound.length,
  tables: tables.length,
  ws: inbound.length + outbound.length + clientLocal.length,
});
