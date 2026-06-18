/**
 * Web backend server entry point.
 *
 * Configures API routes, static assets, Socket.IO rooms, livestream services,
 * schedulers, and diagnostic request logging.
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const { createServer } = require("http");
const { Server } = require("socket.io");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const {
  startSessaoStatusScheduler,
} = require("./src/utils/sessoesStatusScheduler");
const {
  startStatsRefreshScheduler,
} = require("./src/utils/statsRefreshScheduler");
const livestreamService = require("./src/services/livestreamService");

/**
 * Creates a timestamped console logger for a server subsystem.
 *
 * @param {string} context - Label used to identify log output.
 * @returns {{log: Function, error: Function}} Logger methods.
 */
const createLogger = (context) => {
  return {
    log: (...args) => {
      if (process.env.NODE_ENV !== 'test') console.log(`[${context}]`, new Date().toISOString(), ...args);
    },
    error: (...args) => {
      if (process.env.NODE_ENV !== 'test') console.error(`[${context} ERROR]`, new Date().toISOString(), ...args);
    },
  };
};

const serverLogger = createLogger("SERVER");
const routeLogger = createLogger("ROUTES");
const middlewareLogger = createLogger("MIDDLEWARE");

/**
 * Parses a comma-separated environment value into non-empty entries.
 *
 * @param {string|undefined|null} value - CSV string to parse.
 * @returns {string[]} Trimmed values.
 */
