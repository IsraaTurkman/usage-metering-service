declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

async function main() {

const BASE_URL = "http://localhost:3000";


const apiKey = process.env.TEST_API_KEY;
const userId = process.env.TEST_USER_ID;

if (!apiKey || !userId) {
  throw new Error("TEST_API_KEY and TEST_USER_ID are required");
}

const requests = Array.from({ length: 20 }, (_, i) => {
  return fetch(`${BASE_URL}/api/consume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      userId,
      units: 100,
      requestId: `concurrency-${Date.now()}-${i}`,
    }),
  });
});

const responses = await Promise.all(requests);

const results = await Promise.all(
  responses.map(async (response) => ({
    status: response.status,
    body: await response.json(),
  })),
);

const accepted = results.filter(
  (result) => result.body.accepted === true,
).length;

const rejected = results.filter(
  (result) => result.body.accepted === false,
).length;

console.log("Total requests:", results.length);
console.log("Accepted:", accepted);
console.log("Rejected:", rejected);
console.log("Total units accepted:", accepted * 100);
console.log("Unexpected responses:", results.filter(
  (result) => typeof result.body.accepted !== "boolean",
));


}

main().catch((error) => {
  console.error("Concurrency test failed:", error);
  process.exitCode = 1;
});

export {};