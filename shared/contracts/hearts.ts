import { z } from "zod";

export const dailyHeartSendBodySchema = z.object({
  creatorId: z.string().uuid(),
});

export const dailyHeartStatusSchema = z.object({
  todayCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  hasSent: z.boolean(),
});

export const dailyHeartSendResponseSchema = z.object({
  ok: z.boolean(),
  already: z.boolean(),
});

export type DailyHeartStatus = z.infer<typeof dailyHeartStatusSchema>;
