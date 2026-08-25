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
  avatarUrl: string | null;
  createdAt: string;
  isBanned: boolean;
};

export function parseAdminUsers(data: unknown): AdminUserRow[] | null {
  if (!isRecord(data) || !Array.isArray(data.users)) return null;
  const users: AdminUserRow[] = [];
  for (const raw of data.users) {
    if (!isRecord(raw) || typeof raw.id !== "string") return null;
    if (typeof raw.username !== "string" || typeof raw.email !== "string") return null;
    if (typeof raw.isBanned !== "boolean") return null;
    if (raw.avatarUrl != null && typeof raw.avatarUrl !== "string") return null;
    const createdAt = raw.createdAt == null ? "" : typeof raw.createdAt === "string" ? raw.createdAt : null;
    if (createdAt == null) return null;
    users.push({
      id: raw.id,
      username: raw.username,
      email: raw.email,
      avatarUrl: raw.avatarUrl ?? null,
      createdAt,
      isBanned: raw.isBanned,
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
): Promise<{ ok: true; isBanned: true } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>(`/api/admin/users/${encodeURIComponent(userId)}/ban`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || data.ok !== true || data.isBanned !== true) {
    return { ok: false, error: "Invalid ban" };
  }
  return { ok: true, isBanned: true };
}

export async function apiAdminUnbanUser(
  userId: string,
): Promise<{ ok: true; isBanned: false } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>(`/api/admin/users/${encodeURIComponent(userId)}/ban`, {
    method: "DELETE",
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || data.ok !== true || data.isBanned !== false) {
    return { ok: false, error: "Invalid unban" };
  }
  return { ok: true, isBanned: false };
}

export type AdminReportRow = {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  reporter?: { username: string };
};

export function parseAdminReports(data: unknown): AdminReportRow[] | null {
  if (!isRecord(data) || !Array.isArray(data.reports)) return null;
  const reports: AdminReportRow[] = [];
  for (const raw of data.reports) {
    if (!isRecord(raw) || typeof raw.id !== "string") return null;
    if (typeof raw.targetType !== "string" || typeof raw.targetId !== "string") return null;
    if (typeof raw.reason !== "string" || typeof raw.status !== "string") return null;
    if (typeof raw.reporterId !== "string") return null;
    const details = raw.details == null ? "" : typeof raw.details === "string" ? raw.details : null;
    const createdAt = raw.createdAt == null ? "" : typeof raw.createdAt === "string" ? raw.createdAt : null;
    if (details == null || createdAt == null) return null;
    let reporter: { username: string } | undefined;
    if (raw.reporter != null) {
      if (!isRecord(raw.reporter) || typeof raw.reporter.username !== "string") return null;
      reporter = { username: raw.reporter.username };
    }
    reports.push({
      id: raw.id,
      reporterId: raw.reporterId,
      targetType: raw.targetType,
      targetId: raw.targetId,
      reason: raw.reason,
      details,
      status: raw.status,
      createdAt: createdAt,
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
      adminNote: `Outcome: ${action}`,
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
  coinCost: number;
  isActive: boolean;
};

export type AdminEconomyPackage = {
  id: string;
  productId: string;
  provider: string;
  title: string;
  coins: number;
  priceDisplay: string;
};

export type AdminEconomyBooster = {
  id: string;
  name: string;
  coinCost: number;
  effectType: string;
  isActive: boolean;
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
  const coinCost = requiredPositiveInt(raw.coinCost);
  if (coinCost == null || typeof raw.isActive !== "boolean") return null;
  return {
    id: raw.id,
    name: raw.name,
    coinCost: coinCost,
    isActive: raw.isActive,
  };
}

function parseAdminEconomyPackage(raw: unknown): AdminEconomyPackage | null {
  if (!isRecord(raw) || typeof raw.productId !== "string" || !raw.productId) return null;
  if (typeof raw.provider !== "string" || typeof raw.title !== "string") return null;
  const coins = requiredPositiveInt(raw.coins);
  if (coins == null || typeof raw.priceDisplay !== "string") return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : `${raw.provider}:${raw.productId}`;
  return {
    id,
    productId: raw.productId,
    provider: raw.provider,
    title: raw.title,
    coins,
    priceDisplay: raw.priceDisplay,
  };
}

function parseAdminEconomyBooster(raw: unknown): AdminEconomyBooster | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.name !== "string" || typeof raw.effectType !== "string") return null;
  const coinCost = requiredNonNegativeInt(raw.coinCost);
  if (coinCost == null || typeof raw.isActive !== "boolean") return null;
  return {
    id: raw.id,
    name: raw.name,
    coinCost: coinCost,
    effectType: raw.effectType,
    isActive: raw.isActive,
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
      body: JSON.stringify({ coinCost: coinCost }),
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
  userId: string;
  amountPence: number;
  status: string;
  createdAt: string;
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
  if (typeof raw.userId !== "string" || typeof raw.status !== "string") return null;
  const amount = requiredNonNegativeInt(raw.amountPence);
  const createdAt = raw.createdAt == null ? "" : typeof raw.createdAt === "string" ? raw.createdAt : null;
  if (amount == null || createdAt == null) return null;
  return {
    id: raw.id,
    userId: raw.userId,
    amountPence: amount,
    status: raw.status,
    createdAt: createdAt,
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
  userId: string;
  provider: string;
  productId: string;
  transactionId: string;
  coins: number;
  status: string;
  createdAt: string;
};

export type AdminShopPurchase = {
  id: string;
  userId: string;
  stripeSessionId: string;
  itemId: string;
  quantity: number;
  amountPence: number;
  status: string;
  createdAt: string;
};

function parseAdminIapPurchase(raw: unknown): AdminIapPurchase | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.userId !== "string" || typeof raw.provider !== "string") return null;
  if (raw.provider !== "apple" && raw.provider !== "google") return null;
  if (typeof raw.productId !== "string" || typeof raw.transactionId !== "string") return null;
  if (typeof raw.status !== "string") return null;
  const coins = requiredJsonInt(raw.coins, 0, Number.MAX_SAFE_INTEGER);
  const createdAt = raw.createdAt == null ? "" : typeof raw.createdAt === "string" ? raw.createdAt : null;
  if (coins == null || createdAt == null) return null;
  if ("raw_payload" in raw || "purchaseToken" in raw || "receipt" in raw) return null;
  return {
    id: raw.id,
    userId: raw.userId,
    provider: raw.provider,
    productId: raw.productId,
    transactionId: raw.transactionId,
    coins,
    status: raw.status,
    createdAt: createdAt,
  };
}

function parseAdminShopPurchase(raw: unknown): AdminShopPurchase | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.userId !== "string" || typeof raw.stripeSessionId !== "string") return null;
  if (typeof raw.itemId !== "string" || typeof raw.status !== "string") return null;
  const quantity = requiredJsonInt(raw.quantity, 0, Number.MAX_SAFE_INTEGER);
  const amountPence = requiredJsonInt(raw.amountPence, 0, Number.MAX_SAFE_INTEGER);
  const createdAt = raw.createdAt == null ? "" : typeof raw.createdAt === "string" ? raw.createdAt : null;
  if (quantity == null || amountPence == null || createdAt == null) return null;
  if ("client_secret" in raw || "payment_intent" in raw) return null;
  return {
    id: raw.id,
    userId: raw.userId,
    stripeSessionId: raw.stripeSessionId,
    itemId: raw.itemId,
    quantity,
    amountPence: amountPence,
    status: raw.status,
    createdAt: createdAt,
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
  userId: string;
  username: string;
  displayName: string;
  amountPence: number;
  currency: "GBP";
  status: string;
  adminNote: string | null;
  processedBy: string | null;
  processedAt: string | null;
  createdAt: string;
};

export type AdminWithdrawalAction = "review" | "approve" | "reject" | "cancel" | "mark-paid";

function parseAdminWithdrawalRow(raw: unknown): AdminWithdrawalRow | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.userId !== "string" || typeof raw.status !== "string") return null;
  if (typeof raw.username !== "string" || typeof raw.displayName !== "string") return null;
  const amount = requiredJsonInt(raw.amountPence, 1, Number.MAX_SAFE_INTEGER);
  if (amount == null || raw.currency !== "GBP") return null;
  const createdAt = raw.createdAt == null ? "" : typeof raw.createdAt === "string" ? raw.createdAt : null;
  if (createdAt == null) return null;
  if (raw.adminNote != null && typeof raw.adminNote !== "string") return null;
  if (raw.processedBy != null && typeof raw.processedBy !== "string") return null;
  if (raw.processedAt != null && typeof raw.processedAt !== "string") return null;
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
    userId: raw.userId,
    username: raw.username,
    displayName: raw.displayName,
    amountPence: amount,
    currency: "GBP",
    status: raw.status,
    adminNote: raw.adminNote ?? null,
    processedBy: raw.processedBy ?? null,
    processedAt: raw.processedAt ?? null,
    createdAt: createdAt,
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
      body: JSON.stringify({ adminNote: note }),
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
  startsAt: string;
  endsAt: string;
  status: string;
  createdBy: string | null;
  createdAt: string;
};

