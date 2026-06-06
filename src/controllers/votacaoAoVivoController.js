const { createClient } = require("@supabase/supabase-js");
const createLogger = require("../utils/logger");
const logger = createLogger("VOTACAO_AO_VIVO");

/**
 * In-memory live-voting state keyed by chamber and pauta identifiers.
 *
 * @type {Map<string, Object>}
 */
const votacoesAtivas = new Map();

/**
 * Stores live-voting state and emits updates to public portal and TV clients.
 *
 * @param {import("express").Application} app - Express application instance.
 * @param {Object} payload - Live-voting payload.
 * @param {string|number} payload.camaraId - Chamber identifier.
 * @param {string|number} payload.pautaId - Pauta identifier.
 * @param {string} payload.pautaNome - Pauta display name.
 * @param {string} payload.pautaDescricao - Pauta description.
 * @param {string} payload.sessaoNome - Session display name.
 * @param {string} payload.sessaoTipo - Session type.
 * @param {string} payload.sessaoDataHora - Session date and time.
 * @param {number|string} payload.vereadoresOnline - Online vereador count.
 * @param {string} payload.status - Live-voting status.
 * @param {string} payload.timestamp - Event timestamp.
 * @returns {{stored: boolean, emitted: boolean}} Storage and emit status.
 */
function upsertAndEmitVotacaoAoVivo(app, payload) {
  const {
    camaraId,
    pautaId,
    pautaNome,
    pautaDescricao,
    sessaoNome,
    sessaoTipo,
    sessaoDataHora,
    vereadoresOnline,
    status,
    timestamp,
  } = payload || {};

  const camaraIdStr = camaraId != null ? String(camaraId) : "";
  const pautaIdStr = pautaId != null ? String(pautaId) : "";

  const votacaoKey = `${camaraIdStr}_${pautaIdStr}`;
  votacoesAtivas.set(votacaoKey, {
    camaraId: camaraIdStr,
    pautaId: pautaIdStr,
    pautaNome,
    pautaDescricao,
    sessaoNome,
    sessaoTipo,
    sessaoDataHora,
    vereadoresOnline: Number.isFinite(Number(vereadoresOnline))
      ? Number(vereadoresOnline)
      : 0,
    status,
    timestamp,
  });

  const io = app?.get ? app.get("io") : null;
  if (!io) {
    logger.warn("⚠️ Socket.IO não disponível no app");
    return { stored: true, emitted: false };
  }

  const publicPayload = {
    type: "votacao-ao-vivo",
    camaraId: camaraIdStr,
    pautaId: pautaIdStr,
    pautaNome,
    pautaDescricao,
    sessaoNome,
    sessaoTipo,
    sessaoDataHora,
    vereadoresOnline: Number.isFinite(Number(vereadoresOnline))
      ? Number(vereadoresOnline)
      : 0,
    status,
    isLive: status === "iniciada",
    timestamp,
  };

  io.emit("votacao-ao-vivo-update", publicPayload);

  if (status === "iniciada") {
    const tvPayload = {
      type: "iniciar-votacao",
      pauta: {
        id: pautaIdStr,
        nome: pautaNome,
        descricao: pautaDescricao,
      },
      sessao: {
        nome: sessaoNome,
        tipo: sessaoTipo,
        dataHora: sessaoDataHora,
      },
      camaraId: camaraIdStr,
      vereadoresOnline: Number.isFinite(Number(vereadoresOnline))
        ? Number(vereadoresOnline)
        : 0,
      timestamp,
    };

    const tvRoom = `tv-camara-${camaraIdStr}`;
    io.to(tvRoom).emit("tv:iniciar-votacao", tvPayload);
    logger.log(`📺 Evento tv:iniciar-votacao emitido para sala ${tvRoom}`);
  }

  logger.log(
    `✅ WebSocket emitido para portal público - Câmara ${camaraIdStr}, ${
      Number.isFinite(Number(vereadoresOnline)) ? Number(vereadoresOnline) : 0
    } vereadores online`
  );

  return { stored: true, emitted: true };
}

