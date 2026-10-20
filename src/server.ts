import "dotenv/config";
import { accountsRouter } from "./routes/accounts.js";
import { usersRouter } from "./routes/users.js";
import { plansRouter } from "./routes/plans.js";
import { consumeRouter } from "./routes/consume.js";
import { usageRouter } from "./routes/usage.js";

import express from "express";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use("/api/accounts", accountsRouter);
app.use("/api/users", usersRouter);
app.use("/api/plans", plansRouter);
app.use("/api/consume", consumeRouter);
app.use("/api/usage", usageRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "usage-metering-service",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});