export type AdminRisingStarsChallenge = {
  id: string;
  seasonId: string;
  categoryId: string;
  regionId: string | null;
  weekIndex: number;
  title: string;
  description: string | null;
  soundTrackId: string;
  opensAt: string;
  closesAt: string;
  status: string;
  leaderboardFrozen: boolean;
};

export type AdminRisingStarsAudit = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
};

export type AdminRisingStarsCategory = {
  id: string;
  seasonId: string;
  slug: string;
  title: string;
};

export type AdminRisingStarsRegion = {
  id: string;
  seasonId: string;
  slug: string;
  title: string;
};

function parseAdminRisingStarsSeason(raw: unknown): AdminRisingStarsSeason | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.slug !== "string" || typeof raw.title !== "string") return null;
  if (typeof raw.status !== "string" || typeof raw.startsAt !== "string" || typeof raw.endsAt !== "string") {
    return null;
  }
  if (raw.description != null && typeof raw.description !== "string") return null;
  if (raw.createdBy != null && typeof raw.createdBy !== "string") return null;
  if (typeof raw.createdAt !== "string") return null;
  if ("client_secret" in raw || "password_hash" in raw || "DATABASE_URL" in raw) return null;
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description ?? null,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    status: raw.status,
    createdBy: raw.createdBy ?? null,
    createdAt: raw.createdAt,
  };
}

