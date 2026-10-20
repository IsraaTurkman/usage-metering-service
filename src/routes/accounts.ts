import { Router } from "express";
import { and, eq, or, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { accounts, plans } from "../db/schema.js";
import { authenticateAccount } from "../middleware/auth.js";
import { generateApiKey, hashApiKey } from "../services/apiKeys.js";
import { timingSafeEqual } from "node:crypto";

export const accountsRouter = Router();

accountsRouter.post("/", (req, res, next) => {
  const suppliedKey = req.header("x-admin-key");
  const expectedKey = process.env.ADMIN_SETUP_KEY;

  if (!expectedKey) {
    res.status(503).json({
      error: "Admin setup key is not configured",
    });
    return;
  }

  const supplied = Buffer.from(suppliedKey ?? "");
  const expected = Buffer.from(expectedKey);

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    res.status(401).json({
      error: "Invalid admin setup key",
    });
    return;
  }

  next();
});

accountsRouter.post("/", async (req, res) => {
  try {
    const { name, planName } = req.body;

    if (
      typeof name !== "string" ||
      name.trim().length === 0 ||
      typeof planName !== "string"
    ) {
      res.status(400).json({
        error: "Valid name and planName are required",
      });
      return;
    }

    const selectedPlan = await db
      .select()
      .from(plans)
      .where(
        and(
          eq(plans.name, planName),
          eq(plans.type, "account"),
          eq(plans.isPredefined, true),
          isNull(plans.ownerAccountId),
        ),
      )
      .limit(1);

    if (selectedPlan.length === 0) {
      res.status(400).json({
        error: "Account plan not found",
      });
      return;
    }

    const apiKey = generateApiKey();

    const [newAccount] = await db
      .insert(accounts)
      .values({
        name: name.trim(),
        planId: selectedPlan[0].id,
        apiKeyHash: hashApiKey(apiKey),
      })
      .returning({
        id: accounts.id,
        name: accounts.name,
        planId: accounts.planId,
        createdAt: accounts.createdAt,
      });

    res.status(201).json({
      message: "Account created successfully",
      account: newAccount,
      apiKey,
    });
  } catch (error) {
    console.error("Error creating account:", error);

    res.status(500).json({
      error: "Internal server error",
    });
  }
});



accountsRouter.patch(
  "/plan",
  authenticateAccount,
  async (req, res) => {
    try {
      const accountId = res.locals.account.id as string;
      const { planId } = req.body ?? {};

      if (
        typeof planId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(planId)
      ) {
        res.status(400).json({ error: "Valid planId required" });
        return;
      }

      const result = await db.transaction(async (tx) => {
        // Same account lock used by consume requests
        const [account] = await tx
          .select()
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .for("update");

        if (!account) return null;

        const [selectedPlan] = await tx
          .select()
          .from(plans)
          .where(
            and(
              eq(plans.id, planId),
              eq(plans.type, "account"),
              or(
                and(
                  eq(plans.isPredefined, true),
                  isNull(plans.ownerAccountId),
                ),
                and(
                  eq(plans.isPredefined, false),
                  eq(plans.ownerAccountId, accountId),
                ),
              ),
            ),
          );

        if (!selectedPlan) return null;

        const [updatedAccount] = await tx
          .update(accounts)
          .set({ planId: selectedPlan.id })
          .where(eq(accounts.id, accountId))
          .returning();

        return {
          account: updatedAccount,
          plan: selectedPlan,
        };
      });

      if (!result) {
        res.status(404).json({
          error: "Account or accessible account plan not found",
        });
        return;
      }

      res.json({
        message: "Account plan updated successfully",
        ...result,
      });
    } catch (error) {
      console.error("Account plan update error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
