# OLD production proof inventories

Frozen OLD commit `a1c9b11ed3cc47c8a858430076864ac9e7ebbc84`.
Enumerated from OLD `server/routes`, `server/websocket`, `server/migrations`.
Do not copy OLD source. This file proves counts in the master ledger.

NEW product code was not inspected for this audit.

---

## REST endpoints (262 unique method + path)

Each line is one production HTTP contract.

1. `DELETE /api/admin/users/:userId/ban`
2. `DELETE /api/chat/threads/:threadId`
3. `DELETE /api/device-tokens`
4. `DELETE /api/live/:streamKey/moderators/:userId`
5. `DELETE /api/media/delete`
6. `DELETE /api/rising-stars/entries/:id`
7. `DELETE /api/shop/items/:id`
8. `DELETE /api/stickers/:id`
9. `DELETE /api/videos/:id`
10. `DELETE /api/videos/:id/comments/:commentId`
11. `GET /api/activity`
12. `GET /api/admin/iap-purchases`
13. `GET /api/admin/moderation/logs`
14. `GET /api/admin/monetisation/audit`
15. `GET /api/admin/monetisation/config`
16. `GET /api/admin/monetisation/foryou-config`
17. `GET /api/admin/monetisation/fraud-reviews`
18. `GET /api/admin/monetisation/reconciliation`
19. `GET /api/admin/monetisation/reports/dashboard`
20. `GET /api/admin/monetisation/reports/summary`
21. `GET /api/admin/monetisation/withdrawals-gbp`
22. `GET /api/admin/payouts`
23. `GET /api/admin/progression/audit-history`
24. `GET /api/admin/progression/battle-energy-caps`
25. `GET /api/admin/progression/config`
26. `GET /api/admin/progression/daily-rewards`
27. `GET /api/admin/progression/feature-flags`
28. `GET /api/admin/progression/levels`
29. `GET /api/admin/progression/missions`
30. `GET /api/admin/progression/missions/:id/stats`
31. `GET /api/admin/progression/users/:userId`
32. `GET /api/admin/purchases`
33. `GET /api/admin/reports`
34. `GET /api/admin/rising-stars/audit`
35. `GET /api/admin/rising-stars/seasons`
36. `GET /api/admin/shop-purchases`
37. `GET /api/admin/stats/dau`
38. `GET /api/admin/users`
39. `GET /api/auth/2fa/status`
40. `GET /api/auth/me`
41. `GET /api/blocked-users`
42. `GET /api/boosters/catalog`
43. `GET /api/camera-filters`
44. `GET /api/chat/threads`
45. `GET /api/chat/threads/:threadId`
46. `GET /api/chat/threads/:threadId/messages`
47. `GET /api/coin-packages`
48. `GET /api/creator/balance`
49. `GET /api/creator/ledger`
50. `GET /api/creator/payout-account`
51. `GET /api/creator/payout-methods`
52. `GET /api/creator/withdrawals-gbp`
53. `GET /api/engagement/achievements`
54. `GET /api/engagement/battle-energy/fan`
55. `GET /api/engagement/creator-cards`
56. `GET /api/engagement/daily-login`
57. `GET /api/engagement/fan-level`
58. `GET /api/engagement/flags`
59. `GET /api/engagement/hub`
60. `GET /api/engagement/missions`
61. `GET /api/engagement/mvp`
62. `GET /api/engagement/stickers`
63. `GET /api/engagement/treasure`
64. `GET /api/engagement/wallet`
65. `GET /api/feed/following`
66. `GET /api/feed/foryou`
67. `GET /api/feed/friends`
68. `GET /api/gifts/catalog`
69. `GET /api/hashtags/:tag`
70. `GET /api/hashtags/:tag/videos`
71. `GET /api/health`
72. `GET /api/hearts/daily/:creatorUserId`
73. `GET /api/inbox/live-share-requests`
74. `GET /api/live/:streamKey/moderators`
75. `GET /api/live/status`
76. `GET /api/live/streams`
77. `GET /api/live/token`
78. `GET /api/media/public/*`
79. `GET /api/membership/:creatorId`
80. `GET /api/membership/:creatorId/status`
81. `GET /api/metrics`
82. `GET /api/music/collections`
83. `GET /api/music/global`
84. `GET /api/music/playlists`
85. `GET /api/music/search`
86. `GET /api/music/status`
87. `GET /api/music/tracks/:trackId/preview`
88. `GET /api/notifications`
89. `GET /api/profiles`
90. `GET /api/profiles/:userId`
91. `GET /api/profiles/:userId/followers`
92. `GET /api/profiles/:userId/following`
93. `GET /api/profiles/by-username/:username`
94. `GET /api/progression/me`
95. `GET /api/progression/starter-history`
96. `GET /api/progression/users/:userId/status`
97. `GET /api/progression/xp-history`
98. `GET /api/rankings/daily`
99. `GET /api/rankings/weekly`
100. `GET /api/reposts/list`
101. `GET /api/reposts/status`
102. `GET /api/rising-stars/badges/me`
103. `GET /api/rising-stars/badges/user/:userId`
104. `GET /api/rising-stars/categories`
105. `GET /api/rising-stars/challenges`
106. `GET /api/rising-stars/challenges/:id`
107. `GET /api/rising-stars/challenges/:id/entries`
108. `GET /api/rising-stars/challenges/:id/leaderboard`
109. `GET /api/rising-stars/challenges/:id/live`
110. `GET /api/rising-stars/regions`
111. `GET /api/rising-stars/rewards`
112. `GET /api/rising-stars/seasons/:id`
113. `GET /api/rising-stars/seasons/:id/standings`
114. `GET /api/rising-stars/seasons/current`
115. `GET /api/rising-stars/teams`
116. `GET /api/shop/checkout-session/:sessionId`
117. `GET /api/shop/items`
118. `GET /api/speed-options`
119. `GET /api/sticker-options`
120. `GET /api/stickers/:creatorUserId`
121. `GET /api/stories`
122. `GET /api/stories/user/:userId`
123. `GET /api/test-coins/balance`
124. `GET /api/videos`
125. `GET /api/videos/:id`
126. `GET /api/videos/:id/comments`
127. `GET /api/videos/:id/download`
128. `GET /api/videos/:id/likes`
129. `GET /api/videos/liked/list`
130. `GET /api/videos/saved/list`
131. `GET /api/videos/user/:userId`
132. `GET /api/wallet`
133. `GET /health`
134. `PATCH /api/admin/gifts/catalog/:giftId`
135. `PATCH /api/admin/monetisation/config`
136. `PATCH /api/admin/monetisation/foryou-config`
137. `PATCH /api/admin/progression/config`
138. `PATCH /api/admin/progression/feature-flags`
139. `PATCH /api/admin/progression/missions/:id`
140. `PATCH /api/admin/reports/:id`
141. `PATCH /api/admin/rising-stars/challenges/:id/status`
142. `PATCH /api/profiles/:userId`
143. `PATCH /api/shop/items/:id`
144. `PATCH /api/videos/:id/comments/:commentId`
145. `POST /api/admin/chargeback`
146. `POST /api/admin/monetisation/financial-reports/import`
147. `POST /api/admin/monetisation/foryou-sweep`
148. `POST /api/admin/monetisation/fraud-reviews/:id/outcome`
149. `POST /api/admin/monetisation/reconciliation/run`
150. `POST /api/admin/monetisation/rewards/periods/:periodId/close`
151. `POST /api/admin/monetisation/rewards/periods/open`
152. `POST /api/admin/monetisation/settlements/coin-lot`
153. `POST /api/admin/monetisation/settlements/promote`
154. `POST /api/admin/monetisation/settlements/reverse`
155. `POST /api/admin/monetisation/settlements/subscription`
156. `POST /api/admin/monetisation/withdrawals-gbp/:id/mark-paid-manual`
157. `POST /api/admin/monetisation/withdrawals-gbp/:id/status`
158. `POST /api/admin/monetisation/withdrawals-gbp/:id/submit-provider`
159. `POST /api/admin/payout/:id/approve`
160. `POST /api/admin/payout/:id/cancel`
161. `POST /api/admin/payout/:id/mark-paid`
162. `POST /api/admin/payout/:id/reject`
163. `POST /api/admin/payout/:id/review`
164. `POST /api/admin/progression/missions`
165. `POST /api/admin/progression/missions/:id/archive`
166. `POST /api/admin/progression/starter-adjustments`
167. `POST /api/admin/progression/xp-adjustments`
168. `POST /api/admin/rising-stars/badges`
169. `POST /api/admin/rising-stars/badges/award`
170. `POST /api/admin/rising-stars/categories`
171. `POST /api/admin/rising-stars/challenges`
172. `POST /api/admin/rising-stars/challenges/:id/freeze`
173. `POST /api/admin/rising-stars/challenges/:id/live`
174. `POST /api/admin/rising-stars/challenges/:id/snapshot`
175. `POST /api/admin/rising-stars/entries/:id/disqualify`
176. `POST /api/admin/rising-stars/regions`
177. `POST /api/admin/rising-stars/rewards/definitions`
178. `POST /api/admin/rising-stars/rewards/grants`
179. `POST /api/admin/rising-stars/seasons`
180. `POST /api/admin/unfreeze/:userId`
181. `POST /api/admin/users/:userId/ban`
182. `POST /api/analytics/track`
183. `POST /api/auth/2fa/disable`
184. `POST /api/auth/2fa/enroll`
185. `POST /api/auth/2fa/verify`
186. `POST /api/auth/apple/native`
187. `POST /api/auth/apple/start`
188. `POST /api/auth/consent`
189. `POST /api/auth/delete`
190. `POST /api/auth/forgot-password`
191. `POST /api/auth/guest`
192. `POST /api/auth/login`
193. `POST /api/auth/logout`
194. `POST /api/auth/register`
195. `POST /api/auth/resend-confirmation`
196. `POST /api/auth/reset-password`
197. `POST /api/auth/verify-email`
198. `POST /api/block-user`
199. `POST /api/chat/threads/:threadId/messages`
200. `POST /api/chat/threads/:threadId/read`
201. `POST /api/chat/threads/ensure`
202. `POST /api/creator/payout-account/onboard`
203. `POST /api/creator/payout-method`
204. `POST /api/creator/withdraw-gbp`
205. `POST /api/device-tokens`
206. `POST /api/engagement/battle-energy/boost`
207. `POST /api/engagement/battle-energy/earn`
208. `POST /api/engagement/daily-login/claim`
209. `POST /api/engagement/missions/:missionId/claim`
210. `POST /api/engagement/progress`
211. `POST /api/engagement/treasure/:chestId/open`
212. `POST /api/engagement/treasure/spawn`
213. `POST /api/feed/track-interaction`
214. `POST /api/feed/track-view`
215. `POST /api/gifts/send`
216. `POST /api/hearts/daily`
217. `POST /api/live-share`
218. `POST /api/live/:streamKey/moderators`
219. `POST /api/live/end`
220. `POST /api/live/moderation/check`
221. `POST /api/live/start`
222. `POST /api/livekit/webhook`
223. `POST /api/media/upload-file`
224. `POST /api/membership/iap-complete`
225. `POST /api/notifications/read`
226. `POST /api/profiles`
227. `POST /api/profiles/:userId/follow`
228. `POST /api/profiles/:userId/unfollow`
229. `POST /api/profiles/:userId/view`
230. `POST /api/promote-iap-complete`
231. `POST /api/report`
232. `POST /api/reposts/toggle`
233. `POST /api/rising-stars/challenges/:id/enter`
234. `POST /api/rising-stars/challenges/:id/live/attach`
235. `POST /api/rising-stars/entries/:id/vote`
236. `POST /api/rising-stars/teams`
237. `POST /api/rising-stars/teams/:id/join`
238. `POST /api/shop/checkout`
239. `POST /api/shop/items`
240. `POST /api/stickers/upload`
241. `POST /api/stories`
242. `POST /api/stripe-webhook`
243. `POST /api/test-coins/authorize`
244. `POST /api/test-coins/mint`
245. `POST /api/unblock-user`
246. `POST /api/verify-purchase`
247. `POST /api/videos`
248. `POST /api/videos/:id/comments`
249. `POST /api/videos/:id/comments/:commentId/like`
250. `POST /api/videos/:id/comments/:commentId/unlike`
251. `POST /api/videos/:id/fyp`
252. `POST /api/videos/:id/like`
253. `POST /api/videos/:id/save`
254. `POST /api/videos/:id/unlike`
255. `POST /api/videos/:id/unsave`
256. `POST /api/webhooks/apple-iap`
257. `POST /api/webhooks/google-play`
258. `PUT /api/admin/monetisation/rewards/milestones`
259. `PUT /api/admin/progression/battle-energy-caps`
260. `PUT /api/admin/progression/daily-rewards`
261. `PUT /api/admin/progression/daily-rewards/policy`
262. `PUT /api/admin/progression/levels`