function parseAdminRisingStarsChallenge(raw: unknown): AdminRisingStarsChallenge | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.seasonId !== "string" || typeof raw.categoryId !== "string") return null;
  if (raw.regionId != null && typeof raw.regionId !== "string") return null;
  if (typeof raw.title !== "string" || typeof raw.status !== "string") return null;
  if (typeof raw.soundTrackId !== "string") return null;
  const week = requiredJsonInt(raw.weekIndex, 1, 520);
  if (week == null) return null;
  if (typeof raw.opensAt !== "string" || typeof raw.closesAt !== "string") return null;
  if (typeof raw.leaderboardFrozen !== "boolean") return null;
  if (raw.description != null && typeof raw.description !== "string") return null;
  if ("client_secret" in raw || "password_hash" in raw) return null;
  return {
    id: raw.id,
    seasonId: raw.seasonId,
    categoryId: raw.categoryId,
    regionId: raw.regionId ?? null,
    weekIndex: week,
    title: raw.title,
    description: raw.description ?? null,
    soundTrackId: raw.soundTrackId,
    opensAt: raw.opensAt,
    closesAt: raw.closesAt,
    status: raw.status,
    leaderboardFrozen: raw.leaderboardFrozen,
  };
}

function parseAdminRisingStarsAuditRow(raw: unknown): AdminRisingStarsAudit | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.action !== "string" || typeof raw.entityType !== "string") return null;
  if (raw.entityId != null && typeof raw.entityId !== "string") return null;
  if (typeof raw.createdAt !== "string") return null;
  if ("details" in raw || "client_secret" in raw || "password_hash" in raw) return null;
  return {
    id: raw.id,
    action: raw.action,
    entityType: raw.entityType,
    entityId: raw.entityId ?? null,
    createdAt: raw.createdAt,
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
  startsAt: string;
  endsAt: string;
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
  seasonId: string;
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
  if (typeof data.category.seasonId !== "string" || typeof data.category.slug !== "string") {
    return { ok: false, error: "Invalid category" };
  }
  if (typeof data.category.title !== "string") return { ok: false, error: "Invalid category" };
  return {
    ok: true,
    category: {
      id: data.category.id,
      seasonId: data.category.seasonId,
      slug: data.category.slug,
      title: data.category.title,
    },
  };
}

