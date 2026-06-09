const { supabaseAdmin } = require("../config/supabase");
const createLogger = require("../config/logger");
const websocketService = require("../services/websocketService");
const logger = createLogger("TABLET_VOTO_CONTROLLER");

/**
 * Registers or updates the authenticated vereador vote for a pauta.
 *
 * Validates required data, maps tablet vote labels to database enum values,
 * enforces chamber ownership, persists the vote, and notifies real-time clients.
 *
 * @param {import("express").Request} req - Request containing user, profile, pauta_id, and voto.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<import("express").Response|void>} Vote registration response.
 */
const registrarVoto = async (req, res) => {
  const { user, profile } = req;
  const { pauta_id, voto } = req.body;

  logger.info(
    `Registrando voto do vereador ${user.id} na pauta ${pauta_id}: ${voto}`
  );

  try {
    if (!pauta_id || !voto) {
      return res
        .status(400)
        .json({ error: "Pauta ID e voto são obrigatórios." });
    }

    // Map tablet-facing labels to database enum values.
    let votoEnum;
    switch (voto) {
      case "Sim":
        votoEnum = "SIM";
        break;
      case "Não":
        votoEnum = "NÃO";
        break;
      case "Abstenção":
        votoEnum = "ABSTENÇÃO";
        break;
      default:
        return res.status(400).json({
          error: "Voto inválido. Permitidos: Sim, Não, Abstenção",
        });
    }

    const { data: pauta, error: pautaError } = await supabaseAdmin
      .from("pautas")
      .select(
        `
                id,
                nome,
                status,
                sessoes!inner (
                    id,
                    camara_id
                )
            `
      )
      .eq("id", pauta_id)
      .single();

    if (pautaError || !pauta) {
      logger.warn("Pauta não encontrada:", {
        pautaId: pauta_id,
        error: pautaError?.message,
      });
      return res.status(404).json({ error: "Pauta não encontrada." });
    }

    if (pauta.status !== "Em Votação") {
      logger.warn("Pauta não está em votação:", {
        pautaId: pauta_id,
        status: pauta.status,
      });
      return res.status(400).json({ error: "Esta pauta não está em votação." });
    }

    if (pauta.sessoes.camara_id !== profile.camara_id) {
      logger.warn("Tentativa de voto em pauta de outra câmara:", {
        pautaId: pauta_id,
        pautaCamara: pauta.sessoes.camara_id,
        vereadorCamara: profile.camara_id,
      });
      return res
        .status(403)
        .json({ error: "Você só pode votar em pautas da sua câmara." });
    }

    const { data: vereadorData, error: vereadorError } = await supabaseAdmin
      .from("vereadores")
      .select("id, is_presidente, is_vice_presidente, partido_id")
      .eq("profile_id", user.id)
      .single();

    if (vereadorError || !vereadorData) {
      logger.error("Dados do vereador não encontrados:", { userId: user.id });
      return res
        .status(404)
        .json({ error: "Dados do vereador não encontrados." });
    }

    const { data: votoExistente, error: votoExistenteError } =
      await supabaseAdmin
        .from("votos")
        .select("id, voto")
        .eq("pauta_id", pauta_id)
        .eq("vereador_id", vereadorData.id)
        .single();

    if (votoExistente) {
      logger.info("Atualizando voto existente:", { votoId: votoExistente.id });

      const { data: votoAtualizado, error: updateError } = await supabaseAdmin
        .from("votos")
        .update({
          voto: votoEnum,
          era_presidente_no_voto: vereadorData.is_presidente,
          era_vice_presidente_no_voto: vereadorData.is_vice_presidente,
          partido_id_no_voto: vereadorData.partido_id,
        })
        .eq("id", votoExistente.id)
        .select()
        .single();

      if (updateError) {
        logger.error("Erro ao atualizar voto:", { error: updateError.message });
        return res.status(500).json({ error: "Erro ao atualizar voto." });
      }

      logger.info("✅ Voto atualizado com sucesso:", {
        votoId: votoAtualizado.id,
      });

      await websocketService.notifyVoto(pauta_id, {
        vereador: {
          id: vereadorData.id,
          nome_parlamentar: profile.nome_parlamentar || profile.nome,
          is_presidente: vereadorData.is_presidente,
        },
        voto: votoEnum,
        isUpdate: true,
      });

      try {
        const http = require("http");
        const notificationPayload = JSON.stringify({
          pautaId: pauta_id,
          voto: votoEnum,
          isUpdate: true,
          vereadorNome: profile.nome_parlamentar || profile.nome,
          camaraId: profile.camara_id,
          timestamp: new Date().toISOString(),
        });

        const options = {
          hostname: "localhost",
          port: 3000,
          path: "/api/votacao-ao-vivo/notify-voto",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(notificationPayload),
          },
        };

        const req = http.request(options, (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            logger.warn(
              `⚠️ Falha ao notificar Admin Panel sobre voto (Update): ${res.statusCode}`
            );
          }
        });
        req.on("error", (e) =>
          logger.warn(
            `⚠️ Erro ao notificar Admin Panel sobre voto (Update): ${e.message}`
          )
        );
        req.write(notificationPayload);
        req.end();
      } catch (notifyError) {
        logger.warn("Erro ao tentar notificar Admin Panel:", notifyError);
      }

      return res.status(200).json({
        message: "Voto atualizado com sucesso.",
        voto: votoAtualizado,
      });
    } else {
      logger.info("Criando novo voto");

      const { data: novoVoto, error: createError } = await supabaseAdmin
        .from("votos")
        .insert({
          pauta_id,
          vereador_id: vereadorData.id,
          voto: votoEnum,
          era_presidente_no_voto: vereadorData.is_presidente,
          era_vice_presidente_no_voto: vereadorData.is_vice_presidente,
          partido_id_no_voto: vereadorData.partido_id,
        })
        .select()
        .single();

      if (createError) {
        logger.error("Erro ao criar voto:", { error: createError.message });
        return res.status(500).json({ error: "Erro ao registrar voto." });
      }

      logger.info("✅ Voto registrado com sucesso:", { votoId: novoVoto.id });
      await websocketService.notifyVoto(pauta_id, {
        vereador: {
          id: vereadorData.id,
          nome_parlamentar: profile.nome_parlamentar || profile.nome,
          is_presidente: vereadorData.is_presidente,
        },
        voto: votoEnum,
        isUpdate: false,
      });

      try {
        const http = require("http");
        const notificationPayload = JSON.stringify({
          pautaId: pauta_id,
          voto: votoEnum,
          isUpdate: false,
          vereadorNome: profile.nome_parlamentar || profile.nome,
          camaraId: profile.camara_id,
          timestamp: new Date().toISOString(),
        });

        const options = {
          hostname: "localhost",
          port: 3000,
          path: "/api/votacao-ao-vivo/notify-voto",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(notificationPayload),
          },
        };

        const req = http.request(options, (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            logger.warn(
              `⚠️ Falha ao notificar Admin Panel sobre voto (New): ${res.statusCode}`
            );
          }
        });
        req.on("error", (e) =>
          logger.warn(
            `⚠️ Erro ao notificar Admin Panel sobre voto (New): ${e.message}`
          )
        );
        req.write(notificationPayload);
        req.end();
      } catch (notifyError) {
        logger.warn("Erro ao tentar notificar Admin Panel:", notifyError);
      }

      return res.status(201).json({
        message: "Voto registrado com sucesso.",
        voto: novoVoto,
      });
    }
  } catch (error) {
    logger.error("Erro crítico ao registrar voto:", {
      error: error.message,
      stack: error.stack,
      userId: user.id,
      pautaId: pauta_id,
    });
    res.status(500).json({ error: "Erro interno ao registrar voto." });
  }
};