Plus static (not counted in REST 262): `GET /gifts/*`, `GET /env.js`, `GET /.well-known/assetlinks.json`, `GET /.well-known/apple-app-site-association`.

---

## WebSocket contracts

### Client → server (41)

1. `chat_message`
2. `heart_sent`
3. `gift_sent`
4. `battle_create`
5. `battle_join`
6. `battle_spectator_vote`
7. `battle_end`
8. `battle_remove_participant`
9. `battle_get_state`
10. `battle_invite_send`
11. `battle_invite_decline`
12. `battle_invite_accept`
13. `battle_invite_roster_get`
14. `stream_end`
15. `cohost_invite_send`
16. `cohost_invite_accept`
17. `cohost_invite_decline`
18. `cohost_request_send`
19. `cohost_request_accept`
20. `cohost_request_decline`
21. `cohost_layout_sync`
22. `cohost_seat_release`
23. `cohost_seat_leave`
24. `cohost_seats_clear`
25. `booster_activated`
26. `mist_activated`
27. `gift_goal_set`
28. `gift_goal_clear`
29. `engagement_get_state`
30. `engagement_watch_tick`
31. `engagement_mystery_start`
32. `engagement_poll_set`
33. `engagement_poll_end`
34. `engagement_poll_vote`
35. `engagement_features_set`
36. `call_invite`
37. `call_accepted`
38. `call_rejected`
39. `call_ended`
40. `ping`
41. `stream_start`

