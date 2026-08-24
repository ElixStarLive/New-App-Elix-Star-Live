import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";

export type AdminDashboardStats = {
  dailyActiveUsers: number;
  totalUsers: number;
  totalVideos: number;
  liveRooms: number;
  totalRevenueMinor: number;
  pendingReports: number;
};

export type AdminDashboard = AdminDashboardStats;

function requiredCount(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function parseAdminDashboard(data: unknown): AdminDashboardStats | null {
  if (!isRecord(data)) return null;
  const dailyActiveUsers = requiredCount(data.dailyActiveUsers);
  const totalUsers = requiredCount(data.totalUsers);
  const totalVideos = requiredCount(data.totalVideos);
  const liveRooms = requiredCount(data.liveRooms);
  const totalRevenueMinor = requiredCount(data.totalRevenueMinor);
  const pendingReports = requiredCount(data.pendingReports);
  if (
    dailyActiveUsers == null ||
    totalUsers == null ||
    totalVideos == null ||
    liveRooms == null ||
    totalRevenueMinor == null ||
    pendingReports == null
  ) {
    return null;
  }
  return {
    dailyActiveUsers,
    totalUsers,
    totalVideos,
    liveRooms,
    totalRevenueMinor,
    pendingReports,
  };
}

export async function apiFetchAdminDashboard(): Promise<{
  data: AdminDashboardStats | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/admin/dashboard");
  if (error) return { data: null, error: error.message };
  const parsed = parseAdminDashboard(data);
  if (!parsed) return { data: null, error: "Invalid dashboard" };
  return { data: parsed, error: null };
}

export type AdminUserRow = {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  is_banned: boolean;
};

export function parseAdminUsers(data: unknown): AdminUserRow[] | null {
  if (!isRecord(data) || !Array.isArray(data.users)) return null;
  const users: AdminUserRow[] = [];
  for (const raw of data.users) {
    if (!isRecord(raw) || typeof raw.id !== "string") return null;
    if (typeof raw.username !== "string" || typeof raw.email !== "string") return null;
    if (typeof raw.is_banned !== "boolean") return null;
    if (raw.avatar_url != null && typeof raw.avatar_url !== "string") return null;
    const createdAt = raw.created_at == null ? "" : typeof raw.created_at === "string" ? raw.created_at : null;
    if (createdAt == null) return null;
    users.push({
      id: raw.id,
      username: raw.username,
      email: raw.email,
      avatar_url: raw.avatar_url ?? null,
      created_at: createdAt,
      is_banned: raw.is_banned,
    });
  }
  return users;
}

export async function apiFetchAdminUsers(
  query = "",
): Promise<{ users: AdminUserRow[] | null; error: string | null }> {
  const q = query.trim();
  const path = q ? `/api/admin/users?q=${encodeURIComponent(q)}` : "/api/admin/users";
  const { data, error } = await apiRequest<unknown>(path);
  if (error) return { users: null, error: error.message };
  const users = parseAdminUsers(data);
  if (!users) return { users: null, error: "Invalid users" };
  return { users, error: null };
}

export async function apiAdminBanUser(
  userId: string,
  reason: string,
): Promise<{ ok: true; is_banned: true } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>(`/api/admin/users/${encodeURIComponent(userId)}/ban`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || data.ok !== true || data.is_banned !== true) {
    return { ok: false, error: "Invalid ban" };
  }
  return { ok: true, is_banned: true };
}

export async function apiAdminUnbanUser(
  userId: string,
): Promise<{ ok: true; is_banned: false } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>(`/api/admin/users/${encodeURIComponent(userId)}/ban`, {
    method: "DELETE",
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || data.ok !== true || data.is_banned !== false) {
    return { ok: false, error: "Invalid unban" };
  }
  return { ok: true, is_banned: false };
}

export type AdminReportRow = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string;
  status: string;
  created_at: string;
  reporter?: { username: string };
};

export function parseAdminReports(data: unknown): AdminReportRow[] | null {
  if (!isRecord(data) || !Array.isArray(data.reports)) return null;
  const reports: AdminReportRow[] = [];
  for (const raw of data.reports) {
    if (!isRecord(raw) || typeof raw.id !== "string") return null;
    if (typeof raw.target_type !== "string" || typeof raw.target_id !== "string") return null;
    if (typeof raw.reason !== "string" || typeof raw.status !== "string") return null;
    if (typeof raw.reporter_id !== "string") return null;
    const details = raw.details == null ? "" : typeof raw.details === "string" ? raw.details : null;
    const createdAt = raw.created_at == null ? "" : typeof raw.created_at === "string" ? raw.created_at : null;
    if (details == null || createdAt == null) return null;
    let reporter: { username: string } | undefined;
    if (raw.reporter != null) {
      if (!isRecord(raw.reporter) || typeof raw.reporter.username !== "string") return null;
      reporter = { username: raw.reporter.username };
    }
    reports.push({
      id: raw.id,
      reporter_id: raw.reporter_id,
      target_type: raw.target_type,
      target_id: raw.target_id,
      reason: raw.reason,
      details,
      status: raw.status,
      created_at: createdAt,
      ...(reporter ? { reporter } : {}),
    });
  }
  return reports;
}

function parseAdminReport(data: unknown): AdminReportRow | null {
  const parsed = parseAdminReports({ reports: [data] });
  return parsed?.[0] ?? null;
}

export async function apiAdminListReports(
  filter: "pending" | "all" = "pending",
): Promise<{ reports: AdminReportRow[] | null; error: string | null }> {
  const path = filter === "pending" ? "/api/admin/reports?status=pending" : "/api/admin/reports";
  const { data, error } = await apiRequest<unknown>(path);
  if (error) return { reports: null, error: error.message };
  const reports = parseAdminReports(data);
  if (!reports) return { reports: null, error: "Invalid reports" };
  return { reports, error: null };
}