export async function apiAdminRisingStarsCreateRegion(body: {
  seasonId: string;
  slug: string;
  title: string;
  countryCodes: string[];
}): Promise<{ ok: true; region: AdminRisingStarsRegion } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>("/api/admin/rising-stars/regions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || !isRecord(data.region) || typeof data.region.id !== "string") {
    return { ok: false, error: "Invalid region" };
  }
  if (typeof data.region.seasonId !== "string" || typeof data.region.slug !== "string") {
    return { ok: false, error: "Invalid region" };
  }
  if (typeof data.region.title !== "string") return { ok: false, error: "Invalid region" };
  return {
    ok: true,
    region: {
      id: data.region.id,
      seasonId: data.region.seasonId,
      slug: data.region.slug,
      title: data.region.title,
    },
  };
}

export async function apiAdminRisingStarsCreateChallenge(body: {
  seasonId: string;
  categoryId: string;
  regionId: string | null;
  weekIndex: number;
  title: string;
  soundTrackId: string;
  opensAt: string;
  closesAt: string;
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
  xpAmount: number;
  enabled: boolean;
  description: string;
};

export type AdminLevelRow = {
  level: number;
  totalXpRequired: number;
  title: string | null;
  badgeCode: string | null;
};

export type AdminMissionRow = {
  id: string;
  title: string;
  goalCount: number;
  rewardXp: number;
  rewardPromoCoins: number;
  rewardEnergy: number;
  enabled: boolean;
  metricKey: string;
  scope: string;
  audience: string;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
};

export type AdminDailyReward = {
  streakDay: number;
  rewardXp: number;
  rewardPromoCoins: number;
  rewardLabel: string | null;
};

export type AdminDailyPolicy = {
  streakResetPolicy: "miss_one_day" | "never";
  effectiveStart: string;
  effectiveEnd: string;
  active: boolean;
};

export type AdminBattleEnergyCaps = {
  watchAmount: number;
  commentAmount: number;
  shareAmount: number;
  watchCap: number;
  commentCap: number;
  shareCap: number;
  storageCap: number;
  sessionCap: number;
  dailyCap: number;
  minimumBoost: number;
  allowedBoostValues: number[];
  fanEnergyThreshold: number;
  scoreMultiplier: number;
  boostDurationSec: number;
  enabled: boolean;
};

export type AdminFeatureFlagRow = {
  key: string;
  effective: boolean;
  defaultValue: boolean;
  envValue: boolean;
  adminValue: boolean | null;
  lastChangedBy: string | null;
  lastChangedAt: string | null;
  reason: string | null;
};

export type AdminProgressionUser = {
  starterCoinBalance: number;
  totalXp: number;
  currentLevel: number;
};

export type AdminProgressionAudit = {
  id: string;
  adminUserId: string;
  action: string;
  target: string;
  createdAt: string;
};

export type AdminXpHistory = { id: string; xpAmount: number; source: string; createdAt: string };
export type AdminStarterHistory = { id: string; amountDelta: number; kind: string; balanceAfter: number };

function parseXpConfigList(data: unknown): AdminXpConfig[] | null {
  if (!isRecord(data) || !Array.isArray(data.config)) return null;
  const rows: AdminXpConfig[] = [];
  for (const raw of data.config) {
    if (!isRecord(raw) || typeof raw.source !== "string" || typeof raw.description !== "string") return null;
    const xpAmount = requiredInt(raw.xpAmount);
    if (xpAmount == null || typeof raw.enabled !== "boolean") return null;
    rows.push({ source: raw.source, xpAmount: xpAmount, enabled: raw.enabled, description: raw.description });
  }
  return rows;
}

function parseLevelList(data: unknown): AdminLevelRow[] | null {
  if (!isRecord(data) || !Array.isArray(data.levels)) return null;
  const rows: AdminLevelRow[] = [];
  for (const raw of data.levels) {
    if (!isRecord(raw)) return null;
    const level = requiredInt(raw.level);
    const total = requiredInt(raw.totalXpRequired);
    if (level == null || total == null) return null;
    if (raw.title != null && typeof raw.title !== "string") return null;
    if (raw.badgeCode != null && typeof raw.badgeCode !== "string") return null;
    rows.push({
      level,
      totalXpRequired: total,
      title: typeof raw.title === "string" ? raw.title : null,
      badgeCode: typeof raw.badgeCode === "string" ? raw.badgeCode : null,
    });
  }
  return rows;
}

function parseMissionList(data: unknown): AdminMissionRow[] | null {
  if (!isRecord(data) || !Array.isArray(data.missions)) return null;
  const rows: AdminMissionRow[] = [];
  for (const raw of data.missions) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.title !== "string") return null;
    if (typeof raw.metricKey !== "string" || typeof raw.scope !== "string") return null;
    const goal = requiredInt(raw.goalCount);
    const xp = requiredInt(raw.rewardXp);
    const promo = requiredInt(raw.rewardPromoCoins);
    const energy = requiredInt(raw.rewardEnergy);
    const sort = requiredInt(raw.sortOrder ?? 0);
    if (goal == null || xp == null || promo == null || energy == null || sort == null) return null;
    if (typeof raw.enabled !== "boolean") return null;
    rows.push({
      id: raw.id,
      title: raw.title,
      goalCount: goal,
      rewardXp: xp,
      rewardPromoCoins: promo,
      rewardEnergy: energy,
      enabled: raw.enabled,
      metricKey: raw.metricKey,
      scope: raw.scope,
      audience: typeof raw.audience === "string" ? raw.audience : "all_authenticated",
      startsAt: typeof raw.startsAt === "string" ? raw.startsAt : null,
      endsAt: typeof raw.endsAt === "string" ? raw.endsAt : null,
      sortOrder: sort,
    });
  }
  return rows;
}

