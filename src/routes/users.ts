
import { Router } from "express";
import { db } from "../db/index.js";
import { accounts, users, plans } from "../db/schema.js";
import { and, eq, isNull, or } from "drizzle-orm";
import { authenticateAccount } from "../middleware/auth.js";

export const usersRouter = Router();

// All routes require a valid account API key
usersRouter.use(authenticateAccount);

// Create a user under the authenticated account
usersRouter.post("/", async (req, res) => {
  try {
    const account = res.locals.account;
    const { externalId, planName } = req.body ?? {};

    if (
      typeof externalId !== "string" ||
      !externalId.trim() ||
      externalId.length > 150 ||
      typeof planName !== "string"
    ) {
      res.status(400).json({
        error: "Valid externalId and planName are required",
      });
      return;
    }

    
const [selectedPlan] = await db
  .select()
  .from(plans)
  .where(
    and(
      eq(plans.name, planName.trim()),
      eq(plans.type, "user"),
      or(
        and(
          eq(plans.isPredefined, true),
          isNull(plans.ownerAccountId),
        ),
        and(
          eq(plans.isPredefined, false),
          eq(plans.ownerAccountId, account.id),
        ),
      ),
    ),
  )
  .limit(1);


    if (!selectedPlan) {
      res.status(400).json({
        error: "User plan not found",
      });
      return;
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.accountId, account.id),
          eq(users.externalId, externalId.trim()),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({
        error: "User already exists in this account",
      });
      return;
    }

    const [newUser] = await db
      .insert(users)
      .values({
        accountId: account.id,
        externalId: externalId.trim(),
        planId: selectedPlan.id,
      })
      .returning();

    res.status(201).json({
      message: "User created successfully",
      user: newUser,
    });
  } catch (error: any) {
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      res.status(409).json({
        error: "User already exists in this account",
      });
      return;
    }

    console.error("Error creating user:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// List only users belonging to the authenticated account
usersRouter.get("/", async (_req, res) => {
  try {
    const account = res.locals.account;

    const accountUsers = await db
      .select({
        id: users.id,
        externalId: users.externalId,
        planId: users.planId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.accountId, account.id));

    res.json({ users: accountUsers });
  } catch (error) {
    console.error("Error listing users:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});




usersRouter.patch("/:userId/plan", async (req, res) => {
  try {
    const accountId = res.locals.account.id as string;
    const userId = req.params.userId as string;
    const { planName } = req.body ?? {};

    if (typeof planName !== "string" || !planName.trim()) {
      res.status(400).json({ error: "planName is required" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      // Use the same account lock as consume requests
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for("update");

      if (!account) {
        return { status: 404, body: { error: "Account not found" } };
      }

      const [existingUser] = await tx
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.accountId, accountId),
          ),
        );

      if (!existingUser) {
        return { status: 404, body: { error: "User not found" } };
      }

      const [selectedPlan] = await tx
        .select()
        .from(plans)
        .where(
          and(
            eq(plans.name, planName.trim()),
            eq(plans.type, "user"),
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
        )
        .limit(1);

      if (!selectedPlan) {
        return { status: 400, body: { error: "User plan not found" } };
      }

      const [updatedUser] = await tx
        .update(users)
        .set({ planId: selectedPlan.id })
        .where(
          and(
            eq(users.id, userId),
            eq(users.accountId, accountId),
          ),
        )
        .returning();

      return {
        status: 200,
        body: {
          message: "User plan updated successfully",
          user: updatedUser,
        },
      };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Error updating user plan:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
