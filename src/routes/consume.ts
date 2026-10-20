
import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
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

export const consumeRouter = Router();
consumeRouter.use(authenticateAccount);

consumeRouter.post("/", async (req, res) => {
  const accountId = res.locals.account.id as string;
  const { userId, units, requestId } = req.body ?? {};

  if (
    typeof userId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) ||
    !Number.isSafeInteger(units) ||
    units <= 0 ||
    units > 2147483647 ||
    typeof requestId !== "string" ||
    !requestId.trim() ||
    requestId.length > 150
  ) {
    res.status(400).json({ error: "Invalid request data" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Serialize requests belonging to the same account
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for("update");

      if (!account) {
        return { status: 401, body: { error: "Account not found" } };
      }

      // Return the original decision for repeated requests
      const [previous] = await tx
        .select()
        .from(usageRequests)
        .where(
          and(
            eq(usageRequests.accountId, accountId),
            eq(usageRequests.requestId, requestId),
          ),
        );

      if (previous) {
        if (previous.userId !== userId || previous.units !== units) {
          return {
            status: 409,
            body: { error: "Request ID already used with different data" },
          };
        }

        return {
          status: 200,
          body: {
            accepted: previous.accepted,
            rejectionLevel: previous.rejectionLevel,
            rejectionRule: previous.rejectionRule,
            idempotentReplay: true,
          },
        };
      }

      const [user] = await tx
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.accountId, accountId),
          ),
        );

      if (!user) {
        return { status: 404, body: { error: "User not found" } };
      }

      const [accountPlan] = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, account.planId));

      const [userPlan] = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, user.planId));

      if (
        !accountPlan ||
        !userPlan ||
        accountPlan.type !== "account" ||
        userPlan.type !== "user"
      ) {
        return { status: 500, body: { error: "Invalid plan configuration" } };
      }

      const month = new Date().toISOString().slice(0, 7);

      const [accountRecord] = await tx
        .select()
        .from(accountUsage)
        .where(
          and(
            eq(accountUsage.accountId, accountId),
            eq(accountUsage.month, month),
          ),
        );

      const [userRecord] = await tx
        .select()
        .from(userUsage)
        .where(
          and(
            eq(userUsage.userId, userId),
            eq(userUsage.month, month),
          ),
        );

      const accountConsumed = accountRecord?.consumedUnits ?? 0;
      const userConsumed = userRecord?.consumedUnits ?? 0;

      let rejectionLevel: string | null = null;
      let rejectionRule: string | null = null;

      if (units > accountPlan.maxUnitsPerRequest) {
        rejectionLevel = "account";
        rejectionRule = "max_units_per_request";
      } else if (units > userPlan.maxUnitsPerRequest) {
        rejectionLevel = "user";
        rejectionRule = "max_units_per_request";
      } else if (units > accountPlan.monthlyAllowance - accountConsumed) {
        rejectionLevel = "account";
        rejectionRule = "monthly_allowance";
      } else if (units > userPlan.monthlyAllowance - userConsumed) {
        rejectionLevel = "user";
        rejectionRule = "monthly_allowance";
      }

      const MAX_DB_INTEGER = 2147483647;

if (
  rejectionLevel === null &&
  accountConsumed + units > MAX_DB_INTEGER
) {
  rejectionLevel = "account";
  rejectionRule = "storage_limit";
} else if (
  rejectionLevel === null &&
  userConsumed + units > MAX_DB_INTEGER
) {
  rejectionLevel = "user";
  rejectionRule = "storage_limit";
}

      const accepted = rejectionLevel === null;

      if (accepted) {
        await tx
          .insert(accountUsage)
          .values({ accountId, month, consumedUnits: units })
          .onConflictDoUpdate({
            target: [accountUsage.accountId, accountUsage.month],
            set: {
              consumedUnits: sql`${accountUsage.consumedUnits} + ${units}`,
            },
          });

        await tx
          .insert(userUsage)
          .values({ userId, month, consumedUnits: units })
          .onConflictDoUpdate({
            target: [userUsage.userId, userUsage.month],
            set: {
              consumedUnits: sql`${userUsage.consumedUnits} + ${units}`,
            },
          });
      }

      await tx.insert(usageRequests).values({
        accountId,
        userId,
        requestId,
        units,
        accepted,
        rejectionLevel,
        rejectionRule,
      });

      return {
        status: accepted ? 200 : 403,
        body: {
          accepted,
          rejectionLevel,
          rejectionRule,
          idempotentReplay: false,
          accountRemaining: Math.max(
            0,
            accountPlan.monthlyAllowance -
              accountConsumed -
              (accepted ? units : 0),
          ),
          userRemaining: Math.max(
            0,
            userPlan.monthlyAllowance -
              userConsumed -
              (accepted ? units : 0),
          ),
        },
      };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Consume error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
