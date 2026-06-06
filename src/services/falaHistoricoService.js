const supabaseAdmin = require("../config/supabaseAdminClient");
const createLogger = require("../utils/logger");

const logger = createLogger("FALA_HISTORICO");

/**
 * Speaker-turn lifecycle statuses persisted in historico_falas.
 */
const STATUS = {
  PREPARADA: "preparada",
  INICIADA: "iniciada",
  PAUSADA: "pausada",
  TEMPO_ESGOTADO: "tempo_esgotado",
  ENCERRADA: "encerrada",
};

/**
 * Event types persisted in eventos_fala for audit and timer reconstruction.
 */
const EVENTO = {
  PREPARADA: "preparada",
  INICIADA: "iniciada",
  PAUSADA: "pausada",
  RETOMADA: "retomada",
  TEMPO_ADICIONADO: "tempo_adicionado",
  RECOMECADA: "recomeçada",
  TEMPO_ESGOTADO: "tempo_esgotado",
  ENCERRADA: "encerrada",
};

const MAX_ADICIONAR_MINUTOS = 30;

/**
 * Returns the current timestamp in ISO 8601 format.
 *
 * @returns {string} Current ISO timestamp.
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Parses an integer and clamps it to an inclusive range.
 *
 * @param {*} value - Value to parse.
 * @param {number} min - Minimum allowed integer.
 * @param {number} max - Maximum allowed integer.
 * @returns {number|null} Clamped integer, or null when the value is not numeric.
 */
function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/**
 * Normalizes chamber identifiers for comparison and payload output.
 *
 * @param {string|number|null|undefined} camaraId - Chamber identifier.
 * @returns {string} String identifier, or an empty string when missing.
 */
function normalizeCamaraId(camaraId) {
  return camaraId != null ? String(camaraId) : "";
}

/**
 * Fetches the latest non-ended speaker history for a chamber.
 *
 * @param {string|number} camaraId - Chamber identifier.
 * @returns {Promise<Object|null>} Active speaker history row, or null when none exists.
 */
async function getActiveHistoricoByCamara(camaraId) {
  const camaraIdStr = normalizeCamaraId(camaraId);
  if (!camaraIdStr) return null;

  const { data, error } = await supabaseAdmin
    .from("historico_falas")
    .select("*")
    .eq("camara_id", camaraIdStr)
    .neq("status", STATUS.ENCERRADA)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    logger.error("Erro ao buscar fala ativa:", error);
    throw error;
  }

  return data && data.length ? data[0] : null;
}

/**
 * Fetches a speaker history row by ID.
 *
 * @param {string|number} historicoId - Speaker history identifier.
 * @returns {Promise<Object>} Speaker history row.
 */
async function getHistoricoById(historicoId) {
  const { data, error } = await supabaseAdmin
    .from("historico_falas")
    .select("*")
    .eq("id", historicoId)
    .single();

  if (error) {
    logger.error("Erro ao buscar historico_falas:", error);
    throw error;
  }

  return data;
}

/**
 * Fetches a speaker with vereador, party, and session data, scoped to a chamber.
 *
 * @param {string|number} oradorId - Speaker identifier.
 * @param {string|number} camaraId - Chamber identifier.
 * @returns {Promise<Object>} Speaker row with related vereador and session data.
 */
async function getOradorByIdForCamara(oradorId, camaraId) {
  const { data, error } = await supabaseAdmin
    .from("oradores")
    .select(
      `
        id,
        ordem,
        tempo_fala_minutos,
        vereadores (
          id,
          nome_parlamentar,
          foto_url,
          partidos (
            id,
            nome,
            sigla
          )
        ),
        sessoes!inner (
          id,
          nome,
          camara_id
        )
      `
    )
    .eq("id", oradorId)
    .eq("sessoes.camara_id", camaraId)
    .single();

  if (error) {
    logger.error("Erro ao buscar orador:", error);
    throw error;
  }

  return data;
}

/**
 * Appends an audit event for a speaker history record.
 *
 * @param {string|number} historicoFalaId - Speaker history identifier.
 * @param {string} tipoEvento - Event type from EVENTO.
 * @param {Object} [extra={}] - Optional event details.
 * @param {number|string} [extra.tempoRestanteSegundos] - Remaining time snapshot.
 * @param {number|string} [extra.tempoAdicionadoMinutos] - Added time in minutes.
 * @param {string} [extra.observacao] - Optional note.
 * @returns {Promise<void>}
 */