### Server → client (54)

Includes `live_share` (global notify helper) in addition to sendToClient / broadcastToRoom / sendToUserGlobal / feed presence.

1. `battle_accept_ack`
2. `battle_ended`
3. `battle_error`
4. `battle_invite`
5. `battle_invite_accepted`
6. `battle_invite_ack`
7. `battle_invite_declined`
8. `battle_invite_expired`
9. `battle_invite_roster`
10. `battle_invite_roster_invalidate`
11. `battle_participant_removed`
12. `battle_score`
13. `battle_state_sync`
14. `battle_tick`
15. `battle_vote_ack`
16. `booster_activated`
17. `booster_caught`
18. `call_accepted`
19. `call_ended`
20. `call_invite`
21. `call_rejected`
22. `chat_ack`
23. `chat_message`
24. `cohost_invite`
25. `cohost_invite_accepted`
26. `cohost_invite_ack`
27. `cohost_layout_sync`
28. `cohost_request`
29. `cohost_request_accepted`
30. `cohost_request_declined`
31. `cohost_seat_released`
32. `connected`
33. `dm_message`
34. `dm_thread_updated`
35. `engagement_milestone`
36. `engagement_stage_unlock`
37. `engagement_sync`
38. `error`
39. `force_disconnect`
40. `gift_ack`
41. `gift_goal_sync`
42. `gift_sent`
43. `heart_sent`
44. `live_share`
45. `mist_activated`
46. `moderation_warning`
47. `pong`
48. `room_state`
49. `stream_ended`
50. `stream_start_ack`
51. `stream_started`
52. `user_joined`
53. `user_left`
54. `viewer_count`

