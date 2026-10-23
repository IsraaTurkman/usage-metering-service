import { describe, it, expect } from "vitest";

const BASE_URL =
  process.env.API_BASE_URL ?? "http://localhost:3000";

const TEST_API_KEY = process.env.TEST_API_KEY;

describe("Usage Metering API", () => {
  it("rejects requests without API key", async () => {
    const response = await fetch(`${BASE_URL}/api/plans`);

    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("API key is required");
  });

  it("rejects invalid API key", async () => {
    const response = await fetch(`${BASE_URL}/api/plans`, {
      headers: {
        "x-api-key": "invalid-api-key",
      },
    });

    expect(response.status).toBe(401);
  });

  it("rejects consume requests without API key", async () => {
    const response = await fetch(`${BASE_URL}/api/consume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: crypto.randomUUID(),
        units: 10,
        requestId: crypto.randomUUID(),
      }),
    });

    expect(response.status).toBe(401);
  });
});

describe.skipIf(!TEST_API_KEY)(
  "Usage Metering authenticated tests",
  () => {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": TEST_API_KEY ?? "",
    };

    it("returns account usage", async () => {
      const response = await fetch(
        `${BASE_URL}/api/usage/account`,
        { headers }
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body).toHaveProperty("monthlyAllowance");
      expect(body).toHaveProperty("consumedUnits");
      expect(body).toHaveProperty("remainingUnits");

      expect(body.monthlyAllowance).toBeGreaterThan(0);
      expect(body.consumedUnits).toBeGreaterThanOrEqual(0);
      expect(body.remainingUnits).toBeGreaterThanOrEqual(0);
    });

    it("returns available plans", async () => {
      const response = await fetch(
        `${BASE_URL}/api/plans`,
        { headers }
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      const plans = Array.isArray(body)
        ? body
        : body.plans;

      expect(Array.isArray(plans)).toBe(true);
      expect(plans.length).toBeGreaterThan(0);
    });

    it("returns usage request history", async () => {
      const response = await fetch(
        `${BASE_URL}/api/usage/history?limit=5`,
        { headers }
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(Array.isArray(body.requests)).toBe(true);
      expect(body.requests.length).toBeLessThanOrEqual(5);
    });

    it("rejects invalid consume units", async () => {
      const usersResponse = await fetch(
        `${BASE_URL}/api/users`,
        { headers }
      );

      expect(usersResponse.status).toBe(200);

      const usersBody = await usersResponse.json();
      const users = usersBody.users ?? [];

      if (users.length === 0) {
        throw new Error(
          "Create a test user before running this test."
        );
      }

      const response = await fetch(
        `${BASE_URL}/api/consume`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            userId: users[0].id,
            units: -5,
            requestId: crypto.randomUUID(),
          }),
        }
      );

      expect(response.status).toBe(400);
    });
  }
);



describe.skipIf(!process.env.ADMIN_SETUP_KEY)(
  "Quota and Idempotency Integration Tests",
  () => {
    it("accepts usage, rejects excess, and prevents double charging", async () => {
      const adminKey = process.env.ADMIN_SETUP_KEY!;

      // Create a separate test account
      const accountResponse = await fetch(
        `${BASE_URL}/api/accounts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({
            name: `integration-test-${crypto.randomUUID()}`,
            planName: "Starter",
          }),
        }
      );

      expect(accountResponse.status).toBe(201);

      const accountData = await accountResponse.json();
      const testApiKey = accountData.apiKey as string;

      const headers = {
        "Content-Type": "application/json",
        "x-api-key": testApiKey,
      };

      // Create a user with a predefined plan
      const userResponse = await fetch(
        `${BASE_URL}/api/users`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            externalId: `test-user-${crypto.randomUUID()}`,
            planName: "Basic",
          }),
        }
      );

      expect(userResponse.status).toBe(201);

      const userData = await userResponse.json();
      const userId = userData.user.id as string;

      // Check initial usage
      const beforeResponse = await fetch(
        `${BASE_URL}/api/usage/account`,
        { headers }
      );

      expect(beforeResponse.status).toBe(200);

      const before = await beforeResponse.json();

      // Accept a valid request
      const requestId = crypto.randomUUID();

      const requestBody = {
        userId,
        units: 1,
        requestId,
      };

      const acceptedResponse = await fetch(
        `${BASE_URL}/api/consume`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        }
      );

      expect(acceptedResponse.status).toBe(200);

      const accepted = await acceptedResponse.json();
      expect(accepted.accepted).toBe(true);

      // Repeating the same request must not charge twice
      const replayResponse = await fetch(
        `${BASE_URL}/api/consume`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        }
      );

      expect(replayResponse.status).toBe(200);

      const replay = await replayResponse.json();
      expect(replay.accepted).toBe(true);

      // Verify usage increased exactly once
      const afterReplayResponse = await fetch(
        `${BASE_URL}/api/usage/account`,
        { headers }
      );

      const afterReplay = await afterReplayResponse.json();

      expect(afterReplay.consumedUnits).toBe(
        before.consumedUnits + 1
      );

      // Attempt to exceed the account's remaining allowance
      const rejectedResponse = await fetch(
        `${BASE_URL}/api/consume`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            userId,
            units: 2147483647,
            requestId: crypto.randomUUID(),
          }),
        }
      );

      expect(rejectedResponse.status).toBe(403);

      const rejected = await rejectedResponse.json();
      expect(rejected.accepted).toBe(false);

      // Rejected requests must not consume quota
      const finalResponse = await fetch(
        `${BASE_URL}/api/usage/account`,
        { headers }
      );

      const finalUsage = await finalResponse.json();

      expect(finalUsage.consumedUnits).toBe(
        before.consumedUnits + 1
      );
    });
  }
);