async function insertEvento(historicoFalaId, tipoEvento, extra = {}) {
  const insertPayload = {
    historico_fala_id: historicoFalaId,
    tipo_evento: tipoEvento,
    tempo_restante_segundos:
      extra.tempoRestanteSegundos != null
        ? Math.max(0, Math.trunc(Number(extra.tempoRestanteSegundos)))
        : null,
    tempo_adicionado_minutos:
      extra.tempoAdicionadoMinutos != null
        ? Math.trunc(Number(extra.tempoAdicionadoMinutos))
        : null,
    observacao: extra.observacao || null,
  };

  const { error } = await supabaseAdmin.from("eventos_fala").insert(insertPayload);
  if (error) {
    logger.error("Erro ao inserir evento_fala:", error);
    throw error;
  }
}

/**
 * Fetches the latest event matching any of the provided event types.
 *
 * @param {string|number} historicoFalaId - Speaker history identifier.
 * @param {string[]} tipos - Event types to search.
 * @returns {Promise<Object|null>} Latest matching event, or null when none exists.
 */
async function getLastEventoByTypes(historicoFalaId, tipos) {
  const { data, error } = await supabaseAdmin
    .from("eventos_fala")
    .select("*")
    .eq("historico_fala_id", historicoFalaId)
    .in("tipo_evento", tipos)
    .order("timestamp", { ascending: false })
    .limit(1);

  if (error) {
    logger.error("Erro ao buscar eventos_fala:", error);
    throw error;
  }

  return data && data.length ? data[0] : null;
}

/**
 * Computes remaining countdown time from a stored anchor and timestamp.
 *
 * @param {Object} params - Anchor timing data.
 * @param {number|string} params.remainingAtAnchor - Remaining seconds at the anchor.
 * @param {string} params.anchorTimestamp - ISO timestamp for the anchor event.
 * @returns {number|null} Remaining seconds, or null when the anchor value is invalid.
 */
function computeRemainingSecondsFromAnchor({ remainingAtAnchor, anchorTimestamp }) {
  if (!Number.isFinite(Number(remainingAtAnchor))) return null;
  const base = Math.max(0, Math.trunc(Number(remainingAtAnchor)));

  const anchorMs = anchorTimestamp ? Date.parse(anchorTimestamp) : NaN;
  if (!Number.isFinite(anchorMs)) return base;

  const elapsedSeconds = Math.floor((Date.now() - anchorMs) / 1000);
  return Math.max(0, base - Math.max(0, elapsedSeconds));
}

/**
 * Computes current remaining time for a speaker history record.
 *
 * Running turns are reconstructed from the most recent start/resume/restart/add-time
 * event. Prepared and paused turns use stored remaining time.
 *
 * @param {Object|null} historico - Speaker history row.
 * @returns {Promise<number>} Current remaining seconds.
 */
async function computeCurrentRemainingSeconds(historico) {
  if (!historico) return 0;

  const status = historico.status;

  if (status === STATUS.ENCERRADA) return 0;
  if (status === STATUS.TEMPO_ESGOTADO) return 0;

  const storedRemaining =
    historico.tempo_restante_segundos != null
      ? Math.max(0, Math.trunc(Number(historico.tempo_restante_segundos)))
      : null;

  if (status === STATUS.PREPARADA || status === STATUS.PAUSADA) {
    if (storedRemaining != null) return storedRemaining;
    return Math.max(0, Math.trunc(Number(historico.tempo_alocado_minutos || 0)) * 60);
  }

  if (status === STATUS.INICIADA) {
    const anchorEvent = await getLastEventoByTypes(historico.id, [
      EVENTO.INICIADA,
      EVENTO.RETOMADA,
      EVENTO.RECOMECADA,
      EVENTO.TEMPO_ADICIONADO,
    ]);

    const remainingAtAnchor =
      anchorEvent && anchorEvent.tempo_restante_segundos != null
        ? anchorEvent.tempo_restante_segundos
        : storedRemaining;

    const anchorTimestamp = anchorEvent ? anchorEvent.timestamp : historico.iniciada_em;

    const computed = computeRemainingSecondsFromAnchor({
      remainingAtAnchor,
      anchorTimestamp,
    });

    return computed != null ? computed : 0;
  }

  return storedRemaining != null ? storedRemaining : 0;
}

