
import { describe, it, expect } from "vitest";

const BASE_URL =
  process.env.API_BASE_URL ?? "http://localhost:3000";

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
