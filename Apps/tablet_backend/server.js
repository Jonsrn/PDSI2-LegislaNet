/**
 * Tablet backend server entry point.
 *
 * Configures security middleware, CORS, request logging, API routes, static
 * downloads, notification forwarding, Socket.IO, and process-level handlers.
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const createLogger = require("./src/config/logger");
const websocketService = require("./src/services/websocketService");

// Dependências de Documentação
const swaggerUi = require("swagger-ui-express");
const basicAuth = require("express-basic-auth");
const swaggerDocs = require("./src/config/swagger");

const logger = createLogger("TABLET_SERVER");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3003;

logger.info("🚀 === INICIANDO SERVIDOR TABLET BACKEND ===");

// Rate limiting aligned with the main API strict tablet/APK limits.
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10000,
  message: {
    error: "Limite de operações excedido. Aguarde 5 minutos.",
    code: "STRICT_RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

logger.info("🛡️ Configurando middleware de segurança...");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", process.env.SUPABASE_URL],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

logger.info("🌐 Configurando CORS...");
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : [
      "http://localhost:61188",
      "http://localhost:3000",
      "http://127.0.0.1:3001",
    ];

/**
 * CORS options for tablet clients and development localhost tooling.
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without an Origin header, such as mobile apps and Postman.
    if (!origin) return callback(null, true);

    // Allow local development ports without enumerating every Flutter run port.
    if (process.env.NODE_ENV !== "production") {
      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return callback(null, true);
      }
    }

    if (corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    logger.warn(`CORS blocked origin: ${origin}`);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

app.use(limiter);

logger.info("📝 Configurando parsing de requisições...");
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/**
 * Logs each request and its response status/duration.
 */
app.use((req, res, next) => {
  const startTime = Date.now();

  logger.info(`📥 ${req.method} ${req.url}`, {
    userAgent: req.get("User-Agent"),
    ip: req.ip,
    contentType: req.get("Content-Type"),
  });

  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    logger.info(
      `📤 ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`,
    );
    originalSend.call(this, data);
  };

  next();
});

logger.info("📍 Registrando rotas...");
try {
  const authRoutes = require("./src/routes/auth");
  const vereadorRoutes = require("./src/routes/vereador");
  const pautaRoutes = require("./src/routes/pauta");
  const votoRoutes = require("./src/routes/voto");
  const systemRoutes = require("./src/routes/system");

  app.use("/api/auth", authRoutes);
  app.use("/api/vereador", vereadorRoutes);
  app.use("/api/pautas", pautaRoutes);
  app.use("/api/votos", votoRoutes);
  app.use("/api/system", systemRoutes);

  // Rota do Swagger protegida
  app.use(
    "/api-docs",
    basicAuth({
      users: { admin: "123" },
      challenge: true,
    }),
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocs)
  );

  // Serve downloadable APK assets and version metadata from /downloads.
  const path = require("path");
  app.use(
    "/downloads",
    express.static(path.join(__dirname, "public/downloads")),
  );

  logger.info("✅ Rotas registradas com sucesso!");
} catch (error) {
  logger.error("❌ Erro ao registrar rotas:", {
    error: error.message,
    stack: error.stack,
  });
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Verifica o status de saúde do servidor
 *     description: Retorna o status operacional da API do Tablet Backend
 *     tags: [Sistema]
 *     responses:
 *       200:
 *         description: Servidor está saudável e respondendo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 service:
 *                   type: string
 *                   example: tablet-backend
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "tablet-backend",
    version: "1.0.0",
  });
});

/**
 * Receives pauta status-change notifications and forwards them to tablet sockets.
 */