function parseDailyRewards(data: unknown): { rewards: AdminDailyReward[]; policy: AdminDailyPolicy } | null {
  if (!isRecord(data) || !Array.isArray(data.rewards) || !isRecord(data.policy)) return null;
  const rewards: AdminDailyReward[] = [];
  for (const raw of data.rewards) {
    if (!isRecord(raw)) return null;
    const day = requiredInt(raw.streakDay);
    const xp = requiredInt(raw.rewardXp);
    const promo = requiredInt(raw.rewardPromoCoins);
    if (day == null || xp == null || promo == null) return null;
    rewards.push({
      streakDay: day,
      rewardXp: xp,
      rewardPromoCoins: promo,
      rewardLabel: typeof raw.rewardLabel === "string" ? raw.rewardLabel : null,
    });
  }
  const policy = data.policy;
  if (policy.streakResetPolicy !== "miss_one_day" && policy.streakResetPolicy !== "never") return null;
  if (typeof policy.active !== "boolean") return null;
  return {
    rewards,
    policy: {
      streakResetPolicy: policy.streakResetPolicy,
      effectiveStart: typeof policy.effectiveStart === "string" ? policy.effectiveStart : "",
      effectiveEnd: typeof policy.effectiveEnd === "string" ? policy.effectiveEnd : "",
      active: policy.active,
    },
  };
}

function parseCaps(data: unknown): AdminBattleEnergyCaps | null {
  if (!isRecord(data) || !isRecord(data.caps)) return null;
  const raw = data.caps;
  const ints = [
    "watchAmount",
    "commentAmount",
    "shareAmount",
    "watchCap",
    "commentCap",
    "shareCap",
    "storageCap",
    "sessionCap",
    "dailyCap",
    "minimumBoost",
    "fanEnergyThreshold",
    "boostDurationSec",
  ] as const;
  const parsed: Record<string, number> = {};
  for (const key of ints) {
    const n = requiredInt(raw[key]);
    if (n == null) return null;
    parsed[key] = n;
  }
  if (typeof raw.scoreMultiplier !== "number" || !Number.isFinite(raw.scoreMultiplier)) return null;
  if (!Array.isArray(raw.allowedBoostValues) || typeof raw.enabled !== "boolean") return null;
  const allowed: number[] = [];
  for (const value of raw.allowedBoostValues) {
    const n = requiredInt(value);
    if (n == null) return null;
    allowed.push(n);
  }
  return {
    watchAmount: parsed.watchAmount,
    commentAmount: parsed.commentAmount,
    shareAmount: parsed.shareAmount,
    watchCap: parsed.watchCap,
    commentCap: parsed.commentCap,
    shareCap: parsed.shareCap,
    storageCap: parsed.storageCap,
    sessionCap: parsed.sessionCap,
    dailyCap: parsed.dailyCap,
    minimumBoost: parsed.minimumBoost,
    allowedBoostValues: allowed,
    fanEnergyThreshold: parsed.fanEnergyThreshold,
    scoreMultiplier: raw.scoreMultiplier,
    boostDurationSec: parsed.boostDurationSec,
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
    if (typeof raw.effective !== "boolean" || typeof raw.defaultValue !== "boolean" || typeof raw.envValue !== "boolean") {
      return null;
    }
    if (raw.adminValue != null && typeof raw.adminValue !== "boolean") return null;
    rows.push({
      key: raw.key,
      effective: raw.effective,
      defaultValue: raw.defaultValue,
      envValue: raw.envValue,
      adminValue: typeof raw.adminValue === "boolean" ? raw.adminValue : null,
      lastChangedBy: typeof raw.lastChangedBy === "string" ? raw.lastChangedBy : null,
      lastChangedAt: typeof raw.lastChangedAt === "string" ? raw.lastChangedAt : null,
      reason: typeof raw.reason === "string" ? raw.reason : null,
    });
  }
  return { flags, rows };
}

