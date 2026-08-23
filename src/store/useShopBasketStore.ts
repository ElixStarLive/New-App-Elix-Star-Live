import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_LINES = 10;
const MAX_QTY = 99;

export type ShopBasketLine = {
  id: string;
  title: string;
  price: number;
  image_url: string | null;
  quantity: number;
};

type ShopBasketState = {
  items: ShopBasketLine[];
  add: (item: Omit<ShopBasketLine, "quantity">) => { ok: true } | { ok: false; error: string };
  remove: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  clear: () => void;
  totalUnits: () => number;
};

function clampQty(n: unknown): number {
  const q = Math.floor(Number(n));
  if (!Number.isFinite(q) || q < 1) return 1;
  return Math.min(MAX_QTY, q);
}

export const useShopBasketStore = create<ShopBasketState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        const state = get();
        const existing = state.items.find((line) => line.id === item.id);
        if (existing) {
          set({
            items: state.items.map((line) =>
              line.id === item.id ? { ...line, quantity: clampQty(line.quantity + 1) } : line,
            ),
          });
          return { ok: true };
        }
        if (state.items.length >= MAX_LINES) {
          return { ok: false, error: "Basket is limited to 10 items" };
        }
        set({
          items: [
            ...state.items,
            {
              id: item.id,
              title: item.title,
              price: item.price,
              image_url: item.image_url,
              quantity: 1,
            },
          ],
        });
        return { ok: true };
      },
      remove: (id) => set((state) => ({ items: state.items.filter((line) => line.id !== id) })),
      setQuantity: (id, quantity) =>
        set((state) => {
          const q = Math.floor(Number(quantity));
          if (!Number.isFinite(q) || q < 1) {
            return { items: state.items.filter((line) => line.id !== id) };
          }
          return {
            items: state.items.map((line) => (line.id === id ? { ...line, quantity: Math.min(MAX_QTY, q) } : line)),
          };
        }),
      clear: () => set({ items: [] }),
      totalUnits: () => get().items.reduce((sum, line) => sum + clampQty(line.quantity), 0),
    }),
    { name: "elix_shop_basket_v1" },
  ),
);
