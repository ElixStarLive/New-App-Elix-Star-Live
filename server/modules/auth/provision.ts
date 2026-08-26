import type { PoolClient } from "pg";

/**
 * Creates the per-user rows every account needs (coin wallet, creator GBP
 * wallet, notification preferences). Must run inside the transaction that
 * inserted the user.
 */
export async function provisionNewUser(
  client: PoolClient,
  userId: string,
  starterCoins = 0,
): Promise<void> {
  await client.query(`INSERT INTO wallet_balances (user_id, starter_coins) VALUES ($1, $2)`, [
    userId,
    starterCoins,
  ]);
  await client.query(`INSERT INTO creator_wallet_gbp (user_id) VALUES ($1)`, [userId]);
  await client.query(`INSERT INTO notification_prefs (user_id) VALUES ($1)`, [userId]);
}
