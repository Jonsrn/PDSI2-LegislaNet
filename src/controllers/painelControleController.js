const supabaseAdmin = require("../config/supabaseAdminClient");
const createLogger = require("../utils/logger");
const logger = createLogger("PAINEL_CONTROLE");
const { upsertAndEmitVotacaoAoVivo } = require("./votacaoAoVivoController");
const {
  prepararFala,
  iniciarContagem,
  pausar,
  retomar,
  adicionarTempo,
  recomecar,
  encerrar,
  getActiveHistoricoByCamara,
  ensureTempoEsgotadoIfNeeded,
  getOradorByIdForCamara,
  toPublicPayload,
} = require("../services/falaHistoricoService");

/**
 * Removes a speaker from the agenda after verifying that the speaker belongs
 * to the authenticated admin chamber.
 *
 * @param {Object} params - Removal parameters.
 * @param {string|number} params.oradorId - Speaker row identifier.
 * @param {string|number} params.camaraId - Chamber identifier.
 * @returns {Promise<void>}
 */
async function removerOradorDaOrdemDoDia({ oradorId, camaraId }) {
  if (!oradorId || !camaraId) return;

  try {
    // Avoid relying on joined delete filters because PostgREST relationships vary.
    const { data: oradorRow, error: oradorErr } = await supabaseAdmin
      .from("oradores")
      .select("id, sessao_id")
      .eq("id", oradorId)
      .maybeSingle();

    if (oradorErr) {
      logger.warn("⚠️ Falha ao buscar orador para remoção:", oradorErr);
      return;
    }

    if (!oradorRow) return;

    const { data: sessaoRow, error: sessaoErr } = await supabaseAdmin
      .from("sessoes")
      .select("id, camara_id")
      .eq("id", oradorRow.sessao_id)
      .maybeSingle();

    if (sessaoErr) {
      logger.warn(
        "⚠️ Falha ao buscar sessão do orador para remoção:",
        sessaoErr
      );
      return;
    }

    if (!sessaoRow) return;
    if (String(sessaoRow.camara_id) !== String(camaraId)) return;

    const { error: delErr } = await supabaseAdmin
      .from("oradores")
      .delete()
      .eq("id", oradorId);

    if (delErr) {
      logger.warn("⚠️ Falha ao remover orador da ordem do dia:", delErr);
    } else {
      logger.log(`🗑️ Orador ${oradorId} removido da ordem do dia`);
    }
  } catch (e) {
    logger.warn("⚠️ Erro inesperado ao remover orador da ordem do dia:", e);
  }
}

/**
 * Sends a JSON POST request with timeout handling and linear retry backoff.
 *
 * @param {Object} options - Request options.
 * @param {string} options.hostname - Target host.
 * @param {number} options.port - Target port.
 * @param {string} options.path - Target path.
 * @param {Object|string} options.jsonBody - JSON payload or pre-serialized body.
 * @param {number} [options.timeoutMs=2500] - Request timeout in milliseconds.
 * @param {number} [options.maxAttempts=2] - Maximum number of attempts.
 * @returns {Promise<{ok: boolean, statusCode?: number, error?: string}>} Request result.
 */
function postJsonWithRetry({
  hostname,
  port,
  path,
  jsonBody,
  timeoutMs = 2500,
  maxAttempts = 2,
}) {
  const http = require("http");
  const payload =
    typeof jsonBody === "string" ? jsonBody : JSON.stringify(jsonBody);

  const options = {
    hostname,
    port,
    path,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  const attemptOnce = (attemptIndex) =>
    new Promise((resolve) => {
      const req = http.request(options, (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          resolve({ ok, statusCode: res.statusCode });
        });
      });

      req.setTimeout(timeoutMs, () => {
        try {
          req.destroy(new Error("timeout"));
        } catch (_) {}
      });

      req.on("error", (error) => {
        resolve({ ok: false, error: error?.message || String(error) });
      });

      req.write(payload);
      req.end();
    }).then(async (result) => {
      if (result.ok) return result;

      if (attemptIndex + 1 < maxAttempts) {
        const delay = 250 * (attemptIndex + 1);
        await new Promise((r) => setTimeout(r, delay));
        return attemptOnce(attemptIndex + 1);
      }

      return result;
    });

  return attemptOnce(0);
}

/**
 * Determines whether a session should appear in the control panel.
 *
 * All sessions are currently considered valid so the panel can show pautas and
 * speakers regardless of session date.
 *
 * @param {string|Date} dataSessao - Session date.
 * @returns {boolean} Always true for the current control-panel rules.
 */
