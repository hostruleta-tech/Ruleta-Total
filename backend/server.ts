import "./env";
import express from "express";
import cors from "cors";
import { router } from "./app";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Mount the router at /api (frontend) and /api-ruleta (backwards compatibility).
app.use("/api", router);
app.use("/api-ruleta", router);

app.listen(port, () => {
  console.log(
    `Keyton Roulette backend server listening on http://localhost:${port}`,
  );
});