/**
 * LegislaNet web backend entry point.
 *
 * Configures HTTP middleware, API routes, health checks, static assets,
 * scheduled background jobs, and graceful shutdown handling.
 *
 * @module server
 */

"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
require("dotenv").config();

const createLogger = require("./src/utils/logger");
const { startSessaoStatusScheduler } = require("./src/utils/sessoesStatusScheduler");
const { startStatsRefreshScheduler } = require("./src/utils/statsRefreshScheduler");

const serverLogger = createLogger("SERVER");

/**
 * Parses a comma-separated environment variable into a clean string list.
 *
 * @param {string} value - Comma-separated value.
 * @returns {Array<string>} Trimmed non-empty values.
 */
function parseCsv(value) {
  return (value || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Resolves allowed CORS origins for the current environment.
 *
 * @returns {Array<string|RegExp>} Allowed origin strings or regular expressions.
 */
function getAllowedOrigins() {
  const prodOrigins = parseCsv(process.env.CORS_ORIGINS);
  if (process.env.NODE_ENV === "production") {
    if (prodOrigins.length === 0) {
      serverLogger.error(
        "CORS_ORIGINS not set in production. Set CORS_ORIGINS=https://yourdomain.com"
      );
    }
    return prodOrigins;
  }
  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/,
  ];
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://cdn.socket.io",
          "https://www.youtube.com",
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          process.env.SUPABASE_URL,
          "https://legislanet.com.br",
          "wss://legislanet.com.br",
        ],
        frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

try {
  const authRoutes       = require("./src/routes/auth");
  const adminRoutes      = require("./src/routes/admin");
  const partidosRoutes   = require("./src/routes/partidos");
  const sessoesRoutes    = require("./src/routes/sessoes");
  const camaraRoutes     = require("./src/routes/camaraRoutes");
  const pautasRoutes     = require("./src/routes/pautas");
  const votosRoutes      = require("./src/routes/votos");
  const publicRoutes     = require("./src/routes/public");
  const {
    nestedVereadorRouter,
    singleVereadorRouter,
    appVereadorRouter,
  } = require("./src/routes/vereadorRoutes");
  const {
    nestedUserRouter,
    singleUserRouter,
  } = require("./src/routes/userRoutes");

  app.use("/api/auth",                    authRoutes);
  app.use("/api/admin",                   adminRoutes);
  app.use("/api/partidos",                partidosRoutes);
  app.use("/api/sessoes",                 sessoesRoutes);
  app.use("/api/camaras",                 camaraRoutes);
  app.use("/api/pautas",                  pautasRoutes);
  app.use("/api/votos",                   votosRoutes);
  app.use("/api/public",                  publicRoutes);
  app.use("/api/vereadores",              singleVereadorRouter);
  app.use("/api/users",                   singleUserRouter);
  app.use("/api/app/vereadores",          appVereadorRouter);
  app.use("/api/camaras/:camaraId/vereadores", nestedVereadorRouter);
  app.use("/api/camaras/:camaraId/users",      nestedUserRouter);

  serverLogger.log("✅ Sprint 12 routes registered successfully.");
} catch (error) {
  serverLogger.error("Failed to register routes:", error.message);
  serverLogger.error(error.stack);
}

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "web-backend",
    sprint: "12",
    version: "1.0.0",
  });
});

app.use("/uploads", express.static(path.join(__dirname, "uploads"), { maxAge: "1h", etag: true }));
app.use(express.static(path.join(__dirname, "web"), { maxAge: "1d", etag: true }));

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
  });
});

app.use((error, req, res, next) => {
  serverLogger.error("Unhandled error:", {
    message: error.message,
    url: req.url,
    method: req.method,
  });
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : error.message;
  res.status(500).json({ error: message, code: "INTERNAL_SERVER_ERROR" });
});

const server = app.listen(PORT, () => {
  serverLogger.log(`🚀 Web backend running on http://localhost:${PORT}`);
  serverLogger.log(`   Environment : ${process.env.NODE_ENV || "development"}`);
  serverLogger.log(`   Sprint scope: 12 (CRUD — auth, admin, chambers, members, sessions)`);

  try {
    startSessaoStatusScheduler();
    serverLogger.log("🕒 Session status scheduler started.");
  } catch (err) {
    serverLogger.error("Failed to start session scheduler:", err.message);
  }

  try {
    startStatsRefreshScheduler();
    serverLogger.log("📊 Stats refresh scheduler started.");
  } catch (err) {
    serverLogger.error("Failed to start stats scheduler:", err.message);
  }
});

process.on("SIGTERM", () => {
  serverLogger.log("SIGTERM received — shutting down gracefully.");
  server.close(() => serverLogger.log("HTTP server closed."));
});