/**
 * Returns all votes cast by the authenticated vereador.
 *
 * The response includes an ordered vote list and a pauta_id index for fast tablet lookups.
 *
 * @param {import("express").Request} req - Request containing authenticated user.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<import("express").Response|void>} Vereador votes response.
 */
const getVotosDoVereador = async (req, res) => {
  const { user, profile } = req;

  logger.info(`Buscando votos do vereador ${user.id}`);

  try {
    const { data: vereadorData, error: vereadorError } = await supabaseAdmin
      .from("vereadores")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (vereadorError || !vereadorData) {
      return res
        .status(404)
        .json({ error: "Dados do vereador não encontrados." });
    }

    const { data: votos, error: votosError } = await supabaseAdmin
      .from("votos")
      .select(
        `
                id,
                pauta_id,
                voto,
                created_at,
                era_presidente_no_voto,
                era_vice_presidente_no_voto,
                pautas (
                    id,
                    nome,
                    status,
                    resultado_votacao
                )
            `
      )
      .eq("vereador_id", vereadorData.id)
      .order("created_at", { ascending: false });

    if (votosError) {
      logger.error("Erro ao buscar votos do vereador:", {
        error: votosError.message,
      });
      return res.status(500).json({ error: "Erro ao buscar votos." });
    }

    const votosPorPauta = {};
    votos.forEach((voto) => {
      votosPorPauta[voto.pauta_id] = voto;
    });

    logger.info(`✅ Encontrados ${votos.length} votos do vereador`);

    res.status(200).json({
      votos,
      votosPorPauta,
    });
  } catch (error) {
    logger.error("Erro crítico ao buscar votos do vereador:", {
      error: error.message,
      stack: error.stack,
      userId: user.id,
    });
    res.status(500).json({ error: "Erro interno ao buscar votos." });
  }
};

