
import { Router } from "express";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  accounts,
  users,
  plans,
  accountUsage,
  userUsage,
  usageRequests,
} from "../db/schema.js";
import { authenticateAccount } from "../middleware/auth.js";

export const usageRouter = Router();
usageRouter.use(authenticateAccount);

const currentMonth = () => new Date().toISOString().slice(0, 7);

const validMonth = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

// Account usage
usageRouter.get("/account", async (req, res) => {
  try {
    const accountId = res.locals.account.id as string;
    const month = req.query.month ?? currentMonth();

    if (!validMonth(month)) {
      res.status(400).json({ error: "Invalid month. Use YYYY-MM" });
      return;
    }

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, account.planId));

    if (!plan) {
      res.status(500).json({ error: "Account plan not found" });
      return;
    }

    const [usage] = await db
      .select()
      .from(accountUsage)
      .where(
        and(
          eq(accountUsage.accountId, accountId),
          eq(accountUsage.month, month),
        ),
      );

    const consumed = usage?.consumedUnits ?? 0;

    res.json({
      accountId,
      month,
      plan: plan.name,
      monthlyAllowance: plan.monthlyAllowance,
      consumedUnits: consumed,
      remainingUnits: Math.max(0, plan.monthlyAllowance - consumed),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// User usage
usageRouter.get("/users/:userId", async (req, res) => {
  try {
    const accountId = res.locals.account.id as string;
    const userId = req.params.userId as string;
    const month = req.query.month ?? currentMonth();

    if (!validMonth(month)) {
      res.status(400).json({ error: "Invalid month. Use YYYY-MM" });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(
        and(eq(users.id, userId), eq(users.accountId, accountId)),
      );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, user.planId));

    if (!plan) {
      res.status(500).json({ error: "User plan not found" });
      return;
    }

    const [usage] = await db
      .select()
      .from(userUsage)
      .where(
        and(
          eq(userUsage.userId, userId),
          eq(userUsage.month, month),
        ),
      );

    const consumed = usage?.consumedUnits ?? 0;

    res.json({
      userId,
      externalId: user.externalId,
      month,
      plan: plan.name,
      monthlyAllowance: plan.monthlyAllowance,
      consumedUnits: consumed,
      remainingUnits: Math.max(0, plan.monthlyAllowance - consumed),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Paginated request history
usageRouter.get("/history", async (req, res) => {
  try {
    const accountId = res.locals.account.id as string;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger((page - 1) * limit)
    ) {
      res.status(400).json({ error: "Invalid pagination" });
      return;
    }

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(usageRequests)
      .where(eq(usageRequests.accountId, accountId));

    const history = await db
      .select()
      .from(usageRequests)
      .where(eq(usageRequests.accountId, accountId))
      .orderBy(desc(usageRequests.createdAt), desc(usageRequests.id))
      .limit(limit)
      .offset((page - 1) * limit);

    res.json({
      page,
      limit,
      total: countResult?.total ?? 0,
      requests: history,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});