export async function apiAdminResolveReport(
  reportId: string,
  action: "removed" | "warned" | "no_action",
): Promise<{ ok: true; report: AdminReportRow } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>(`/api/admin/reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "actioned",
      action,
      admin_note: `Outcome: ${action}`,
    }),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data)) return { ok: false, error: "Invalid report" };
  const report = parseAdminReport(data.report);
  if (!report || report.status !== "actioned") return { ok: false, error: "Invalid report" };
  return { ok: true, report };
}

export type AdminEconomyGift = {
  id: string;
  name: string;
  coin_cost: number;
  is_active: boolean;
};

export type AdminEconomyPackage = {
  id: string;
  product_id: string;
  provider: string;
  title: string;
  coins: number;
  price_display: string;
};

export type AdminEconomyBooster = {
  id: string;
  name: string;
  coin_cost: number;
  effect_type: string;
  is_active: boolean;
};

export type AdminEconomy = {
  gifts: AdminEconomyGift[];
  packages: AdminEconomyPackage[];
  boosters: AdminEconomyBooster[];
};

function requiredPositiveInt(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function requiredNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function parseAdminEconomyGift(raw: unknown): AdminEconomyGift | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.name !== "string") return null;
  const coinCost = requiredPositiveInt(raw.coin_cost);
  if (coinCost == null || typeof raw.is_active !== "boolean") return null;
  return {
    id: raw.id,
    name: raw.name,
    coin_cost: coinCost,
    is_active: raw.is_active,
  };
}

function parseAdminEconomyPackage(raw: unknown): AdminEconomyPackage | null {
  if (!isRecord(raw) || typeof raw.product_id !== "string" || !raw.product_id) return null;
  if (typeof raw.provider !== "string" || typeof raw.title !== "string") return null;
  const coins = requiredPositiveInt(raw.coins);
  if (coins == null || typeof raw.price_display !== "string") return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : `${raw.provider}:${raw.product_id}`;
  return {
    id,
    product_id: raw.product_id,
    provider: raw.provider,
    title: raw.title,
    coins,
    price_display: raw.price_display,
  };
}

function parseAdminEconomyBooster(raw: unknown): AdminEconomyBooster | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.name !== "string" || typeof raw.effect_type !== "string") return null;
  const coinCost = requiredNonNegativeInt(raw.coin_cost);
  if (coinCost == null || typeof raw.is_active !== "boolean") return null;
  return {
    id: raw.id,
    name: raw.name,
    coin_cost: coinCost,
    effect_type: raw.effect_type,
    is_active: raw.is_active,
  };
}

export function parseAdminEconomy(data: unknown): AdminEconomy | null {
  if (!isRecord(data) || !Array.isArray(data.gifts) || !Array.isArray(data.packages) || !Array.isArray(data.boosters)) {
    return null;
  }
  const gifts: AdminEconomyGift[] = [];
  for (const raw of data.gifts) {
    const gift = parseAdminEconomyGift(raw);
    if (!gift) return null;
    gifts.push(gift);
  }
  const packages: AdminEconomyPackage[] = [];
  for (const raw of data.packages) {
    const row = parseAdminEconomyPackage(raw);
    if (!row) return null;
    packages.push(row);
  }
  const boosters: AdminEconomyBooster[] = [];
  for (const raw of data.boosters) {
    const row = parseAdminEconomyBooster(raw);
    if (!row) return null;
    boosters.push(row);
  }
  return { gifts, packages, boosters };
}

export async function apiFetchAdminEconomy(): Promise<{
  data: AdminEconomy | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/admin/economy");
  if (error) return { data: null, error: error.message };
  const parsed = parseAdminEconomy(data);
  if (!parsed) return { data: null, error: "Invalid economy" };
  return { data: parsed, error: null };
}

export async function apiAdminUpdateGiftPrice(
  giftId: string,
  coinCost: number,
): Promise<{ ok: true; gift: AdminEconomyGift } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>(
    `/api/admin/gifts/catalog/${encodeURIComponent(giftId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ coin_cost: coinCost }),
    },
  );
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data)) return { ok: false, error: "Invalid gift" };
  const gift = parseAdminEconomyGift(data.gift);
  if (!gift) return { ok: false, error: "Invalid gift" };
  return { ok: true, gift };
}

export type AdminMonetisationConfigField = "giftCreatorPct" | "giftPlatformPct" | "giftSettlementHours";

export type AdminMonetisationConfig = {
  giftCreatorPct: number;
  giftPlatformPct: number;
  giftSettlementHours: number;
};

export type AdminMonetisationWithdrawal = {
  id: string;
  user_id: string;
  amount_pence: number;
  status: string;
  created_at: string;
};

export type AdminMonetisation = {
  config: AdminMonetisationConfig;
  dashboard: Record<string, unknown>;
  report: Record<string, unknown>;
  withdrawals: AdminMonetisationWithdrawal[];
};

function requiredJsonInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function parseAdminMonetisationConfig(raw: unknown): AdminMonetisationConfig | null {
  if (!isRecord(raw)) return null;
  const giftCreatorPct = requiredJsonInt(raw.giftCreatorPct, 0, 100);
  const giftPlatformPct = requiredJsonInt(raw.giftPlatformPct, 0, 100);
  const giftSettlementHours = requiredJsonInt(raw.giftSettlementHours, 0, 8760);
  if (giftCreatorPct == null || giftPlatformPct == null || giftSettlementHours == null) return null;
  if (giftCreatorPct + giftPlatformPct !== 100) return null;
  return { giftCreatorPct, giftPlatformPct, giftSettlementHours };
}

