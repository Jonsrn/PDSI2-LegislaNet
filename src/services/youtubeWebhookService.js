/**
 * YouTube Push Notification (Webhook) Service
 *
 * Handles YouTube PubSubHubbub subscriptions and webhook notifications without
 * consuming YouTube Data API quota for new-live detection.
 */

const crypto = require("crypto");
const supabaseAdmin = require("../config/supabaseAdminClient");

const logger = {
  log: (...args) =>
    console.log("[YOUTUBE_WEBHOOK]", new Date().toISOString(), "-", ...args),
  error: (...args) =>
    console.error(
      "[YOUTUBE_WEBHOOK ERROR]",
      new Date().toISOString(),
      "-",
      ...args,
    ),
};

/**
 * Manages YouTube webhook subscription state, verification, and notification handling.
 */
class YouTubeWebhookService {
  /**
   * Initializes webhook configuration and disables production webhooks when
   * required secrets or HTTPS callback settings are missing.
   */
  constructor() {
    this.subscriptions = new Map(); // Active subscription tracking.
    this.hubUrl = "https://pubsubhubbub.appspot.com/subscribe";
    this.leaseSeconds = 864000; // 10 days.

    this.lastNotificationAt = null;
    this.lastVerificationAt = null;

    const DEFAULT_SECRET = "legisla-net-webhook-secret";
    const DEFAULT_CALLBACK_URL = "https://seu-dominio.com/api/webhooks/youtube";

    const envSecret = process.env.YOUTUBE_WEBHOOK_SECRET;
    const envCallbackUrl = process.env.YOUTUBE_WEBHOOK_CALLBACK_URL;
    const isProd = process.env.NODE_ENV === "production";

    this.hubSecret = envSecret || DEFAULT_SECRET;
    this.callbackUrl = envCallbackUrl || DEFAULT_CALLBACK_URL;

    this.webhooksEnabled = true;

    if (isProd) {
      const problems = [];

      if (!envSecret) problems.push("YOUTUBE_WEBHOOK_SECRET");
      if (!envCallbackUrl) problems.push("YOUTUBE_WEBHOOK_CALLBACK_URL");
      if (this.callbackUrl === DEFAULT_CALLBACK_URL)
        problems.push("YOUTUBE_WEBHOOK_CALLBACK_URL (placeholder)");
      if (this.callbackUrl && !this.callbackUrl.startsWith("https://"))
        problems.push("YOUTUBE_WEBHOOK_CALLBACK_URL deve começar com https://");

      if (problems.length > 0) {
        this.webhooksEnabled = false;
        logger.error(
          `❌ Webhooks do YouTube desabilitados em produção (configuração incompleta): ${problems.join(", ")}.`,
        );
        logger.error("   Configure as variáveis e reinicie o servidor.");
      }
    } else {
      if (!envSecret || !envCallbackUrl) {
        logger.log(
          "ℹ️ Webhooks do YouTube em modo DEV com valores padrão. Em produção, configure YOUTUBE_WEBHOOK_SECRET e YOUTUBE_WEBHOOK_CALLBACK_URL.",
        );
      }
    }
  }

