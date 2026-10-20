import { client } from "./index.js";

async function testConnection() {
  try {
    const result = await client`SELECT version()`;
    console.log("Database connected successfully!");
    console.log(result[0].version);
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

testConnection();