function parseAdminMonetisationWithdrawal(raw: unknown): AdminMonetisationWithdrawal | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.user_id !== "string" || typeof raw.status !== "string") return null;
  const amount = requiredNonNegativeInt(raw.amount_pence);
  const createdAt = raw.created_at == null ? "" : typeof raw.created_at === "string" ? raw.created_at : null;
  if (amount == null || createdAt == null) return null;
  return {
    id: raw.id,
    user_id: raw.user_id,
    amount_pence: amount,
    status: raw.status,
    created_at: createdAt,
  };
}

export function parseAdminMonetisation(data: unknown): AdminMonetisation | null {
  if (!isRecord(data) || !isRecord(data.dashboard) || !isRecord(data.report) || !Array.isArray(data.withdrawals)) {
    return null;
  }
  const config = parseAdminMonetisationConfig(data.config);
  if (!config) return null;
  const withdrawals: AdminMonetisationWithdrawal[] = [];
  for (const raw of data.withdrawals) {
    const row = parseAdminMonetisationWithdrawal(raw);
    if (!row) return null;
    withdrawals.push(row);
  }
  return {
    config,
    dashboard: data.dashboard,
    report: data.report,
    withdrawals,
  };
}

export async function apiFetchAdminMonetisation(): Promise<{
  data: AdminMonetisation | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/admin/monetisation");
  if (error) return { data: null, error: error.message };
  const parsed = parseAdminMonetisation(data);
  if (!parsed) return { data: null, error: "Invalid monetisation" };
  return { data: parsed, error: null };
}

export async function apiAdminPatchMonetisationConfig(
  field: AdminMonetisationConfigField,
  value: number,
  reason: string,
): Promise<{ ok: true; config: AdminMonetisationConfig } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>("/api/admin/monetisation/config", {
    method: "PATCH",
    body: JSON.stringify({ field, value, reason }),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || data.ok !== true) return { ok: false, error: "Invalid config" };
  const config = parseAdminMonetisationConfig(data.config);
  if (!config) return { ok: false, error: "Invalid config" };
  return { ok: true, config };
}

export type AdminPurchaseTab = "iap" | "shop";

export type AdminIapPurchase = {
  id: string;
  user_id: string;
  provider: string;
  product_id: string;
  transaction_id: string;
  coins: number;
  status: string;
  created_at: string;
};

export type AdminShopPurchase = {
  id: string;
  user_id: string;
  stripe_session_id: string;
  item_id: string;
  quantity: number;
  amount_pence: number;
  status: string;
  created_at: string;
};

function parseAdminIapPurchase(raw: unknown): AdminIapPurchase | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.user_id !== "string" || typeof raw.provider !== "string") return null;
  if (raw.provider !== "apple" && raw.provider !== "google") return null;
  if (typeof raw.product_id !== "string" || typeof raw.transaction_id !== "string") return null;
  if (typeof raw.status !== "string") return null;
  const coins = requiredJsonInt(raw.coins, 0, Number.MAX_SAFE_INTEGER);
  const createdAt = raw.created_at == null ? "" : typeof raw.created_at === "string" ? raw.created_at : null;
  if (coins == null || createdAt == null) return null;
  if ("raw_payload" in raw || "purchaseToken" in raw || "receipt" in raw) return null;
  return {
    id: raw.id,
    user_id: raw.user_id,
    provider: raw.provider,
    product_id: raw.product_id,
    transaction_id: raw.transaction_id,
    coins,
    status: raw.status,
    created_at: createdAt,
  };
}

function parseAdminShopPurchase(raw: unknown): AdminShopPurchase | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.user_id !== "string" || typeof raw.stripe_session_id !== "string") return null;
  if (typeof raw.item_id !== "string" || typeof raw.status !== "string") return null;
  const quantity = requiredJsonInt(raw.quantity, 0, Number.MAX_SAFE_INTEGER);
  const amountPence = requiredJsonInt(raw.amount_pence, 0, Number.MAX_SAFE_INTEGER);
  const createdAt = raw.created_at == null ? "" : typeof raw.created_at === "string" ? raw.created_at : null;
  if (quantity == null || amountPence == null || createdAt == null) return null;
  if ("client_secret" in raw || "payment_intent" in raw) return null;
  return {
    id: raw.id,
    user_id: raw.user_id,
    stripe_session_id: raw.stripe_session_id,
    item_id: raw.item_id,
    quantity,
    amount_pence: amountPence,
    status: raw.status,
    created_at: createdAt,
  };
}