/**
 * Converts internal speaker history and speaker rows into the public live payload.
 *
 * @param {Object} historico - Speaker history row.
 * @param {Object|null} orador - Speaker row with related vereador data.
 * @returns {Object} Payload emitted to TV and control-panel clients.
 */
function toPublicPayload(historico, orador) {
  const camaraIdStr = normalizeCamaraId(historico.camara_id);

  return {
    type: "fala-ao-vivo",
    historicoFalaId: historico.id,
    camaraId: camaraIdStr,

    oradorId: historico.orador_id,
    vereadorId: historico.vereador_id,
    sessaoId: historico.sessao_id,

    oradorNome: orador?.vereadores?.nome_parlamentar || null,
    oradorFotoUrl: orador?.vereadores?.foto_url || null,
    partidoSigla: orador?.vereadores?.partidos?.sigla || null,

    status: historico.status,
    tempoFalaMinutos: historico.tempo_alocado_minutos,
    tempoRestanteSegundos: historico.tempo_restante_segundos,

    preparadaEm: historico.preparada_em,
    iniciadaEm: historico.iniciada_em,
    encerradaEm: historico.encerrada_em,

    totalPausas: historico.total_pausas,
    tempoTotalPausadoSegundos: historico.tempo_total_pausado_segundos,
    tempoAdicionadoTotalMinutos: historico.tempo_adicionado_total_minutos,
    recomecos: historico.recomecos,

    updatedAt: historico.updated_at,
    serverTime: nowIso(),
  };
}

/**
 * Emits live-speaking updates to chamber TV and control-panel rooms.
 *
 * Status-specific TV events are emitted for prepared, started, and ended states;
 * all updates also emit the general live-speaking update events.
 *
 * @param {import("express").Application} app - Express application instance.
 * @param {Object} payload - Public live-speaking payload.
 * @returns {void}
 */
function emitFalaUpdate(app, payload) {
  const io = app?.get ? app.get("io") : null;
  if (!io) {
    logger.warn("⚠️ Socket.IO não disponível no app");
    return;
  }

  const camaraIdStr = normalizeCamaraId(payload?.camaraId);
  if (!camaraIdStr) return;

  const tvRoom = `tv-camara-${camaraIdStr}`;
  const painelRoom = `painel-camara-${camaraIdStr}`;

  if (payload.status === STATUS.PREPARADA) {
    io.to(tvRoom).emit("tv:iniciar-fala", payload);
  } else if (payload.status === STATUS.INICIADA) {
    io.to(tvRoom).emit("tv:iniciar-fala-start", payload);
  } else if (payload.status === STATUS.ENCERRADA) {
    io.to(tvRoom).emit("tv:encerrar-fala", payload);
  }

  io.to(tvRoom).emit("tv:fala-ao-vivo-update", payload);
  io.to(painelRoom).emit("fala-ao-vivo-update", payload);
}

/**
 * Automatically marks an active speaker turn as tempo_esgotado when its timer
 * has reached zero. This transition does not end the speaker turn.
 *
 * @param {import("express").Application} app - Express application instance.
 * @param {Object} historico - Speaker history row.
 * @param {Object|null} orador - Speaker row with related vereador data.
 * @returns {Promise<Object>} Original or updated speaker history row.
 */
async function ensureTempoEsgotadoIfNeeded(app, historico, orador) {
  if (!historico || historico.status !== STATUS.INICIADA) return historico;

  const remaining = await computeCurrentRemainingSeconds(historico);
  if (remaining > 0) return historico;

  const patch = {
    status: STATUS.TEMPO_ESGOTADO,
    tempo_restante_segundos: 0,
    updated_at: nowIso(),
  };

  const { data, error } = await supabaseAdmin
    .from("historico_falas")
    .update(patch)
    .eq("id", historico.id)
    .select("*")
    .single();

  if (error) {
    logger.error("Erro ao marcar tempo_esgotado:", error);
    throw error;
  }

  await insertEvento(historico.id, EVENTO.TEMPO_ESGOTADO, {
    tempoRestanteSegundos: 0,
  });

  const payload = toPublicPayload(data, orador);
  emitFalaUpdate(app, payload);

  return data;
}