  /**
   * Requests webhook subscription notifications for a YouTube channel.
   *
   * @param {string} channelId - YouTube channel identifier.
   * @param {string|number} camaraId - Chamber identifier.
   * @returns {Promise<boolean>} True when the subscription request succeeds.
   */
  async subscribeToChannel(channelId, camaraId) {
    if (!this.webhooksEnabled) {
      logger.error(
        "Webhooks desabilitados: não é possível solicitar subscrição.",
      );
      return false;
    }

    logger.log(`Subscrevendo ao canal ${channelId} para câmara ${camaraId}`);

    const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;

    const formData = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.topic": topicUrl,
      "hub.callback": this.callbackUrl,
      "hub.verify": "async",
      "hub.secret": this.hubSecret,
      "hub.lease_seconds": this.leaseSeconds.toString(),
    });

    try {
      const response = await fetch(this.hubUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      if (response.ok) {
        this.subscriptions.set(channelId, {
          camaraId,
          subscribedAt: new Date(),
          topicUrl,
          status: "pending",
        });
        logger.log(`✅ Subscrição solicitada para canal ${channelId}`);
        return true;
      } else {
        const errorText = await response.text();
        logger.error(`Erro ao subscrever canal ${channelId}:`, errorText);
        return false;
      }
    } catch (error) {
      logger.error(`Erro ao subscrever canal ${channelId}:`, error.message);
      return false;
    }
  }

  /**
   * Requests cancellation of a YouTube channel webhook subscription.
   *
   * @param {string} channelId - YouTube channel identifier.
   * @returns {Promise<boolean>} True when the unsubscribe request succeeds.
   */
  async unsubscribeFromChannel(channelId) {
    if (!this.webhooksEnabled) {
      logger.error(
        "Webhooks desabilitados: não é possível cancelar subscrição.",
      );
      return false;
    }

    logger.log(`Cancelando subscrição do canal ${channelId}`);

    const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;

    const formData = new URLSearchParams({
      "hub.mode": "unsubscribe",
      "hub.topic": topicUrl,
      "hub.callback": this.callbackUrl,
      "hub.verify": "async",
    });

    try {
      const response = await fetch(this.hubUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      if (response.ok) {
        this.subscriptions.delete(channelId);
        logger.log(`✅ Subscrição cancelada para canal ${channelId}`);
        return true;
      } else {
        const errorText = await response.text();
        logger.error(
          `Erro ao cancelar subscrição do canal ${channelId}:`,
          errorText,
        );
        return false;
      }
    } catch (error) {
      logger.error(
        `Erro ao cancelar subscrição do canal ${channelId}:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * Verifies the PubSubHubbub HMAC signature for a webhook body.
   *
   * @param {string} body - Raw request body.
   * @param {string} signature - Signature received in the x-hub-signature header.
   * @returns {boolean} True when the signature matches the configured secret.
   */
  verifySignature(body, signature) {
    if (!this.webhooksEnabled) {
      return false;
    }

    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha1", this.hubSecret)
      .update(body)
      .digest("hex");

    const receivedSignature = signature.replace("sha1=", "");

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(receivedSignature, "hex"),
    );
  }

  /**
   * Processes a YouTube XML webhook notification.
   *
   * @param {string} xmlData - XML payload received from YouTube.
   * @returns {Promise<boolean>} True when the notification is processed.
   */
  async processWebhookNotification(xmlData) {
    if (!this.webhooksEnabled) {
      logger.error("Webhooks desabilitados: notificação ignorada.");
      return false;
    }

    try {
      // Lightweight XML extraction is enough for the PubSubHubbub video payload.
      const videoIdMatch = xmlData.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const channelIdMatch = xmlData.match(
        /<yt:channelId>([^<]+)<\/yt:channelId>/,
      );
      const titleMatch = xmlData.match(/<media:title>([^<]+)<\/media:title>/);
      const publishedMatch = xmlData.match(/<published>([^<]+)<\/published>/);

      if (!videoIdMatch || !channelIdMatch) {
        logger.error("Dados inválidos no webhook XML");
        return false;
      }

      const videoId = videoIdMatch[1];
      const channelId = channelIdMatch[1];
      const title = titleMatch ? titleMatch[1] : "";
      const published = publishedMatch
        ? new Date(publishedMatch[1])
        : new Date();

      logger.log(
        `📺 Notificação recebida: Canal ${channelId}, Vídeo ${videoId} - "${title}"`,
      );

      // Resolve chamber from the database so webhook handling survives restarts.
      const { data: camara, error: camaraError } = await supabaseAdmin
        .from("camaras")
        .select("id, nome_camara")
        .eq("youtube_channel_id", channelId)
        .single();

      if (camaraError || !camara) {
        logger.log(
          `Notificação recebida para canal não cadastrado: ${channelId}`,
        );
        return false;
      }

      const camaraId = camara.id;
      this.lastNotificationAt = new Date();

      if (!this.subscriptions.has(channelId)) {
        this.subscriptions.set(channelId, {
          camaraId,
          subscribedAt: new Date(),
          status: "verified",
        });
      }

      // YouTube sends updates for many video changes; duplicate handling is delegated to upsert.
      logger.log(
        `🔴 Processando notificação de vídeo: ${title} (videoId: ${videoId})`,
      );

      await this.handleLivestreamDetectedZeroQuota(
        camaraId,
        channelId,
        videoId,
        title,
        published,
      );

      return true;
    } catch (error) {
      logger.error("Erro ao processar notificação webhook:", error.message);
      return false;
    }
  }

  /**
   * Handles live detection from webhook metadata without calling the YouTube API.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string} channelId - YouTube channel identifier.
   * @param {string} videoId - YouTube video identifier.
   * @param {string} title - Video title.
   * @param {Date} publishedDate - Video published timestamp.
   * @returns {Promise<void>}
   */
  async handleLivestreamDetectedZeroQuota(
    camaraId,
    channelId,
    videoId,
    title,
    publishedDate,
  ) {
    try {
      const livestreamService = require("./livestreamService");
      const now = new Date().toISOString();
      const published = publishedDate || new Date(0);

      // Memory barrier: ignore delayed webhooks for recently ended livestreams.
      if (
        livestreamService.isRecentlyEnded &&
        livestreamService.isRecentlyEnded(videoId)
      ) {
        logger.log(
          `🛡️ Filtro Memory Barrier: Ignorando webhook de live recentemente encerrada (${videoId})`,
        );
        return;
      }

      // Stability filter: keep a newer active livestream when older webhook jitter arrives.
      const { data: currentLive } = await supabaseAdmin
        .from("livestreams")
        .select("youtube_video_id, scheduled_start_time, created_at")
        .eq("camara_id", camaraId)
        .eq("status", "live")
        .maybeSingle();

      if (currentLive && currentLive.youtube_video_id !== videoId) {
        const currentLiveDate = new Date(
          currentLive.scheduled_start_time || currentLive.created_at,
        );

        if (published < currentLiveDate) {
          logger.log(
            `🛡️ Filtro de Estabilidade: Ignorando vídeo antigo (${videoId} - ${published.toISOString()}) pois já existe live ativa mais recente (${
              currentLive.youtube_video_id
            } - ${currentLiveDate.toISOString()})`,
          );
          return;
        }

        logger.log(
          `🔄 Substituindo live anterior (${currentLive.youtube_video_id}) por nova live mais recente (${videoId})`,
        );
      }

      const streamData = {
        youtube_video_id: videoId,
        camara_id: camaraId,
        title: title || "Transmissão ao vivo",
        description: "",
        thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        status: "live",
        is_current: true,
        scheduled_start_time: published.toISOString(),
        actual_start_time: now,
      };

      logger.log(`🎯 Processando livestream (zero-quota): ${title}`);

      const { data, error } = await supabaseAdmin
        .from("livestreams")
        .upsert([streamData], {
          onConflict: "youtube_video_id",
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        logger.error("Erro ao salvar livestream:", error.message);
        return;
      }

      if (typeof global !== "undefined" && global.io) {
        const eventData = {
          camaraId,
          livestreamData: data,
          isLive: true,
          timestamp: now,
          source: "webhook-zero-quota",
        };

        global.io
          .to(`portal-camara-${camaraId}`)
          .emit("livestream-updated", eventData);
        logger.log(
          `📡 WebSocket: Notificação enviada para portal-camara-${camaraId} via webhook (zero-quota)`,
        );
      }

      await livestreamService.updateCamaraCurrentLivestream(camaraId, data.id);

      logger.log(`✅ Livestream processada com sucesso (zero-quota): ${title}`);
    } catch (error) {
      logger.error("Erro ao processar livestream (zero-quota):", error.message);
    }
  }

  /**
   * Handles livestream detection with a YouTube API lookup as a legacy fallback.
   *
   * @param {string|number} camaraId - Chamber identifier.
   * @param {string} channelId - YouTube channel identifier.
   * @param {string} videoId - YouTube video identifier.
   * @param {string} title - Video title.
   * @returns {Promise<void>}
   */
  async handleLivestreamDetected(camaraId, channelId, videoId, title) {
    try {
      const youtubeService = require("./youtubeService");
      const livestreamService = require("./livestreamService");

      const videoDetails = await youtubeService.getVideoDetails(videoId);
      const liveDetails = videoDetails.liveStreamingDetails;

      if (
        liveDetails &&
        (liveDetails.actualStartTime || liveDetails.scheduledStartTime)
      ) {
        const isLive =
          !!liveDetails.actualStartTime && !liveDetails.actualEndTime;

        logger.log(
          `🎯 Livestream confirmada (API): ${title} (Live: ${isLive})`,
        );

        const streamData = youtubeService.formatLivestreamData(
          videoDetails,
          camaraId,
        );
        streamData.status = isLive ? "live" : "upcoming";
        streamData.is_current = isLive;

        const { data, error } = await supabaseAdmin
          .from("livestreams")
          .upsert([streamData], {
            onConflict: "youtube_video_id",
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (error) {
          logger.error("Erro ao salvar livestream:", error.message);
          return;
        }

        if (typeof global !== "undefined" && global.io) {
          const eventData = {
            camaraId,
            livestreamData: data,
            isLive,
            timestamp: new Date().toISOString(),
            source: "webhook-api",
          };

          global.io
            .to(`portal-camara-${camaraId}`)
            .emit("livestream-updated", eventData);
          logger.log(
            `📡 WebSocket: Notificação enviada para portal-camara-${camaraId} via webhook (API)`,
          );
        }

        if (isLive) {
          await livestreamService.updateCamaraCurrentLivestream(
            camaraId,
            data.id,
          );
        }

        logger.log(`✅ Livestream processada com sucesso (API): ${title}`);
      } else {
        logger.log(`📄 Vídeo não é livestream: ${title}`);
      }
    } catch (error) {
      logger.error("Erro ao processar livestream detectada:", error.message);
    }
  }

  /**
   * Handles PubSubHubbub verification challenges.
   *
   * @param {string} mode - Verification mode.
   * @param {string} topic - Subscription topic.
   * @param {string} challenge - Hub challenge value.
   * @returns {string|null} Challenge response, or null when webhooks are disabled.
   */
  handleVerification(mode, topic, challenge) {
    if (!this.webhooksEnabled) {
      logger.error("Webhooks desabilitados: verificação ignorada.");
      return null;
    }

    logger.log(`🔍 Verificação de webhook: ${mode} para ${topic}`);

    const channelIdMatch = topic.match(/channel_id=([^&]+)/);
    if (channelIdMatch) {
      const channelId = channelIdMatch[1];
      const subscription = this.subscriptions.get(channelId);

      if (subscription) {
        subscription.status =
          mode === "subscribe" ? "verified" : "unsubscribed";
        this.lastVerificationAt = new Date();
        logger.log(`✅ Subscrição ${mode} verificada para canal ${channelId}`);
      }
    }

    return challenge;
  }

  /**
   * Requests webhook subscriptions for all configured chambers with YouTube channels.
   *
   * @returns {Promise<void>}
   */
  async subscribeToAllChannels() {
    if (!this.webhooksEnabled) {
      logger.error("Webhooks desabilitados: não é possível subscrever canais.");
      return;
    }

    try {
      logger.log("🔄 Subscrevendo a todos os canais configurados...");

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

      let subscribed = 0;
      for (const camara of camaras) {
        const success = await this.subscribeToChannel(
          camara.youtube_channel_id,
          camara.id,
        );
        if (success) subscribed++;

        // Pace subscription requests to avoid hub rate limits.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      logger.log(
        `✅ Subscrições solicitadas: ${subscribed}/${camaras.length} canais`,
      );
    } catch (error) {
      logger.error("Erro ao subscrever canais:", error.message);
    }
  }

  /**
   * Returns tracked subscription status by channel.
   *
   * @returns {Object<string, {camaraId: string|number, status: string, subscribedAt: Date}>} Subscription status map.
   */
  getSubscriptionStatus() {
    const status = {};
    for (const [channelId, subscription] of this.subscriptions) {
      status[channelId] = {
        camaraId: subscription.camaraId,
        status: subscription.status,
        subscribedAt: subscription.subscribedAt,
      };
    }
    return status;
  }

  /**
   * Returns safe webhook health data without exposing secrets.
   *
   * @returns {Object} Webhook health summary.
   */
  getHealth() {
    let verifiedCount = 0;
    let pendingCount = 0;
    let unsubscribedCount = 0;

    for (const [, subscription] of this.subscriptions) {
      if (subscription.status === "verified") verifiedCount++;
      else if (subscription.status === "pending") pendingCount++;
      else if (subscription.status === "unsubscribed") unsubscribedCount++;
    }

    return {
      enabled: this.webhooksEnabled,
      callbackUrl: this.callbackUrl,
      leaseSeconds: this.leaseSeconds,
      totals: {
        trackedChannels: this.subscriptions.size,
        verifiedCount,
        pendingCount,
        unsubscribedCount,
      },
      lastNotificationAt: this.lastNotificationAt,
      lastVerificationAt: this.lastVerificationAt,
    };
  }
}

module.exports = new YouTubeWebhookService();