export function parseAdminIapPurchases(data: unknown): AdminIapPurchase[] | null {
  if (!isRecord(data) || data.source !== "iap" || !Array.isArray(data.data)) return null;
  const rows: AdminIapPurchase[] = [];
  for (const raw of data.data) {
    const row = parseAdminIapPurchase(raw);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

export function parseAdminShopPurchases(data: unknown): AdminShopPurchase[] | null {
  if (!isRecord(data) || data.source !== "shop" || !Array.isArray(data.data)) return null;
  const rows: AdminShopPurchase[] = [];
  for (const raw of data.data) {
    const row = parseAdminShopPurchase(raw);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

export async function apiFetchAdminIapPurchases(): Promise<{
  data: AdminIapPurchase[] | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/admin/iap-purchases");
  if (error) return { data: null, error: error.message };
  const parsed = parseAdminIapPurchases(data);
  if (!parsed) return { data: null, error: "Invalid purchases" };
  return { data: parsed, error: null };
}

export async function apiFetchAdminShopPurchases(): Promise<{
  data: AdminShopPurchase[] | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/admin/shop-purchases");
  if (error) return { data: null, error: error.message };
  const parsed = parseAdminShopPurchases(data);
  if (!parsed) return { data: null, error: "Invalid purchases" };
  return { data: parsed, error: null };
}

export type AdminWithdrawalRow = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  amount_pence: number;
  currency: "GBP";
  status: string;
  admin_note: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
};

export type AdminWithdrawalAction = "review" | "approve" | "reject" | "cancel" | "mark-paid";

function parseAdminWithdrawalRow(raw: unknown): AdminWithdrawalRow | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.user_id !== "string" || typeof raw.status !== "string") return null;
  if (typeof raw.username !== "string" || typeof raw.display_name !== "string") return null;
  const amount = requiredJsonInt(raw.amount_pence, 1, Number.MAX_SAFE_INTEGER);
  if (amount == null || raw.currency !== "GBP") return null;
  const createdAt = raw.created_at == null ? "" : typeof raw.created_at === "string" ? raw.created_at : null;
  if (createdAt == null) return null;
  if (raw.admin_note != null && typeof raw.admin_note !== "string") return null;
  if (raw.processed_by != null && typeof raw.processed_by !== "string") return null;
  if (raw.processed_at != null && typeof raw.processed_at !== "string") return null;
  if (
    "client_secret" in raw ||
    "password_hash" in raw ||
    "raw_payload" in raw ||
    "details" in raw ||
    "stripe_secret" in raw
  ) {
    return null;
  }
  return {
    id: raw.id,
    user_id: raw.user_id,
    username: raw.username,
    display_name: raw.display_name,
    amount_pence: amount,
    currency: "GBP",
    status: raw.status,
    admin_note: raw.admin_note ?? null,
    processed_by: raw.processed_by ?? null,
    processed_at: raw.processed_at ?? null,
    created_at: createdAt,
  };
}

export function parseAdminWithdrawals(data: unknown): AdminWithdrawalRow[] | null {
  if (!isRecord(data) || !Array.isArray(data.withdrawals)) return null;
  const rows: AdminWithdrawalRow[] = [];
  for (const raw of data.withdrawals) {
    const row = parseAdminWithdrawalRow(raw);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

export async function apiFetchAdminWithdrawals(
  status: string,
): Promise<{ data: AdminWithdrawalRow[] | null; error: string | null }> {
  const path = `/api/admin/withdrawals?status=${encodeURIComponent(status)}`;
  const { data, error } = await apiRequest<unknown>(path);
  if (error) return { data: null, error: error.message };
  const parsed = parseAdminWithdrawals(data);
  if (!parsed) return { data: null, error: "Invalid withdrawals" };
  return { data: parsed, error: null };
}

export async function apiAdminWithdrawalAction(
  withdrawalId: string,
  action: AdminWithdrawalAction,
  note: string,
): Promise<{ ok: true; withdrawal: AdminWithdrawalRow } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>(
    `/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/${action}`,
    {
      method: "POST",
      body: JSON.stringify({ admin_note: note }),
    },
  );
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data)) return { ok: false, error: "Invalid withdrawal" };
  const withdrawal = parseAdminWithdrawalRow(data.withdrawal);
  if (!withdrawal) return { ok: false, error: "Invalid withdrawal" };
  return { ok: true, withdrawal };
}

export type AdminRisingStarsSeason = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  created_by: string | null;
  created_at: string;
};

export type AdminRisingStarsChallenge = {
  id: string;
  season_id: string;
  category_id: string;
  region_id: string | null;
  week_index: number;
  title: string;
  description: string | null;
  sound_track_id: string;
  opens_at: string;
  closes_at: string;
  status: string;
  leaderboard_frozen: boolean;
};

export type AdminRisingStarsAudit = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

export type AdminRisingStarsCategory = {
  id: string;
  season_id: string;
  slug: string;
  title: string;
};

export type AdminRisingStarsRegion = {
  id: string;
  season_id: string;
  slug: string;
  title: string;
};

function parseAdminRisingStarsSeason(raw: unknown): AdminRisingStarsSeason | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.slug !== "string" || typeof raw.title !== "string") return null;
  if (typeof raw.status !== "string" || typeof raw.starts_at !== "string" || typeof raw.ends_at !== "string") {
    return null;
  }
  if (raw.description != null && typeof raw.description !== "string") return null;
  if (raw.created_by != null && typeof raw.created_by !== "string") return null;
  if (typeof raw.created_at !== "string") return null;
  if ("client_secret" in raw || "password_hash" in raw || "DATABASE_URL" in raw) return null;
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description ?? null,
    starts_at: raw.starts_at,
    ends_at: raw.ends_at,
    status: raw.status,
    created_by: raw.created_by ?? null,
    created_at: raw.created_at,
  };
}

function parseAdminRisingStarsChallenge(raw: unknown): AdminRisingStarsChallenge | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.season_id !== "string" || typeof raw.category_id !== "string") return null;
  if (raw.region_id != null && typeof raw.region_id !== "string") return null;
  if (typeof raw.title !== "string" || typeof raw.status !== "string") return null;
  if (typeof raw.sound_track_id !== "string") return null;
  const week = requiredJsonInt(raw.week_index, 1, 520);
  if (week == null) return null;
  if (typeof raw.opens_at !== "string" || typeof raw.closes_at !== "string") return null;
  if (typeof raw.leaderboard_frozen !== "boolean") return null;
  if (raw.description != null && typeof raw.description !== "string") return null;
  if ("client_secret" in raw || "password_hash" in raw) return null;
  return {
    id: raw.id,
    season_id: raw.season_id,
    category_id: raw.category_id,
    region_id: raw.region_id ?? null,
    week_index: week,
    title: raw.title,
    description: raw.description ?? null,
    sound_track_id: raw.sound_track_id,
    opens_at: raw.opens_at,
    closes_at: raw.closes_at,
    status: raw.status,
    leaderboard_frozen: raw.leaderboard_frozen,
  };
}