/**
 * Returns the authenticated vereador vote for one pauta.
 *
 * A missing vote is a valid response and returns voto: null.
 *
 * @param {import("express").Request} req - Request containing authenticated user and pauta_id.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<import("express").Response|void>} Pauta vote response.
 */
const getVotoEmPauta = async (req, res) => {
  const { user } = req;
  const { pauta_id } = req.params;

  logger.info(`Buscando voto do vereador ${user.id} na pauta ${pauta_id}`);

  try {
    const { data: vereadorData, error: vereadorError } = await supabaseAdmin
      .from("vereadores")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (vereadorError || !vereadorData) {
      return res
        .status(404)
        .json({ error: "Dados do vereador não encontrados." });
    }

    const { data: voto, error: votoError } = await supabaseAdmin
      .from("votos")
      .select(
        `
                id,
                pauta_id,
                voto,
                created_at,
                era_presidente_no_voto,
                era_vice_presidente_no_voto
            `
      )
      .eq("pauta_id", pauta_id)
      .eq("vereador_id", vereadorData.id)
      .single();

    if (votoError && votoError.code !== "PGRST116") {
      logger.error("Erro ao buscar voto:", { error: votoError.message });
      return res.status(500).json({ error: "Erro ao buscar voto." });
    }

    if (!voto) {
      return res
        .status(200)
        .json({ voto: null, message: "Vereador ainda não votou nesta pauta." });
    }

    logger.info("✅ Voto encontrado:", { votoId: voto.id, voto: voto.voto });
    res.status(200).json({ voto });
  } catch (error) {
    logger.error("Erro crítico ao buscar voto em pauta:", {
      error: error.message,
      stack: error.stack,
      userId: user.id,
      pautaId: pauta_id,
    });
    res.status(500).json({ error: "Erro interno ao buscar voto." });
  }
};

/**
 * Returns current vote totals for a pauta in the authenticated vereador chamber.
 *
 * @param {import("express").Request} req - Request containing authenticated user and pauta_id.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<import("express").Response|void>} Pauta vote statistics response.
 */
const getEstatisticasPauta = async (req, res) => {
  const { user } = req;
  const { pauta_id } = req.params;

  logger.info(
    `Buscando estatísticas da pauta ${pauta_id} para vereador ${user.id}`
  );

  try {
    const { data: vereadorData, error: vereadorError } = await supabaseAdmin
      .from("vereadores")
      .select("id, camara_id")
      .eq("profile_id", user.id)
      .single();

    if (vereadorError || !vereadorData) {
      return res
        .status(404)
        .json({ error: "Dados do vereador não encontrados." });
    }

    const { data: pauta, error: pautaError } = await supabaseAdmin
      .from("pautas")
      .select(
        `
                id,
                nome,
                status,
                sessoes!inner (camara_id)
            `
      )
      .eq("id", pauta_id)
      .single();

    if (pautaError || !pauta) {
      return res.status(404).json({ error: "Pauta não encontrada." });
    }

    if (pauta.sessoes.camara_id !== vereadorData.camara_id) {
      return res
        .status(403)
        .json({ error: "Acesso negado - pauta de outra câmara." });
    }

    const { data: votos, error: votosError } = await supabaseAdmin
      .from("votos")
      .select("voto")
      .eq("pauta_id", pauta_id);

    if (votosError) {
      logger.error("Erro ao buscar votos:", { error: votosError.message });
      return res.status(500).json({ error: "Erro ao buscar votos." });
    }

    const estatisticas = {
      total: votos.length,
      sim: votos.filter((v) => v.voto === "SIM").length,
      nao: votos.filter((v) => v.voto === "NÃO").length,
      abstencao: votos.filter((v) => v.voto === "ABSTENÇÃO").length,
    };

    logger.info("✅ Estatísticas calculadas:", estatisticas);
    res.status(200).json({
      pauta: {
        id: pauta.id,
        nome: pauta.nome,
        status: pauta.status,
      },
      estatisticas,
    });
  } catch (error) {
    logger.error("Erro crítico ao buscar estatísticas:", {
      error: error.message,
      stack: error.stack,
      userId: user.id,
      pautaId: pauta_id,
    });
    res.status(500).json({ error: "Erro interno ao buscar estatísticas." });
  }
};

module.exports = {
  registrarVoto,
  getVotosDoVereador,
  getVotoEmPauta,
  getEstatisticasPauta,
};
