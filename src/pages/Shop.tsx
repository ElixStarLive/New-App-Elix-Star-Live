import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, MoreVertical, ShoppingBag, Tag, Trash2, X } from "lucide-react";
import {
  apiCreateShopItem,
  apiDeleteShopItem,
  apiListShopItems,
  apiStartShopCheckout,
  type ShopItem,
} from "@/features/shop/shopApi";
import { apiLiveStreams } from "@/features/feed/feedApi";
import { apiEnsureDmThread } from "@/features/chat/chatApi";
import { useAuthStore } from "@/store/useAuthStore";
import { useShopBasketStore } from "@/store/useShopBasketStore";
import { AvatarRing } from "@/components/AvatarRing";
import { SHOP_EXIT_TO, containerReturnState, exitToFromLocationState, inboxReturnState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "clothing", label: "Clothing" },
  { key: "electronics", label: "Electronics" },
  { key: "accessories", label: "Accessories" },
  { key: "other", label: "Other" },
] as const;

export default function Shop() {
  const navigate = useNavigate();
  const location = useLocation();
  const me = useAuthStore((s) => s.user);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [creating, setCreating] = useState(false);
  const [live, setLive] = useState<Array<{ streamId: string; displayName: string; avatarUrl: string | null }>>([]);
  const lines = useShopBasketStore((s) => s.lines);
  const addToCart = useShopBasketStore((s) => s.add);
  const removeFromCart = useShopBasketStore((s) => s.remove);
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const reload = useCallback(() => {
    setLoading(true);
    void apiListShopItems().then((res) => {
      setLoading(false);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setItems(res.items);
      }
    });
  }, []);

  useEffect(() => {
    reload();
    void apiLiveStreams().then((res) => {
      if (res.streams) {
        setLive(res.streams.map((s) => ({ streamId: s.streamId, displayName: s.displayName, avatarUrl: s.avatarUrl })));
      }
    });
  }, [reload]);

  const visible = items.filter((item) => {
    if (filter === "all") return true;
    const hay = `${item.name} ${item.description}`.toLowerCase();
    return hay.includes(filter);
  });

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        <header className="flex items-center justify-between px-4 pb-2 relative z-20" style={{ paddingTop: "var(--page-header-top)" }}>
          <div className="flex items-center gap-3 z-10">
            <button type="button" onClick={() => navigate("/search", { state: containerReturnState("/shop") })} className="text-[12px] font-bold text-white active:opacity-70">
              Search
            </button>
            <button type="button" onClick={() => navigate("/live")} className="text-[12px] font-bold text-white active:opacity-70">
              Live
            </button>
          </div>
          <h1 className="pointer-events-none text-[16px] font-bold text-white absolute left-1/2 -translate-x-1/2">Shop</h1>
          <button type="button" onClick={() => navigate(exitToFromLocationState(location.state, SHOP_EXIT_TO), { replace: true })} className="relative z-20 p-1" aria-label="Back">
            <X size={18} className="text-[#E6E9EE]" />
          </button>
        </header>

        {live.length > 0 ? (
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-white/60">LIVE now</span>
              <button type="button" onClick={() => navigate("/live")} className="text-[11px] font-bold text-[#F5F5F7]">
                See all
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
              {live.map((u) => (
                <button key={u.streamId} type="button" onClick={() => navigate(`/watch/${u.streamId}`, { state: containerReturnState("/shop") })} className="flex-shrink-0 flex flex-col items-center gap-1" style={{ width: 56 }}>
                  <AvatarRing src={u.avatarUrl} alt={u.displayName} size={56} ringColor="#FF2D55" />
                  <div className="text-[9px] text-white/70 truncate w-full text-center">{u.displayName}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 px-3 py-3 overflow-x-auto no-scrollbar">
          <button type="button" onClick={() => setShowCreate(true)} className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent">
            <span className="elix-silver-red-text">Add products</span>
          </button>
          <button type="button" onClick={() => setShowCart(true)} className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent">
            <span className="elix-silver-red-text">Basket{unitCount > 0 ? ` (${unitCount})` : ""}</span>
          </button>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent ${filter === f.key ? "opacity-100" : "opacity-45"}`}
            >
              <span className="elix-silver-red-text">{f.label}</span>
            </button>
          ))}
        </div>

        {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <Tag size={40} className="text-white/20" />
            <p className="text-white/40 text-sm">No items for sale yet</p>
            <button type="button" onClick={() => setShowCreate(true)} className="mt-2 px-5 py-2 rounded-xl bg-transparent border border-white/30 font-bold text-sm">
              <span className="elix-silver-red-text">Sell Something</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-3 py-2 pb-6">
            {visible.map((item) => {
              const isOwn = item.sellerId === me?.id;
              return (
                <div key={item.id} className="bg-white/5 rounded-2xl overflow-hidden border border-white/5 relative">
                  <div className="relative">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square bg-white/5 flex items-center justify-center">
                        <Tag size={28} className="text-white/20" />
                      </div>
                    )}
                    <div className="absolute top-0 right-0 z-[2] pt-0.5 pr-0.5">
                      <button
                        type="button"
                        onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                        className="p-1.5 rounded-full bg-black/55 border border-white/10"
                        aria-label="Item options"
                      >
                        <MoreVertical size={14} className="text-white" />
                      </button>
                      {menuId === item.id ? (
                        <>
                          <button type="button" className="fixed inset-0 z-[3]" aria-label="Close menu" onClick={() => setMenuId(null)} />
                          <div className="absolute right-0 top-full mt-1 z-[4] min-w-[120px] rounded-xl bg-[#1A1C21] border border-white/15 overflow-hidden">
                            {isOwn ? (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-[#F5F5F7] flex items-center gap-1.5"
                                onClick={() => {
                                  setMenuId(null);
                                  void apiDeleteShopItem(item.id).then((r) => {
                                    if (!r.ok) showToast(r.error);
                                    else reload();
                                  });
                                }}
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-[#F5F5F7] flex items-center gap-1.5"
                                onClick={() => {
                                  setMenuId(null);
                                  if (!item.sellerId) return;
                                  void apiEnsureDmThread(item.sellerId).then((r) => {
                                    if (!r.threadId) showToast(r.error || "Could not open chat");
                                    else navigate(`/inbox/${r.threadId}`, { state: inboxReturnState() });
                                  });
                                }}
                              >
                                <MessageCircle size={12} /> Message
                              </button>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="relative border-t border-white/15 px-2.5 py-2 pr-10">
                    <h3 className="text-sm font-bold text-gold-metallic truncate">{item.name}</h3>
                    <p className="text-base font-extrabold text-white mt-0.5">{item.priceLabel}</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (isOwn) {
                          showToast("This is your listing");
                          return;
                        }
                        addToCart(item);
                        showToast("Added to basket");
                      }}
                      className="absolute right-1.5 top-1/2 z-[2] w-8 h-8 rounded-full bg-black/55 border border-white/10 flex items-center justify-center"
                      style={{ transform: "translateY(calc(-50% + 2mm))" }}
                      aria-label="Add to basket"
                    >
                      <ShoppingBag size={16} className="text-[#F5F5F7]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showCreate ? (
          <div className="fixed inset-0 z-[10050] bg-black/85 flex items-end justify-center" onClick={() => setShowCreate(false)}>
            <div className="w-full max-w-[480px] rounded-t-3xl border border-black p-5 pb-8" style={{ backgroundColor: "var(--elix-bg)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-center pb-3">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              <h3 className="text-gold-metallic font-bold text-base text-center mb-4">Sell an Item</h3>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full bg-white/10 rounded-lg px-3 py-2.5 mb-2 text-sm" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="w-full bg-white/10 rounded-lg px-3 py-2.5 mb-2 text-sm min-h-[72px]" />
              <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price in GBP" inputMode="decimal" className="w-full bg-white/10 rounded-lg px-3 py-2.5 mb-4 text-sm" />
              <button
                type="button"
                disabled={creating}
                className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold"
                onClick={() => {
                  const pence = Math.round(Number(price) * 100);
                  if (!title.trim()) {
                    showToast("Enter a title");
                    return;
                  }
                  setCreating(true);
                  void apiCreateShopItem({ title: title.trim(), description: description.trim(), pricePence: Number.isFinite(pence) ? pence : 0 }).then((r) => {
                    setCreating(false);
                    if (!r.ok) showToast(r.error);
                    else {
                      setShowCreate(false);
                      setTitle("");
                      setDescription("");
                      setPrice("");
                      reload();
                    }
                  });
                }}
              >
                {creating ? "Saving..." : "List item"}
              </button>
            </div>
          </div>
        ) : null}

        {showCart ? (
          <div className="fixed inset-0 z-[10050] bg-black/85 flex items-end justify-center" onClick={() => setShowCart(false)}>
            <div className="w-full max-w-[480px] rounded-t-3xl border border-black p-5 pb-8 min-h-[40vh]" style={{ backgroundColor: "var(--elix-bg)" }} onClick={(e) => e.stopPropagation()}>
              <h3 className="text-gold-metallic font-bold text-base text-center mb-4">Basket</h3>
              {lines.length === 0 ? <p className="text-white/40 text-sm text-center py-8">Basket is empty</p> : null}
              {lines.map((line) => (
                <div key={line.item.id} className="flex items-center gap-3 py-2 border-b border-white/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{line.item.name}</p>
                    <p className="text-[12px] text-white/50">{line.item.priceLabel} × {line.quantity}</p>
                  </div>
                  <button
                    type="button"
                    className="text-[12px] font-bold"
                    onClick={() => {
                      void apiStartShopCheckout(line.item.id).then((r) => {
                        if (!r.ok) showToast(r.error);
                      });
                    }}
                  >
                    Checkout
                  </button>
                  <button type="button" className="text-[12px] text-white/50" onClick={() => removeFromCart(line.item.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