function parseAdminRisingStarsAuditRow(raw: unknown): AdminRisingStarsAudit | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.action !== "string" || typeof raw.entity_type !== "string") return null;
  if (raw.entity_id != null && typeof raw.entity_id !== "string") return null;
  if (typeof raw.created_at !== "string") return null;
  if ("details" in raw || "client_secret" in raw || "password_hash" in raw) return null;
  return {
    id: raw.id,
    action: raw.action,
    entity_type: raw.entity_type,
    entity_id: raw.entity_id ?? null,
    created_at: raw.created_at,
  };
}

export function parseAdminRisingStarsSeasons(data: unknown): AdminRisingStarsSeason[] | null {
  if (!isRecord(data) || !Array.isArray(data.seasons)) return null;
  const seasons: AdminRisingStarsSeason[] = [];
  for (const raw of data.seasons) {
    const season = parseAdminRisingStarsSeason(raw);
    if (!season) return null;
    seasons.push(season);
  }
  return seasons;
}

export function parseAdminRisingStarsChallenges(data: unknown): AdminRisingStarsChallenge[] | null {
  if (!isRecord(data) || !Array.isArray(data.challenges)) return null;
  const challenges: AdminRisingStarsChallenge[] = [];
  for (const raw of data.challenges) {
    const challenge = parseAdminRisingStarsChallenge(raw);
    if (!challenge) return null;
    challenges.push(challenge);
  }
  return challenges;
}

export function parseAdminRisingStarsAudit(data: unknown): AdminRisingStarsAudit[] | null {
  if (!isRecord(data) || !Array.isArray(data.audit)) return null;
  const audit: AdminRisingStarsAudit[] = [];
  for (const raw of data.audit) {
    const row = parseAdminRisingStarsAuditRow(raw);
    if (!row) return null;
    audit.push(row);
  }
  return audit;
}

export async function apiAdminRisingStarsReload(): Promise<{
  seasons: AdminRisingStarsSeason[] | null;
  audit: AdminRisingStarsAudit[] | null;
  error: string | null;
}> {
  const [seasonsRes, auditRes] = await Promise.all([
    apiRequest<unknown>("/api/admin/rising-stars/seasons"),
    apiRequest<unknown>("/api/admin/rising-stars/audit?limit=50"),
  ]);
  if (seasonsRes.error) return { seasons: null, audit: null, error: seasonsRes.error.message };
  if (auditRes.error) return { seasons: null, audit: null, error: auditRes.error.message };
  const seasons = parseAdminRisingStarsSeasons(seasonsRes.data);
  const audit = parseAdminRisingStarsAudit(auditRes.data);
  if (!seasons || !audit) return { seasons: null, audit: null, error: "Invalid Rising Stars admin" };
  return { seasons, audit, error: null };
}

export async function apiAdminRisingStarsLoadChallenges(seasonId: string): Promise<{
  challenges: AdminRisingStarsChallenge[] | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(
    `/api/admin/rising-stars/challenges?seasonId=${encodeURIComponent(seasonId)}`,
  );
  if (error) return { challenges: null, error: error.message };
  const challenges = parseAdminRisingStarsChallenges(data);
  if (!challenges) return { challenges: null, error: "Invalid challenges" };
  return { challenges, error: null };
}

