import { create } from "zustand";
import type { ShopItem } from "@/features/shop/shopApi";

export type BasketLine = {
  item: ShopItem;
  quantity: number;
};

type ShopBasketState = {
  lines: BasketLine[];
  add: (item: ShopItem) => void;
  remove: (itemId: string) => void;
  clear: () => void;
  unitCount: () => number;
};

export const useShopBasketStore = create<ShopBasketState>((set, get) => ({
  lines: [],
  add: (item) => {
    set((state) => {
      const existing = state.lines.find((line) => line.item.id === item.id);
      if (existing) {
        return {
          lines: state.lines.map((line) =>
            line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
          ),
        };
      }
      return { lines: [...state.lines, { item, quantity: 1 }] };
    });
  },
  remove: (itemId) => set((state) => ({ lines: state.lines.filter((line) => line.item.id !== itemId) })),
  clear: () => set({ lines: [] }),
  unitCount: () => get().lines.reduce((sum, line) => sum + line.quantity, 0),
}));
