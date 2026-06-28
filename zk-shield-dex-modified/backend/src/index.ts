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
const allowedOrigins = [process.env.FRONTEND_URL, process.env.ALLOWED_ORIGINS]
  .flatMap((value) => (value ?? "").split(","))
  .map((value) => value.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
    const isRailwayLike = hostname.endsWith(".railway.app") || hostname.endsWith(".up.railway.app");
    const isCodespacesLike = hostname.endsWith(".app.github.dev");
    const isVercelLike = hostname.endsWith(".vercel.app");

    return isLocalhost || isRailwayLike || isCodespacesLike || isVercelLike;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin ?? "")) {
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