### Client-local (not server events, still a reconnect contract) (2)

1. `ws_error`
2. `ws_reconnect_exhausted`

**Directional total:** 41 + 54 + 2 = 97

Join order (server → joining socket): `connected` → `room_state` → `cohost_layout_sync` → queued `cohost_request` → `battle_state_sync` → `gift_goal_sync` → `engagement_sync`.

Paid gifts: REST `POST /api/gifts/send` settles first. WS `gift_sent` is fan-out after settlement. Client WS `gift_sent` is not the paid money path.

---

## Neon tables (131 unique CREATE TABLE names from 65 migration files)

1. `auth_users`
2. `battle_creator_buckets`
3. `battle_energy_balances`
4. `battle_energy_daily_caps`
5. `battle_energy_ledger`
6. `battle_fan_energy`
7. `battle_result_participants`
8. `battle_results`
9. `booster_catch_logs`
10. `booster_config`
11. `chat_threads`
12. `comment_likes`
13. `comments`
14. `copyright_appeals`
15. `copyright_moderation_actions`
16. `copyright_reports`
17. `creator_card_defs`
18. `creator_stickers`
19. `daily_hearts`
20. `daily_reward_claims`
21. `daily_reward_config`
22. `elix_analytics_events`
23. `elix_auth_sessions`
24. `elix_auth_users`
25. `elix_blocked_users`
26. `elix_coin_packages`
27. `elix_creator_balances`
28. `elix_creator_earnings`
29. `elix_creator_membership_products`
30. `elix_creator_payout_accounts`
31. `elix_creator_reward_milestones`
32. `elix_creator_reward_periods`
33. `elix_creator_reward_results`
34. `elix_creator_wallet_gbp`
35. `elix_creator_withdrawal_status_history`
36. `elix_creator_withdrawals_gbp`
37. `elix_device_tokens`
38. `elix_financial_ledger`
39. `elix_foryou_config`
40. `elix_fraud_decisions`
41. `elix_fraud_reviews`
42. `elix_gift_transactions`
43. `elix_gifts`
44. `elix_membership_purchases`
45. `elix_monetisation_config`
46. `elix_monetisation_config_audit`
47. `elix_notifications`
48. `elix_paid_coin_lots`
49. `elix_payout_audit`
50. `elix_payout_methods`
51. `elix_payout_provider_events`
52. `elix_payout_requests`
53. `elix_platform_wallet_gbp`
54. `elix_processed_purchases`
55. `elix_processed_webhook_events`
56. `elix_promote_purchases`
57. `elix_qualified_video_views`
58. `elix_reconciliation_runs`
59. `elix_reports`
60. `elix_reposts`
61. `elix_runtime_config`
62. `elix_shop_purchases`
63. `elix_store_financial_report_lines`
64. `elix_store_financial_reports`
65. `elix_test_coin_issue_audit`
66. `elix_video_feed_signals`
67. `elix_video_foryou_state`
68. `elix_video_not_interested`
69. `elix_video_view_metrics`
70. `elix_wallet_balances`
71. `elix_wallet_ledger`
72. `engagement_achievements`
73. `engagement_admin_audit`
74. `engagement_missions`
75. `engagement_settings`
76. `follows`
77. `gift_logs`
78. `level_history`
79. `likes`
80. `live_moderation_log`
81. `live_share_inbox`
82. `live_stream_moderators`
83. `live_streams`
84. `messages`
85. `mvp_scores`
86. `profile_unique_views`
87. `profiles`
88. `promotional_coin_balances`
89. `promotional_coin_ledger`
90. `rs_admin_audit`
91. `rs_badges`
92. `rs_categories`
93. `rs_challenges`
94. `rs_entries`
95. `rs_phase_results`
96. `rs_regions`
97. `rs_reward_definitions`
98. `rs_reward_grants`
99. `rs_seasons`
100. `rs_team_members`
101. `rs_teams`
102. `rs_user_badges`
103. `rs_votes`
104. `saves`
105. `shop_items`
106. `sound_reuse_events`
107. `sound_rights_confirmations`
108. `sounds`
109. `starter_coin_balances`
110. `starter_coin_transactions`
111. `sticker_defs`
112. `sticker_sets`
113. `stories`
114. `treasure_chest_defs`
115. `user_achievements`
116. `user_consents`
117. `user_creator_cards`
118. `user_creator_collection_progress`
119. `user_engagement_unique_creators`
120. `user_mission_progress`
121. `user_progression`
122. `user_stickers`
123. `user_treasure_chests`
124. `user_two_factor`
125. `video_scores`
126. `video_view_counters`
127. `video_views`
128. `videos`
129. `xp_activity_config`
130. `xp_level_requirements`
131. `xp_transactions`

