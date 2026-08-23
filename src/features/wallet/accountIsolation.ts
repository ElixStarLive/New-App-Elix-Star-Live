import { useShopBasketStore } from "@/store/useShopBasketStore";
import { useTestCoinsStore } from "@/store/useTestCoinsStore";
import { useWalletStore } from "@/store/useWalletStore";

export function isolateWalletAccount(): void {
  useWalletStore.getState().clear();
  useTestCoinsStore.getState().clear();
  useShopBasketStore.getState().clear();
}
