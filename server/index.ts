import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { loadEnv, env } from "./infra/env.js";
import { logger } from "./infra/logger.js";
import { applyPendingMigrations, assertMigrationsApplied, closePool, getPool } from "./infra/postgres.js";
import { closeValkey } from "./infra/valkey.js";
import { attachSession, requireAuth, type AuthedRequest } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRouter from "./modules/auth/router.js";
import profileRouter from "./modules/profile/router.js";
import feedRouter from "./modules/feed/router.js";
import liveRouter from "./modules/live/router.js";
import giftsRouter from "./modules/gifts/router.js";
import walletRouter from "./modules/wallet/router.js";
import testCoinsRouter from "./modules/testCoins/router.js";
import iapRouter, { handleGetCoinPackages, handleVerifyPurchase } from "./modules/iap/router.js";
import promoteRouter from "./modules/promote/router.js";
import heartsRouter from "./modules/hearts/router.js";
import videosRouter from "./modules/videos/router.js";
import storiesRouter from "./modules/stories/router.js";
import musicRouter from "./modules/music/router.js";
import hashtagsRouter from "./modules/hashtags/router.js";
import repostsRouter from "./modules/reposts/router.js";
import engagementRouter from "./modules/engagement/router.js";
import risingStarsRouter from "./modules/risingStars/router.js";
import membershipRouter from "./modules/membership/router.js";
import creatorRouter from "./modules/creator/router.js";
import { handleAvatarUpload } from "./modules/media/upload.js";
import { cameraOptionsRouter } from "./modules/camera/options.js";
import uploadsRouter, { handleUploadBytes } from "./modules/uploads/router.js";
import {
  adminRouter,
  moderationRouter,
  notifyRouter,
} from "./modules/misc/routers.js";
import { shopRouter } from "./modules/shop/router.js";
import deviceTokensRouter from "./modules/push/router.js";
import blocksRouter from "./modules/blocks/router.js";
import { handleShopImageUpload } from "./modules/shop/image.js";
import {
  callsRouter,
  discoverRouter,
  extraAdminRouter,
  inboxRouter,
} from "./modules/app/clientRoutes.js";
import {
  handleAppleNotification,
  handleGoogleRtdn,
  handleLivekitWebhook,
  handleStripeWebhook,
} from "./modules/webhooks/handlers.js";
import { attachWebSocket } from "./websocket/index.js";
import { startBackgroundJobs } from "./infra/jobs.js";

function authedMultipart(
  handler: (req: AuthedRequest, res: express.Response) => Promise<void>,
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    void attachSession(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      requireAuth(req, res, (authErr?: unknown) => {
        if (authErr) {
          next(authErr);
          return;
        }
        void handler(req as AuthedRequest, res).catch(next);
      });
    });
  };
}

export async function createApp() {
  loadEnv();
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env().CLIENT_URL || true,
      credentials: true,
    }),
  );
  app.use(compression());
  app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), (req, res, next) => {
    void handleStripeWebhook(req, res).catch(next);
  });
  app.post("/api/webhooks/livekit", express.raw({ type: () => true }), (req, res, next) => {
    void handleLivekitWebhook(req, res).catch(next);
  });
  app.post("/api/uploads/sessions/:sessionId/bytes", authedMultipart(handleUploadBytes));
  app.post("/api/profiles/me/avatar", authedMultipart(handleAvatarUpload));
  app.post("/api/shop/image", authedMultipart(handleShopImageUpload));
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    void attachSession(req, res, next).catch(next);
  });
  app.use((req, res, next) => {
    void rateLimit(req, res, next).catch(next);
  });

  app.get("/health", async (_req, res) => {
    try {
      await getPool().query("SELECT 1");
      res.json({ ok: true, service: "elix-star-live", db: true });
    } catch {
      res.status(503).json({ ok: false, service: "elix-star-live", db: false });
    }
  });
  app.get("/api/health", async (_req, res) => {
    try {
      await getPool().query("SELECT 1");
      res.json({ ok: true, service: "elix-star-live", db: true });
    } catch {
      res.status(503).json({ ok: false, service: "elix-star-live", db: false });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/profiles", profileRouter);
  app.use("/api/feed", feedRouter);
  app.use("/api/live", liveRouter);
  app.use("/api/gifts", giftsRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/test-coins", testCoinsRouter);
  app.use("/api/iap", iapRouter);
  app.get("/api/coin-packages", (req, res, next) => {
    void handleGetCoinPackages(req, res).catch(next);
  });
  app.post("/api/verify-purchase", requireAuth, (req, res, next) => {
    void handleVerifyPurchase(req, res).catch(next);
  });
  app.use("/api", promoteRouter);
  app.use("/api/hearts", heartsRouter);
  app.post("/api/webhooks/apple-iap", (req, res, next) => {
    void handleAppleNotification(req, res).catch(next);
  });
  app.post("/api/webhooks/google-play", (req, res, next) => {
    void handleGoogleRtdn(req, res).catch(next);
  });
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/videos", videosRouter);
  app.use("/api/stories", storiesRouter);
  app.use("/api/music", musicRouter);
  app.use("/api", cameraOptionsRouter);
  app.use("/api/hashtags", hashtagsRouter);
  app.use("/api/reposts", repostsRouter);
  app.use("/api/engagement", engagementRouter);
  app.use("/api/rising-stars", risingStarsRouter);
  app.use("/api/membership", membershipRouter);
  app.use("/api/creator", creatorRouter);
  app.use("/api/inbox", inboxRouter);
  app.use("/api/shop", shopRouter);
  app.use("/api/notifications", notifyRouter);
  app.use("/api/device-tokens", deviceTokensRouter);
  app.use("/api/admin", extraAdminRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", blocksRouter);
  app.use("/api/calls", callsRouter);
  app.use("/api", discoverRouter);
  app.use("/api", moderationRouter);

  app.get("/env.js", (_req, res) => {
    const payload = {
      VITE_APPLE_SIGN_IN_ENABLED: env().APPLE_SIGN_IN_ENABLED === "true" ? "true" : "false",
      VITE_EMAIL_CONFIGURED: process.env.SMTP_URL?.trim() ? "true" : "false",
    };
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(
      `window.__ELIX_ENV = Object.assign({}, window.__ELIX_ENV || {}, ${JSON.stringify(payload)});`,
    );
  });

  const dist = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== "GET") {
        next();
        return;
      }
      if (req.path.startsWith("/api") || req.path.startsWith("/live")) {
        next();
        return;
      }
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}

export async function startServer(): Promise<http.Server> {
  loadEnv();
  if (env().isProduction && !env().valkeyUrl) {
    throw new Error("VALKEY_URL is required in production");
  }
  await applyPendingMigrations();
  await assertMigrationsApplied();
  const app = await createApp();
  const server = http.createServer(app);
  attachWebSocket(server);
  startBackgroundJobs();
  await new Promise<void>((resolve) => {
    server.listen(env().PORT, () => {
      logger.info({ port: env().PORT }, "elix server listening");
      resolve();
    });
  });
  const shutdown = async () => {
    server.close();
    await closePool();
    await closeValkey().catch(() => undefined);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
  return server;
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}` ||
  process.argv[1]?.endsWith("server/index.ts") ||
  process.argv[1]?.endsWith("server\\index.ts");

if (isDirectRun) {
  void startServer().catch((error) => {
    logger.error({ err: error }, "fatal boot error");
    process.exit(1);
  });
}