---

## Valkey contracts (62 unique prefixes / named keys)

Keys and locks (pattern, not copied implementation):

1. `elix:health:cache`
2. `elix:jobs` (queue)
3. `elix:jobs:dlq`
4. `elix:jobs:leader` (leader lock)
5. `lock:{cacheKey}` (cache populate NX)
6. `sess:{tokenHash}`
7. `sessidx:{userId}`
8. `auth:login:fail:{hash}` (lockout; unreadable → refuse login)
9. `email_confirm_sent:{email}`
10. `rl:{key}` (HTTP rate)
11. `elix:ratelimit:feed_view:{key}`
12. `fraud:gift_rest:{userId}`
13. `fraud:rs_vote:{userId}`
14. `fraud:iap_verify:{userId}`
15. `wsrl:{userId}:{event}`
16. `stream:{roomId}` (live session hash)
17. `elix:http:live_streams:v1`
18. `room:members:{roomId}`
19. `room:meta:{roomId}` (`live_likes`)
20. `room:audience:{roomId}`
21. `room:presence:{roomId}:{userId}`
22. `room:{roomId}` (pubsub)
23. `user:{userId}` (pubsub)
24. `feed:global` (presence pubsub)
25. `txn:{transactionId}` (WS gift dedupe)
26. `cohost:{roomId}` (seat JSON)
27. `cohost:lock:{room}` (8+1 seat lock)
28. `cohost:req:{roomId}`
29. `gift_goal:{roomId}`
30. `booster:pm:{roomId}:{userId}`
31. `engage:room:{roomId}`
32. `engage:activeRoom:{userId}`
33. `engage:tick:{roomId}:{userId}:{bucket}`
34. `engage:action:{roomId}:{userId}:{type}:{window}`
35. `engage:pollvote:{roomId}:{pollId}:{userId}`
36. `battle:{roomId}` (session)
37. `battle:tick:{roomId}` (1s clock lock)
38. `battle:scores:{roomId}`
39. `battle:seat_lock:{roomId}`
40. `battle:pending_invites:{roomId}`
41. `battle:final:{battleId}`
42. `battle:result_pending:{battleId}`
43. `battle:result_flush`
44. `battles:active`
45. `battles:result_outbox`
46. `battle_invite:{roomId}:{targetUserId}`
47. `battle_accept:{roomId}:{userId}`
48. `battle_vote_once:{battleId}:{userId}`
49. `ubr:{userId}` (user-battle-room)
50. `test_coins:balances`
51. `test_coins:fail:{scope}:{id}`
52. `test_coins:mint:req:{userId}:{requestId}`
53. `elix:http:gifts_catalog:v4`
54. `elix:http:coin_packages`
55. `elix:feed:foryou:epoch`
56. `elix:feed:foryou:{epoch}:{page}:{limit}`
57. `elix:profiles:list:epoch`
58. `elix:profiles:list:{epoch}`
59. `profile:{ownerUserId}`
60. `elix:music:{kind}:{id}`
61. `elix:music:preview:v2:{trackId}`
62. `elix:audiocan:{videoId}`