/**
 * Manually marks a speaker turn as tempo_esgotado when it belongs to the chamber
 * and the countdown has already reached zero.
 *
 * @param {Object} params - Operation parameters.
 * @param {import("express").Application} params.app - Express application instance.
 * @param {string|number} params.camaraId - Chamber identifier.
 * @param {string|number} params.historicoId - Speaker history identifier.
 * @returns {Promise<{historico: Object, orador: Object, payload: Object}>} Updated or current state.
 */
async function marcarTempoEsgotado({ app, camaraId, historicoId }) {
  const historico = await getHistoricoById(historicoId);
  if (normalizeCamaraId(historico.camara_id) !== normalizeCamaraId(camaraId)) {
    const err = new Error("Fala não pertence à câmara");
    err.statusCode = 403;
    throw err;
  }

  const orador = await getOradorByIdForCamara(historico.orador_id, camaraId);

  if (historico.status === STATUS.ENCERRADA) {
    const err = new Error("Fala já encerrada");
    err.statusCode = 409;
    throw err;
  }

  if (historico.status === STATUS.TEMPO_ESGOTADO) {
    return { historico, orador, payload: toPublicPayload(historico, orador) };
  }

  if (historico.status !== STATUS.INICIADA) {
    const err = new Error("Só é possível marcar tempo esgotado quando estiver iniciada");
    err.statusCode = 409;
    throw err;
  }

  const remaining = await computeCurrentRemainingSeconds(historico);
  if (remaining > 0) {
    return { historico, orador, payload: toPublicPayload(historico, orador) };
  }

  const patch = {
    status: STATUS.TEMPO_ESGOTADO,
    tempo_restante_segundos: 0,
    updated_at: nowIso(),
  };

  const { data, error } = await supabaseAdmin
    .from("historico_falas")
    .update(patch)
    .eq("id", historico.id)
    .select("*")
    .single();

  if (error) {
    logger.error("Erro ao marcar tempo_esgotado (manual):", error);
    throw error;
  }

  await insertEvento(historico.id, EVENTO.TEMPO_ESGOTADO, {
    tempoRestanteSegundos: 0,
  });

  const payload = toPublicPayload(data, orador);
  emitFalaUpdate(app, payload);

  return { historico: data, orador, payload };
}

/**
 * Prepares a new speaker turn for a chamber when no other turn is active.
 *
 * @param {Object} params - Operation parameters.
 * @param {import("express").Application} params.app - Express application instance.
 * @param {string|number} params.camaraId - Chamber identifier.
 * @param {string|number} params.oradorId - Speaker identifier.
 * @returns {Promise<{created: boolean, historico: Object, orador?: Object, payload?: Object, reason?: string}>} Preparation result.
 */
async function prepararFala({ app, camaraId, oradorId }) {
  const active = await getActiveHistoricoByCamara(camaraId);
  if (active) {
    return { created: false, historico: active, reason: "fala_ja_ativa" };
  }

  const orador = await getOradorByIdForCamara(oradorId, camaraId);

  const tempoAlocadoMinutos = Math.max(
    0,
    Math.trunc(Number(orador.tempo_fala_minutos || 0))
  );
  const preparadaEm = nowIso();

  const insertHistorico = {
    orador_id: orador.id,
    sessao_id: orador.sessoes.id,
    vereador_id: orador.vereadores.id,
    camara_id: orador.sessoes.camara_id,

    status: STATUS.PREPARADA,

    tempo_alocado_minutos: tempoAlocadoMinutos,
    tempo_restante_segundos: tempoAlocadoMinutos * 60,

    preparada_em: preparadaEm,
    iniciada_em: null,
    encerrada_em: null,

    total_pausas: 0,
    tempo_total_pausado_segundos: 0,
    tempo_adicionado_total_minutos: 0,
    recomecos: 0,
  };

  const { data: historico, error } = await supabaseAdmin
    .from("historico_falas")
    .insert(insertHistorico)
    .select("*")
    .single();

  if (error) {
    logger.error("Erro ao criar historico_falas:", error);
    throw error;
  }

  await insertEvento(historico.id, EVENTO.PREPARADA, {
    tempoRestanteSegundos: historico.tempo_restante_segundos,
  });

  const payload = toPublicPayload(historico, orador);
  emitFalaUpdate(app, payload);

  return { created: true, historico, orador, payload };
}

/**
 * Starts or resumes countdown tracking for a speaker history record.
 *
 * @param {Object} params - Operation parameters.
 * @param {import("express").Application} params.app - Express application instance.
 * @param {string|number} params.camaraId - Chamber identifier.
 * @param {string|number} params.historicoId - Speaker history identifier.
 * @returns {Promise<{historico: Object, orador: Object, payload: Object}>} Updated state.
 */
