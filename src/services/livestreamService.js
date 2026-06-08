/**
 * Livestream Management Service
 *
 * Manages YouTube livestream polling, webhook reconciliation, database state,
 * and portal notifications.
 */

const supabaseAdmin = require("../config/supabaseAdminClient");
const youtubeService = require("./youtubeService");

const logger = {
  log: (...args) =>
    console.log("[LIVESTREAM_SERVICE]", new Date().toISOString(), "-", ...args),
  error: (...args) =>
    console.error(
      "[LIVESTREAM_SERVICE ERROR]",
      new Date().toISOString(),
      "-",
      ...args,
    ),
};

/**
 * Coordinates livestream discovery, status reconciliation, and chamber state.
 */
class LivestreamService {
  /**
   * Initializes in-memory polling state, quota guards, and interval settings.
   */
  constructor() {
    this.isChecking = false;
    this.checkInterval = null;
    this.activeLivestreams = new Set(); // Active live chambers.
    this.connectedUsers = 0;
    this.quotaExceeded = false;
    this.quotaExceeded = false;
    this.lastQuotaError = null;
    this.recentlyEndedVideos = new Map(); // videoId -> timestamp guard against delayed webhook reactivation.

    const envPollIntervalMs = Number.parseInt(
      process.env.YOUTUBE_POLL_INTERVAL_MS || "",
      10,
    );
    const envReconcileIntervalMs = Number.parseInt(
      process.env.YOUTUBE_RECONCILE_INTERVAL_MS || "",
      10,
    );
    this.POLL_INTERVAL_MS =
      Number.isFinite(envPollIntervalMs) && envPollIntervalMs > 0
        ? envPollIntervalMs
        : 300000;
    this.RECONCILE_INTERVAL_MS =
      Number.isFinite(envReconcileIntervalMs) && envReconcileIntervalMs > 0
        ? envReconcileIntervalMs
        : 21600000;

    // Context-aware intervals tuned to reduce YouTube API quota usage.
    this.INTERVALS = {
      LIVE_ACTIVE: 1800000,
      NO_LIVE_DAY: 900000,
      NO_LIVE_NIGHT: 900000,
      NO_USERS: 900000,
      WEBHOOK_RECONCILE: this.RECONCILE_INTERVAL_MS,
      QUOTA_EXCEEDED: 14400000,
    };

    this.currentInterval = this.INTERVALS.NO_LIVE_DAY;
  }

