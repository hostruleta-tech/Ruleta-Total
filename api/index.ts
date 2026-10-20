import express from "express";
import { router } from "../backend/app";

const app = express();

app.use(express.json());

// Vercel rewrites /api/* to /api/index?__path=* so the function path stays
// valid. Restore the original path before handing the request to Express.
app.use((req, _res, next) => {
  const rawPath = req.query.__path;

  if (rawPath !== undefined) {
    const rewrittenPath = typeof rawPath === "string" ? rawPath : "";
    req.url = rewrittenPath ? `/api/${rewrittenPath}` : "/api/";
  }

  next();
});

app.use("/api", router);

export default app;