async function iniciarContagem({ app, camaraId, historicoId }) {
  const historico = await getHistoricoById(historicoId);
  if (normalizeCamaraId(historico.camara_id) !== normalizeCamaraId(camaraId)) {
    const err = new Error("Fala não pertence à câmara");
    err.statusCode = 403;
    throw err;
  }

  const orador = await getOradorByIdForCamara(historico.orador_id, camaraId);

  if (historico.status === STATUS.ENCERRADA) {
    const err = new Error("Fala já encerrada");
    err.statusCode = 409;
    throw err;
  }

  const remaining = await computeCurrentRemainingSeconds(historico);
  const iniciadaEm = historico.iniciada_em || nowIso();

  const patch = {
    status: STATUS.INICIADA,
    tempo_restante_segundos: remaining,
    iniciada_em: iniciadaEm,
    updated_at: nowIso(),
  };

  const { data, error } = await supabaseAdmin
    .from("historico_falas")
    .update(patch)
    .eq("id", historico.id)
    .select("*")
    .single();

  if (error) {
    logger.error("Erro ao iniciar contagem:", error);
    throw error;
  }

  await insertEvento(historico.id, EVENTO.INICIADA, {
    tempoRestanteSegundos: remaining,
  });

  const payload = toPublicPayload(data, orador);
  emitFalaUpdate(app, payload);

  await ensureTempoEsgotadoIfNeeded(app, data, orador);

  return { historico: data, orador, payload };
}

/**
 * Pauses a running speaker countdown and stores the current remaining time.
 *
 * @param {Object} params - Operation parameters.
 * @param {import("express").Application} params.app - Express application instance.
 * @param {string|number} params.camaraId - Chamber identifier.
 * @param {string|number} params.historicoId - Speaker history identifier.
 * @returns {Promise<{historico: Object, orador: Object, payload: Object}>} Updated state.
 */
async function pausar({ app, camaraId, historicoId }) {
  const historico = await getHistoricoById(historicoId);
  if (normalizeCamaraId(historico.camara_id) !== normalizeCamaraId(camaraId)) {
    const err = new Error("Fala não pertence à câmara");
    err.statusCode = 403;
    throw err;
  }

  const orador = await getOradorByIdForCamara(historico.orador_id, camaraId);

  if (historico.status !== STATUS.INICIADA) {
    const err = new Error("Só é possível pausar quando estiver iniciada");
    err.statusCode = 409;
    throw err;
  }

  const remaining = await computeCurrentRemainingSeconds(historico);

  const patch = {
    status: STATUS.PAUSADA,
    tempo_restante_segundos: remaining,
    total_pausas: (historico.total_pausas || 0) + 1,
    updated_at: nowIso(),
  };

  const { data, error } = await supabaseAdmin
    .from("historico_falas")
    .update(patch)
    .eq("id", historico.id)
    .select("*")
    .single();

  if (error) {
    logger.error("Erro ao pausar fala:", error);
    throw error;
  }

  await insertEvento(historico.id, EVENTO.PAUSADA, {
    tempoRestanteSegundos: remaining,
  });

  const payload = toPublicPayload(data, orador);
  emitFalaUpdate(app, payload);

  return { historico: data, orador, payload };
}

/**
 * Resumes a paused speaker countdown and accumulates paused duration.
 *
 * @param {Object} params - Operation parameters.
 * @param {import("express").Application} params.app - Express application instance.
 * @param {string|number} params.camaraId - Chamber identifier.
 * @param {string|number} params.historicoId - Speaker history identifier.
 * @returns {Promise<{historico: Object, orador: Object, payload: Object}>} Updated state.
 */