/**
 * POST /api/votacao-ao-vivo/notify
 *
 * Receives live-voting updates and broadcasts them through the global
 * Socket.IO instance.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const notifyVotacaoAoVivo = async (req, res) => {
  try {
    const {
      camaraId,
      pautaId,
      pautaNome,
      pautaDescricao,
      sessaoNome,
      sessaoTipo,
      sessaoDataHora,
      vereadoresOnline,
      status,
      timestamp,
    } = req.body;

    logger.log(
      `📡 Notificação de votação ao vivo recebida - Câmara: ${camaraId}, Pauta: ${pautaId}, Vereadores online: ${vereadoresOnline}`
    );

    upsertAndEmitVotacaoAoVivo(req.app, {
      camaraId,
      pautaId,
      pautaNome,
      pautaDescricao,
      sessaoNome,
      sessaoTipo,
      sessaoDataHora,
      vereadoresOnline,
      status,
      timestamp,
    });

    res.status(200).json({
      success: true,
      message: "Notificação processada e emitida via WebSocket",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("❌ Erro ao processar notificação de votação ao vivo:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * GET /api/votacao-ao-vivo/status/:camaraId
 *
 * Returns active live-voting state for a chamber from the in-memory cache.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getStatusVotacao = async (req, res) => {
  try {
    const { camaraId } = req.params;

    const votacoesCamera = Array.from(votacoesAtivas.values()).filter(
      (v) => String(v.camaraId) === String(camaraId) && v.status === "iniciada"
    );

    if (votacoesCamera.length === 0) {
      return res.json({
        isLive: false,
        votacoes: [],
        message: "Nenhuma votação ativa no momento",
      });
    }

    res.json({
      isLive: true,
      votacoes: votacoesCamera,
    });
  } catch (error) {
    logger.error("Erro ao buscar status de votação:", error);
    res.status(500).json({
      error: "Erro interno do servidor",
    });
  }
};

/**
 * POST /api/votacao-ao-vivo/notify-voto
 *
 * Receives vote notifications, relays them to public pauta viewers, and sends
 * chamber TV/control-panel updates when a chamber is provided.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const notifyVoto = async (req, res) => {
  try {
    const { pautaId, voto, isUpdate, vereadorNome, camaraId } = req.body;

    logger.log(
      `🗳️ Notificação de voto recebida - Pauta: ${pautaId}, Voto: ${voto}, IsUpdate: ${isUpdate}`
    );

    const io = req.app.get("io");
    if (io) {
      const votoPayload = {
        type: "voto-registrado",
        pautaId,
        voto,
        isUpdate: isUpdate || false,
        vereadorNome,
        timestamp: new Date().toISOString(),
      };

      io.to(`pauta_public_${pautaId}`).emit(
        "voto-notification-public",
        votoPayload
      );
      logger.log(
        `✅ Voto retransmitido via WebSocket para sala pauta_public_${pautaId}`
      );

      if (camaraId) {
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );

        const { data: votos } = await supabase
          .from("votos")
          .select("voto")
          .eq("pauta_id", pautaId);

        const totals = { sim: 0, nao: 0, abstencao: 0 };
        if (votos) {
          votos.forEach((v) => {
            if (v.voto === "SIM") totals.sim++;
            else if (v.voto === "NÃO") totals.nao++;
            else if (v.voto === "ABSTENÇÃO") totals.abstencao++;
          });
        }

        const tvVotoPayload = {
          type: "voto-tv",
          pautaId,
          voto,
          vereadorNome,
          isUpdate: isUpdate || false,
          timestamp: new Date().toISOString(),
        };

        const painelVotoPayload = {
          pautaId,
          totals,
          voto,
        };

        const tvRoom = `tv-camara-${camaraId}`;
        const painelRoom = `painel-camara-${camaraId}`;

        io.to(tvRoom).emit("tv:voto-notification", tvVotoPayload);
        logger.log(`📺 Voto emitido para TVs na sala ${tvRoom}`);

        io.to(painelRoom).emit("votacao-ao-vivo-update", painelVotoPayload);
        logger.log(`🎛️ Voto emitido para Painel na sala ${painelRoom} | Totals: SIM=${totals.sim}, NÃO=${totals.nao}, ABSTENÇÃO=${totals.abstencao}`);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("❌ Erro ao retransmitir voto:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
};

module.exports = {
  notifyVotacaoAoVivo,
  getStatusVotacao,
  notifyVoto,
  votacoesAtivas,
  upsertAndEmitVotacaoAoVivo,
};