function parseCsv(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolves the CORS origin allowlist for the current environment.
 *
 * Production only uses explicit `CORS_ORIGINS` entries. Development also allows
 * localhost and 127.0.0.1 on dynamic ports.
 *
 * @returns {(string|RegExp)[]} Allowed origins for CORS and Socket.IO.
 */
function getAllowedOrigins() {
  // Configure production origins explicitly through CORS_ORIGINS (CSV).
  const prodOrigins = parseCsv(process.env.CORS_ORIGINS);

  if (process.env.NODE_ENV === "production") {
    if (prodOrigins.length === 0) {
      serverLogger.error(
        "❌ CORS_ORIGINS não configurado em produção. Defina CORS_ORIGINS=https://legislanet.com.br",
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

/**
 * Creates middleware that logs request details and response payloads.
 *
 * @returns {Function} Express middleware.
 */
function createRequestInterceptor() {
  return (req, res, next) => {
    const startTime = Date.now();
    middlewareLogger.log(`🟦 REQUISIÇÃO RECEBIDA: ${req.method} ${req.url}`);
    middlewareLogger.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
    middlewareLogger.log(`   Body:`, req.body);
    middlewareLogger.log(`   Query:`, req.query);
    middlewareLogger.log(`   Params:`, req.params);

    // Wrap response methods to log the final payload and duration.
    const originalSend = res.send;
    const originalJson = res.json;

    res.send = function (data) {
      const duration = Date.now() - startTime;
      middlewareLogger.log(
        `🟩 RESPOSTA ENVIADA: ${res.statusCode} (${duration}ms)`,
      );
      middlewareLogger.log(`   Data:`, data);
      originalSend.call(this, data);
    };

    res.json = function (data) {
      const duration = Date.now() - startTime;
      middlewareLogger.log(
        `🟩 RESPOSTA JSON: ${res.statusCode} (${duration}ms)`,
      );
      middlewareLogger.log(`   Data:`, JSON.stringify(data, null, 2));
      originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Logs the registered Express middleware and route stack for diagnostics.
 *
 * @param {import("express").Express} app - Express application instance.
 * @returns {void}
 */
function showRegisteredRoutes(app) {
  serverLogger.log("🔍 === ROTAS REGISTRADAS NO EXPRESS ===");

  function printRoutes(routes, prefix = "") {
    routes.forEach((route, index) => {
      if (route.route) {
        const methods = Object.keys(route.route.methods)
          .join(", ")
          .toUpperCase();
        serverLogger.log(
          `   ${index + 1}. ${methods} ${prefix}${route.route.path}`,
        );
      } else if (route.name === "router") {
        let routerPrefix = route.regexp.source;
        // Convert Express router regex output into a readable path prefix.
        routerPrefix = routerPrefix
          .replace(/^\^\\?/, "")
          .replace(/\$.*/, "")
          .replace(/\\\//g, "/")
          .replace(/\(\?\:\[\^\\\/\]\+\)\?\$/g, "");

        serverLogger.log(`   📁 ROUTER: ${routerPrefix}`);
        if (route.handle && route.handle.stack) {
          printRoutes(route.handle.stack, routerPrefix);
        }
      } else {
        serverLogger.log(
          `   ${index + 1}. MIDDLEWARE: ${route.name || "anonymous"}`,
        );
      }
    });
  }

  if (app._router && app._router.stack) {
    serverLogger.log(
      `📊 Total de middlewares/rotas: ${app._router.stack.length}`,
    );
    printRoutes(app._router.stack);
  } else {
    serverLogger.error("❌ Nenhuma rota encontrada no stack do Express!");
  }
}

/**
 * Creates the final API fallback handler for unmatched routes.
 *
 * @returns {Function} Express middleware.
 */
function create404Handler() {
  return (req, res, next) => {
    middlewareLogger.error(`❌ 404 NOT FOUND: ${req.method} ${req.url}`);
    middlewareLogger.error(`   Esta rota não foi encontrada no Express`);
    middlewareLogger.error(
      `   Verifique se a rota foi registrada corretamente`,
    );

    res.status(404).json({
      error: "Rota não encontrada",
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString(),
      debug: "Middleware 404 personalizado - rota não existe",
    });
  };
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ["GET", "POST"],
  },
});
const PORT = process.env.PORT || 3000;

serverLogger.log("🚀 === INICIANDO SERVIDOR DE DEBUG ===");

// Register request diagnostics before other middleware.
serverLogger.log("1️⃣ Registrando interceptador de requisições...");
app.use(createRequestInterceptor());

serverLogger.log("1.5️⃣ Registrando Swagger Documentation...");
const setupSwagger = require('./src/config/swagger');
setupSwagger(app);

// Security middleware.
serverLogger.log("2️⃣ Registrando Helmet...");
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
        scriptSrcAttr: ["'unsafe-inline'"], // Allows legacy inline event attributes.
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          process.env.SUPABASE_URL,
          "https://cdn.socket.io",
          "https://legislanet.com.br",
          "wss://legislanet.com.br",
          "http://localhost:3002",
          "http://127.0.0.1:3002",
          "http://localhost:3003",
          "http://127.0.0.1:3003",
        ],
        frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS for web clients.
serverLogger.log("3️⃣ Registrando CORS...");
app.use(
  cors({
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Request body parsing.
serverLogger.log("4️⃣ Registrando express.json...");
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Import and register API routes.
serverLogger.log("5️⃣ Tentando importar rotas...");
try {
  const authRoutes = require("./src/routes/auth");
  const adminRoutes = require("./src/routes/admin");
  const partidosRoutes = require("./src/routes/partidos");
  const pautasRoutes = require("./src/routes/pautas");
  const sessoesRoutes = require("./src/routes/sessoes");
  const votosRoutes = require("./src/routes/votos");

  const camaraRoutes = require("./src/routes/camaraRoutes");
  const publicRoutes = require("./src/routes/public");
  const livestreamService = require("./src/services/livestreamService");
  const livestreamRoutes = require("./src/routes/livestreamRoutes");
  const webhookRoutes = require("./src/routes/webhookRoutes");
  const painelControleRoutes = require("./src/routes/painelControle");
  const votacaoAoVivoRoutes = require("./src/routes/votacaoAoVivo");
  const falaAoVivoRoutes = require("./src/routes/falaAoVivo");
  const {
    nestedVereadorRouter,
    singleVereadorRouter,
    appVereadorRouter,
  } = require("./src/routes/vereadorRoutes");
  const {
    nestedUserRouter,
    singleUserRouter,
  } = require("./src/routes/userRoutes");

  serverLogger.log("✅ Rotas importadas com sucesso!");

  serverLogger.log("6️⃣ Registrando rotas...");

  // Register public routes before authenticated API routers.
  app.use("/api", publicRoutes);

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/partidos", partidosRoutes);
  app.use("/api/pautas", pautasRoutes);
  app.use("/api/sessoes", sessoesRoutes);
  app.use("/api/votos", votosRoutes);

  app.use("/api/camaras", camaraRoutes);
  app.use("/api/livestreams", livestreamRoutes);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/painel-controle", painelControleRoutes);
  app.use("/api/votacao-ao-vivo", votacaoAoVivoRoutes);
  app.use("/api/fala-ao-vivo", falaAoVivoRoutes);
  app.use("/api/vereadores", singleVereadorRouter);
  app.use("/api/users", singleUserRouter);
  app.use("/api/app/vereadores", appVereadorRouter);

  app.use("/api/camaras/:camaraId/vereadores", nestedVereadorRouter);
  app.use("/api/camaras/:camaraId/users", nestedUserRouter);

  serverLogger.log("✅ Rotas registradas com sucesso!");
} catch (error) {
  serverLogger.error("❌ ERRO AO IMPORTAR OU REGISTRAR ROTAS:", error);
  serverLogger.error("Stack:", error.stack);
}

/**
 * Health check endpoint for monitoring and uptime checks.
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "web-backend",
    version: "1.0.0",
  });
});
serverLogger.log("5.5️⃣ Health check endpoint registrado!");

// Serve uploaded agenda item and councilor assets.
serverLogger.log("7️⃣ Registrando pasta de uploads...");
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "1h", // Cache uploads for one hour.
    etag: true,
  }),
);

// Serve test scripts without client-side caching.
serverLogger.log("7.5️⃣ Registrando pasta de scripts de teste...");
app.use(
  "/scripts",
  express.static(path.join(__dirname, "scripts"), {
    maxAge: "0",
    etag: false,
  }),
);

// Serve the web app after API routes.
serverLogger.log("8️⃣ Registrando arquivos estáticos...");
app.use(
  express.static(path.join(__dirname, "web"), {
    maxAge: "1d", // Cache static assets for one day.
    etag: true,
  }),
);

showRegisteredRoutes(app);

// Register the 404 handler after API and static routes.
serverLogger.log("9️⃣ Registrando handler 404...");
app.use(create404Handler());

// Global error handler.
app.use((error, req, res, next) => {
  serverLogger.error("💥 ERRO GLOBAL:", {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Avoid exposing internal error details in production.
  const message =
    process.env.NODE_ENV === "production"
      ? "Erro interno do servidor"
      : error.message;

  res.status(500).json({
    error: message,
    code: "INTERNAL_SERVER_ERROR",
  });
});

// SPA fallback route.
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "web", "index.html"));
});

process.on("SIGTERM", () => {
  serverLogger.log("SIGTERM signal received: closing HTTP server");

  try {
    const livestreamService = require("./src/services/livestreamService");
    livestreamService.stopAutoCheck();
    serverLogger.log("📺 Serviço de livestream parado");
  } catch (error) {
    serverLogger.error("Erro ao parar serviço de livestream:", error.message);
  }

  server.close(() => {
    serverLogger.log("HTTP server closed");
  });
});

// Socket.IO rooms for livestream, portal, voting, and TV clients.
io.on("connection", (socket) => {
  serverLogger.log(`🔌 Cliente WebSocket conectado: ${socket.id}`);

  socket.on("join-camara", (camaraId) => {
    socket.join(`camara-${camaraId}`);
    serverLogger.log(
      `📡 Cliente ${socket.id} entrou na sala da câmara: ${camaraId}`,
    );
  });

  socket.on("leave-camara", (camaraId) => {
    socket.leave(`camara-${camaraId}`);
    serverLogger.log(
      `📡 Cliente ${socket.id} saiu da sala da câmara: ${camaraId}`,
    );
  });

  socket.on("join-portal-camara", (camaraId) => {
    socket.join(`portal-camara-${camaraId}`);
    serverLogger.log(
      `🏡 Cliente ${socket.id} entrou no portal da câmara: ${camaraId}`,
    );
  });

  socket.on("leave-portal-camara", (camaraId) => {
    socket.leave(`portal-camara-${camaraId}`);
    serverLogger.log(
      `🏡 Cliente ${socket.id} saiu do portal da câmara: ${camaraId}`,
    );
  });

  socket.on("join-room", (roomName) => {
    socket.join(roomName);
    serverLogger.log(`🔗 Cliente ${socket.id} entrou na sala: ${roomName}`);
    socket.emit("room-joined", {
      room: roomName,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on("leave-room", (roomName) => {
    socket.leave(roomName);
    serverLogger.log(`🔗 Cliente ${socket.id} saiu da sala: ${roomName}`);
  });

  socket.on("disconnect", () => {
    serverLogger.log(`🔌 Cliente WebSocket desconectado: ${socket.id}`);
  });

  // Zero-quota livestream end signal from the frontend player.
  socket.on("livestream-ended", async (payload) => {
    try {
      const { videoId, camaraId } = payload;
      if (videoId && camaraId) {
        serverLogger.log(
          `🛑 Frontend ${socket.id} reportou fim da live: ${videoId}`,
        );
        await livestreamService.markAsEnded(videoId, camaraId);
      }
    } catch (err) {
      serverLogger.error("Erro no handler livestream-ended", err);
    }
  });

  // Authenticated TV room joins by chamber and agenda item.
  socket.on("tv:join-camara", async (payload) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      const camaraId = payload && (payload.camaraId || payload.camara_id);
      serverLogger.log(
        `tv:join-camara pedido por ${socket.id}. CamaraId: ${camaraId}`,
      );

      if (!token) {
        socket.emit("tv:join-error", { error: "Token ausente" });
        return;
      }

      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      );

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        serverLogger.log(
          "tv:join-camara - token inválido para socket",
          socket.id,
          userError,
        );
        socket.emit("tv:join-error", { error: "Token inválido" });
        return;
      }

      const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
      );
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("role, camara_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        serverLogger.log(
          "tv:join-camara - perfil não encontrado",
          socket.id,
          profileError,
        );
        socket.emit("tv:join-error", { error: "Perfil não encontrado" });
        return;
      }

      if (profile.role !== "tv") {
        serverLogger.log(
          "tv:join-camara - acesso negado, role não é tv",
          socket.id,
          profile.role,
        );
        socket.emit("tv:join-error", { error: "Acesso negado" });
        return;
      }

      if (
        camaraId &&
        profile.camara_id &&
        profile.camara_id.toString() !== camaraId.toString()
      ) {
        serverLogger.log(
          "tv:join-camara - tentativa de join em câmara diferente",
          socket.id,
        );
        socket.emit("tv:join-error", {
          error: "Câmara inválida para esta credencial",
        });
        return;
      }

      // Join the TV room only after the socket token and chamber match.
      const roomName = `tv-camara-${profile.camara_id || camaraId}`;
      socket.join(roomName);
      serverLogger.log(`📺 TV ${socket.id} entrou na sala: ${roomName}`);
      socket.emit("tv:joined", { room: roomName });
    } catch (err) {
      serverLogger.error("Erro em tv:join-camara", err.message || err);
      socket.emit("tv:join-error", { error: "Erro interno ao validar TV" });
    }
  });

  socket.on("tv:leave-camara", (payload) => {
    try {
      const camaraId = payload && (payload.camaraId || payload.camara_id);
      const roomName = `tv-camara-${camaraId}`;
      socket.leave(roomName);
      serverLogger.log(`📺 TV ${socket.id} saiu da sala: ${roomName}`);
      socket.emit("tv:left", { room: roomName });
    } catch (err) {
      serverLogger.error("Erro em tv:leave-camara", err.message || err);
    }
  });

  socket.on("tv:join-pauta", async (payload) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      const pautaId = payload && (payload.pautaId || payload.pauta_id);
      serverLogger.log(
        `tv:join-pauta pedido por ${socket.id}. PautaId: ${pautaId}`,
      );

      if (!token) {
        socket.emit("tv:join-error", { error: "Token ausente" });
        return;
      }

      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      );

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        serverLogger.log(
          "tv:join-pauta - token inválido para socket",
          socket.id,
          userError,
        );
        socket.emit("tv:join-error", { error: "Token inválido" });
        return;
      }

      const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
      );
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("role, camara_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        serverLogger.log(
          "tv:join-pauta - perfil não encontrado",
          socket.id,
          profileError,
        );
        socket.emit("tv:join-error", { error: "Perfil não encontrado" });
        return;
      }

      if (profile.role !== "tv") {
        serverLogger.log(
          "tv:join-pauta - acesso negado, role não é tv",
          socket.id,
          profile.role,
        );
        socket.emit("tv:join-error", { error: "Acesso negado" });
        return;
      }

      // Ensure the agenda item belongs to the same chamber as the TV profile.
      const { data: pauta, error: pautaError } = await supabaseAdmin
        .from("pautas")
        .select("id, sessoes ( camara_id )")
        .eq("id", pautaId)
        .single();

      if (pautaError || !pauta) {
        serverLogger.log(
          "tv:join-pauta - pauta não encontrada",
          socket.id,
          pautaError,
        );
        socket.emit("tv:join-error", { error: "Pauta não encontrada" });
        return;
      }

      const pautaCamaraId = pauta.sessoes && pauta.sessoes.camara_id;
      if (
        !pautaCamaraId ||
        pautaCamaraId.toString() !== (profile.camara_id || "").toString()
      ) {
        serverLogger.log(
          "tv:join-pauta - pauta de câmara diferente",
          socket.id,
        );
        socket.emit("tv:join-error", {
          error: "Pauta não pertence à câmara desta TV",
        });
        return;
      }

      const roomName = `tv-pauta-${pautaId}`;
      socket.join(roomName);
      // Also join the chamber room for general TV notifications.
      socket.join(`tv-camara-${profile.camara_id}`);
      serverLogger.log(
        `📺 TV ${socket.id} entrou na sala: ${roomName} e tv-camara-${profile.camara_id}`,
      );
      socket.emit("tv:joined-pauta", { room: roomName });
    } catch (err) {
      serverLogger.error("Erro em tv:join-pauta", err.message || err);
      socket.emit("tv:join-error", { error: "Erro interno ao validar pauta" });
    }
  });
});

// Expose Socket.IO to controllers and services that emit server-side events.
global.io = io;
app.set("io", io);

// Initialize livestream polling and YouTube webhook subscription services.
try {
  const livestreamService = require("./src/services/livestreamService");
  const youtubeWebhookService = require("./src/services/youtubeWebhookService");

  const envAutoSubscribe = (
    process.env.YOUTUBE_WEBHOOK_AUTO_SUBSCRIBE || ""
  ).toLowerCase();
  const defaultAutoSubscribe = process.env.NODE_ENV === "production";
  const shouldAutoSubscribe = envAutoSubscribe
    ? envAutoSubscribe === "1" ||
      envAutoSubscribe === "true" ||
      envAutoSubscribe === "yes"
    : defaultAutoSubscribe;

  // Delay startup checks until the HTTP and WebSocket servers are ready.
  setTimeout(() => {
    if (process.env.NODE_ENV === 'test') return;

    livestreamService.startAutoCheck();
    serverLogger.log("📺 Serviço de verificação de livestreams iniciado");

    try {
      const callbackUrl = process.env.YOUTUBE_WEBHOOK_CALLBACK_URL;
      const hasHttpsCallback = !!(
        callbackUrl && callbackUrl.startsWith("https://")
      );

      if (
        shouldAutoSubscribe &&
        youtubeWebhookService.webhooksEnabled &&
        hasHttpsCallback
      ) {
        youtubeWebhookService.subscribeToAllChannels();
        serverLogger.log("🔔 Webhooks do YouTube: auto-subscrição iniciada");
      } else {
        serverLogger.log(
          "🔕 Webhooks do YouTube: auto-subscrição desabilitada/indisponível",
          {
            shouldAutoSubscribe,
            webhooksEnabled: youtubeWebhookService.webhooksEnabled,
            hasHttpsCallback,
            env: process.env.NODE_ENV || "development",
          },
        );
      }
    } catch (err) {
      serverLogger.error(
        "❌ Falha ao iniciar auto-subscrição de webhooks:",
        err,
      );
    }
  }, 5000);
} catch (error) {
  serverLogger.error(
    "❌ Erro ao inicializar serviço de livestream:",
    error.message,
  );
}

if (process.env.NODE_ENV !== 'test') {
  const server = httpServer.listen(PORT, () => {
    serverLogger.log("🎯 === SERVIDOR INICIADO COM SUCESSO ===");
    serverLogger.log(`🌐 URL: http://localhost:${PORT}`, {
      env: process.env.NODE_ENV || "development",
      pid: process.pid,
    });
    serverLogger.log(
      "🔍 Logs detalhados de requisições e rotas serão exibidos aqui.",
    );
    serverLogger.log(
      "📺 Verificação de livestreams será iniciada em 5 segundos...",
    );

    // Daily session status update at 00:01.
    try {
      startSessaoStatusScheduler();
      serverLogger.log("🕒 Scheduler de status de sessões iniciado");
    } catch (err) {
      serverLogger.error("❌ Falha ao iniciar scheduler de sessões:", err);
    }

    // Daily statistics materialized view refresh at 23:59.
    try {
      startStatsRefreshScheduler();
      serverLogger.log("📊 Scheduler de refresh de estatísticas iniciado");
    } catch (err) {
      serverLogger.error("❌ Falha ao iniciar scheduler de estatísticas:", err);
    }
  });
}

module.exports = app;