async function retomar({ app, camaraId, historicoId }) {
  const historico = await getHistoricoById(historicoId);
  if (normalizeCamaraId(historico.camara_id) !== normalizeCamaraId(camaraId)) {
    const err = new Error("Fala não pertence à câmara");
    err.statusCode = 403;
    throw err;
  }

  const orador = await getOradorByIdForCamara(historico.orador_id, camaraId);

  if (historico.status !== STATUS.PAUSADA) {
    const err = new Error("Só é possível retomar quando estiver pausada");
    err.statusCode = 409;
    throw err;
  }

  const remaining = await computeCurrentRemainingSeconds(historico);
  const lastPause = await getLastEventoByTypes(historico.id, [EVENTO.PAUSADA]);

  let totalPausado = Math.trunc(Number(historico.tempo_total_pausado_segundos || 0));
  if (lastPause && lastPause.timestamp) {
    const pauseMs = Date.parse(lastPause.timestamp);
    if (Number.isFinite(pauseMs)) {
      totalPausado += Math.max(0, Math.floor((Date.now() - pauseMs) / 1000));
    }
  }

  const patch = {
    status: STATUS.INICIADA,
    tempo_restante_segundos: remaining,
    tempo_total_pausado_segundos: totalPausado,
    updated_at: nowIso(),
  };

  const { data, error } = await supabaseAdmin
    .from("historico_falas")
    .update(patch)
    .eq("id", historico.id)
    .select("*")
    .single();

  if (error) {
    logger.error("Erro ao retomar fala:", error);
    throw error;
  }

  await insertEvento(historico.id, EVENTO.RETOMADA, {
    tempoRestanteSegundos: remaining,
  });

  const payload = toPublicPayload(data, orador);
  emitFalaUpdate(app, payload);

  await ensureTempoEsgotadoIfNeeded(app, data, orador);

  return { historico: data, orador, payload };
}

/**
 * Adds speaking time to a non-ended speaker turn.
 *
 * Adding time to a tempo_esgotado turn moves it back to iniciada.
 *
 * @param {Object} params - Operation parameters.
 * @param {import("express").Application} params.app - Express application instance.
 * @param {string|number} params.camaraId - Chamber identifier.
 * @param {string|number} params.historicoId - Speaker history identifier.
 * @param {number|string} params.minutos - Minutes to add.
 * @returns {Promise<{historico: Object, orador: Object, payload: Object, addMin: number}>} Updated state.
 */
async function adicionarTempo({ app, camaraId, historicoId, minutos }) {
  const historico = await getHistoricoById(historicoId);
  if (normalizeCamaraId(historico.camara_id) !== normalizeCamaraId(camaraId)) {
    const err = new Error("Fala não pertence à câmara");
    err.statusCode = 403;
    throw err;
  }

  const orador = await getOradorByIdForCamara(historico.orador_id, camaraId);

  if (historico.status === STATUS.ENCERRADA) {
    const err = new Error("Não é possível adicionar tempo: fala encerrada");
    err.statusCode = 409;
    throw err;
  }

  const addMin = clampInt(minutos, 1, MAX_ADICIONAR_MINUTOS);
  if (addMin == null) {
    const err = new Error("Minutos inválidos");
    err.statusCode = 400;
    throw err;
  }

  const currentRemaining = await computeCurrentRemainingSeconds(historico);
  const newRemaining = currentRemaining + addMin * 60;

  let newStatus = historico.status;
  if (historico.status === STATUS.TEMPO_ESGOTADO) {
    newStatus = STATUS.INICIADA;
  }

  const patch = {
    status: newStatus,
    tempo_restante_segundos: newRemaining,
    tempo_adicionado_total_minutos:
      Math.trunc(Number(historico.tempo_adicionado_total_minutos || 0)) + addMin,
    updated_at: nowIso(),
  };

  const { data, error } = await supabaseAdmin
    .from("historico_falas")
    .update(patch)
    .eq("id", historico.id)
    .select("*")
    .single();

  if (error) {
    logger.error("Erro ao adicionar tempo:", error);
    throw error;
  }

  await insertEvento(historico.id, EVENTO.TEMPO_ADICIONADO, {
    tempoRestanteSegundos: newRemaining,
    tempoAdicionadoMinutos: addMin,
  });

  const payload = toPublicPayload(data, orador);
  emitFalaUpdate(app, payload);

  await ensureTempoEsgotadoIfNeeded(app, data, orador);

  return { historico: data, orador, payload, addMin };
}

/**
 * Restarts a speaker countdown from the originally allocated time.
 *
 * @param {Object} params - Operation parameters.
 * @param {import("express").Application} params.app - Express application instance.
 * @param {string|number} params.camaraId - Chamber identifier.
 * @param {string|number} params.historicoId - Speaker history identifier.
 * @returns {Promise<{historico: Object, orador: Object, payload: Object}>} Updated state.
 */
