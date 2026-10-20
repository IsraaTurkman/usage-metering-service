import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { accounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { hashApiKey } from "../services/apiKeys.js";

export async function authenticateAccount(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const apiKey = req.header("x-api-key");

    if (!apiKey) {
      res.status(401).json({
        error: "API key is required",
      });
      return;
    }

    const [account] = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        planId: accounts.planId,
      })
      .from(accounts)
      .where(eq(accounts.apiKeyHash, hashApiKey(apiKey)))
      .limit(1);

    if (!account) {
      res.status(401).json({
        error: "Invalid API key",
      });
      return;
    }

    res.locals.account = account;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}