export async function apiAdminRisingStarsCreateSeason(body: {
  slug: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  status: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>("/api/admin/rising-stars/seasons", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiAdminRisingStarsCreateCategory(body: {
  season_id: string;
  slug: string;
  title: string;
}): Promise<{ ok: true; category: AdminRisingStarsCategory } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>("/api/admin/rising-stars/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || !isRecord(data.category) || typeof data.category.id !== "string") {
    return { ok: false, error: "Invalid category" };
  }
  if (typeof data.category.season_id !== "string" || typeof data.category.slug !== "string") {
    return { ok: false, error: "Invalid category" };
  }
  if (typeof data.category.title !== "string") return { ok: false, error: "Invalid category" };
  return {
    ok: true,
    category: {
      id: data.category.id,
      season_id: data.category.season_id,
      slug: data.category.slug,
      title: data.category.title,
    },
  };
}

export async function apiAdminRisingStarsCreateRegion(body: {
  season_id: string;
  slug: string;
  title: string;
  country_codes: string[];
}): Promise<{ ok: true; region: AdminRisingStarsRegion } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>("/api/admin/rising-stars/regions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || !isRecord(data.region) || typeof data.region.id !== "string") {
    return { ok: false, error: "Invalid region" };
  }
  if (typeof data.region.season_id !== "string" || typeof data.region.slug !== "string") {
    return { ok: false, error: "Invalid region" };
  }
  if (typeof data.region.title !== "string") return { ok: false, error: "Invalid region" };
  return {
    ok: true,
    region: {
      id: data.region.id,
      season_id: data.region.season_id,
      slug: data.region.slug,
      title: data.region.title,
    },
  };
}

export async function apiAdminRisingStarsCreateChallenge(body: {
  season_id: string;
  category_id: string;
  region_id: string | null;
  week_index: number;
  title: string;
  sound_track_id: string;
  opens_at: string;
  closes_at: string;
  status: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>("/api/admin/rising-stars/challenges", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiAdminRisingStarsSetChallengeStatus(
  challengeId: string,
  status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(
    `/api/admin/rising-stars/challenges/${encodeURIComponent(challengeId)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiAdminRisingStarsSnapshot(
  challengeId: string,
  phase: "qualifier" | "final",
  advanceTopN: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>(
    `/api/admin/rising-stars/challenges/${encodeURIComponent(challengeId)}/snapshot`,
    {
      method: "POST",
      body: JSON.stringify({ phase, advanceTopN }),
    },
  );
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || data.ok !== true) return { ok: false, error: "Invalid snapshot" };
  return { ok: true };
}

function requiredInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?(0|[1-9]\d*)$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

export type AdminXpConfig = {
  source: string;
  xp_amount: number;
  enabled: boolean;
  description: string;
};

export type AdminLevelRow = {
  level: number;
  total_xp_required: number;
  title: string | null;
  badge_code: string | null;
};

export type AdminMissionRow = {
  id: string;
  title: string;
  goal_count: number;
  reward_xp: number;
  reward_promo_coins: number;
  reward_energy: number;
  enabled: boolean;
  metric_key: string;
  scope: string;
  audience: string;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
};

export type AdminDailyReward = {
  streak_day: number;
  reward_xp: number;
  reward_promo_coins: number;
  reward_label: string | null;
};

export type AdminDailyPolicy = {
  streak_reset_policy: "miss_one_day" | "never";
  effective_start: string;
  effective_end: string;
  active: boolean;
};

export type AdminBattleEnergyCaps = {
  watch_amount: number;
  comment_amount: number;
  share_amount: number;
  watch_cap: number;
  comment_cap: number;
  share_cap: number;
  storage_cap: number;
  session_cap: number;
  daily_cap: number;
  minimum_boost: number;
  allowed_boost_values: number[];
  fan_energy_threshold: number;
  score_multiplier: number;
  boost_duration_sec: number;
  enabled: boolean;
};

export type AdminFeatureFlagRow = {
  key: string;
  effective: boolean;
  default_value: boolean;
  env_value: boolean;
  admin_value: boolean | null;
  last_changed_by: string | null;
  last_changed_at: string | null;
  reason: string | null;
};

export type AdminProgressionUser = {
  starter_coin_balance: number;
  total_xp: number;
  current_level: number;
};

export type AdminProgressionAudit = {
  id: string;
  admin_user_id: string;
  action: string;
  target: string;
  created_at: string;
};

export type AdminXpHistory = { id: string; xp_amount: number; source: string; created_at: string };
export type AdminStarterHistory = { id: string; amount_delta: number; kind: string; balance_after: number };

function parseXpConfigList(data: unknown): AdminXpConfig[] | null {
  if (!isRecord(data) || !Array.isArray(data.config)) return null;
  const rows: AdminXpConfig[] = [];
  for (const raw of data.config) {
    if (!isRecord(raw) || typeof raw.source !== "string" || typeof raw.description !== "string") return null;
    const xpAmount = requiredInt(raw.xp_amount);
    if (xpAmount == null || typeof raw.enabled !== "boolean") return null;
    rows.push({ source: raw.source, xp_amount: xpAmount, enabled: raw.enabled, description: raw.description });
  }
  return rows;
}

function parseLevelList(data: unknown): AdminLevelRow[] | null {
  if (!isRecord(data) || !Array.isArray(data.levels)) return null;
  const rows: AdminLevelRow[] = [];
  for (const raw of data.levels) {
    if (!isRecord(raw)) return null;
    const level = requiredInt(raw.level);
    const total = requiredInt(raw.total_xp_required);
    if (level == null || total == null) return null;
    if (raw.title != null && typeof raw.title !== "string") return null;
    if (raw.badge_code != null && typeof raw.badge_code !== "string") return null;
    rows.push({
      level,
      total_xp_required: total,
      title: typeof raw.title === "string" ? raw.title : null,
      badge_code: typeof raw.badge_code === "string" ? raw.badge_code : null,
    });
  }
  return rows;
}

function parseMissionList(data: unknown): AdminMissionRow[] | null {
  if (!isRecord(data) || !Array.isArray(data.missions)) return null;
  const rows: AdminMissionRow[] = [];
  for (const raw of data.missions) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.title !== "string") return null;
    if (typeof raw.metric_key !== "string" || typeof raw.scope !== "string") return null;
    const goal = requiredInt(raw.goal_count);
    const xp = requiredInt(raw.reward_xp);
    const promo = requiredInt(raw.reward_promo_coins);
    const energy = requiredInt(raw.reward_energy);
    const sort = requiredInt(raw.sort_order ?? 0);
    if (goal == null || xp == null || promo == null || energy == null || sort == null) return null;
    if (typeof raw.enabled !== "boolean") return null;
    rows.push({
      id: raw.id,
      title: raw.title,
      goal_count: goal,
      reward_xp: xp,
      reward_promo_coins: promo,
      reward_energy: energy,
      enabled: raw.enabled,
      metric_key: raw.metric_key,
      scope: raw.scope,
      audience: typeof raw.audience === "string" ? raw.audience : "all_authenticated",
      starts_at: typeof raw.starts_at === "string" ? raw.starts_at : null,
      ends_at: typeof raw.ends_at === "string" ? raw.ends_at : null,
      sort_order: sort,
    });
  }
  return rows;
}

function parseDailyRewards(data: unknown): { rewards: AdminDailyReward[]; policy: AdminDailyPolicy } | null {
  if (!isRecord(data) || !Array.isArray(data.rewards) || !isRecord(data.policy)) return null;
  const rewards: AdminDailyReward[] = [];
  for (const raw of data.rewards) {
    if (!isRecord(raw)) return null;
    const day = requiredInt(raw.streak_day);
    const xp = requiredInt(raw.reward_xp);
    const promo = requiredInt(raw.reward_promo_coins);
    if (day == null || xp == null || promo == null) return null;
    rewards.push({
      streak_day: day,
      reward_xp: xp,
      reward_promo_coins: promo,
      reward_label: typeof raw.reward_label === "string" ? raw.reward_label : null,
    });
  }
  const policy = data.policy;
  if (policy.streak_reset_policy !== "miss_one_day" && policy.streak_reset_policy !== "never") return null;
  if (typeof policy.active !== "boolean") return null;
  return {
    rewards,
    policy: {
      streak_reset_policy: policy.streak_reset_policy,
      effective_start: typeof policy.effective_start === "string" ? policy.effective_start : "",
      effective_end: typeof policy.effective_end === "string" ? policy.effective_end : "",
      active: policy.active,
    },
  };
}

function parseCaps(data: unknown): AdminBattleEnergyCaps | null {
  if (!isRecord(data) || !isRecord(data.caps)) return null;
  const raw = data.caps;
  const ints = [
    "watch_amount",
    "comment_amount",
    "share_amount",
    "watch_cap",
    "comment_cap",
    "share_cap",
    "storage_cap",
    "session_cap",
    "daily_cap",
    "minimum_boost",
    "fan_energy_threshold",
    "boost_duration_sec",
  ] as const;
  const parsed: Record<string, number> = {};
  for (const key of ints) {
    const n = requiredInt(raw[key]);
    if (n == null) return null;
    parsed[key] = n;
  }
  if (typeof raw.score_multiplier !== "number" || !Number.isFinite(raw.score_multiplier)) return null;
  if (!Array.isArray(raw.allowed_boost_values) || typeof raw.enabled !== "boolean") return null;
  const allowed: number[] = [];
  for (const value of raw.allowed_boost_values) {
    const n = requiredInt(value);
    if (n == null) return null;
    allowed.push(n);
  }
  return {
    watch_amount: parsed.watch_amount,
    comment_amount: parsed.comment_amount,
    share_amount: parsed.share_amount,
    watch_cap: parsed.watch_cap,
    comment_cap: parsed.comment_cap,
    share_cap: parsed.share_cap,
    storage_cap: parsed.storage_cap,
    session_cap: parsed.session_cap,
    daily_cap: parsed.daily_cap,
    minimum_boost: parsed.minimum_boost,
    allowed_boost_values: allowed,
    fan_energy_threshold: parsed.fan_energy_threshold,
    score_multiplier: raw.score_multiplier,
    boost_duration_sec: parsed.boost_duration_sec,
    enabled: raw.enabled,
  };
}

function parseFlagDetail(data: unknown): { flags: Record<string, boolean>; rows: AdminFeatureFlagRow[] } | null {
  if (!isRecord(data) || !isRecord(data.flags) || !Array.isArray(data.rows)) return null;
  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(data.flags)) {
    if (typeof value !== "boolean") return null;
    flags[key] = value;
  }
  const rows: AdminFeatureFlagRow[] = [];
  for (const raw of data.rows) {
    if (!isRecord(raw) || typeof raw.key !== "string") return null;
    if (typeof raw.effective !== "boolean" || typeof raw.default_value !== "boolean" || typeof raw.env_value !== "boolean") {
      return null;
    }
    if (raw.admin_value != null && typeof raw.admin_value !== "boolean") return null;
    rows.push({
      key: raw.key,
      effective: raw.effective,
      default_value: raw.default_value,
      env_value: raw.env_value,
      admin_value: typeof raw.admin_value === "boolean" ? raw.admin_value : null,
      last_changed_by: typeof raw.last_changed_by === "string" ? raw.last_changed_by : null,
      last_changed_at: typeof raw.last_changed_at === "string" ? raw.last_changed_at : null,
      reason: typeof raw.reason === "string" ? raw.reason : null,
    });
  }
  return { flags, rows };
}

function parseAuditEntries(data: unknown): AdminProgressionAudit[] | null {
  if (!isRecord(data) || !Array.isArray(data.entries)) return null;
  const rows: AdminProgressionAudit[] = [];
  for (const raw of data.entries) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.admin_user_id !== "string") return null;
    if (typeof raw.action !== "string" || typeof raw.target !== "string") return null;
    rows.push({
      id: raw.id,
      admin_user_id: raw.admin_user_id,
      action: raw.action,
      target: raw.target,
      created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    });
  }
  return rows;
}

export async function apiAdminProgressionLoadConfig(): Promise<{
  config: AdminXpConfig[] | null;
  levels: AdminLevelRow[] | null;
  error: string | null;
}> {
  const [configRes, levelsRes] = await Promise.all([
    apiRequest<unknown>("/api/admin/progression/config"),
    apiRequest<unknown>("/api/admin/progression/levels"),
  ]);
  if (configRes.error) return { config: null, levels: null, error: configRes.error.message };
  if (levelsRes.error) return { config: null, levels: null, error: levelsRes.error.message };
  const config = parseXpConfigList(configRes.data);
  const levels = parseLevelList(levelsRes.data);
  if (!config || !levels) return { config: null, levels: null, error: "Invalid progression config" };
  return { config, levels, error: null };
}

export async function apiAdminProgressionLoadEngagementAdmin(): Promise<{
  flags: Record<string, boolean> | null;
  rows: AdminFeatureFlagRow[] | null;
  missions: AdminMissionRow[] | null;
  rewards: AdminDailyReward[] | null;
  policy: AdminDailyPolicy | null;
  caps: AdminBattleEnergyCaps | null;
  entries: AdminProgressionAudit[] | null;
  error: string | null;
}> {
  const [flagsRes, missionsRes, dailyRes, capsRes, auditRes] = await Promise.all([
    apiRequest<unknown>("/api/admin/progression/feature-flags"),
    apiRequest<unknown>("/api/admin/progression/missions"),
    apiRequest<unknown>("/api/admin/progression/daily-rewards"),
    apiRequest<unknown>("/api/admin/progression/battle-energy-caps"),
    apiRequest<unknown>("/api/admin/progression/audit-history?limit=30"),
  ]);
  const firstError =
    flagsRes.error?.message ||
    missionsRes.error?.message ||
    dailyRes.error?.message ||
    capsRes.error?.message ||
    auditRes.error?.message ||
    null;
  if (firstError) {
    return {
      flags: null,
      rows: null,
      missions: null,
      rewards: null,
      policy: null,
      caps: null,
      entries: null,
      error: firstError,
    };
  }
  const flags = parseFlagDetail(flagsRes.data);
  const missions = parseMissionList(missionsRes.data);
  const daily = parseDailyRewards(dailyRes.data);
  const caps = parseCaps(capsRes.data);
  const entries = parseAuditEntries(auditRes.data);
  if (!flags || !missions || !daily || !caps || !entries) {
    return {
      flags: null,
      rows: null,
      missions: null,
      rewards: null,
      policy: null,
      caps: null,
      entries: null,
      error: "Invalid progression admin",
    };
  }
  return {
    flags: flags.flags,
    rows: flags.rows,
    missions,
    rewards: daily.rewards,
    policy: daily.policy,
    caps,
    entries,
    error: null,
  };
}

export async function apiAdminProgressionSaveConfig(row: AdminXpConfig): Promise<{ error: string | null }> {
  const { error } = await apiRequest<unknown>("/api/admin/progression/config", {
    method: "PATCH",
    body: JSON.stringify({ source: row.source, xp_amount: row.xp_amount, enabled: row.enabled }),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionSaveLevel(row: AdminLevelRow): Promise<{ error: string | null }> {
  const { error } = await apiRequest<unknown>("/api/admin/progression/levels", {
    method: "PUT",
    body: JSON.stringify({
      level: row.level,
      total_xp_required: row.total_xp_required,
      title: row.title,
      badge_code: row.badge_code,
    }),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionLoadUser(userId: string): Promise<{
  progression: AdminProgressionUser | null;
  xp_history: AdminXpHistory[];
  starter_history: AdminStarterHistory[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/admin/progression/users/${encodeURIComponent(userId)}`);
  if (error) return { progression: null, xp_history: [], starter_history: [], error: error.message };
  if (!isRecord(data) || !isRecord(data.progression) || !Array.isArray(data.xp_history) || !Array.isArray(data.starter_history)) {
    return { progression: null, xp_history: [], starter_history: [], error: "Invalid user progression" };
  }
  const starter = requiredInt(data.progression.starter_coin_balance);
  const totalXp = requiredInt(data.progression.total_xp);
  const level = requiredInt(data.progression.current_level);
  if (starter == null || totalXp == null || level == null) {
    return { progression: null, xp_history: [], starter_history: [], error: "Invalid user progression" };
  }
  const xpHistory: AdminXpHistory[] = [];
  for (const raw of data.xp_history) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.source !== "string") {
      return { progression: null, xp_history: [], starter_history: [], error: "Invalid user progression" };
    }
    const amount = requiredInt(raw.xp_amount);
    if (amount == null) return { progression: null, xp_history: [], starter_history: [], error: "Invalid user progression" };
    xpHistory.push({
      id: raw.id,
      xp_amount: amount,
      source: raw.source,
      created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    });
  }
  const starterHistory: AdminStarterHistory[] = [];
  for (const raw of data.starter_history) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.kind !== "string") {
      return { progression: null, xp_history: [], starter_history: [], error: "Invalid user progression" };
    }
    const delta = requiredInt(raw.amount_delta);
    const after = requiredInt(raw.balance_after);
    if (delta == null || after == null) {
      return { progression: null, xp_history: [], starter_history: [], error: "Invalid user progression" };
    }
    starterHistory.push({ id: raw.id, amount_delta: delta, kind: raw.kind, balance_after: after });
  }
  return {
    progression: { starter_coin_balance: starter, total_xp: totalXp, current_level: level },
    xp_history: xpHistory,
    starter_history: starterHistory,
    error: null,
  };
}

