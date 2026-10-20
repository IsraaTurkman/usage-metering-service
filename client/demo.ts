

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const BASE_URL =
  process.env.API_BASE_URL ?? "http://localhost:3000";

const apiKey = process.env.DEMO_API_KEY;
const user1 = process.env.DEMO_USER_1;
const user2 = process.env.DEMO_USER_2;

async function consume(
  userId: string,
  units: number,
  label: string,
) {
  const response = await fetch(`${BASE_URL}/api/consume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey!,
    },
    body: JSON.stringify({
      userId,
      units,
      requestId: `demo-${Date.now()}-${crypto.randomUUID()}`,
    }),
  });

  const result = await response.json();

  console.log(`\n${label}`);
  console.log("HTTP status:", response.status);
  console.log("Response:", JSON.stringify(result, null, 2));

  return result;
}


async function updateCustomPlan(
  planId: string,
  maxUnitsPerRequest: number,
) {
  const response = await fetch(`${BASE_URL}/api/plans/${planId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey!,
    },
    body: JSON.stringify({ maxUnitsPerRequest }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Plan update failed: ${JSON.stringify(result)}`);
  }

  console.log("\nCustom plan updated!");
  console.log("New max units per request:", maxUnitsPerRequest);
}


async function main() {
  if (!apiKey || !user1 || !user2) {
    throw new Error(
      "DEMO_API_KEY, DEMO_USER_1 and DEMO_USER_2 are required",
    );
  }

  console.log("=== Usage Metering Demo ===");

  const customPlanId = process.env.DEMO_CUSTOM_PLAN_ID;

if (!customPlanId) {
  throw new Error("DEMO_CUSTOM_PLAN_ID is required");
}

// Start every demo with the original request limit
await updateCustomPlan(customPlanId, 20);

  await consume(user1, 10, "User 1 - Small request");
  await consume(user1, 50, "User 1 - Larger request");
  await consume(user2, 50, "User 2 - Request");
  await consume(user2, 500, "User 2 - Large request");

  
 

  console.log("\n=== Dynamic Plan Update Test ===");

 

  const before = await consume(
    user1,
    50,
    "BEFORE update - 50 units",
  );

  await updateCustomPlan(customPlanId, 100);

  const after = await consume(
    user1,
    50,
    "AFTER update - 50 units",
  );

  if (before.accepted !== false || after.accepted !== true) {
    throw new Error("Dynamic plan update test FAILED");
  }

  console.log("\nDYNAMIC PLAN UPDATE TEST PASSED!");


  console.log("\n=== Demo finished ===");
}

main().catch((error) => {
  console.error("Demo failed:", error);
  process.exitCode = 1;
});
