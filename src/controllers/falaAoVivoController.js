const createLogger = require("../utils/logger");
const logger = createLogger("FALA_AO_VIVO");

const {
  STATUS,
  getActiveHistoricoByCamara,
  ensureTempoEsgotadoIfNeeded,
  getOradorByIdForCamara,
  marcarTempoEsgotado,
  toPublicPayload,
  emitFalaUpdate,
} = require("../services/falaHistoricoService");

/**
 * Normalizes chamber identifiers for route and payload comparisons.
 *
 * @param {string|number|null|undefined} camaraId - Chamber identifier.
 * @returns {string} String identifier, or an empty string when missing.
 */
function normalizeCamaraId(camaraId) {
  return camaraId != null ? String(camaraId) : "";
}

/**
 * Emits a live-speaking update using the legacy notification contract.
 *
 * The current primary flow stores live-speaking state in the database; this
 * helper keeps the previous function signature available for callers that only
 * need to broadcast an update.
 *
 * @param {import("express").Application} app - Express application instance.
 * @param {Object} payload - Live-speaking payload received from the caller.
 * @returns {{stored: boolean, emitted: boolean}} Compatibility status flags.
 */
function upsertAndEmitFalaAoVivo(app, payload) {
  try {
    const camaraIdStr = normalizeCamaraId(payload?.camaraId);
    if (!camaraIdStr) return { stored: false, emitted: false };

    // Preserve legacy behavior: emit the update without persisting it.
    emitFalaUpdate(app, {
      type: "fala-ao-vivo",
      historicoFalaId: payload?.historicoFalaId || null,
      camaraId: camaraIdStr,
      oradorId: payload?.oradorId != null ? String(payload.oradorId) : null,
      vereadorId: payload?.vereadorId != null ? String(payload.vereadorId) : null,
      sessaoId: payload?.sessaoId != null ? String(payload.sessaoId) : null,
      oradorNome: payload?.oradorNome || null,
      oradorFotoUrl: payload?.oradorFotoUrl || null,
      partidoSigla: payload?.partidoSigla || null,
      status: payload?.status || STATUS.PREPARADA,
      tempoFalaMinutos: Number.isFinite(Number(payload?.tempoFalaMinutos))
        ? Number(payload.tempoFalaMinutos)
        : 0,
      tempoRestanteSegundos: Number.isFinite(Number(payload?.tempoRestanteSegundos))
        ? Math.max(0, Math.trunc(Number(payload.tempoRestanteSegundos)))
        : null,
      preparadaEm: payload?.preparadaEm || payload?.timestamp || null,
      iniciadaEm: payload?.startedAt || null,
      encerradaEm: payload?.endedAt || null,
      updatedAt: payload?.timestamp || new Date().toISOString(),
      serverTime: new Date().toISOString(),
    });

    return { stored: true, emitted: true };
  } catch (e) {
    logger.error("Erro ao emitir fala (compat):", e);
    return { stored: false, emitted: false };
  }
}

/**
 * POST /api/fala-ao-vivo/notify
 *
 * Receives live-speaking updates and broadcasts them to chamber TV clients.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const notifyFalaAoVivo = async (req, res) => {
  try {
    upsertAndEmitFalaAoVivo(req.app, req.body);
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("❌ Erro ao processar notificação de fala ao vivo:", error);
    res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * GET /api/fala-ao-vivo/status/:camaraId
 *
 * Returns the current live-speaking status for a chamber and reconciles expired
 * speaking time when no in-memory timer is available.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getStatusFala = async (req, res) => {
  try {
    const camaraIdStr = normalizeCamaraId(req.params.camaraId);
    if (!camaraIdStr) {
      return res.json({
        isLive: false,
        fala: null,
        message: "Câmara inválida",
      });
    }

    const historico = await getActiveHistoricoByCamara(camaraIdStr);
    if (!historico) {
      return res.json({
        isLive: false,
        fala: null,
        message: "Nenhuma fala ativa no momento",
      });
    }

    let orador = null;
    try {
      if (historico.orador_id) {
        orador = await getOradorByIdForCamara(historico.orador_id, camaraIdStr);
      }
    } catch (_) {
      // Status responses should still succeed when speaker enrichment fails.
    }

    // Mark expired speaking time after restarts or when no in-memory timer exists.
    const historicoAtualizado = await ensureTempoEsgotadoIfNeeded(
      req.app,
      historico,
      orador
    );

    const payload = toPublicPayload(historicoAtualizado, orador);

    return res.json({
      isLive: historicoAtualizado.status !== STATUS.ENCERRADA,
      fala: payload,
    });
  } catch (error) {
    logger.error("Erro ao buscar status de fala:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * POST /api/fala-ao-vivo/tempo-esgotado/:historicoId
 *
 * Idempotently marks a speaking turn as tempo_esgotado without ending it.
 * Requires authenticated TV or admin access.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const markTempoEsgotado = async (req, res) => {
  try {
    const { profile } = req;
    const { historicoId } = req.params;

    const result = await marcarTempoEsgotado({
      app: req.app,
      camaraId: profile.camara_id,
      historicoId,
    });

    return res.json({ success: true, fala: result.payload });
  } catch (error) {
    logger.error("Erro ao marcar tempo esgotado:", error);
    return res
      .status(error.statusCode || 500)
      .json({ success: false, error: error.message || "Erro interno" });
  }
};

module.exports = {
  notifyFalaAoVivo,
  getStatusFala,
  markTempoEsgotado,
  upsertAndEmitFalaAoVivo,
};
