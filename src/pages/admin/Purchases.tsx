import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DollarSign } from "lucide-react";
import {
  ADMIN_PURCHASES_BACK,
  ADMIN_PURCHASES_COL_AMOUNT,
  ADMIN_PURCHASES_COL_DETAIL,
  ADMIN_PURCHASES_COL_USER,
  ADMIN_PURCHASES_COL_WHEN,
  ADMIN_PURCHASES_EMPTY,
  ADMIN_PURCHASES_ERROR,
  ADMIN_PURCHASES_LOADING,
  ADMIN_PURCHASES_SUBTITLE,
  ADMIN_PURCHASES_TAB_IAP,
  ADMIN_PURCHASES_TAB_SHOP,
  ADMIN_PURCHASES_TITLE,
  formatAdminPurchaseId,
  formatAdminPurchasePence,
  formatAdminPurchaseWhen,
  type AdminPurchaseTab,
} from "@/content/adminPurchases";
import {
  apiFetchAdminIapPurchases,
  apiFetchAdminShopPurchases,
  type AdminIapPurchase,
  type AdminShopPurchase,
} from "@/features/admin/adminApi";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function AdminPurchases() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const [tab, setTab] = useState<AdminPurchaseTab>("iap");
  const [iapRows, setIapRows] = useState<AdminIapPurchase[] | null>(null);
  const [shopRows, setShopRows] = useState<AdminShopPurchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isAdmin || !userId) {
      setIapRows(null);
      setShopRows(null);
      setError(null);
      setReady(false);
      setListLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const ownerId = userId;
    const source = tab;
    setError(null);
    setListLoading(true);
    const fetchRows = source === "iap" ? apiFetchAdminIapPurchases() : apiFetchAdminShopPurchases();
    void fetchRows.then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (useAuthStore.getState().user?.id !== ownerId) return;
      if (useAuthStore.getState().user?.isAdmin !== true) {
        setIapRows(null);
        setShopRows(null);
        setError(null);
        setListLoading(false);
        setReady(false);
        return;
      }
      if (result.error || !result.data) {
        const message = result.error || ADMIN_PURCHASES_ERROR;
        showToast(message);
        if (source === "iap") {
          setIapRows((prev) => {
            if (!prev || prev.length === 0) setError(message);
            return prev;
          });
        } else {
          setShopRows((prev) => {
            if (!prev || prev.length === 0) setError(message);
            return prev;
          });
        }
        setListLoading(false);
        setReady(true);
        return;
      }
      if (source === "iap") {
        setIapRows(result.data as AdminIapPurchase[]);
      } else {
        setShopRows(result.data as AdminShopPurchase[]);
      }
      setError(null);
      setListLoading(false);
      setReady(true);
    });
  }, [isAdmin, userId, tab]);

  if (!isAdmin || !userId) {
    return null;
  }

  if (!ready && listLoading) {
    return (
      <div className="min-h-screen elix-page-glass bg-transparent flex items-center justify-center text-white" aria-busy="true">
        {ADMIN_PURCHASES_LOADING}
      </div>
    );
  }

  const rows = tab === "iap" ? iapRows : shopRows;

  return (
    <div className="min-h-screen elix-page-glass bg-transparent text-white p-6">
      <div className="max-w-5xl mx-auto">
        <button type="button" className="text-white/50 text-sm mb-4" onClick={() => navigate("/admin", { replace: true })}>
          {ADMIN_PURCHASES_BACK}
        </button>
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <DollarSign className="w-7 h-7 text-[#F5F5F7]" />
          {ADMIN_PURCHASES_TITLE}
        </h1>
        <p className="text-sm text-white/50 mb-4">{ADMIN_PURCHASES_SUBTITLE}</p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            aria-pressed={tab === "iap"}
            onClick={() => setTab("iap")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              tab === "iap" ? "bg-[#E6E9EE] text-white elix-accent" : "bg-white/10"
            }`}
          >
            {ADMIN_PURCHASES_TAB_IAP}
          </button>
          <button
            type="button"
            aria-pressed={tab === "shop"}
            onClick={() => setTab("shop")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              tab === "shop" ? "bg-[#E6E9EE] text-white elix-accent" : "bg-white/10"
            }`}
          >
            {ADMIN_PURCHASES_TAB_SHOP}
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-red-400 text-sm">
            {error}
          </p>
        ) : listLoading || !rows ? (
          <p className="text-white/50" aria-busy="true">
            {ADMIN_PURCHASES_LOADING}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-white/40 text-sm">{ADMIN_PURCHASES_EMPTY}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 text-white/50">
                <tr>
                  <th className="p-2">{ADMIN_PURCHASES_COL_WHEN}</th>
                  <th className="p-2">{ADMIN_PURCHASES_COL_USER}</th>
                  <th className="p-2">{ADMIN_PURCHASES_COL_DETAIL}</th>
                  <th className="p-2">{ADMIN_PURCHASES_COL_AMOUNT}</th>
                </tr>
              </thead>
              <tbody>
                {tab === "iap"
                  ? (rows as AdminIapPurchase[]).map((row) => (
                      <tr key={row.id} className="border-t border-white/5">
                        <td className="p-2 text-white/60 whitespace-nowrap">{formatAdminPurchaseWhen(row.createdAt)}</td>
                        <td className="p-2 font-mono text-white/70">{formatAdminPurchaseId(row.userId)}</td>
                        <td className="p-2 text-white/70 break-all">
                          {row.productId} · {row.provider} · {row.status}
                        </td>
                        <td className="p-2 tabular-nums text-[#F5F5F7]">{String(row.coins)}</td>
                      </tr>
                    ))
                  : (rows as AdminShopPurchase[]).map((row) => (
                      <tr key={row.id} className="border-t border-white/5">
                        <td className="p-2 text-white/60 whitespace-nowrap">{formatAdminPurchaseWhen(row.createdAt)}</td>
                        <td className="p-2 font-mono text-white/70">
                          {formatAdminPurchaseId(row.userId || row.stripeSessionId)}
                        </td>
                        <td className="p-2 text-white/70 break-all">
                          {row.itemId} · {row.status}
                        </td>
                        <td className="p-2 tabular-nums text-[#F5F5F7]">{formatAdminPurchasePence(row.amountPence)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
