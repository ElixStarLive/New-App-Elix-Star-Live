import { useEffect, useRef, useState } from "react";
import { DollarSign, Gift, Package, Zap } from "lucide-react";
import { nativePrompt } from "@/components/NativeDialog";
import {
  ADMIN_ECONOMY_BOOSTERS_TITLE,
  ADMIN_ECONOMY_EDIT_PRICE,
  ADMIN_ECONOMY_ERROR,
  ADMIN_ECONOMY_GIFTS_TITLE,
  ADMIN_ECONOMY_INVALID_PRICE,
  ADMIN_ECONOMY_LOADING,
  ADMIN_ECONOMY_PACKAGES_EMPTY,
  ADMIN_ECONOMY_PACKAGES_TITLE,
  ADMIN_ECONOMY_PRICE_EMPTY,
  ADMIN_ECONOMY_PRICE_FAILURE,
  ADMIN_ECONOMY_PRICE_PROMPT_TITLE,
  ADMIN_ECONOMY_PRICE_UPDATED,
  ADMIN_ECONOMY_RARITY_UNAVAILABLE,
  ADMIN_ECONOMY_STATUS_ACTIVE,
  ADMIN_ECONOMY_STATUS_INACTIVE,
  ADMIN_ECONOMY_TITLE,
  adminEconomyPricePrompt,
  parseEconomyGiftPriceInput,
} from "@/content/adminEconomy";
import {
  apiAdminUpdateGiftPrice,
  apiFetchAdminEconomy,
  type AdminEconomy,
  type AdminEconomyGift,
} from "@/features/admin/adminApi";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function AdminEconomy() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const [economy, setEconomy] = useState<AdminEconomy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Record<string, true>>({});
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isAdmin || !userId) {
      setEconomy(null);
      setError(null);
      setReady(false);
      setListLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const ownerId = userId;
    setEconomy(null);
    setError(null);
    setListLoading(true);
    void apiFetchAdminEconomy().then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (useAuthStore.getState().user?.id !== ownerId) return;
      if (useAuthStore.getState().user?.isAdmin !== true) {
        setEconomy(null);
        setError(null);
        setListLoading(false);
        setReady(false);
        return;
      }
      if (result.error || !result.data) {
        setEconomy(null);
        setError(result.error || ADMIN_ECONOMY_ERROR);
        setListLoading(false);
        setReady(true);
        return;
      }
      setEconomy(result.data);
      setError(null);
      setListLoading(false);
      setReady(true);
    });
  }, [isAdmin, userId]);

  const setPending = (giftId: string, pending: boolean) => {
    setPendingIds((current) => {
      if (pending) return { ...current, [giftId]: true };
      const next = { ...current };
      delete next[giftId];
      return next;
    });
  };

  const applyAuthoritativeGift = (gift: AdminEconomyGift) => {
    setEconomy((current) =>
      current
        ? {
            ...current,
            gifts: current.gifts.map((row) => (row.id === gift.id ? gift : row)),
          }
        : current,
    );
  };

  const handleEditPrice = async (gift: AdminEconomyGift) => {
    if (pendingIds[gift.id]) return;
    const entered = await nativePrompt(
      adminEconomyPricePrompt(gift.name),
      String(gift.coin_cost),
      ADMIN_ECONOMY_PRICE_PROMPT_TITLE,
    );
    if (!entered) return;
    const parsed = parseEconomyGiftPriceInput(entered);
    if (parsed == null) {
      showToast(ADMIN_ECONOMY_INVALID_PRICE);
      return;
    }
    if (pendingIds[gift.id]) return;
    if (useAuthStore.getState().user?.isAdmin !== true) return;
    setPending(gift.id, true);
    const result = await apiAdminUpdateGiftPrice(gift.id, parsed);
    if (useAuthStore.getState().user?.isAdmin !== true) {
      setPending(gift.id, false);
      return;
    }
    if (!result.ok) {
      showToast(ADMIN_ECONOMY_PRICE_FAILURE);
      setPending(gift.id, false);
      return;
    }
    applyAuthoritativeGift(result.gift);
    const refresh = await apiFetchAdminEconomy();
    if (useAuthStore.getState().user?.isAdmin !== true) {
      setPending(gift.id, false);
      return;
    }
    if (!refresh.error && refresh.data) {
      setEconomy(refresh.data);
      setError(null);
    }
    showToast(ADMIN_ECONOMY_PRICE_UPDATED);
    setPending(gift.id, false);
  };

  if (!ready && listLoading) {
    return (
      <div className="min-h-screen elix-page-glass bg-transparent flex items-center justify-center text-white" aria-busy="true">
        {ADMIN_ECONOMY_LOADING}
      </div>
    );
  }

  return (
    <div className="min-h-screen elix-page-glass bg-transparent text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-white" />
          {ADMIN_ECONOMY_TITLE}
        </h1>

        {error ? (
          <p role="alert" className="text-sm text-rose-300 mb-6">
            {error}
          </p>
        ) : listLoading || !economy ? (
          <p className="text-white" aria-busy="true">
            {ADMIN_ECONOMY_LOADING}
          </p>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Package className="w-6 h-6 text-white" />
                {ADMIN_ECONOMY_PACKAGES_TITLE} ({economy.packages.length})
              </h2>
              <div className="bg-transparent rounded-lg overflow-hidden">
                {economy.packages.length === 0 ? (
                  <p className="text-gray-400 p-6">{ADMIN_ECONOMY_PACKAGES_EMPTY}</p>
                ) : (
                  <table className="w-full">
                    <thead className="bg-[rgba(255,255,255,0.06)]">
                      <tr>
                        <th className="px-4 py-3 text-left">Package</th>
                        <th className="px-4 py-3 text-left">Coins</th>
                        <th className="px-4 py-3 text-left">Price</th>
                        <th className="px-4 py-3 text-left">Product ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {economy.packages.map((pkg) => (
                        <tr key={pkg.id} className="hover:bg-[rgba(255,255,255,0.06)]">
                          <td className="px-4 py-3 font-semibold">{pkg.title}</td>
                          <td className="px-4 py-3">{pkg.coins.toLocaleString()}</td>
                          <td className="px-4 py-3">{pkg.price_display || ADMIN_ECONOMY_PRICE_EMPTY}</td>
                          <td className="px-4 py-3 text-gray-400 text-sm">{pkg.product_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Gift className="w-6 h-6 text-pink-500" />
                {ADMIN_ECONOMY_GIFTS_TITLE} ({economy.gifts.length})
              </h2>
              <div className="bg-transparent rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-[rgba(255,255,255,0.06)]">
                    <tr>
                      <th className="px-4 py-3 text-left">Gift</th>
                      <th className="px-4 py-3 text-left">Rarity</th>
                      <th className="px-4 py-3 text-left">Price (Coins)</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {economy.gifts.map((gift) => (
                      <tr key={gift.id} className="hover:bg-[rgba(255,255,255,0.06)]">
                        <td className="px-4 py-3 font-semibold">{gift.name}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-[#FFFFFF] rounded text-xs">
                            {ADMIN_ECONOMY_RARITY_UNAVAILABLE}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white font-bold">{gift.coin_cost}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              gift.is_active ? "bg-[#E6E9EE] elix-accent" : "bg-[rgba(255,255,255,0.06)]"
                            }`}
                          >
                            {gift.is_active ? ADMIN_ECONOMY_STATUS_ACTIVE : ADMIN_ECONOMY_STATUS_INACTIVE}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={Boolean(pendingIds[gift.id])}
                            aria-label={`${ADMIN_ECONOMY_EDIT_PRICE} ${gift.name}`}
                            onClick={() => void handleEditPrice(gift)}
                            className="px-3 py-1 bg-[#E6E9EE] text-white elix-accent rounded hover:bg-[#E6E9EE]/90 text-sm"
                          >
                            {ADMIN_ECONOMY_EDIT_PRICE}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Zap className="w-6 h-6 text-white" />
                {ADMIN_ECONOMY_BOOSTERS_TITLE} ({economy.boosters.length})
              </h2>
              <div className="bg-transparent rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-[rgba(255,255,255,0.06)]">
                    <tr>
                      <th className="px-4 py-3 text-left">Booster</th>
                      <th className="px-4 py-3 text-left">Effect</th>
                      <th className="px-4 py-3 text-left">Price (Coins)</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {economy.boosters.map((booster) => (
                      <tr key={booster.id} className="hover:bg-[rgba(255,255,255,0.06)]">
                        <td className="px-4 py-3 font-semibold">{booster.name}</td>
                        <td className="px-4 py-3 text-gray-400">{booster.effect_type}</td>
                        <td className="px-4 py-3 text-white font-bold">{booster.coin_cost}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              booster.is_active ? "bg-[#E6E9EE] elix-accent" : "bg-[rgba(255,255,255,0.06)]"
                            }`}
                          >
                            {booster.is_active ? ADMIN_ECONOMY_STATUS_ACTIVE : ADMIN_ECONOMY_STATUS_INACTIVE}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
