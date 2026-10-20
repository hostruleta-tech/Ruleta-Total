import express from "express";

const app = express();

app.get("/api/express-test", (_req, res) => {
  res.json({ ok: true });
});

export default app;
