import { getPool } from "../../infra/postgres.js";

export type PublicGiftCatalogItem = {
  id: string;
  name: string;
  coinCost: number;
  animationUrl: string | null;
};

export const PUBLIC_GIFTS_CATALOG_SQL = `
  SELECT id, name, coin_cost, animation_url
    FROM gifts
   WHERE active = TRUE
   ORDER BY sort_order ASC, id ASC
`;

export function mapPublicGiftRow(row: {
  id: string;
  name: string;
  coin_cost: number;
  animation_url: string | null;
}): PublicGiftCatalogItem {
  return {
    id: row.id,
    name: row.name,
    coinCost: row.coin_cost,
    animationUrl: row.animation_url,
  };
}

export async function loadPublicGiftsCatalog(): Promise<PublicGiftCatalogItem[]> {
  const { rows } = await getPool().query<{
    id: string;
    name: string;
    coin_cost: number;
    animation_url: string | null;
  }>(PUBLIC_GIFTS_CATALOG_SQL);
  return rows.map(mapPublicGiftRow);
}
