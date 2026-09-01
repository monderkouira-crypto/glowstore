import { and, asc, eq, gte, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateOrderBody,
  CreateOrderResponse,
  ListOrdersResponse,
} from "@workspace/api-zod";
import { db, ordersTable } from "@workspace/db";

const router: IRouter = Router();
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ORDERS_PER_DEVICE = 4;

class DeviceOrderLimitError extends Error {
  constructor(public readonly retryAfterHours: number) {
    super("Order limit reached for this device");
  }
}

router.get("/orders", async (req, res): Promise<void> => {
  const orders = await db
    .select()
    .from(ordersTable)
    .orderBy(ordersTable.createdAt);

  req.log.info({ count: orders.length }, "Fetched saved orders");
  res.json(ListOrdersResponse.parse(orders.reverse()));
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid order body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const order = await db.transaction(async (tx) => {
      // Serialize requests from the same device so two tabs cannot bypass the limit.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${parsed.data.deviceId}))`);

      const since = new Date(Date.now() - WINDOW_MS);
      const recentOrders = await tx
        .select({ createdAt: ordersTable.createdAt })
        .from(ordersTable)
        .where(and(eq(ordersTable.deviceId, parsed.data.deviceId), gte(ordersTable.createdAt, since)))
        .orderBy(asc(ordersTable.createdAt));

      if (recentOrders.length >= MAX_ORDERS_PER_DEVICE) {
        const oldest = recentOrders[0]?.createdAt.getTime() ?? Date.now();
        const retryAfterHours = Math.max(1, Math.ceil((oldest + WINDOW_MS - Date.now()) / 3_600_000));
        throw new DeviceOrderLimitError(retryAfterHours);
      }

      const code = `GS-${Math.floor(100000 + Math.random() * 899999)}`;
      const [created] = await tx
        .insert(ordersTable)
        .values({
          ...parsed.data,
          code,
        })
        .returning();

      return created;
    });

    req.log.info({ orderId: order.id, code: order.code }, "Saved new order");
    res.status(201).json(CreateOrderResponse.parse(order));
  } catch (error) {
    if (error instanceof DeviceOrderLimitError) {
      req.log.warn({ retryAfterHours: error.retryAfterHours }, "Device order limit reached");
      res.status(429).json({
        error: "يمكن لهذا الجهاز إرسال 4 طلبات فقط خلال 24 ساعة.",
        retryAfterHours: error.retryAfterHours,
      });
      return;
    }
    throw error;
  }
});

export default router;