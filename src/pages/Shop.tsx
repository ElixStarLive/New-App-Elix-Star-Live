import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Camera, ChevronLeft, ChevronRight, MessageCircle, MoreVertical, Pencil, Tag, Trash2 } from "lucide-react";
import { RoyceBackIcon, ShopBasketIcon } from "@/components/royce";
import { StoryGoldRingAvatar } from "@/components/StoryGoldRingAvatar";
import { apiEnsureDmThread } from "@/features/chat/chatApi";
import { apiLiveStreams } from "@/features/feed/feedApi";
import {
  apiCreateShopItem,
  apiDeleteShopItem,
  apiGetShopItem,
  apiListShopItems,
  apiShopCheckout,
  apiShopCheckoutSessionStatus,
  apiUpdateShopItem,
  apiUploadShopImage,
  canonicalShopRouteItemId,
  openShopStripeCheckout,
  selectShopItemByCanonicalId,
  type ShopItem,
} from "@/features/shop/shopApi";
import {
  SHOP_EXIT_TO,
  SHOP_HOME,
  containerReturnState,
  inboxReturnState,
  returnToFromLocationState,
} from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { wsClient } from "@/lib/wsClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useShopBasketStore } from "@/store/useShopBasketStore";

const SHOP_LIVE_RING = 56;
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
  const params = useParams<{ itemId?: string }>();
  const routeItemId = canonicalShopRouteItemId(params.itemId);
  const user = useAuthStore((s) => s.user);
  const [catalog, setCatalog] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [liveUsers, setLiveUsers] = useState<Array<{ id: string; name: string; avatar: string; roomId: string }>>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const [newImage, setNewImage] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [imgScale, setImgScale] = useState(1);
  const [imgX, setImgX] = useState(0);
  const [imgY, setImgY] = useState(0);
  const [imageTouched, setImageTouched] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const fetchGen = useRef(0);
  const cartItems = useShopBasketStore((s) => s.items);
  const addToCart = useShopBasketStore((s) => s.add);
  const removeFromCart = useShopBasketStore((s) => s.remove);
  const setCartQuantity = useShopBasketStore((s) => s.setQuantity);
  const clearCart = useShopBasketStore((s) => s.clear);
  const cartUnitCount = useShopBasketStore((s) => s.totalUnits());
  const [showCart, setShowCart] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const checkoutInFlightRef = useRef(false);
  const checkoutIdempotencyKeyRef = useRef<string | null>(null);
  const cartTotal = cartItems.reduce(
    (sum, line) => sum + (Number(line.price) || 0) * Math.max(1, Math.floor(Number(line.quantity) || 1)),
    0,
  );

  const items = useMemo(() => {
    if (routeItemId) {
      const selected = selectShopItemByCanonicalId(catalog, routeItemId);
      return selected ? [selected] : [];
    }
    if (activeFilter === "all") return catalog;
    return catalog.filter((item) => item.category === activeFilter);
  }, [catalog, routeItemId, activeFilter]);

  const goBack = useCallback(() => {
    if (routeItemId) {
      navigate(SHOP_HOME, { replace: true, state: location.state });
      return;
    }
    navigate(returnToFromLocationState(location.state) || SHOP_EXIT_TO, { replace: true });
  }, [navigate, location.state, routeItemId]);

  const resetImageFrame = useCallback(() => {
    setImgScale(1);
    setImgX(0);
    setImgY(0);
    panRef.current = null;
    setImageTouched(false);
  }, []);

  const clearListingForm = useCallback(() => {
    setShowCreate(false);
    setEditingItemId(null);
    setExistingImageUrl(null);
    setNewTitle("");
    setNewDescription("");
    setNewPrice("");
    setNewCategory("other");
    setNewImage(null);
    setNewImagePreview(null);
    resetImageFrame();
  }, [resetImageFrame]);

  const openCreateListing = useCallback(() => {
    setShowCart(false);
    clearListingForm();
    setShowCreate(true);
  }, [clearListingForm]);

  const fetchItems = useCallback(async () => {
    const gen = ++fetchGen.current;
    setLoading(true);
    if (routeItemId) {
      const res = await apiGetShopItem(routeItemId);
      if (gen !== fetchGen.current) return;
      if (res.error) {
        const message = !navigator.onLine ? "No internet connection" : res.error || "Failed to load shop items";
        showToast(message);
        setLoadError(message);
        setCatalog([]);
        setLoading(false);
        return;
      }
      setLoadError(null);
      setCatalog(res.item ? [res.item] : []);
      setLoading(false);
      return;
    }
    const res = await apiListShopItems();
    if (gen !== fetchGen.current) return;
    if (res.error) {
      const message = !navigator.onLine ? "No internet connection" : res.error || "Failed to load shop items";
      showToast(message);
      setLoadError(message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setCatalog(res.items);
    setLoading(false);
  }, [routeItemId]);

  useEffect(() => {
    void fetchItems();
  }, [activeFilter, fetchItems]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLive = () => {
      void apiLiveStreams().then((res) => {
        if (cancelled || res.error || !res.streams) return;
        setLiveUsers(
          res.streams.slice(0, 25).map((stream) => ({
            id: stream.hostId,
            name: stream.displayName,
            avatar: stream.avatarUrl || "",
            roomId: stream.roomId,
          })),
        );
      });
    };
    loadLive();
    const onLiveChange = () => loadLive();
    wsClient.on("stream_started", onLiveChange);
    wsClient.on("stream_ended", onLiveChange);
    return () => {
      cancelled = true;
      wsClient.off("stream_started", onLiveChange);
      wsClient.off("stream_ended", onLiveChange);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get("purchase");
    const sessionId = params.get("session_id");
    if (purchase === "cancelled") {
      checkoutInFlightRef.current = false;
      checkoutIdempotencyKeyRef.current = null;
      setCheckingOut(false);
      showToast("Checkout cancelled");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (purchase !== "success") return;
    let cancelled = false;
    void (async () => {
      if (!sessionId) {
        checkoutInFlightRef.current = false;
        checkoutIdempotencyKeyRef.current = null;
        setCheckingOut(false);
        showToast("Checkout return incomplete — check email/orders if you paid");
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
      const status = await apiShopCheckoutSessionStatus(sessionId);
      if (cancelled) return;
      checkoutInFlightRef.current = false;
      checkoutIdempotencyKeyRef.current = null;
      setCheckingOut(false);
      if (status.error) {
        showToast(status.error);
      } else if (status.paid) {
        clearCart();
        setShowCart(false);
        showToast("Payment confirmed");
      } else {
        showToast(
          `Checkout returned — payment status: ${status.paymentStatus || "pending"}. Cart kept until payment confirms.`,
        );
      }
      window.history.replaceState({}, "", window.location.pathname);
    })();
    return () => {
      cancelled = true;
    };
  }, [clearCart]);

  const handleImageSelect = (file: File | undefined) => {
    if (!file) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setNewImage(file);
    setNewImagePreview(url);
    resetImageFrame();
    setImageTouched(true);
  };

  const bakeFramedImage = useCallback(async (): Promise<File | null> => {
    const frame = previewFrameRef.current;
    const img = previewImgRef.current;
    if (!frame || !img) return null;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (fw < 2 || fh < 2 || nw < 1 || nh < 1) return null;
    const outScale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(fw * outScale));
    canvas.height = Math.max(2, Math.round(fh * outScale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#080A0E";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cover = Math.max(fw / nw, fh / nh);
    const drawW = nw * cover * imgScale;
    const drawH = nh * cover * imgScale;
    const dx = (fw - drawW) / 2 + imgX;
    const dy = (fh - drawH) / 2 + imgY;
    ctx.drawImage(img, dx * outScale, dy * outScale, drawW * outScale, drawH * outScale);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return null;
    const base = newImage?.name?.replace(/\.[^.]+$/, "") || "shop";
    return new File([blob], `${base}-framed.jpg`, { type: "image/jpeg" });
  }, [imgScale, imgX, imgY, newImage]);

  const handleCreateListing = async () => {
    if (!user?.id || !newTitle.trim() || !newPrice.trim()) {
      showToast("Please fill in title and price");
      return;
    }
    const parsed = Number.parseFloat(newPrice);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      showToast("Invalid price");
      return;
    }
    setCreating(true);
    let imageUrl: string | null = editingItemId ? existingImageUrl : null;
    if (newImage || (imageTouched && newImagePreview)) {
      const framed = await bakeFramedImage();
      const uploadFile = framed || newImage;
      if (uploadFile) {
        const uploaded = await apiUploadShopImage(uploadFile, uploadFile.name);
        if (uploaded.imageUrl) imageUrl = uploaded.imageUrl;
        else showToast("Image upload failed, keeping previous photo");
      }
    }
    const payload = {
      title: newTitle.trim(),
      description: newDescription.trim(),
      pricePence: Math.round(parsed * 100),
      imageUrl,
      category: newCategory,
    };
    const result = editingItemId
      ? await apiUpdateShopItem(editingItemId, payload)
      : await apiCreateShopItem(payload);
    setCreating(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(editingItemId ? "Item updated" : "Item listed!");
    clearListingForm();
    void fetchItems();
  };

  const handleCheckoutCart = async () => {
    if (cartItems.length === 0 || checkingOut || checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    setCheckingOut(true);
    if (!checkoutIdempotencyKeyRef.current) {
      checkoutIdempotencyKeyRef.current =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `shop_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    }
    const result = await apiShopCheckout({
      items: cartItems.map((line) => ({
        id: line.id,
        quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
      })),
      idempotencyKey: checkoutIdempotencyKeyRef.current,
    });
    if (result.error || !result.url) {
      checkoutInFlightRef.current = false;
      checkoutIdempotencyKeyRef.current = null;
      setCheckingOut(false);
      showToast(result.error || "Could not start checkout");
      return;
    }
    const opened = await openShopStripeCheckout(result.url);
    if (!opened.ok) {
      checkoutInFlightRef.current = false;
      checkoutIdempotencyKeyRef.current = null;
      setCheckingOut(false);
      showToast(opened.error);
    }
  };

  const dismissCart = useCallback(() => {
    setShowCart(false);
    if (checkingOut || checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = false;
    checkoutIdempotencyKeyRef.current = null;
    setCheckingOut(false);
  }, [checkingOut]);

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        <header className="flex items-center justify-between px-4 pt-page-header pb-2 relative z-20">
          <div className="flex items-center gap-3 z-10">
            <button
              type="button"
              onClick={() => navigate("/search", { state: containerReturnState("/shop") })}
              className="text-[12px] font-bold text-white active:opacity-70"
              title="Search"
              aria-label="Search"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => navigate("/live")}
              className="text-[12px] font-bold text-white active:opacity-70"
              title="Live"
              aria-label="Live"
            >
              Live
            </button>
          </div>
          <h1 className="pointer-events-none text-[16px] font-bold text-white absolute left-1/2 -translate-x-1/2">Shop</h1>
          <button type="button" onClick={goBack} className="relative z-20 p-1" title="Back" aria-label="Back">
            <RoyceBackIcon />
          </button>
        </header>

        {liveUsers.length > 0 ? (
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-white/60">LIVE now</span>
              <button type="button" onClick={() => navigate("/live")} className="text-[11px] font-bold text-[#F5F5F7]">
                See all
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar py-1">
              {liveUsers.map((u) => (
                <button
                  key={u.roomId}
                  type="button"
                  onClick={() => navigate(`/watch/${u.roomId}`, { state: containerReturnState("/shop") })}
                  className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  style={{ width: SHOP_LIVE_RING, minWidth: SHOP_LIVE_RING }}
                  title={u.name}
                >
                  <StoryGoldRingAvatar size={SHOP_LIVE_RING} live src={u.avatar || ""} alt={u.name} />
                  <div className="text-[9px] text-white/70 truncate w-full text-center">{u.name}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 px-3 py-3 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={openCreateListing}
            className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent"
          >
            <span className="elix-silver-red-text">Add products</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreate(false);
              setShowCart(true);
            }}
            className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent"
          >
            <span className="elix-silver-red-text">Basket{cartUnitCount > 0 ? ` (${cartUnitCount})` : ""}</span>
          </button>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent transition-opacity ${
                activeFilter === f.key ? "opacity-100" : "opacity-45"
              }`}
            >
              <span className="elix-silver-red-text">{f.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          </div>
        ) : loadError && catalog.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-rose-300 text-sm text-center px-4">{loadError}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <Tag size={40} className="text-white/20" />
            <p className="text-white/40 text-sm">
              {routeItemId ? "Item not available" : "No items for sale yet"}
            </p>
            {!routeItemId ? (
              <button
                type="button"
                onClick={openCreateListing}
                className="mt-2 px-5 py-2 rounded-xl bg-transparent border border-white/30 font-bold text-sm active:opacity-70"
              >
                <span className="elix-silver-red-text">Sell Something</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-3 py-2 pb-6 overflow-y-auto">
            {items.map((item) => {
              const isOwn = item.sellerId === user?.id;
              const menuOpen = menuItemId === item.id;
              return (
                <div
                  key={item.id}
                  className="bg-white/5 rounded-2xl overflow-hidden border border-white/5 relative"
                  onClick={() => {
                    if (routeItemId === item.id) return;
                    navigate(`${SHOP_HOME}/${item.id}`);
                  }}
                >
                  <div className="relative">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square bg-white/5 flex items-center justify-center">
                        <Tag size={28} className="text-white/20" />
                      </div>
                    )}
                    <div className="absolute top-0 right-0 z-[2] pt-0.5 pr-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuItemId(menuOpen ? null : item.id);
                        }}
                        className="p-1.5 rounded-full bg-black/55 border border-white/10"
                        aria-label="Item options"
                      >
                        <MoreVertical size={14} className="text-white" />
                      </button>
                      {menuOpen ? (
                        <>
                          <button type="button" className="fixed inset-0 z-[3]" aria-label="Close menu" onClick={() => setMenuItemId(null)} />
                          <div className="absolute right-0 top-full mt-1 z-[4] min-w-[120px] rounded-xl bg-[#1A1C21] border border-white/15 shadow-lg overflow-hidden">
                            {isOwn ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuItemId(null);
                                    setShowCart(false);
                                    setEditingItemId(item.id);
                                    setExistingImageUrl(item.imageUrl);
                                    setNewTitle(item.title);
                                    setNewDescription(item.description);
                                    setNewPrice(String(item.price));
                                    setNewCategory(item.category || "other");
                                    setNewImage(null);
                                    setNewImagePreview(item.imageUrl);
                                    resetImageFrame();
                                    setShowCreate(true);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs font-semibold text-[#F5F5F7] hover:bg-white/5 flex items-center gap-1.5"
                                >
                                  <Pencil size={12} className="text-[#F5F5F7]" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={removingId === item.id}
                                  onClick={() => {
                                    if (!user?.id || item.sellerId !== user.id) {
                                      showToast("You can only delete your own listings");
                                      setMenuItemId(null);
                                      return;
                                    }
                                    setRemovingId(item.id);
                                    setMenuItemId(null);
                                    void apiDeleteShopItem(item.id).then((res) => {
                                      setRemovingId(null);
                                      if (!res.ok) showToast(res.error);
                                      else {
                                        setCatalog((prev) => prev.filter((row) => row.id !== item.id));
                                        showToast("Item deleted");
                                      }
                                    });
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs font-semibold text-[#F5F5F7] hover:bg-white/5 flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  <Trash2 size={12} className="text-[#F5F5F7]" />
                                  {removingId === item.id ? "Deleting…" : "Delete"}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuItemId(null);
                                  void apiEnsureDmThread(item.sellerId).then((res) => {
                                    if (!res.threadId) showToast(res.error || "Failed to contact seller");
                                    else navigate(`/inbox/${res.threadId}`, { state: inboxReturnState() });
                                  });
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-[#F5F5F7] hover:bg-white/5 flex items-center gap-1.5"
                              >
                                <MessageCircle size={12} className="text-[#F5F5F7]" />
                                Message
                              </button>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="relative border-t border-white/15 px-2.5 py-2 pr-10">
                    <h3 className="text-sm font-bold text-gold-metallic truncate">{item.title}</h3>
                    <p className="text-base font-extrabold text-white mt-0.5">£{item.price.toFixed(2)}</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isOwn) {
                          showToast("You can't add your own listing to basket");
                          return;
                        }
                        const added = addToCart({
                          id: item.id,
                          title: item.title,
                          price: item.price,
                          imageUrl: item.imageUrl,
                        });
                        if (!added.ok) {
                          showToast(added.error);
                          return;
                        }
                        const qty = useShopBasketStore.getState().items.find((line) => line.id === item.id)?.quantity ?? 1;
                        showToast(qty > 1 ? `Basket: ${qty}` : "Added to basket");
                      }}
                      className="absolute right-1.5 top-1/2 z-[2] w-8 h-8 rounded-full bg-black/55 border border-white/10 flex items-center justify-center active:opacity-70"
                      style={{ transform: "translateY(calc(-50% + 2mm))" }}
                      aria-label="Add to basket"
                    >
                      <ShopBasketIcon size={16} className="text-[#F5F5F7]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showCreate ? (
          <>
            <div className="fixed inset-0 z-[10050] bg-black/85" onClick={clearListingForm} aria-hidden />
            <div
              className="fixed left-0 right-0 z-[10051] pointer-events-auto max-w-[480px] mx-auto fixed-above-bottom-nav top-[var(--safe-top,0px)] bottom-[var(--bottom-nav-top)] flex flex-col justify-end"
              onClick={clearListingForm}
            >
              <div
                className="w-full elix-panel rounded-t-3xl pb-safe border border-black flex flex-col min-h-0"
                style={{
                  maxHeight: "85dvh",
                  height: "85dvh",
                  backgroundColor: "var(--elix-bg)",
                  backgroundImage: "var(--elix-page-fill)",
                  backgroundSize: "var(--elix-fundal-size), var(--elix-fundal-size)",
                  backgroundPosition: "var(--elix-fundal-position), var(--elix-fundal-position)",
                  backgroundRepeat: "no-repeat, no-repeat",
                }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={editingItemId ? "Edit item" : "Sell an Item"}
              >
                <div className="flex items-center justify-center pt-3 pb-1 shrink-0">
                  <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>
                <div className="flex items-center justify-center px-5 pb-3 shrink-0">
                  <h3 className="text-gold-metallic font-bold text-base">{editingItemId ? "Edit Item" : "Sell an Item"}</h3>
                </div>
                <div className="overflow-y-auto px-5 pb-6 flex-1 min-h-0">
                  <div className="mb-4">
                    <div
                      ref={previewFrameRef}
                      className="w-full aspect-video rounded-xl border-2 border-dashed border-[#D8D9DD]/40 bg-black/40 flex flex-col items-center justify-center gap-2 overflow-hidden relative touch-none"
                      onPointerDown={(e) => {
                        if (!newImagePreview) return;
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        panRef.current = {
                          pointerId: e.pointerId,
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: imgX,
                          origY: imgY,
                        };
                      }}
                      onPointerMove={(e) => {
                        const pan = panRef.current;
                        if (!pan || pan.pointerId !== e.pointerId) return;
                        setImgX(pan.origX + (e.clientX - pan.startX));
                        setImgY(pan.origY + (e.clientY - pan.startY));
                        setImageTouched(true);
                      }}
                      onPointerUp={(e) => {
                        if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
                      }}
                      onPointerCancel={(e) => {
                        if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
                      }}
                    >
                      {newImagePreview ? (
                        <img
                          ref={previewImgRef}
                          src={newImagePreview}
                          alt="Preview"
                          draggable={false}
                          className="absolute left-1/2 top-1/2 w-full h-full object-cover pointer-events-none select-none"
                          style={{
                            transform: `translate(calc(-50% + ${imgX}px), calc(-50% + ${imgY}px)) scale(${imgScale})`,
                            transformOrigin: "center center",
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => document.getElementById("shop-image-input")?.click()}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                        >
                          <Camera size={28} className="text-[#F5F5F7]/50" />
                          <span className="text-white/40 text-xs">Add Photo</span>
                        </button>
                      )}
                    </div>
                    {newImagePreview ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-white/40 text-[10px] font-semibold shrink-0">Size</span>
                        <input
                          type="range"
                          min={0.4}
                          max={2}
                          step={0.05}
                          value={imgScale}
                          onChange={(e) => {
                            setImgScale(Number(e.target.value));
                            setImageTouched(true);
                          }}
                          className="flex-1 accent-[#D8D9DD]"
                          aria-label="Photo size"
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById("shop-image-input")?.click()}
                          className="shrink-0 text-[10px] font-semibold text-[#F5F5F7]/70 px-2 py-1 rounded-lg bg-white/5 border border-white/10"
                        >
                          Change
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <input
                    id="shop-image-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-label="Upload item photo"
                    onChange={(e) => handleImageSelect(e.target.files?.[0])}
                  />
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Item name"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 mb-3 focus:outline-none focus:border-[#D8D9DD]"
                  />
                  <input
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="Price (£)"
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 mb-3 focus:outline-none focus:border-[#D8D9DD]"
                  />
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 mb-3 focus:outline-none focus:border-[#D8D9DD] resize-none"
                  />
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-4 focus:outline-none focus:border-[#D8D9DD] [&>option]:bg-[#1A1C21] [&>option]:text-white"
                    aria-label="Category"
                  >
                    <option value="clothing">Clothing</option>
                    <option value="electronics">Electronics</option>
                    <option value="accessories">Accessories</option>
                    <option value="other">Other</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleCreateListing()}
                    disabled={creating || !newTitle.trim() || !newPrice.trim()}
                    className="w-full py-3 rounded-xl bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold text-sm disabled:opacity-50"
                  >
                    {creating ? (editingItemId ? "Saving..." : "Listing...") : editingItemId ? "Save changes" : "List for Sale"}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {showCart ? (
          <>
            <div
              className="fixed inset-0 z-[10050] bg-black/70"
              onClick={dismissCart}
            />
            <div
              className="fixed left-0 right-0 z-[10051] pointer-events-auto max-w-[480px] mx-auto fixed-above-bottom-nav"
              onClick={dismissCart}
            >
              <div
                className="w-full rounded-t-3xl pb-safe border border-black overflow-hidden"
                style={{
                  maxHeight: "80dvh",
                  backgroundColor: "var(--elix-bg)",
                  backgroundImage: "var(--elix-fundal-image)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>
                <div className="relative flex items-center justify-center px-5 pb-3 min-h-[2rem]">
                  <h3 className="text-gold-metallic font-bold text-base">Your basket</h3>
                  {cartItems.length === 1 ? (
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const qty = Math.max(1, Math.floor(Number(cartItems[0]!.quantity) || 1));
                          if (qty <= 1) removeFromCart(cartItems[0]!.id);
                          else setCartQuantity(cartItems[0]!.id, qty - 1);
                        }}
                        className="w-7 h-7 rounded-full bg-[#1A1C21] border border-white/15 flex items-center justify-center active:opacity-70"
                        aria-label={`Less ${cartItems[0]!.title}`}
                      >
                        <ChevronLeft size={16} className="text-[#F5F5F7]" />
                      </button>
                      <span className="min-w-[1.5rem] text-center text-xs font-bold text-[#F5F5F7] tabular-nums">
                        {Math.max(1, Math.floor(Number(cartItems[0]!.quantity) || 1))}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCartQuantity(cartItems[0]!.id, Math.max(1, Math.floor(Number(cartItems[0]!.quantity) || 1)) + 1)
                        }
                        className="w-7 h-7 rounded-full bg-[#1A1C21] border border-white/15 flex items-center justify-center active:opacity-70"
                        aria-label={`More ${cartItems[0]!.title}`}
                        disabled={Math.max(1, Math.floor(Number(cartItems[0]!.quantity) || 1)) >= 99}
                      >
                        <ChevronRight size={16} className="text-[#F5F5F7]" />
                      </button>
                    </div>
                  ) : null}
                </div>
                {cartItems.length === 0 ? (
                  <div className="px-5 pb-8 pt-4 flex flex-col items-center gap-2">
                    <ShopBasketIcon size={32} className="text-white/25" />
                    <p className="text-white/40 text-sm">Your basket is empty</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-y-auto px-5" style={{ maxHeight: "calc(80dvh - 190px)" }}>
                      {cartItems.map((ci) => {
                        const qty = Math.max(1, Math.floor(Number(ci.quantity) || 1));
                        return (
                          <div key={ci.id} className="flex items-center gap-3 py-2 border-b border-white/5">
                            {ci.imageUrl ? (
                              <img src={ci.imageUrl} alt={ci.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                                <Tag size={16} className="text-white/20" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{ci.title}</p>
                              <p className="text-sm font-extrabold text-gold-metallic">
                                £{(Number(ci.price) * qty).toFixed(2)}
                                {qty > 1 ? ` × ${qty}` : ""}
                              </p>
                            </div>
                            {cartItems.length > 1 ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (qty <= 1) removeFromCart(ci.id);
                                    else setCartQuantity(ci.id, qty - 1);
                                  }}
                                  className="w-7 h-7 rounded-full bg-[#1A1C21] border border-white/15 flex items-center justify-center active:opacity-70"
                                  aria-label={`Less ${ci.title}`}
                                >
                                  <ChevronLeft size={16} className="text-[#F5F5F7]" />
                                </button>
                                <span className="min-w-[1.5rem] text-center text-xs font-bold text-[#F5F5F7] tabular-nums">{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => setCartQuantity(ci.id, qty + 1)}
                                  className="w-7 h-7 rounded-full bg-[#1A1C21] border border-white/15 flex items-center justify-center active:opacity-70"
                                  aria-label={`More ${ci.title}`}
                                  disabled={qty >= 99}
                                >
                                  <ChevronRight size={16} className="text-[#F5F5F7]" />
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-5 pt-3 pb-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-white/60">Total</span>
                        <span className="text-lg font-extrabold text-white">£{cartTotal.toFixed(2)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCheckoutCart()}
                        disabled={checkingOut}
                        className="w-full py-3 rounded-xl bg-[#1A1C21] border border-white/15 text-[#F5F5F7] font-bold text-sm disabled:opacity-50"
                      >
                        {checkingOut ? "Starting checkout…" : "Checkout with Stripe"}
                      </button>
                      <p className="text-[10px] text-white/40 text-center mt-2">
                        Pay via Stripe with Apple Pay, Google Pay, or card when available (Clearpay when eligible). Elix Live App will contribute 1% of your purchase to help people in need. Eligible shop refunds are handled via Stripe/support only — not as digital coins. Digital coin purchases are separate and non-refundable.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
