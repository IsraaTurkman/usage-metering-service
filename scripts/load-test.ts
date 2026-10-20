
export {};

const BASE_URL =
  process.env.API_BASE_URL ?? "http://localhost:3000";

const apiKey = process.env.DEMO_API_KEY;
const userId = process.env.DEMO_USER_2;

async function main() {
  if (!apiKey || !userId) {
    throw new Error("DEMO_API_KEY and DEMO_USER_2 are required");
  }

  const totalRequests = 100;
  const concurrency = 10;
  const durations: number[] = [];
  let accepted = 0;
  let rejected = 0;
  let errors = 0;

  const start = performance.now();

  for (let i = 0; i < totalRequests; i += concurrency) {
    const batch = Array.from(
      { length: Math.min(concurrency, totalRequests - i) },
      async () => {
        const requestStart = performance.now();

        try {
          const response = await fetch(`${BASE_URL}/api/consume`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
            },
            body: JSON.stringify({
              userId,
              units: 1,
              requestId: crypto.randomUUID(),
            }),
          });

          const result = await response.json();

          if (result.accepted === true) accepted++;
          else if (result.accepted === false) rejected++;
          else errors++;
        } catch {
          errors++;
        } finally {
          durations.push(performance.now() - requestStart);
        }
      },
    );

    await Promise.all(batch);
  }

  const totalSeconds = (performance.now() - start) / 1000;
  const sorted = [...durations].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted[Math.ceil(sorted.length * p) - 1]?.toFixed(2) ?? "N/A";

  console.log("\n=== LOAD TEST RESULTS ===");
  console.log("Total requests:", totalRequests);
  console.log("Concurrency:", concurrency);
  console.log("Accepted:", accepted);
  console.log("Rejected:", rejected);
  console.log("Errors:", errors);
  console.log("Duration:", totalSeconds.toFixed(2), "seconds");
  console.log("Throughput:", (totalRequests / totalSeconds).toFixed(2), "req/s");
  console.log("P50 latency:", percentile(0.5), "ms");
  console.log("P95 latency:", percentile(0.95), "ms");
  console.log("P99 latency:", percentile(0.99), "ms");
}

main().catch(console.error);