Production without Valkey: rate limits and locks fail closed. Test-coin debit fail closed. Login lockout unreadable → refuse.

---

## LiveKit flows (12)

1. Host publish start (identity = userId, `GET /api/live/token?publish=1`)
2. Spectator subscribe (identity `{userId}__v_{12hex}`, publish=0)
3. Token refresh (AccessToken TTL 6h)
4. Co-host grant publish after accept (Valkey seat is membership; LiveKit is media)
5. Co-host revoke publish on leave / release / seats_clear
6. Battle seated participant publish (host/opponent/player3/player4 rooms)
7. Video call room `call_*` — both parties publish
8. For You inline live preview subscribe-only (no auto-join)
9. LiveKit webhook room/participant end — idempotent; not process-local 20s as authority
10. List rooms / publisher check for `GET /api/live/streams` presence
11. Host/spectator media reconnect after network or thermal drop
12. Publish authority re-verification on join (unauthorized publish refused)

---

## Webhooks and background jobs (15)

### Webhooks (4)

1. `POST /api/stripe-webhook` — shop + Connect payouts (raw body)
2. `POST /api/livekit/webhook` — room/participant lifecycle (raw)
3. `POST /api/webhooks/google-play` — Play RTDN refunds/subs/consume
4. `POST /api/webhooks/apple-iap` — App Store Server Notifications

### Queued job types (4) — Valkey `elix:jobs` / DLQ

5. `cleanup_retention`
6. `push_notify`
7. `email_send`
8. `google_play_consume`

### Leader / always-on timers (7)

9. Mature creator Diamond earnings (5 min)
10. Mature GBP pending earnings (5 min, hold hours from monetisation config)
11. Creator reward period open/close (hourly)
12. Wallet ledger reconciliation (6 h)
13. For You lifecycle sweep (15 min)
14. Daily enqueue `cleanup_retention`
15. Battle tick scheduler (1 s, lock `battle:tick:{roomId}`) + result outbox flush

---

## Count block used by the master ledger

- REST: 262
- WS directional: 97
- LiveKit flows: 12
- Migration files: 65
- Tables: 131
- DB/migration dependencies: 196
- Valkey contracts: 62
- Webhooks/background jobs: 15
