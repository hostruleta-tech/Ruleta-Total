import express from "express";
import { router } from "../backend/app";

const app = express();

app.use("/api/backend-test", router);

export default app;