  /**
   * Checks whether YouTube webhooks are enabled and at least one channel is verified.
   *
   * @returns {boolean} True when webhook delivery is considered healthy.
   */
  isWebhookHealthy() {
    try {
      const youtubeWebhookService = require("./youtubeWebhookService");
      if (!youtubeWebhookService || !youtubeWebhookService.webhooksEnabled)
        return false;

      if (typeof youtubeWebhookService.getHealth === "function") {
        const health = youtubeWebhookService.getHealth();
        return !!(health && health.totals && health.totals.verifiedCount > 0);
      }

      const status = youtubeWebhookService.getSubscriptionStatus?.();
      if (!status) return false;
      return Object.values(status).some((s) => s && s.status === "verified");
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculates the next polling interval from quota, active-live, and webhook state.
   *
   * @returns {number} Interval in milliseconds.
   */
  calculateOptimalInterval() {
    if (this.quotaExceeded && this.lastQuotaError) {
      const timeSinceQuotaError = Date.now() - this.lastQuotaError;
      if (timeSinceQuotaError < this.INTERVALS.QUOTA_EXCEEDED) {
        logger.log(
          `⏳ Quota excedida - aguardando ${Math.round((this.INTERVALS.QUOTA_EXCEEDED - timeSinceQuotaError) / 60000)} minutos`,
        );
        return this.INTERVALS.QUOTA_EXCEEDED;
      } else {
        this.quotaExceeded = false;
        this.lastQuotaError = null;
        logger.log("✅ Tentando reativar verificações após limite de quota");
      }
    }

    const webhookHealthy = this.isWebhookHealthy();

    if (this.activeLivestreams.size > 0) {
      return this.INTERVALS.LIVE_ACTIVE;
    }

    if (webhookHealthy) {
      return this.INTERVALS.WEBHOOK_RECONCILE;
    }

    return this.INTERVALS.NO_LIVE_DAY;
  }

  /**
   * Applies the optimal polling interval and restarts the timer when needed.
   *
   * @returns {void}
   */
  adjustCheckInterval() {
    const optimalInterval = this.calculateOptimalInterval();

    if (optimalInterval !== this.currentInterval) {
      logger.log(
        `🔄 Ajustando intervalo: ${this.currentInterval / 1000}s → ${optimalInterval / 1000}s`,
      );

      this.currentInterval = optimalInterval;

      if (this.checkInterval) {
        this.stopAutoCheck();
        this.startAutoCheck();
      }
    }
  }

  /**
   * Updates connected Socket.IO user count and recalculates polling cadence.
   *
   * @returns {void}
   */
  updateConnectedUsers() {
    try {
      if (global.io) {
        this.connectedUsers = global.io.engine.clientsCount || 0;
        logger.log(`👥 Usuários conectados: ${this.connectedUsers}`);
        this.adjustCheckInterval();
      }
    } catch (error) {
      logger.error("Erro ao contar usuários conectados:", error.message);
    }
  }

  /**
   * Emits livestream state to public portal clients for a chamber.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {Object} livestreamData - Livestream row or payload.
   * @param {boolean} isLive - Whether the livestream is currently live.
   * @returns {void}
   */
  emitLivestreamUpdate(camaraId, livestreamData, isLive) {
    try {
      if (typeof global !== "undefined" && global.io) {
        const eventData = {
          camaraId,
          livestreamData,
          isLive,
          timestamp: new Date().toISOString(),
        };

        global.io
          .to(`portal-camara-${camaraId}`)
          .emit("livestream-updated", eventData);

        logger.log(
          `📡 WebSocket: Notificação enviada para portal público câmara ${camaraId} (${isLive ? "LIVE" : "ÚLTIMA SESSÃO"})`,
        );
      }
    } catch (error) {
      logger.error("Erro ao emitir evento WebSocket:", error.message);
    }
  }

  /**
   * Starts automatic livestream checks using the current dynamic interval.
   *
   * @returns {void}
   */
  startAutoCheck() {
    if (this.checkInterval) {
      logger.log("Verificação automática já está rodando");
      return;
    }

    this.updateConnectedUsers();

    logger.log(
      `Iniciando verificação automática (intervalo: ${this.currentInterval / 1000}s)`,
    );

    this.checkAllCamarasLivestreams();

    this.checkInterval = setInterval(() => {
      this.updateConnectedUsers();
      this.checkAllCamarasLivestreams();
    }, this.currentInterval);
  }

  /**
   * Stops automatic livestream checks.
   *
   * @returns {void}
   */
  stopAutoCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.log("Verificação automática parada");
    }
  }

