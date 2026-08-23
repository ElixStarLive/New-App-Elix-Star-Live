import { z } from "zod";

export const alertKindSchema = z.enum(["system", "live_started"]);

export const alertItemSchema = z.object({
  id: z.string().min(1),
  kind: alertKindSchema,
  title: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  actionUrl: z.string().nullable(),
  createdAt: z.string(),
});

export const alertsResponseSchema = z.object({
  items: z.array(alertItemSchema),
  total: z.number().int().nonnegative(),
  unreadIds: z.array(z.string()),
});

export type AlertKind = z.infer<typeof alertKindSchema>;
export type AlertItem = z.infer<typeof alertItemSchema>;
