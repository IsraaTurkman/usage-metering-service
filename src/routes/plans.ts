
import { Router } from "express";
import { db } from "../db/index.js";
import { plans } from "../db/schema.js";
import { and, eq, or, isNull } from "drizzle-orm";
import { authenticateAccount } from "../middleware/auth.js";

export const plansRouter = Router();

plansRouter.use(authenticateAccount);

// Create a custom plan
plansRouter.post("/", async (req, res) => {
  try {
    const account = res.locals.account;

    const {
      name,
      type,
      monthlyAllowance,
      maxUnitsPerRequest,
    } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100 ||
      !["account", "user"].includes(type) ||
      !Number.isSafeInteger(monthlyAllowance) ||
      monthlyAllowance <= 0 ||
      !Number.isSafeInteger(maxUnitsPerRequest) ||
      maxUnitsPerRequest <= 0
    ) {
      res.status(400).json({
        error: "Invalid plan details",
      });
      return;
    }

    const [newPlan] = await db
      .insert(plans)
      .values({
        name: name.trim(),
        type,
        monthlyAllowance,
        maxUnitsPerRequest,
        ownerAccountId: account.id,
        isPredefined: false,
      })
      .returning();

    res.status(201).json({
      message: "Custom plan created successfully",
      plan: newPlan,
    });
  } catch (error) {
    console.error("Error creating plan:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// List predefined and account-owned plans
plansRouter.get("/", async (_req, res) => {
  try {
    const account = res.locals.account;

    const availablePlans = await db
      .select()
      .from(plans)
      .where(
        or(
          and(
            eq(plans.isPredefined, true),
            isNull(plans.ownerAccountId),
          ),
          eq(plans.ownerAccountId, account.id),
        ),
      );

    res.json({ plans: availablePlans });
  } catch (error) {
    console.error("Error listing plans:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});



// Update an account-owned custom plan
plansRouter.patch("/:planId", async (req, res) => {
  try {
    const account = res.locals.account;
    const planId = req.params.planId as string;

    const {
      name,
      monthlyAllowance,
      maxUnitsPerRequest,
    } = req.body ?? {};

    if (
      (name !== undefined &&
        (typeof name !== "string" ||
          !name.trim() ||
          name.length > 100)) ||
      (monthlyAllowance !== undefined &&
        (!Number.isSafeInteger(monthlyAllowance) ||
          monthlyAllowance <= 0)) ||
      (maxUnitsPerRequest !== undefined &&
        (!Number.isSafeInteger(maxUnitsPerRequest) ||
          maxUnitsPerRequest <= 0))
    ) {
      res.status(400).json({
        error: "Invalid plan details",
      });
      return;
    }

    const updates: {
      name?: string;
      monthlyAllowance?: number;
      maxUnitsPerRequest?: number;
      updatedAt?: Date;
    } = {};

    if (name !== undefined) updates.name = name.trim();

    if (monthlyAllowance !== undefined) {
      updates.monthlyAllowance = monthlyAllowance;
    }

    if (maxUnitsPerRequest !== undefined) {
      updates.maxUnitsPerRequest = maxUnitsPerRequest;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        error: "No fields provided for update",
      });
      return;
    }

    updates.updatedAt = new Date();

    const [updatedPlan] = await db
      .update(plans)
      .set(updates)
      .where(
        and(
          eq(plans.id, planId),
          eq(plans.ownerAccountId, account.id),
          eq(plans.isPredefined, false),
        ),
      )
      .returning();

    if (!updatedPlan) {
      res.status(404).json({
        error: "Custom plan not found",
      });
      return;
    }

    res.json({
      message: "Custom plan updated successfully",
      plan: updatedPlan,
    });
  } catch (error) {
    console.error("Error updating custom plan:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});
