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
