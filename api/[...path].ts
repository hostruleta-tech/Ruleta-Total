// Vercel Functions entry point (catch-all under /api).
import cors from "cors";
import express from "express";
import { router } from "../backend/app";

const app = express();

// CORS for local development (Vercel handles CORS in production).
if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: true, credentials: true }));
}

app.use(express.json());

// The frontend calls /api/*. Keep /api-ruleta for backwards compatibility.
app.use("/api", router);
app.use("/api-ruleta", router);

export default app;
