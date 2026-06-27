/**
 * ZK Shield DEX — Backend API
 * Express server: ZK proof pipeline + Stellar Testnet integration
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { tradeRouter } from "./routes/trade";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3000")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
  })
);
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", tradeRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ZK Shield DEX Backend",
    network: "Stellar Testnet",
    contractId: process.env.CONTRACT_ID ?? "DEMO_MODE",
    timestamp: new Date().toISOString(),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   🛡️  ZK Shield DEX — Backend Running      ║
║   Network : Stellar Testnet                ║
║   Port    : ${PORT}                           ║
║   Contract: ${(process.env.CONTRACT_ID ?? "DEMO_MODE").slice(0, 20).padEnd(20)}... ║
╚════════════════════════════════════════════╝
  `);
});

export default app;