function isSessaoValida(dataSessao) {
  return true;
}

/**
 * GET /api/painel-controle/pautas-em-votacao
 *
 * Returns voting pautas for the authenticated admin chamber.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getPautasEmVotacao = async (req, res) => {
  try {
    const { profile } = req;

    logger.log(`Buscando pautas em votação da câmara ${profile.camara_id}`);

    const { data: pautas, error } = await supabaseAdmin
      .from("pautas")
      .select(
        `
                id,
                nome,
                descricao,
                autor,
                status,
                votacao_simbolica,
                created_at,
                sessoes!inner (
                    id,
                    nome,
                    tipo,
                    data_sessao,
                    status,
                    camara_id
                )
            `
      )
      .eq("status", "Em Votação")
      .eq("sessoes.camara_id", profile.camara_id)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Erro ao buscar pautas em votação:", error);
      return res.status(500).json({ error: "Erro ao buscar pautas" });
    }

    const pautasValidas = pautas.filter((pauta) => {
      const valida = isSessaoValida(pauta.sessoes.data_sessao);
      logger.log(
        `Pauta "${pauta.nome}" - Sessão: ${pauta.sessoes.data_sessao} - Válida: ${valida}`
      );
      return valida;
    });

    logger.log(
      `✅ Encontradas ${pautasValidas.length} pautas em votação válidas (de ${pautas.length} total)`
    );

    res.json({
      data: pautasValidas,
      total: pautasValidas.length,
    });
  } catch (error) {
    logger.error("Erro inesperado ao buscar pautas em votação:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * GET /api/painel-controle/oradores
 *
 * Returns active speakers for the authenticated admin chamber.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getOradoresAtivos = async (req, res) => {
  try {
    const { profile } = req;

    logger.log(`Buscando oradores ativos da câmara ${profile.camara_id}`);

    const { data: oradores, error } = await supabaseAdmin
      .from("oradores")
      .select(
        `
                id,
                ordem,
                tempo_fala_minutos,
                created_at,
                vereadores (
                    id,
                    nome_parlamentar,
                    foto_url,
                    partidos (
                        id,
                        nome,
                        sigla,
                        logo_url
                    )
                ),
                sessoes!inner (
                    id,
                    nome,
                    tipo,
                    data_sessao,
                    status,
                    camara_id
                )
            `
      )
      .eq("sessoes.camara_id", profile.camara_id)
      .order("ordem", { ascending: true });

    if (error) {
      logger.error("Erro ao buscar oradores:", error);
      return res.status(500).json({ error: "Erro ao buscar oradores" });
    }

    logger.log(`📋 Total de oradores encontrados no banco: ${oradores.length}`);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    logger.log(`📅 Data de hoje (00:00): ${hoje.toISOString()}`);

    const oradoresValidos = oradores.filter((orador) => {
      const sessaoDate = new Date(orador.sessoes.data_sessao);
      sessaoDate.setHours(0, 0, 0, 0);
      const valida = isSessaoValida(orador.sessoes.data_sessao);

      logger.log(
        `👤 Orador: ${orador.vereadores?.nome_parlamentar || "N/A"} | Sessão: ${
          orador.sessoes.nome
        } | Data: ${
          orador.sessoes.data_sessao
        } (${sessaoDate.toISOString()}) | Válida: ${
          valida ? "✅ SIM" : "❌ NÃO"
        }`
      );

      return valida;
    });

    // Sort by most recent session date, then by agenda order.
    oradoresValidos.sort((a, b) => {
      const dataA = new Date(a.sessoes.data_sessao);
      const dataB = new Date(b.sessoes.data_sessao);

      if (dataB.getTime() !== dataA.getTime()) {
        return dataB.getTime() - dataA.getTime();
      }

      return a.ordem - b.ordem;
    });

    logger.log(
      `✅ Encontrados ${oradoresValidos.length} oradores válidos (de ${oradores.length} total)`
    );

    res.json({
      data: oradoresValidos,
      total: oradoresValidos.length,
    });
  } catch (error) {
    logger.error("Erro inesperado ao buscar oradores:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * POST /api/painel-controle/iniciar-votacao/:pautaId
 *
 * Starts voting for a pauta, updates live-voting state, and notifies tablet and
 * public display channels.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const iniciarVotacao = async (req, res) => {
  try {
    const { profile } = req;
    const { pautaId } = req.params;

    logger.log(
      `Iniciando votação da pauta ${pautaId} pela câmara ${profile.camara_id}`
    );

    const { data: pauta, error: pautaError } = await supabaseAdmin
      .from("pautas")
      .select(
        `
                id,
                nome,
                descricao,
                status,
                sessoes!inner (
                    id,
                    camara_id,
                    nome,
                    tipo,
                    data_sessao
                )
            `
      )
      .eq("id", pautaId)
      .eq("sessoes.camara_id", profile.camara_id)
      .single();

    if (pautaError || !pauta) {
      logger.error("Pauta não encontrada ou não pertence à câmara");
      return res.status(404).json({ error: "Pauta não encontrada" });
    }

    // Clear stale live flags so only one pauta remains live per chamber.
    try {
      // Reverse-join updates are brittle here, so first find active pauta IDs.
      const { data: pautasAtivas } = await supabaseAdmin
        .from("pautas")
        .select("id, sessoes!inner(camara_id)")
        .eq("ao_vivo", true)
        .eq("sessoes.camara_id", profile.camara_id);

      if (pautasAtivas && pautasAtivas.length > 0) {
        const idsParaDesativar = pautasAtivas
          .filter((p) => p.id !== pautaId)
          .map((p) => p.id);

        if (idsParaDesativar.length > 0) {
          logger.log(
            `🧹 Limpando flag ao_vivo de ${
              idsParaDesativar.length
            } pautas antigas: ${idsParaDesativar.join(", ")}`
          );
          await supabaseAdmin
            .from("pautas")
            .update({ ao_vivo: false })
            .in("id", idsParaDesativar);
        }
      }
    } catch (cleanError) {
      logger.error(
        "⚠️ Erro não-bloqueante ao limpar pautas antigas:",
        cleanError
      );
    }

    // Mark the current pauta as live, with a compatibility fallback for older schemas.
    {
      const desiredUpdate =
        pauta.status !== "Em Votação"
          ? { status: "Em Votação", ao_vivo: true }
          : { ao_vivo: true };

      let { error: updateError } = await supabaseAdmin
        .from("pautas")
        .update(desiredUpdate)
        .eq("id", pautaId);

      if (updateError) {
        const msg = (updateError?.message || "").toLowerCase();
        const missingAoVivoColumn =
          msg.includes("ao_vivo") &&
          (msg.includes("does not exist") ||
            msg.includes("column") ||
            msg.includes("schema"));

        if (missingAoVivoColumn) {
          if (pauta.status !== "Em Votação") {
            logger.log(
              "⚠️ Coluna ao_vivo ausente; iniciando votação sem ao_vivo (fallback compatível)"
            );
            ({ error: updateError } = await supabaseAdmin
              .from("pautas")
              .update({ status: "Em Votação" })
              .eq("id", pautaId));
          } else {
            updateError = null;
          }
        }
      }

      if (updateError) {
        logger.error("Erro ao atualizar status da pauta:", updateError);
        return res.status(500).json({ error: "Erro ao iniciar votação" });
      }
    }

    // Update public portal and TV state directly instead of relying only on tablets.
    try {
      upsertAndEmitVotacaoAoVivo(req.app, {
        camaraId: pauta.sessoes.camara_id,
        pautaId: pauta.id,
        pautaNome: pauta.nome,
        pautaDescricao: pauta.descricao,
        sessaoNome: pauta.sessoes.nome,
        sessaoTipo: pauta.sessoes.tipo,
        sessaoDataHora: pauta.sessoes.data_sessao,
        vereadoresOnline: 0,
        status: "iniciada",
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      logger.log(
        "⚠️ Falha ao emitir fallback de votação ao vivo:",
        e?.message || e
      );
    }

    const notificationPayload = {
      camaraId: pauta.sessoes.camara_id,
      pautaId: pauta.id,
      pautaNome: pauta.nome,
      pautaDescricao: pauta.descricao,
      sessaoNome: pauta.sessoes.nome,
      sessaoTipo: pauta.sessoes.tipo,
      sessaoDataHora: pauta.sessoes.data_sessao,
      action: "iniciar-votacao",
    };

    postJsonWithRetry({
      hostname: "localhost",
      port: 3003,
      path: "/api/notify/iniciar-votacao",
      jsonBody: notificationPayload,
      timeoutMs: 2500,
      maxAttempts: 2,
    }).then((result) => {
      if (result.ok) {
        logger.log(
          "✅ Notificação de início de votação enviada ao tablet backend"
        );
      } else if (result.statusCode) {
        logger.log("⚠️ Falha ao notificar tablet backend:", result.statusCode);
      } else {
        logger.log("⚠️ Erro ao notificar tablet backend:", result.error);
      }
    });

    logger.log(`✅ Votação iniciada para pauta ${pautaId}`);

    res.json({
      message: "Votação iniciada com sucesso",
      data: {
        id: pauta.id,
        nome: pauta.nome,
        descricao: pauta.descricao,
        sessoes: {
          nome: pauta.sessoes.nome,
          tipo: pauta.sessoes.tipo,
          camara_id: pauta.sessoes.camara_id,
          data_sessao: pauta.sessoes.data_sessao,
        },
      },
    });
  } catch (error) {
    logger.error("Erro inesperado ao iniciar votação:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * POST /api/painel-controle/iniciar-fala/:oradorId
 *
 * Prepares a speaker turn and emits the pre-countdown TV state.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const iniciarFala = async (req, res) => {
  try {
    const { profile } = req;
    const { oradorId } = req.params;

    logger.log(
      `Iniciando fala do orador ${oradorId} pela câmara ${profile.camara_id}`
    );

    const result = await prepararFala({
      app: req.app,
      camaraId: profile.camara_id,
      oradorId,
    });

    const historico = result.historico;
    const payload =
      result.payload ||
      (historico ? toPublicPayload(historico, result.orador || null) : null);

    if (!result.created) {
      return res.status(409).json({
        message:
          "Já existe uma fala ativa nesta câmara. Encerre a fala atual antes de iniciar outra.",
        fala: payload,
      });
    }

    logger.log(`✅ Fala preparada (DB) para orador ${oradorId}`);

    res.json({
      message: "Fala preparada com sucesso",
      fala: payload,
    });
  } catch (error) {
    logger.error("Erro inesperado ao iniciar fala:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * POST /api/painel-controle/iniciar-fala-start/:oradorId
 *
 * Starts the countdown for the currently prepared speaker turn.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const iniciarFalaStart = async (req, res) => {
  try {
    const { profile } = req;
    const { oradorId } = req.params;

    logger.log(
      `Iniciando contagem da fala do orador ${oradorId} pela câmara ${profile.camara_id}`
    );

    const active = await getActiveHistoricoByCamara(profile.camara_id);
    if (!active || String(active.orador_id) !== String(oradorId)) {
      return res.status(404).json({
        error:
          "Fala ativa não encontrada para este orador. Clique em Iniciar Fala primeiro.",
      });
    }

    const result = await iniciarContagem({
      app: req.app,
      camaraId: profile.camara_id,
      historicoId: active.id,
    });

    res.json({
      message: "Contagem da fala iniciada com sucesso",
      fala: result.payload,
    });
  } catch (error) {
    logger.error("Erro inesperado ao iniciar contagem da fala:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * POST /api/painel-controle/encerrar-fala/:oradorId
 *
 * Ends the active speaker turn and removes the speaker from the agenda.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const encerrarFala = async (req, res) => {
  try {
    const { profile } = req;
    const { oradorId } = req.params;

    logger.log(
      `Encerrando fala do orador ${oradorId} pela câmara ${profile.camara_id}`
    );

    const active = await getActiveHistoricoByCamara(profile.camara_id);
    if (!active) {
      return res
        .status(404)
        .json({ error: "Nenhuma fala ativa para encerrar" });
    }

    if (String(active.orador_id) !== String(oradorId)) {
      return res.status(409).json({
        error:
          "Existe outra fala ativa nesta câmara. Encerre a fala ativa atual.",
      });
    }

    const result = await encerrar({
      app: req.app,
      camaraId: profile.camara_id,
      historicoId: active.id,
    });

    await removerOradorDaOrdemDoDia({
      oradorId: active.orador_id,
      camaraId: profile.camara_id,
    });

    res.json({
      message: "Fala encerrada com sucesso",
      fala: result.payload,
    });
  } catch (error) {
    logger.error("Erro inesperado ao encerrar fala:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * GET /api/painel-controle/fala-ativa
 *
 * Returns the active speaker turn for the authenticated admin chamber so the
 * control panel can restore its state after reload.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getFalaAtiva = async (req, res) => {
  try {
    const { profile } = req;
    const active = await getActiveHistoricoByCamara(profile.camara_id);
    if (!active) {
      return res.json({ isLive: false, fala: null });
    }

    let orador = null;
    try {
      if (active.orador_id) {
        orador = await getOradorByIdForCamara(
          active.orador_id,
          profile.camara_id
        );
      }
    } catch (_) {
      // Keep active-state recovery available even when speaker enrichment fails.
    }

    const activeChecked = await ensureTempoEsgotadoIfNeeded(
      req.app,
      active,
      orador
    );
    return res.json({
      isLive: activeChecked.status !== "encerrada",
      fala: toPublicPayload(activeChecked, orador),
    });
  } catch (error) {
    logger.error("Erro ao buscar fala ativa:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * POST /api/painel-controle/fala/:historicoId/iniciar
 *
 * Starts countdown for a speaker history record.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const iniciarFalaByHistorico = async (req, res) => {
  try {
    const { profile } = req;
    const { historicoId } = req.params;

    const result = await iniciarContagem({
      app: req.app,
      camaraId: profile.camara_id,
      historicoId,
    });

    res.json({ message: "Contagem iniciada", fala: result.payload });
  } catch (error) {
    logger.error("Erro ao iniciar contagem (historico):", error);
    res
      .status(error.statusCode || 500)
      .json({ error: error.message || "Erro interno do servidor" });
  }
};

/**
 * POST /api/painel-controle/fala/:historicoId/pausar
 *
 * Pauses countdown for a speaker history record.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const pausarFala = async (req, res) => {
  try {
    const { profile } = req;
    const { historicoId } = req.params;

    const result = await pausar({
      app: req.app,
      camaraId: profile.camara_id,
      historicoId,
    });

    res.json({ message: "Fala pausada", fala: result.payload });
  } catch (error) {
    logger.error("Erro ao pausar fala:", error);
    res
      .status(error.statusCode || 500)
      .json({ error: error.message || "Erro interno do servidor" });
  }
};

/**
 * POST /api/painel-controle/fala/:historicoId/retomar
 *
 * Resumes countdown for a paused speaker history record.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const retomarFala = async (req, res) => {
  try {
    const { profile } = req;
    const { historicoId } = req.params;

    const result = await retomar({
      app: req.app,
      camaraId: profile.camara_id,
      historicoId,
    });

    res.json({ message: "Fala retomada", fala: result.payload });
  } catch (error) {
    logger.error("Erro ao retomar fala:", error);
    res
      .status(error.statusCode || 500)
      .json({ error: error.message || "Erro interno do servidor" });
  }
};

/**
 * POST /api/painel-controle/fala/:historicoId/adicionar-tempo
 *
 * Adds speaking time to a speaker history record.
 *
 * @param {import("express").Request} req - Express request with body { minutos }.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const adicionarTempoFala = async (req, res) => {
  try {
    const { profile } = req;
    const { historicoId } = req.params;
    const { minutos } = req.body || {};

    const result = await adicionarTempo({
      app: req.app,
      camaraId: profile.camara_id,
      historicoId,
      minutos,
    });

    res.json({
      message: `Tempo adicionado (+${result.addMin} min)`,
      fala: result.payload,
    });
  } catch (error) {
    logger.error("Erro ao adicionar tempo na fala:", error);
    res
      .status(error.statusCode || 500)
      .json({ error: error.message || "Erro interno do servidor" });
  }
};

/**
 * POST /api/painel-controle/fala/:historicoId/recomecar
 *
 * Restarts countdown for a speaker history record.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const recomecarFala = async (req, res) => {
  try {
    const { profile } = req;
    const { historicoId } = req.params;

    const result = await recomecar({
      app: req.app,
      camaraId: profile.camara_id,
      historicoId,
    });

    res.json({ message: "Fala recomeçada", fala: result.payload });
  } catch (error) {
    logger.error("Erro ao recomeçar fala:", error);
    res
      .status(error.statusCode || 500)
      .json({ error: error.message || "Erro interno do servidor" });
  }
};

/**
 * POST /api/painel-controle/fala/:historicoId/encerrar
 *
 * Ends a speaker history record and removes its speaker from the agenda.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const encerrarFalaByHistorico = async (req, res) => {
  try {
    const { profile } = req;
    const { historicoId } = req.params;

    const result = await encerrar({
      app: req.app,
      camaraId: profile.camara_id,
      historicoId,
    });

    await removerOradorDaOrdemDoDia({
      oradorId: result?.payload?.oradorId,
      camaraId: profile.camara_id,
    });

    res.json({ message: "Fala encerrada", fala: result.payload });
  } catch (error) {
    logger.error("Erro ao encerrar fala (historico):", error);
    res
      .status(error.statusCode || 500)
      .json({ error: error.message || "Erro interno do servidor" });
  }
};

module.exports = {
  getPautasEmVotacao,
  getOradoresAtivos,
  iniciarVotacao,
  iniciarFala,
  iniciarFalaStart,
  encerrarFala,
  getFalaAtiva,
  iniciarFalaByHistorico,
  pausarFala,
  retomarFala,
  adicionarTempoFala,
  recomecarFala,
  encerrarFalaByHistorico,
  isSessaoValida, // Exported for tests.
};