export async function apiAdminProgressionAdjust(
  endpoint: "xp-adjustments" | "starter-adjustments",
  payload: { user_id: string; amount_delta: number; reason: string; idempotency_key: string },
): Promise<{ error: string | null }> {
  const { error } = await apiRequest<unknown>(`/api/admin/progression/${endpoint}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionToggleFeatureFlag(
  payload: Record<string, unknown>,
): Promise<{ flags: Record<string, boolean> | null; rows: AdminFeatureFlagRow[] | null; error: string | null }> {
  const { data, error } = await apiRequest<unknown>("/api/admin/progression/feature-flags", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (error) return { flags: null, rows: null, error: error.message };
  const parsed = parseFlagDetail(data);
  if (!parsed) return { flags: null, rows: null, error: "Invalid flags" };
  return { flags: parsed.flags, rows: parsed.rows, error: null };
}

export async function apiAdminProgressionSaveMission(
  missionId: string,
  payload: {
    goal_count: number;
    reward_xp: number;
    reward_promo_coins: number;
    reward_energy: number;
    enabled: boolean;
    audience: string;
    sort_order: number;
  },
): Promise<{ error: string | null }> {
  const { error } = await apiRequest<unknown>(`/api/admin/progression/missions/${encodeURIComponent(missionId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionArchiveMission(missionId: string): Promise<{ error: string | null }> {
  const { error } = await apiRequest<unknown>(
    `/api/admin/progression/missions/${encodeURIComponent(missionId)}/archive`,
    { method: "POST", body: "{}" },
  );
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionSaveDailyReward(payload: AdminDailyReward): Promise<{ error: string | null }> {
  const { error } = await apiRequest<unknown>("/api/admin/progression/daily-rewards", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionSaveDailyPolicy(payload: {
  streak_reset_policy: "miss_one_day" | "never";
  active: boolean;
  effective_start: string | null;
  effective_end: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await apiRequest<unknown>("/api/admin/progression/daily-rewards/policy", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionSaveBattleEnergyCaps(
  payload: AdminBattleEnergyCaps,
): Promise<{ caps: AdminBattleEnergyCaps | null; error: string | null }> {
  const { data, error } = await apiRequest<unknown>("/api/admin/progression/battle-energy-caps", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (error) return { caps: null, error: error.message };
  const caps = parseCaps(data);
  if (!caps) return { caps: null, error: "Invalid energy caps" };
  return { caps, error: null };
}
