// This is the entry point for Vercel Functions
// It exports the Express app that handles all /api-ruleta routes

import express from "express";
import cors from "cors";
import { router } from "../backend/app";

const app = express();

// CORS for local development (Vercel handles CORS in production)
if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: true, credentials: true }));
}

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Mount the router at /api-ruleta (used locally and via vercel.json rewrite)
app.use("/api-ruleta", router);

// Also mount at /api/index for Vercel's internal routing
app.use("/api/index", router);

export default app;