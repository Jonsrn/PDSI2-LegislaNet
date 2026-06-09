const { Server } = require("socket.io");
const { supabaseAdmin } = require("../config/supabase");
const createLogger = require("../config/logger");

const logger = createLogger("WEBSOCKET_SERVICE");

/**
 * Manages Socket.IO connections for tablet clients, chamber rooms, pauta rooms,
 * and voting-related real-time notifications.
 */
class WebSocketService {
  /**
   * Creates in-memory indexes for connected users and active Socket.IO rooms.
   */
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> { socketId, camaraId, role, isPresidente }
    this.camaraRooms = new Map(); // camaraId -> Set(socketIds)
    this.pautaRooms = new Map(); // pautaId -> Set(socketIds)
  }

  /**
   * Replays an active live-voting start event to an authenticated socket after reconnect.
   *
   * @param {import("socket.io").Socket} socket - Socket.IO client connection.
   * @returns {Promise<void>}
   */
  async syncVotacaoAoVivoOnConnect(socket) {
    try {
      if (!socket || socket.isPublic) return;
      if (!socket.camaraId) return;

      const http = require("http");
      const camaraId = socket.camaraId;
      const path = `/api/votacao-ao-vivo/status/${encodeURIComponent(
        camaraId
      )}`;

      await new Promise((resolve) => {
        const req = http.request(
          {
            hostname: "localhost",
            port: 3000,
            path,
            method: "GET",
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => {
              body += chunk;
            });
            res.on("end", () => {
              try {
                if (!(res.statusCode >= 200 && res.statusCode < 300)) {
                  return resolve();
                }

                const data = body ? JSON.parse(body) : null;
                if (!data || !data.isLive || !Array.isArray(data.votacoes)) {
                  return resolve();
                }

                const votacao = data.votacoes[0];
                if (!votacao || !votacao.pautaId) return resolve();

                socket.emit("iniciar-votacao", {
                  type: "iniciar-votacao",
                  pautaId: votacao.pautaId,
                  pautaNome: votacao.pautaNome || "Pauta sem nome",
                  action: "open-voting-screen",
                  timestamp: new Date().toISOString(),
                  source: "status-sync",
                });

                logger.info(
                  `🔁 Sync votação ao vivo: reenviando iniciar-votacao para socket ${socket.id} (câmara ${camaraId}, pauta ${votacao.pautaId})`
                );
              } catch (_) {
                // best-effort
              }
              resolve();
            });
          }
        );

        req.setTimeout(2000, () => {
          try {
            req.destroy(new Error("timeout"));
          } catch (_) {
            // best-effort
          }
          resolve();
        });

        req.on("error", () => resolve());
        req.end();
      });
    } catch (_) {
      // best-effort
    }
  }

  /**
   * Sends a voting-end event to a socket when the requested pauta is no longer live.
   *
   * @param {import("socket.io").Socket} socket - Socket.IO client connection.
   * @param {string|number} pautaId - Pauta identifier to verify against the live voting status.
   * @param {string} pautaNome - Display name used in the emitted event.
   * @returns {Promise<void>}
   */
  async syncEncerramentoIfNotLiveForPauta(socket, pautaId, pautaNome) {
    try {
      if (!socket || socket.isPublic) return;
      if (!socket.camaraId) return;
      if (!pautaId) return;

      const http = require("http");
      const camaraId = socket.camaraId;
      const path = `/api/votacao-ao-vivo/status/${encodeURIComponent(
        camaraId
      )}`;

      await new Promise((resolve) => {
        const req = http.request(
          {
            hostname: "localhost",
            port: 3000,
            path,
            method: "GET",
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => {
              body += chunk;
            });
            res.on("end", () => {
              try {
                if (!(res.statusCode >= 200 && res.statusCode < 300)) {
                  return resolve();
                }

                const data = body ? JSON.parse(body) : null;
                const isLive = !!(data && data.isLive);
                const votacoes = Array.isArray(data?.votacoes)
                  ? data.votacoes
                  : [];

                const pautaIdStr = pautaId.toString();
                const hasThisPautaLive =
                  isLive &&
                  votacoes.some(
                    (v) => v && v.pautaId && v.pautaId.toString() === pautaIdStr
                  );

                if (hasThisPautaLive) return resolve();

                socket.emit("encerrar-votacao", {
                  type: "encerrar-votacao",
                  pautaId,
                  pautaNome: pautaNome || "Pauta sem nome",
                  resultado: "Finalizada",
                  action: "return-to-dashboard",
                  timestamp: new Date().toISOString(),
                  source: "status-sync",
                });

                logger.info(
                  `🔁 Sync encerramento: enviando encerrar-votacao para socket ${socket.id} (câmara ${camaraId}, pauta ${pautaIdStr})`
                );
              } catch (_) {
                // best-effort
              }
              resolve();
            });
          }
        );

        req.setTimeout(2000, () => {
          try {
            req.destroy(new Error("timeout"));
          } catch (_) {
            // best-effort
          }
          resolve();
        });

        req.on("error", () => resolve());
        req.end();
      });
    } catch (_) {
      // best-effort
    }
  }

  /**
   * Initializes the Socket.IO server and registers middleware and event handlers.
   *
   * @param {import("http").Server} server - HTTP server used by Socket.IO.
   * @returns {void}
   */
  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: true,
        credentials: true,
        methods: ["GET", "POST"],
      },
      transports: ["websocket", "polling"],
      pingTimeout: 5000,
      pingInterval: 2000,
      upgradeTimeout: 2000,
      allowEIO3: true,
      compression: false,
      perMessageDeflate: false,
      httpCompression: false,
    });

    this.setupMiddleware();
    this.setupConnectionHandlers();

    logger.info("🚀 WebSocket servidor inicializado com sucesso");
  }

  /**
   * Decodes the payload section of a JWT for session freshness checks.
   *
   * @param {string} token - JWT string.
   * @returns {Object|null} Parsed JWT payload, or null when decoding fails.
   */
  decodeJwtPayload(token) {
    try {
      const payloadBase64 = token.split(".")[1];
      const decodedJson = Buffer.from(payloadBase64, "base64").toString();
      return JSON.parse(decodedJson);
    } catch (error) {
      logger.error("Erro ao decodificar o payload do JWT:", {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Registers Socket.IO authentication middleware.
   *
   * Public connections are allowed for read-only viewing. Authenticated clients
   * must be vereadores, must have a valid Supabase session, and must pass the
   * profile minimum-token-IAT check used by HTTP middleware.
   *
   * @returns {void}
   */
  setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth.token ||
          socket.handshake.headers.authorization?.replace("Bearer ", "");

        if (!token) {
          socket.isPublic = true;
          logger.info(
            "🌐 [WebSocket] Conexão pública permitida para visualização"
          );
          next();
          return;
        }

        logger.info("🔐 [WebSocket] Iniciando verificação de autenticação...");
        logger.info(
          `🔐 [WebSocket] Token recebido: ${token.substring(0, 20)}...`
        );

        const {
          data: { user },
          error: userError,
        } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
          logger.error("❌ [WebSocket] Token inválido ou expirado:", {
            error: userError?.message,
          });
          throw new Error("Token inválido ou expirado");
        }

        logger.info(
          `✅ [WebSocket] Usuário ${user.id} (${user.email}) autenticado com sucesso`
        );

        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("role, camara_id, min_token_iat, nome")
          .eq("id", user.id)
          .single();

        if (profileError || !profile) {
          logger.error(
            `❌ [WebSocket] Perfil não encontrado para o usuário ${user.id}:`,
            { error: profileError?.message }
          );
          throw new Error("Perfil de usuário não encontrado");
        }

        logger.info(
          `📋 [WebSocket] Perfil encontrado. Role: '${profile.role}', Câmara: ${profile.camara_id}`
        );

        if (profile.role !== "vereador") {
          logger.error(
            `❌ [WebSocket] Acesso negado. Role '${profile.role}' não permitida`
          );
          throw new Error("Acesso restrito a vereadores");
        }

        const tokenPayload = this.decodeJwtPayload(token);
        const iatDoToken = tokenPayload ? tokenPayload.iat : null;
        const iatMinimoDoPerfil = profile.min_token_iat;

        logger.info(
          `🔐 [WebSocket] Comparando IATs. Token IAT: ${iatDoToken}, Perfil IAT Mínimo: ${iatMinimoDoPerfil}`
        );

        if (!tokenPayload || tokenPayload.iat < profile.min_token_iat) {
          logger.warn(
            `❌ [WebSocket] Token antigo detectado. IAT: ${tokenPayload?.iat}, IAT mínimo: ${profile.min_token_iat}`
          );
          throw new Error("Sessão expirada. Faça login novamente");
        }

        const { data: vereadorData, error: vereadorError } = await supabaseAdmin
          .from("vereadores")
          .select(
            "id, nome_parlamentar, camara_id, is_presidente, is_vice_presidente, partido_id"
          )
          .eq("profile_id", user.id)
          .single();

        if (vereadorError || !vereadorData) {
          logger.error(
            `❌ [WebSocket] Dados do vereador não encontrados para ${user.id}:`,
            { error: vereadorError?.message }
          );
          throw new Error("Dados do vereador não encontrados");
        }

        socket.userId = user.id;
        socket.userEmail = user.email;
        socket.profile = profile;
        socket.vereadorData = vereadorData;
        socket.camaraId = vereadorData.camara_id;
        socket.isPresidente = vereadorData.is_presidente;

        logger.info(
          `✅ [WebSocket] Acesso autorizado para vereador ${vereadorData.nome_parlamentar} da câmara ${vereadorData.camara_id}`
        );
        next();
      } catch (error) {
        logger.warn(`❌ [WebSocket] Falha na autenticação: ${error.message}`);
        next(new Error("Falha na autenticação"));
      }
    });
  }

  /**
   * Registers Socket.IO connection lifecycle and pauta room handlers.
   *
   * @returns {void}
   */
  setupConnectionHandlers() {
    this.io.on("connection", (socket) => {
      this.handleConnection(socket);

      socket.on("disconnect", () => {
        this.handleDisconnection(socket);
      });

      socket.on("join-pauta", (pautaId) => {
        this.handleJoinPauta(socket, pautaId);
      });

      socket.on("leave-pauta", (pautaId) => {
        this.handleLeavePauta(socket, pautaId);
      });

      socket.on("ping", () => {
        socket.emit("pong");
      });
    });
  }

  /**
   * Handles a new socket connection, joins authenticated vereadores to their
   * chamber room, and emits the initial connection status.
   *
   * @param {import("socket.io").Socket} socket - Socket.IO client connection.
   * @returns {Promise<void>}
   */
  async handleConnection(socket) {
    if (socket.isPublic) {
      logger.info(`🌐 Usuário público conectado: Socket ID ${socket.id}`);

      socket.emit("connection-status", {
        connected: true,
        isPublic: true,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const userInfo = {
      socketId: socket.id,
      camaraId: socket.camaraId,
      role: "vereador",
      isPresidente: socket.isPresidente,
      connectedAt: new Date().toISOString(),
    };

    this.connectedUsers.set(socket.userId, userInfo);

    const camaraRoom = `camara_${socket.camaraId}`;
    socket.join(camaraRoom);

    if (!this.camaraRooms.has(socket.camaraId)) {
      this.camaraRooms.set(socket.camaraId, new Set());
    }
    this.camaraRooms.get(socket.camaraId).add(socket.id);

    logger.info(
      `👤 Vereador conectado: ${socket.userEmail} (ID: ${socket.userId}, Câmara: ${socket.camaraId})`
    );
    logger.info(
      `📊 Usuários conectados na Câmara ${socket.camaraId}: ${
        this.camaraRooms.get(socket.camaraId).size
      }`
    );

    socket.to(camaraRoom).emit("vereador-connected", {
      vereadorId: socket.userId,
      nomeVereador: socket.vereadorData.nome_parlamentar,
      isPresidente: socket.isPresidente,
      timestamp: new Date().toISOString(),
    });

    socket.emit("connection-status", {
      connected: true,
      camaraId: socket.camaraId,
      connectedUsers: this.camaraRooms.get(socket.camaraId).size,
      timestamp: new Date().toISOString(),
    });

    // Reconcile missed voting-start events after a vereador reconnects.
    this.syncVotacaoAoVivoOnConnect(socket);
  }

  /**
   * Removes a socket from tracked chamber and pauta rooms and broadcasts the
   * vereador disconnection to the chamber.
   *
   * @param {import("socket.io").Socket} socket - Socket.IO client connection.
   * @returns {void}
   */
  handleDisconnection(socket) {
    const userInfo = this.connectedUsers.get(socket.userId);

    if (userInfo) {
      const camaraRoom = `camara_${socket.camaraId}`;

      if (this.camaraRooms.has(socket.camaraId)) {
        this.camaraRooms.get(socket.camaraId).delete(socket.id);

        if (this.camaraRooms.get(socket.camaraId).size === 0) {
          this.camaraRooms.delete(socket.camaraId);
        }
      }

      this.pautaRooms.forEach((sockets, pautaId) => {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          this.pautaRooms.delete(pautaId);
        }
      });

      this.connectedUsers.delete(socket.userId);

      logger.info(
        `👋 Vereador desconectado: ${socket.userEmail} (ID: ${socket.userId})`
      );

      socket.to(camaraRoom).emit("vereador-disconnected", {
        vereadorId: socket.userId,
        nomeVereador: socket.vereadorData?.nome_parlamentar,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Joins a vereador to a pauta room after verifying the pauta belongs to the
   * same chamber as the socket user.
   *
   * @param {import("socket.io").Socket} socket - Socket.IO client connection.
   * @param {string|number} pautaId - Pauta identifier.
   * @returns {Promise<void>}
   */
  async handleJoinPauta(socket, pautaId) {
    try {
      const { data: pauta, error } = await supabaseAdmin
        .from("pautas")
        .select("id, nome, sessoes!inner(camara_id)")
        .eq("id", pautaId)
        .single();

      if (error || !pauta) {
        socket.emit("error", { message: "Pauta não encontrada" });
        return;
      }

      if (pauta.sessoes.camara_id !== socket.camaraId) {
        socket.emit("error", {
          message: "Acesso negado - pauta de outra câmara",
        });
        return;
      }

      const pautaRoom = `pauta_${pautaId}`;
      socket.join(pautaRoom);

      if (!this.pautaRooms.has(pautaId)) {
        this.pautaRooms.set(pautaId, new Set());
      }
      this.pautaRooms.get(pautaId).add(socket.id);

      logger.info(`📋 Vereador ${socket.userEmail} entrou na pauta ${pautaId}`);

      socket.emit("pauta-joined", {
        pautaId,
        pautaNome: pauta.nome,
        timestamp: new Date().toISOString(),
      });

      this.sendPautaStats(pautaId);

      // Reconcile missed voting-end events when the app opens a non-live pauta.
      this.syncEncerramentoIfNotLiveForPauta(socket, pautaId, pauta.nome);
    } catch (error) {
      logger.error(`Erro ao entrar na pauta ${pautaId}:`, error);
      socket.emit("error", { message: "Erro ao entrar na pauta" });
    }
  }

  /**
   * Removes a socket from a pauta room and clears empty room tracking entries.
   *
   * @param {import("socket.io").Socket} socket - Socket.IO client connection.
   * @param {string|number} pautaId - Pauta identifier.
   * @returns {void}
   */
  handleLeavePauta(socket, pautaId) {
    const pautaRoom = `pauta_${pautaId}`;
    socket.leave(pautaRoom);

    if (this.pautaRooms.has(pautaId)) {
      this.pautaRooms.get(pautaId).delete(socket.id);

      if (this.pautaRooms.get(pautaId).size === 0) {
        this.pautaRooms.delete(pautaId);
      }
    }

    logger.info(`📋 Vereador ${socket.userEmail} saiu da pauta ${pautaId}`);

    socket.emit("pauta-left", {
      pautaId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Sends current pauta voting statistics to a single socket.
   *
   * @param {import("socket.io").Socket} socket - Socket.IO client connection.
   * @param {string|number} pautaId - Pauta identifier.
   * @returns {Promise<void>}
   */
  async handleRequestStats(socket, pautaId) {
    try {
      await this.sendPautaStatsToSocket(socket, pautaId);
    } catch (error) {
      logger.error(`Erro ao buscar estatísticas para pauta ${pautaId}:`, error);
      socket.emit("error", { message: "Erro ao buscar estatísticas" });
    }
  }

  /**
   * Broadcasts a vote update to chamber clients, forwards it to the public
   * live-voting server, and refreshes private and public statistics.
   *
   * @param {string|number} pautaId - Pauta identifier.
   * @param {Object} votoData - Vote event payload.
   * @param {Object} votoData.vereador - Vereador that cast or updated the vote.
   * @param {string} votoData.voto - Vote value.
   * @param {boolean} votoData.isUpdate - Whether the vote replaced a previous value.
   * @returns {Promise<void>}
   */
  async notifyVoto(pautaId, votoData) {
    try {
      const { vereador, voto, isUpdate } = votoData;

      logger.info(
        `🗳️ Notificando voto: ${vereador.nome_parlamentar} votou ${voto} na pauta ${pautaId}`
      );

      const { data: pauta, error } = await supabaseAdmin
        .from("pautas")
        .select("sessoes!inner(camara_id)")
        .eq("id", pautaId)
        .single();

      if (error || !pauta) {
        logger.warn(`Pauta ${pautaId} não encontrada para notificação`);
        return;
      }

      const camaraId = pauta.sessoes.camara_id;
      const camaraRoom = `camara_${camaraId}`;
      const pautaRoom = `pauta_${pautaId}`;

      const notification = {
        type: "voto-registrado",
        pautaId: pautaId,
        vereador: {
          id: vereador.id,
          nome: vereador.nome_parlamentar,
          isPresidente: vereador.is_presidente,
        },
        voto,
        isUpdate,
        timestamp: new Date().toISOString(),
      };

      // Clients filter chamber-wide vote notifications by pauta.
      this.io.to(camaraRoom).emit("voto-notification", notification);

      const http = require("http");
      const votoPayload = JSON.stringify({
        pautaId,
        voto,
        isUpdate,
        vereadorNome: vereador.nome_parlamentar,
        camaraId: camaraId,
      });

      const options = {
        hostname: "localhost",
        port: 3000,
        path: "/api/votacao-ao-vivo/notify-voto",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(votoPayload),
        },
      };

      const request = http.request(options, (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          logger.info(
            `✅ Voto retransmitido para servidor global (porta 3000)`
          );
        }
      });

      request.on("error", (error) => {
        logger.warn(
          `⚠️ Erro ao notificar servidor global sobre voto: ${error.message}`
        );
      });

      request.write(votoPayload);
      request.end();

      // Keep vote notifications fast while statistics refresh asynchronously.
      this.sendPautaStats(pautaId).catch((err) => {
        logger.error("Erro ao enviar estatísticas:", err);
      });

      this.sendPautaStatsToPublicRoom(pautaId).catch((err) => {
        logger.error("Erro ao enviar estatísticas públicas:", err);
      });

      logger.info(`✅ Notificação de voto enviada para Câmara ${camaraId}`);
    } catch (error) {
      logger.error("Erro ao notificar voto:", error);
    }
  }

  /**
   * Emits current voting statistics to all sockets in a pauta room.
   *
   * @param {string|number} pautaId - Pauta identifier.
   * @returns {Promise<void>}
   */
  async sendPautaStats(pautaId) {
    try {
      const stats = await this.fetchPautaStats(pautaId);
      const pautaRoom = `pauta_${pautaId}`;

      this.io.to(pautaRoom).emit("pauta-stats-update", {
        pautaId,
        estatisticas: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(`Erro ao enviar estatísticas da pauta ${pautaId}:`, error);
    }
  }

  /**
   * Emits current voting statistics to a single socket.
   *
   * @param {import("socket.io").Socket} socket - Socket.IO client connection.
   * @param {string|number} pautaId - Pauta identifier.
   * @returns {Promise<void>}
   */
  async sendPautaStatsToSocket(socket, pautaId) {
    try {
      const stats = await this.fetchPautaStats(pautaId);

      socket.emit("pauta-stats-update", {
        pautaId,
        estatisticas: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        `Erro ao enviar estatísticas da pauta ${pautaId} para socket:`,
        error
      );
    }
  }

  /**
   * Fetches vote totals for a pauta from Supabase.
   *
   * @param {string|number} pautaId - Pauta identifier.
   * @returns {Promise<{total: number, sim: number, nao: number, abstencao: number}>} Vote totals by option.
   */
  async fetchPautaStats(pautaId) {
    const { data: votos, error } = await supabaseAdmin
      .from("votos")
      .select("voto")
      .eq("pauta_id", pautaId);

    if (error) {
      throw error;
    }

    return {
      total: votos.length,
      sim: votos.filter((v) => v.voto === "SIM").length,
      nao: votos.filter((v) => v.voto === "NÃO").length,
      abstencao: votos.filter((v) => v.voto === "ABSTENÇÃO").length,
    };
  }

  /**
   * Sends current pauta statistics to the public live-voting server.
   *
   * @param {string|number} pautaId - Pauta identifier.
   * @returns {Promise<void>}
   */
  async sendPautaStatsToPublicRoom(pautaId) {
    try {
      const stats = await this.fetchPautaStats(pautaId);

      const http = require("http");
      const payload = JSON.stringify({ pautaId, estatisticas: stats });

      const options = {
        hostname: "localhost",
        port: 3000,
        path: "/api/votacao-ao-vivo/notify-stats",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 3000,
      };

      const req = http.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.info(
            `✅ Estatísticas da pauta ${pautaId} enviadas ao servidor público`
          );
        } else {
          logger.warn(
            `⚠️ Falha ao enviar estatísticas públicas (status ${res.statusCode})`
          );
        }
      });

      req.on("error", (err) => {
        logger.warn(
          `⚠️ Erro ao notificar servidor público sobre estatísticas: ${err.message}`
        );
      });

      req.write(payload);
      req.end();
    } catch (error) {
      logger.error(
        `Erro em sendPautaStatsToPublicRoom para pauta ${pautaId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Broadcasts a pauta status change to chamber clients and pauta viewers.
   *
   * @param {string|number} pautaId - Pauta identifier.
   * @param {string} newStatus - New pauta status.
   * @param {string|null} [resultado=null] - Voting result, when available.
   * @returns {Promise<void>}
   */
  async notifyPautaStatusChange(pautaId, newStatus, resultado = null) {
    try {
      logger.info(
        `📢 Notificando mudança de status da pauta ${pautaId}: ${newStatus}`
      );

      const { data: pauta, error } = await supabaseAdmin
        .from("pautas")
        .select(
          `
                    id,
                    nome,
                    status,
                    resultado_votacao,
                    sessoes!inner(camara_id)
                `
        )
        .eq("id", pautaId)
        .single();

      if (error || !pauta) {
        logger.warn(
          `Pauta ${pautaId} não encontrada para notificação de status`
        );
        return;
      }

      const camaraId = pauta.sessoes.camara_id;
      const camaraRoom = `camara_${camaraId}`;
      const pautaRoom = `pauta_${pautaId}`;

      const notification = {
        type: "pauta-status-changed",
        pautaId,
        pautaNome: pauta.nome,
        oldStatus: pauta.status,
        newStatus,
        resultado,
        timestamp: new Date().toISOString(),
      };

      this.io.to(camaraRoom).emit("pauta-status-notification", notification);

      this.io.to(pautaRoom).emit("pauta-status-update", notification);

      logger.info(
        `✅ Notificação de mudança de status enviada para Câmara ${camaraId}`
      );
    } catch (error) {
      logger.error("Erro ao notificar mudança de status da pauta:", error);
    }
  }

  /**
   * Returns connection counts grouped by chamber and active pauta rooms.
   *
   * @returns {{totalConnections: number, camaraConnections: Object<string, number>, activePautas: number}} Connection statistics.
   */
  getConnectionStats() {
    const stats = {
      totalConnections: this.connectedUsers.size,
      camaraConnections: {},
      activePautas: this.pautaRooms.size,
    };

    this.camaraRooms.forEach((sockets, camaraId) => {
      stats.camaraConnections[camaraId] = sockets.size;
    });

    return stats;
  }

  /**
   * Emits an administrative event to every connected socket.
   *
   * @param {string} event - Socket.IO event name.
   * @param {Object} data - Event payload.
   * @returns {void}
   */
  broadcastToAll(event, data) {
    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    logger.info(`📢 Broadcast global enviado: ${event}`);
  }

  /**
   * Emits an event to all sockets in a chamber room.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string} event - Socket.IO event name.
   * @param {Object} data - Event payload.
   * @returns {void}
   */
  broadcastToCamara(camaraId, event, data) {
    const camaraRoom = `camara_${camaraId}`;

    this.io.to(camaraRoom).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    logger.info(`📢 Broadcast para Câmara ${camaraId}: ${event}`);
  }

  /**
   * Notifies authenticated vereadores in a chamber to open the voting screen.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string|number} pautaId - Pauta identifier.
   * @param {string} pautaNome - Pauta display name.
   * @returns {number} Number of authenticated vereadores currently online.
   */
  notifyIniciarVotacao(camaraId, pautaId, pautaNome) {
    const camaraRoom = `camara_${camaraId}`;

    const notification = {
      type: "iniciar-votacao",
      pautaId,
      pautaNome,
      action: "open-voting-screen",
      timestamp: new Date().toISOString(),
    };

    this.io.to(camaraRoom).emit("iniciar-votacao", notification);

    // Count authenticated vereador app clients only, excluding public viewers.
    const room = this.io.sockets.adapter.rooms.get(camaraRoom);
    let vereadoresOnline = 0;

    if (room) {
      room.forEach((socketId) => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket && !socket.isPublic && socket.vereadorData) {
          vereadoresOnline++;
        }
      });
    }

    logger.info(
      `🗳️ Notificação de início de votação enviada para Câmara ${camaraId} - Pauta: ${pautaNome} - Vereadores online: ${vereadoresOnline} (de ${
        room ? room.size : 0
      } conexões totais)`
    );

    return vereadoresOnline;
  }

  /**
   * Notifies a chamber that voting has ended for a pauta.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string|number} pautaId - Pauta identifier.
   * @param {string} pautaNome - Pauta display name.
   * @param {string} resultado - Voting result.
   * @returns {void}
   */
  notifyEncerrarVotacao(camaraId, pautaId, pautaNome, resultado) {
    const camaraRoom = `camara_${camaraId}`;

    const notification = {
      type: "encerrar-votacao",
      pautaId,
      pautaNome,
      resultado,
      action: "return-to-dashboard",
      timestamp: new Date().toISOString(),
    };

    this.io.to(camaraRoom).emit("encerrar-votacao", notification);

    logger.info(
      `🏁 Notificação de encerramento de votação enviada para Câmara ${camaraId} - Pauta: ${pautaNome} - Resultado: ${resultado}`
    );
  }

  /**
   * Notifies a chamber that a new pauta was created.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string|number} pautaId - Pauta identifier.
   * @param {string} pautaNome - Pauta display name.
   * @param {string} status - Initial pauta status.
   * @returns {void}
   */
  notifyNovaPauta(camaraId, pautaId, pautaNome, status) {
    const camaraRoom = `camara_${camaraId}`;

    const notification = {
      type: "nova-pauta",
      pautaId,
      pautaNome,
      status,
      timestamp: new Date().toISOString(),
    };

    this.io.to(camaraRoom).emit("nova-pauta", notification);

    logger.info(
      `📝 Notificação de nova pauta enviada para Câmara ${camaraId} - Pauta: ${pautaNome}`
    );
  }

  /**
   * Notifies a chamber that a speaker turn has started.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string|number} oradorId - Speaker identifier.
   * @param {string} oradorNome - Speaker display name.
   * @param {string} sessaoNome - Session display name.
   * @param {number} tempoFala - Allocated speaking time.
   * @returns {void}
   */
  notifyIniciarFala(camaraId, oradorId, oradorNome, sessaoNome, tempoFala) {
    const camaraRoom = `camara_${camaraId}`;

    const notification = {
      type: "iniciar-fala",
      oradorId,
      oradorNome,
      sessaoNome,
      tempoFala,
      timestamp: new Date().toISOString(),
    };

    this.io.to(camaraRoom).emit("iniciar-fala", notification);

    logger.info(
      `🎤 Notificação de início de fala enviada para Câmara ${camaraId} - Orador: ${oradorNome}`
    );
  }
}

module.exports = new WebSocketService();