  /**
   * Checks livestream state for every chamber with a configured YouTube channel.
   *
   * @returns {Promise<void>}
   */
  async checkAllCamarasLivestreams() {
    if (this.isChecking) {
      logger.log("Verificação já em andamento, pulando...");
      return;
    }

    // Avoid any YouTube calls while the quota cooldown is active.
    if (this.quotaExceeded) {
      const timeRemaining = Math.round(
        (this.INTERVALS.QUOTA_EXCEEDED - (Date.now() - this.lastQuotaError)) /
          60000,
      );
      logger.log(
        `⏳ QUOTA EXCEDIDA - Pulando todas as verificações (${timeRemaining} min restantes)`,
      );
      return;
    }

    this.isChecking = true;
    logger.log("🔍 Iniciando verificação de livestreams de todas as câmaras");

    try {
      const { data: camaras, error } = await supabaseAdmin
        .from("camaras")
        .select("id, nome_camara, youtube_channel_id")
        .not("youtube_channel_id", "is", null)
        .neq("youtube_channel_id", "");

      if (error) {
        throw new Error(`Erro ao buscar câmaras: ${error.message}`);
      }

      if (!camaras || camaras.length === 0) {
        logger.log("Nenhuma câmara com Channel ID configurado encontrada");
        return;
      }

      logger.log(`Verificando ${camaras.length} câmara(s) configurada(s)`);

      for (const camara of camaras) {
        try {
          await this.checkCamaraLivestreams(
            camara.id,
            camara.youtube_channel_id,
          );
        } catch (error) {
          if (this.isQuotaExceededError(error)) {
            this.handleQuotaExceeded();
            break;
          }
          logger.error(
            `Erro ao verificar câmara ${camara.nome_camara} (${camara.id}):`,
            error.message,
          );
        }
      }

      logger.log("✅ Verificação de todas as câmaras concluída");
    } catch (error) {
      logger.error("Erro na verificação geral:", error.message);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Detects YouTube quota errors.
   *
   * @param {Error} error - Error to inspect.
   * @returns {boolean} True when the error message indicates quota exhaustion.
   */
  isQuotaExceededError(error) {
    return error.message && error.message.includes("quota");
  }

  /**
   * Starts quota cooldown and recalculates the polling interval.
   *
   * @returns {void}
   */
  handleQuotaExceeded() {
    this.quotaExceeded = true;
    this.lastQuotaError = Date.now();
    logger.error(
      "🚫 Quota da API YouTube excedida - pausando verificações por 1 hora",
    );
    this.adjustCheckInterval();
  }

  /**
   * Checks livestream state for one chamber.
   *
   * New live discovery is webhook-only unless force=true. Non-forced checks only
   * reconcile existing live/upcoming records to detect ended streams.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string} channelId - YouTube channel identifier.
   * @param {Object} [options={}] - Check options.
   * @param {boolean} [options.force=false] - Whether to actively query YouTube for live streams.
   * @returns {Promise<void>}
   */
  async checkCamaraLivestreams(camaraId, channelId, options = {}) {
    const { force = false } = options;

    if (this.quotaExceeded) {
      logger.log(
        `🚫 Pulando verificação da câmara ${camaraId} - quota excedida`,
      );
      return;
    }

    if (force) {
      logger.log(
        `⚡ FORÇANDO verificação de livestreams para câmara ${camaraId} (Channel ID: ${channelId})`,
      );
    } else {
      if (this.isWebhookHealthy()) {
        logger.log(
          `📡 Webhook ativo - verificando encerramento de lives (câmara ${camaraId})`,
        );
      } else {
        logger.log(
          `⚠️ ATENÇÃO: Webhook não está ativo para câmara ${camaraId}. Novas lives não serão detectadas automaticamente.`,
        );
        logger.log(
          `   → Execute: curl -X POST https://legislanet.com.br/api/webhooks/youtube/subscribe-all`,
        );
      }
    }

    try {
      if (force && channelId) {
        logger.log(
          `🔍 [FORCE] Buscando lives ativas no YouTube para o canal...`,
        );
        const liveStreams = await youtubeService.getLiveStreams(channelId);

        if (liveStreams && liveStreams.length > 0) {
          logger.log(
            `✅ [FORCE] Encontradas ${liveStreams.length} lives ativas! Processando...`,
          );
          for (const stream of liveStreams) {
            await this.processLivestream(camaraId, stream, "live");
          }
        } else {
          logger.log(`ℹ️ [FORCE] Nenhuma live ativa encontrada no momento.`);
        }
      }

      await this.checkEndedLivestreams(camaraId);
    } catch (error) {
      if (this.isQuotaExceededError(error)) {
        this.handleQuotaExceeded();
        throw error;
      }
      logger.error(
        `Erro ao verificar livestreams (${camaraId}):`,
        error.message,
      );
    }
  }

  /**
   * Creates or updates the database record for a YouTube livestream.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {Object} youtubeStream - YouTube stream payload.
   * @param {string} status - Target livestream status.
   * @returns {Promise<void>}
   */
  async processLivestream(camaraId, youtubeStream, status) {
    const videoId = youtubeStream.id.videoId || youtubeStream.id;

    try {
      const { data: existingStream } = await supabaseAdmin
        .from("livestreams")
        .select("*")
        .eq("youtube_video_id", videoId)
        .eq("camara_id", camaraId)
        .single();

      if (existingStream) {
        await this.updateExistingLivestream(
          existingStream,
          youtubeStream,
          status,
        );
      } else {
        await this.createNewLivestream(camaraId, youtubeStream, status);
      }
    } catch (error) {
      logger.error(`Erro ao processar livestream ${videoId}:`, error.message);
    }
  }

  /**
   * Creates a livestream row from YouTube video details and updates chamber state.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {Object} youtubeStream - YouTube stream payload.
   * @param {string} status - Initial livestream status.
   * @returns {Promise<void>}
   */
  async createNewLivestream(camaraId, youtubeStream, status) {
    const videoId = youtubeStream.id.videoId || youtubeStream.id;

    logger.log(`📝 Criando nova livestream: ${videoId}`);

    try {
      const videoDetails = await youtubeService.getVideoDetails(videoId);
      const streamData = youtubeService.formatLivestreamData(
        videoDetails,
        camaraId,
      );

      streamData.status = status;
      streamData.is_current = status === "live";

      const { data, error } = await supabaseAdmin
        .from("livestreams")
        .insert([streamData])
        .select()
        .single();

      if (error) {
        throw new Error(`Erro ao inserir livestream: ${error.message}`);
      }

      logger.log(`✅ Livestream criada: ${data.title}`);

      if (status === "live") {
        await this.updateCamaraCurrentLivestream(camaraId, data.id);
      }

      if (status === "live") {
        this.activeLivestreams.add(camaraId);
        this.adjustCheckInterval();
      }

      this.emitLivestreamUpdate(camaraId, data, status === "live");
    } catch (error) {
      logger.error(`Erro ao criar livestream ${videoId}:`, error.message);
      throw error;
    }
  }

  /**
   * Refreshes an existing livestream from YouTube and emits status changes.
   *
   * @param {Object} existingStream - Existing livestream row.
   * @param {Object} youtubeStream - YouTube stream payload.
   * @param {string} currentStatus - Current status from the caller.
   * @returns {Promise<void>}
   */
  async updateExistingLivestream(existingStream, youtubeStream, currentStatus) {
    const videoId = existingStream.youtube_video_id;

    try {
      const videoDetails = await youtubeService.getVideoDetails(videoId);
      const updatedData = youtubeService.formatLivestreamData(
        videoDetails,
        existingStream.camara_id,
      );

      updatedData.id = existingStream.id;
      updatedData.created_at = existingStream.created_at;

      const statusChanged = existingStream.status !== updatedData.status;
      updatedData.is_current = updatedData.status === "live";

      const { error } = await supabaseAdmin
        .from("livestreams")
        .update(updatedData)
        .eq("id", existingStream.id);

      if (error) {
        throw new Error(`Erro ao atualizar livestream: ${error.message}`);
      }

      if (statusChanged) {
        logger.log(
          `🔄 Status da livestream ${videoId} mudou: ${existingStream.status} → ${updatedData.status}`,
        );

        if (updatedData.status === "live") {
          await this.updateCamaraCurrentLivestream(
            existingStream.camara_id,
            existingStream.id,
          );
        } else if (updatedData.status === "ended") {
          await this.updateCamaraLastLivestream(
            existingStream.camara_id,
            existingStream.id,
          );
        }

        if (updatedData.status === "live") {
          this.activeLivestreams.add(existingStream.camara_id);
        } else if (
          existingStream.status === "live" &&
          updatedData.status !== "live"
        ) {
          this.activeLivestreams.delete(existingStream.camara_id);
        }
        this.adjustCheckInterval();

        const fullStreamData = { ...existingStream, ...updatedData };
        this.emitLivestreamUpdate(
          existingStream.camara_id,
          fullStreamData,
          updatedData.status === "live",
        );
      }
    } catch (error) {
      logger.error(`Erro ao atualizar livestream ${videoId}:`, error.message);
    }
  }

  /**
   * Reconciles active or upcoming livestreams and marks ended streams.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @returns {Promise<void>}
   */
  async checkEndedLivestreams(camaraId) {
    try {
      const { data: activeStreams } = await supabaseAdmin
        .from("livestreams")
        .select("*")
        .eq("camara_id", camaraId)
        .in("status", ["live", "upcoming"]);

      if (!activeStreams || activeStreams.length === 0) {
        return;
      }

      for (const stream of activeStreams) {
        try {
          const videoDetails = await youtubeService.getVideoDetails(
            stream.youtube_video_id,
          );
          const currentStatus = youtubeService.determineStatus(
            videoDetails.liveStreamingDetails || {},
          );

          if (currentStatus === "ended" && stream.status !== "ended") {
            logger.log(`📺 Livestream ${stream.youtube_video_id} terminou`);

            await supabaseAdmin
              .from("livestreams")
              .update({
                status: "ended",
                is_current: false,
                actual_end_time: new Date().toISOString(),
              })
              .eq("id", stream.id);

            await this.updateCamaraLastLivestream(camaraId, stream.id);

            await this.emitLivestreamUpdate(
              camaraId,
              {
                ...stream,
                status: "ended",
                is_current: false,
                actual_end_time: new Date().toISOString(),
              },
              false,
            );
          }
        } catch (error) {
          logger.error(
            `Erro ao verificar status da livestream ${stream.youtube_video_id}:`,
            error.message,
          );
        }
      }
    } catch (error) {
      logger.error(
        `Erro ao verificar livestreams finalizadas da câmara ${camaraId}:`,
        error.message,
      );
    }
  }

  /**
   * Updates the current livestream pointer for a chamber.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string|number} livestreamId - Livestream row identifier.
   * @returns {Promise<void>}
   */
  async updateCamaraCurrentLivestream(camaraId, livestreamId) {
    try {
      await supabaseAdmin
        .from("livestreams")
        .update({ is_current: false })
        .eq("camara_id", camaraId)
        .neq("id", livestreamId);

      await supabaseAdmin
        .from("camaras")
        .update({ current_livestream_id: livestreamId })
        .eq("id", camaraId);

      logger.log(
        `📺 Câmara ${camaraId} - livestream atual atualizada: ${livestreamId}`,
      );
    } catch (error) {
      logger.error(
        `Erro ao atualizar livestream atual da câmara ${camaraId}:`,
        error.message,
      );
    }
  }

  /**
   * Updates the last livestream pointer for a chamber and clears current live.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string|number} livestreamId - Livestream row identifier.
   * @returns {Promise<void>}
   */
  async updateCamaraLastLivestream(camaraId, livestreamId) {
    try {
      await supabaseAdmin
        .from("camaras")
        .update({
          last_livestream_id: livestreamId,
          current_livestream_id: null,
        })
        .eq("id", camaraId);

      logger.log(
        `📺 Câmara ${camaraId} - última livestream atualizada: ${livestreamId}`,
      );
    } catch (error) {
      logger.error(
        `Erro ao atualizar última livestream da câmara ${camaraId}:`,
        error.message,
      );
    }
  }

  /**
   * Fetches the current live livestream for a chamber.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @returns {Promise<Object|null>} Current livestream row, or null when none exists.
   */
  async getCurrentLivestream(camaraId) {
    try {
      const { data, error } = await supabaseAdmin
        .from("livestreams")
        .select("*")
        .eq("camara_id", camaraId)
        .eq("status", "live")
        .eq("is_current", true)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Erro ao buscar livestream atual: ${error.message}`);
      }

      return data;
    } catch (error) {
      logger.error(
        `Erro ao buscar livestream atual da câmara ${camaraId}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Fetches the most recent ended livestream for a chamber.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @returns {Promise<Object|null>} Last livestream row, or null when none exists.
   */
  async getLastLivestream(camaraId) {
    try {
      const { data, error } = await supabaseAdmin
        .from("livestreams")
        .select("*")
        .eq("camara_id", camaraId)
        .eq("status", "ended")
        .order("actual_end_time", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Erro ao buscar última livestream: ${error.message}`);
      }

      return data;
    } catch (error) {
      logger.error(
        `Erro ao buscar última livestream da câmara ${camaraId}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Lists livestreams for a chamber with pagination and optional status filtering.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {Object} [options={}] - Query options.
   * @param {number} [options.page=1] - Page number.
   * @param {number} [options.limit=10] - Page size.
   * @param {string|null} [options.status=null] - Optional livestream status filter.
   * @returns {Promise<{data: Object[], pagination: {page: number, limit: number, total: number, totalPages: number}}>} Paginated livestreams.
   */
  async getCamaraLivestreams(
    camaraId,
    { page = 1, limit = 10, status = null } = {},
  ) {
    try {
      let query = supabaseAdmin
        .from("livestreams")
        .select("*", { count: "exact" })
        .eq("camara_id", camaraId)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Erro ao buscar livestreams: ${error.message}`);
      }

      return {
        data: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      logger.error(
        `Erro ao buscar livestreams da câmara ${camaraId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Imports recent historical livestream videos when a chamber has no records yet.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string} channelId - YouTube channel identifier.
   * @returns {Promise<void>}
   */
  async checkHistoricalVideos(camaraId, channelId) {
    try {
      const { count: existingCount } = await supabaseAdmin
        .from("livestreams")
        .select("id", { count: "exact", head: true })
        .eq("camara_id", camaraId);

      if (existingCount > 0) {
        return;
      }

      logger.log(
        `📹 Buscando vídeos históricos para câmara ${camaraId} (primeira vez)`,
      );

      const recentVideos = await youtubeService.getRecentVideos(channelId);

      if (recentVideos.length === 0) {
        logger.log(`📹 Nenhum vídeo encontrado no canal ${channelId}`);
        return;
      }

      logger.log(`📹 Encontrados ${recentVideos.length} vídeos para processar`);

      // Limit first-time import to the most recent videos to avoid heavy API usage.
      const videosToProcess = recentVideos.slice(0, 10);

      for (const video of videosToProcess) {
        try {
          const videoDetails = await youtubeService.getVideoDetails(
            video.id.videoId,
          );

          if (videoDetails.liveStreamingDetails) {
            await this.processHistoricalLivestream(camaraId, videoDetails);
          }
        } catch (error) {
          logger.error(
            `Erro ao processar vídeo histórico ${video.id.videoId}:`,
            error.message,
          );
        }
      }

      logger.log(
        `📹 Processamento de vídeos históricos concluído para câmara ${camaraId}`,
      );
    } catch (error) {
      logger.error(
        `Erro ao verificar vídeos históricos da câmara ${camaraId}:`,
        error.message,
      );
    }
  }

  /**
   * Stores a finished historical livestream when it is not already imported.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {Object} videoDetails - YouTube video details.
   * @returns {Promise<void>}
   */
  async processHistoricalLivestream(camaraId, videoDetails) {
    const videoId = videoDetails.id;

    try {
      const { data: existingStream } = await supabaseAdmin
        .from("livestreams")
        .select("*")
        .eq("youtube_video_id", videoId)
        .eq("camara_id", camaraId)
        .single();

      if (existingStream) {
        return;
      }

      logger.log(
        `📺 Processando livestream histórica: ${videoDetails.snippet.title}`,
      );

      const streamData = youtubeService.formatLivestreamData(
        videoDetails,
        camaraId,
      );

      streamData.status = "ended";
      streamData.is_current = false;

      // Derive an end time from duration when YouTube does not provide one.
      if (
        !streamData.actual_end_time &&
        videoDetails.contentDetails?.duration
      ) {
        const startTime = new Date(streamData.scheduled_start_time);
        const duration = this.parseDuration(
          videoDetails.contentDetails.duration,
        );
        streamData.actual_end_time = new Date(
          startTime.getTime() + duration,
        ).toISOString();
      }

      const { data, error } = await supabaseAdmin
        .from("livestreams")
        .insert([streamData])
        .select()
        .single();

      if (error) {
        throw new Error(
          `Erro ao inserir livestream histórica: ${error.message}`,
        );
      }

      logger.log(`✅ Livestream histórica processada: ${data.title}`);

      await this.updateCamaraLastLivestream(camaraId, data.id);
    } catch (error) {
      logger.error(
        `Erro ao processar livestream histórica ${videoId}:`,
        error.message,
      );
    }
  }

  /**
   * Converts an ISO 8601 duration to milliseconds.
   *
   * @param {string} duration - ISO 8601 duration.
   * @returns {number} Duration in milliseconds.
   */
  parseDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  /**
   * Checks whether a video was recently ended to prevent delayed webhook reactivation.
   *
   * @param {string} videoId - YouTube video identifier.
   * @returns {boolean} True when the video is still inside the recent-ended guard window.
   */
  isRecentlyEnded(videoId) {
    if (!videoId) return false;
    const endedTime = this.recentlyEndedVideos.get(videoId);
    if (!endedTime) return false;

    const now = Date.now();
    if (now - endedTime > 600000) {
      this.recentlyEndedVideos.delete(videoId);
      return false;
    }
    return true;
  }

  /**
   * Marks a livestream as ended from a frontend socket action.
   *
   * @param {string} videoId - YouTube video identifier.
   * @param {string|number} camaraId - Chamber identifier.
   * @returns {Promise<void>}
   */
  async markAsEnded(videoId, camaraId) {
    try {
      if (!videoId || !camaraId) return;

      logger.log(
        `🛑 Marcando livestream como encerrada via socket: ${videoId}`,
      );

      // Memory barrier: prevent delayed webhooks from reactivating the livestream.
      this.recentlyEndedVideos.set(videoId, Date.now());

      // Keep the guard slightly longer than isRecentlyEnded's active window.
      setTimeout(() => {
        if (this.recentlyEndedVideos.has(videoId)) {
          this.recentlyEndedVideos.delete(videoId);
        }
      }, 900000);

      const { data, error } = await supabaseAdmin
        .from("livestreams")
        .update({
          status: "ended",
          is_current: false,
          actual_end_time: new Date().toISOString(),
        })
        .eq("youtube_video_id", videoId)
        .select()
        .single();

      if (error) {
        tracker.captureException(error);
        return;
      }

      if (data) {
        await this.updateCamaraLastLivestream(camaraId, data.id);

        // Explicit stop event lets the SPA transition to VOD without reloading.
        global.io.to(`portal-camara-${camaraId}`).emit("livestream-stopped", {
          camaraId: camaraId,
          videoId: videoId,
          timestamp: new Date().toISOString(),
          vodData: {
            ...data,
            status: "ended",
            is_current: false,
            youtube_video_id: videoId,
            actual_end_time: new Date().toISOString(),
          },
        });

        logger.log(
          `🛑 Evento livestream-stopped emitido para câmara ${camaraId}`,
        );
      }
    } catch (error) {
      logger.error(`Erro ao marcar live como encerrada: ${error.message}`);
    }
  }
}

module.exports = new LivestreamService();