async function recomecar({ app, camaraId, historicoId }) {
  const historico = await getHistoricoById(historicoId);
  if (normalizeCamaraId(historico.camara_id) !== normalizeCamaraId(camaraId)) {
    const err = new Error("Fala não pertence à câmara");
    err.statusCode = 403;
    throw err;
  }

  const orador = await getOradorByIdForCamara(historico.orador_id, camaraId);

  if (historico.status === STATUS.PREPARADA) {
    const err = new Error("Não é possível recomeçar: contagem ainda não iniciada");
    err.statusCode = 409;
    throw err;
  }

  if (historico.status === STATUS.ENCERRADA) {
    const err = new Error("Não é possível recomeçar: fala encerrada");
    err.statusCode = 409;
    throw err;
  }

  const baseSeconds = Math.max(0, Math.trunc(Number(historico.tempo_alocado_minutos || 0)) * 60);

  const patch = {
    status: STATUS.INICIADA,
    tempo_restante_segundos: baseSeconds,
    recomecos: Math.trunc(Number(historico.recomecos || 0)) + 1,
    iniciada_em: historico.iniciada_em || nowIso(),
    updated_at: nowIso(),
  };

  const { data, error } = await supabaseAdmin
    .from("historico_falas")
    .update(patch)
    .eq("id", historico.id)
    .select("*")
    .single();

  if (error) {
    logger.error("Erro ao recomeçar fala:", error);
    throw error;
  }

  await insertEvento(historico.id, EVENTO.RECOMECADA, {
    tempoRestanteSegundos: baseSeconds,
  });

  const payload = toPublicPayload(data, orador);
  emitFalaUpdate(app, payload);

  return { historico: data, orador, payload };
}

/**
 * Ends a speaker turn and records elapsed speaking time.
 *
 * The operation is idempotent for already ended turns.
 *
 * @param {Object} params - Operation parameters.
 * @param {import("express").Application} params.app - Express application instance.
 * @param {string|number} params.camaraId - Chamber identifier.
 * @param {string|number} params.historicoId - Speaker history identifier.
 * @returns {Promise<{historico: Object, orador: Object, payload: Object}>} Final state.
 */
async function encerrar({ app, camaraId, historicoId }) {
  const historico = await getHistoricoById(historicoId);
  if (normalizeCamaraId(historico.camara_id) !== normalizeCamaraId(camaraId)) {
    const err = new Error("Fala não pertence à câmara");
    err.statusCode = 403;
    throw err;
  }

  const orador = await getOradorByIdForCamara(historico.orador_id, camaraId);

  if (historico.status === STATUS.ENCERRADA) {
    return { historico, orador, payload: toPublicPayload(historico, orador) };
  }

  const remaining = await computeCurrentRemainingSeconds(historico);
  const encerradaEm = nowIso();

  const totalSecondsBudget =
    Math.max(0, Math.trunc(Number(historico.tempo_alocado_minutos || 0)) * 60) +
    Math.max(0, Math.trunc(Number(historico.tempo_adicionado_total_minutos || 0)) * 60);

  const usedSeconds = Math.max(0, totalSecondsBudget - remaining);

  const patch = {
    status: STATUS.ENCERRADA,
    tempo_restante_segundos: remaining,
    encerrada_em: encerradaEm,
    tempo_decorrido_segundos: usedSeconds,
    tempo_utilizado_minutos: usedSeconds / 60,
    updated_at: encerradaEm,
  };

  const { data, error } = await supabaseAdmin
    .from("historico_falas")
    .update(patch)
    .eq("id", historico.id)
    .select("*")
    .single();

  if (error) {
    logger.error("Erro ao encerrar fala:", error);
    throw error;
  }

  await insertEvento(historico.id, EVENTO.ENCERRADA, {
    tempoRestanteSegundos: remaining,
  });

  const payload = toPublicPayload(data, orador);
  emitFalaUpdate(app, payload);

  return { historico: data, orador, payload };
}

module.exports = {
  STATUS,
  EVENTO,
  MAX_ADICIONAR_MINUTOS,

  getActiveHistoricoByCamara,
  getHistoricoById,
  getOradorByIdForCamara,
  computeCurrentRemainingSeconds,
  ensureTempoEsgotadoIfNeeded,

  prepararFala,
  iniciarContagem,
  pausar,
  retomar,
  adicionarTempo,
  recomecar,
  encerrar,

  toPublicPayload,
  emitFalaUpdate,
  marcarTempoEsgotado,
};
