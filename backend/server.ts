import "./env";
import express from "express";
import cors from "cors";
import { router } from "./app";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
  origin: [], // <- sobrescribir con lista explícita de dominios produción (admin)
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Operator-Password"],
}));
app.use(express.json({ limit: "4mb" }));

// Mount the router at /api (frontend) and /api-ruleta (backwards compatibility).
app.use("/api", router);
app.use("/api-ruleta", router);

app.listen(port, () => {
  console.log(
    `Ruleta TOTAL backend server listening on http://localhost:${port}`,
  );
});