function parseAuditEntries(data: unknown): AdminProgressionAudit[] | null {
  if (!isRecord(data) || !Array.isArray(data.entries)) return null;
  const rows: AdminProgressionAudit[] = [];
  for (const raw of data.entries) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.adminUserId !== "string") return null;
    if (typeof raw.action !== "string" || typeof raw.target !== "string") return null;
    rows.push({
      id: raw.id,
      adminUserId: raw.adminUserId,
      action: raw.action,
      target: raw.target,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
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
    body: JSON.stringify({ source: row.source, xpAmount: row.xpAmount, enabled: row.enabled }),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionSaveLevel(row: AdminLevelRow): Promise<{ error: string | null }> {
  const { error } = await apiRequest<unknown>("/api/admin/progression/levels", {
    method: "PUT",
    body: JSON.stringify({
      level: row.level,
      totalXpRequired: row.totalXpRequired,
      title: row.title,
      badgeCode: row.badgeCode,
    }),
  });
  return { error: error?.message ?? null };
}

export async function apiAdminProgressionLoadUser(userId: string): Promise<{
  progression: AdminProgressionUser | null;
  xpHistory: AdminXpHistory[];
  starterHistory: AdminStarterHistory[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/admin/progression/users/${encodeURIComponent(userId)}`);
  if (error) return { progression: null, xpHistory: [], starterHistory: [], error: error.message };
  if (!isRecord(data) || !isRecord(data.progression) || !Array.isArray(data.xpHistory) || !Array.isArray(data.starterHistory)) {
    return { progression: null, xpHistory: [], starterHistory: [], error: "Invalid user progression" };
  }
  const starter = requiredInt(data.progression.starterCoinBalance);
  const totalXp = requiredInt(data.progression.totalXp);
  const level = requiredInt(data.progression.currentLevel);
  if (starter == null || totalXp == null || level == null) {
    return { progression: null, xpHistory: [], starterHistory: [], error: "Invalid user progression" };
  }
  const xpHistory: AdminXpHistory[] = [];
  for (const raw of data.xpHistory) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.source !== "string") {
      return { progression: null, xpHistory: [], starterHistory: [], error: "Invalid user progression" };
    }
    const amount = requiredInt(raw.xpAmount);
    if (amount == null) return { progression: null, xpHistory: [], starterHistory: [], error: "Invalid user progression" };
    xpHistory.push({
      id: raw.id,
      xpAmount: amount,
      source: raw.source,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    });
  }
  const starterHistory: AdminStarterHistory[] = [];
  for (const raw of data.starterHistory) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.kind !== "string") {
      return { progression: null, xpHistory: [], starterHistory: [], error: "Invalid user progression" };
    }
    const delta = requiredInt(raw.amountDelta);
    const after = requiredInt(raw.balanceAfter);
    if (delta == null || after == null) {
      return { progression: null, xpHistory: [], starterHistory: [], error: "Invalid user progression" };
    }
    starterHistory.push({ id: raw.id, amountDelta: delta, kind: raw.kind, balanceAfter: after });
  }
  return {
    progression: { starterCoinBalance: starter, totalXp: totalXp, currentLevel: level },
    xpHistory: xpHistory,
    starterHistory: starterHistory,
    error: null,
  };
}

export async function apiAdminProgressionAdjust(
  endpoint: "xp-adjustments" | "starter-adjustments",
  payload: { userId: string; amountDelta: number; reason: string; idempotencyKey: string },
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
    goalCount: number;
    rewardXp: number;
    rewardPromoCoins: number;
    rewardEnergy: number;
    enabled: boolean;
    audience: string;
    sortOrder: number;
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
  streakResetPolicy: "miss_one_day" | "never";
  active: boolean;
  effectiveStart: string | null;
  effectiveEnd: string | null;
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
