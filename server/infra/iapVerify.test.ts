import { describe, expect, it } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import { AppError } from "../middleware/errors.js";
import { verifyAppleReceipt, verifyGooglePurchase } from "./iapVerify.js";

describe("IAP verification", () => {
  it("rejects an Apple receipt that is not a signed StoreKit transaction", async () => {
    await expect(verifyAppleReceipt("not-a-jws", "coins100", 100)).rejects.toBeInstanceOf(AppError);
  });

  it("rejects a self-signed JWS that is not chained to Apple Root CA G3", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const jws = await new SignJWT({
      transactionId: "tx1",
      productId: "coins100",
      bundleId: "com.elixstarlive.app",
      environment: "Production",
    })
      .setProtectedHeader({ alg: "ES256" })
      .sign(privateKey);
    await expect(verifyAppleReceipt(jws, "coins100", 100)).rejects.toBeInstanceOf(AppError);
  });

  it("never credits Google purchases without a service account", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    await expect(verifyGooglePurchase("token", "coins100", 100)).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});