app.post("/api/notify/pauta-status-change", (req, res) => {
  try {
    const { pautaId, pautaNome, oldStatus, newStatus, resultado, camaraId } =
      req.body;

    logger.info(
      `📡 Recebida notificação de mudança de status da pauta ${pautaId}: ${oldStatus} → ${newStatus}`,
    );

    websocketService.notifyPautaStatusChange(pautaId, newStatus, resultado);

    res.status(200).json({
      success: true,
      message: "Notificação enviada com sucesso",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      "❌ Erro ao processar notificação de mudança de status:",
      error,
    );
    res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Starts tablet voting screens and forwards live-voting state to the web backend.
 */
app.post("/api/notify/iniciar-votacao", (req, res) => {
  try {
    const {
      camaraId,
      pautaId,
      pautaNome,
      pautaDescricao,
      sessaoNome,
      sessaoTipo,
      sessaoDataHora,
      action,
    } = req.body;

    logger.info(
      `🗳️ Recebida solicitação para iniciar votação da pauta ${pautaId} na câmara ${camaraId}`,
    );

    const vereadoresOnline = websocketService.notifyIniciarVotacao(
      camaraId,
      pautaId,
      pautaNome,
    );

    const http = require("http");
    const notificationPayload = JSON.stringify({
      camaraId,
      pautaId,
      pautaNome,
      pautaDescricao,
      sessaoNome,
      sessaoTipo,
      sessaoDataHora,
      vereadoresOnline,
      status: "iniciada",
      timestamp: new Date().toISOString(),
    });

    const options = {
      hostname: "localhost",
      port: 3000,
      path: "/api/votacao-ao-vivo/notify",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(notificationPayload),
      },
    };

    const request = http.request(options, (response) => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        logger.info(
          `✅ Portal público notificado sobre início de votação - ${vereadoresOnline} vereadores online`,
        );
      } else {
        logger.warn(
          `⚠️ Falha ao notificar portal público: ${response.statusCode}`,
        );
      }
    });

    request.on("error", (error) => {
      logger.warn(`⚠️ Erro ao notificar portal público: ${error.message}`);
    });

    request.write(notificationPayload);
    request.end();

    res.status(200).json({
      success: true,
      message: "Notificação de início de votação enviada",
      vereadoresOnline,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("❌ Erro ao processar início de votação:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Ends tablet voting screens and forwards the ended state to the web backend.
 */
app.post("/api/notify/encerrar-votacao", (req, res) => {
  try {
    const { camaraId, pautaId, pautaNome, resultado } = req.body;

    logger.info(
      `🏁 Recebida solicitação para encerrar votação da pauta ${pautaId} na câmara ${camaraId}`,
    );

    websocketService.notifyEncerrarVotacao(
      camaraId,
      pautaId,
      pautaNome,
      resultado,
    );

    const http = require("http");
    const notificationPayload = JSON.stringify({
      camaraId,
      pautaId,
      pautaNome,
      vereadoresOnline: 0,
      status: "encerrada",
      resultado,
      timestamp: new Date().toISOString(),
    });

    const options = {
      hostname: "localhost",
      port: 3000,
      path: "/api/votacao-ao-vivo/notify",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(notificationPayload),
      },
    };

    const request = http.request(options, (response) => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        logger.info(
          `✅ Portal público notificado sobre encerramento - Resultado: ${resultado}`,
        );
      }
    });

    request.on("error", (error) => {
      logger.warn(
        `⚠️ Erro ao notificar portal público sobre encerramento: ${error.message}`,
      );
    });

    request.write(notificationPayload);
    request.end();

    res.status(200).json({
      success: true,
      message: "Notificação de encerramento de votação enviada",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("❌ Erro ao processar encerramento de votação:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Notifies tablet clients that a new pauta was created.
 */
app.post("/api/notify/nova-pauta", (req, res) => {
  try {
    const { camaraId, pautaId, pautaNome, status } = req.body;

    logger.info(
      `📝 Recebida notificação de nova pauta: ${pautaNome} (ID: ${pautaId}) - Câmara: ${camaraId}`,
    );

    websocketService.notifyNovaPauta(camaraId, pautaId, pautaNome, status);

    res.status(200).json({
      success: true,
      message: "Notificação de nova pauta enviada",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("❌ Erro ao processar notificação de nova pauta:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Notifies tablet clients that a speaker turn has started.
 */
app.post("/api/notify/iniciar-fala", (req, res) => {
  try {
    const { camaraId, oradorId, oradorNome, sessaoNome, tempoFala, action } =
      req.body;

    logger.info(
      `🎤 Recebida solicitação para iniciar fala do orador ${oradorNome} na câmara ${camaraId}`,
    );

    websocketService.notifyIniciarFala(
      camaraId,
      oradorId,
      oradorNome,
      sessaoNome,
      tempoFala,
    );

    res.status(200).json({
      success: true,
      message: "Notificação de início de fala enviada",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("❌ Erro ao processar início de fala:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Returns JSON for unmatched routes.
 */
app.use("*", (req, res) => {
  logger.warn(`❌ 404 NOT FOUND: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: "Rota não encontrada",
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Handles unhandled Express errors with environment-aware error messages.
 */
app.use((error, req, res, next) => {
  logger.error("💥 ERRO GLOBAL:", {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  const message =
    process.env.NODE_ENV === "production"
      ? "Erro interno do servidor"
      : error.message;

  res.status(500).json({
    error: message,
    code: "INTERNAL_SERVER_ERROR",
    timestamp: new Date().toISOString(),
  });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    logger.info("HTTP server closed");
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", {
    promise,
    reason,
  });
});

logger.info("🔌 Inicializando WebSocket...");
websocketService.initialize(server);

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, "0.0.0.0", () => {
    logger.info("🎯 === SERVIDOR TABLET INICIADO COM SUCESSO ===");
    logger.info(`🌐 Servidor escutando em todas as interfaces:`, {
      url: `http://localhost:${PORT}`,
      ip: `http://0.0.0.0:${PORT}`,
      env: process.env.NODE_ENV || "development",
      pid: process.pid,
      corsOrigins,
    });
    logger.info("📱 Pronto para receber requisições do aplicativo tablet!");
    logger.info("🔌 WebSocket ativo para notificações em tempo real!");
    logger.info("🔍 Testando conectividade: curl http://localhost:3001/health");
  });
}

module.exports = app;
