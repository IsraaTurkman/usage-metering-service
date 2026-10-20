import { db, client } from "./index.js";
import { plans } from "./schema.js";
import { and, eq, isNull } from "drizzle-orm";

const predefinedPlans = [
  {
    name: "Starter",
    type: "account" as const,
    monthlyAllowance: 1000,
    maxUnitsPerRequest: 100,
  },
  {
    name: "Pro",
    type: "account" as const,
    monthlyAllowance: 10000,
    maxUnitsPerRequest: 500,
  },
  {
    name: "Basic",
    type: "user" as const,
    monthlyAllowance: 100,
    maxUnitsPerRequest: 20,
  },
  {
    name: "Premium",
    type: "user" as const,
    monthlyAllowance: 1000,
    maxUnitsPerRequest: 100,
  },
];

async function seed() {
  try {
    for (const plan of predefinedPlans) {
      const existing = await db
        .select()
        .from(plans)
        .where(
          and(
            eq(plans.name, plan.name),
            eq(plans.type, plan.type),
            eq(plans.isPredefined, true),
            isNull(plans.ownerAccountId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        console.log(`${plan.name} already exists`);
        continue;
      }

      await db.insert(plans).values({
        ...plan,
        isPredefined: true,
      });

      console.log(`Created ${plan.name} plan`);
    }

    console.log("Database seeding completed!");
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

seed();