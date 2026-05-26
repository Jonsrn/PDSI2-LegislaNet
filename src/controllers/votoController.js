const { createClient } = require("@supabase/supabase-js");
const createLogger = require("../utils/logger");

const logger = createLogger("VOTO_CONTROLLER");

/**
 * Controller actions for recording votes and reading vote totals.
 *
 * @module controllers/votoController
 */

/**
 * Authenticates a request using its Supabase bearer token and loads vereador
 * metadata when the profile role is vereador.
 *
 * @param {object} req - Express request object.
 * @returns {Promise<object>} Authenticated user, profile, and optional vereador data.
 * @throws {Error} When the token is missing, invalid, or the profile cannot be found.
 */
const authenticateToken = async (req) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    throw new Error("Token de acesso requerido");
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      logger.error("Erro ao verificar usuário:", userError);
      throw new Error("Token inválido ou expirado");
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*, camaras(nome_camara)")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      logger.error("Erro ao buscar perfil:", profileError);
      throw new Error("Perfil não encontrado");
    }

    let vereadorData = null;
    if (profile.role === "vereador") {
      const { data: vereador, error: vereadorError } = await supabaseAdmin
        .from("vereadores")
        .select(
          "id, nome_parlamentar, is_presidente, is_vice_presidente, partido_id"
        )
        .eq("profile_id", user.id)
        .single();

      if (vereadorError) {
        logger.error("Erro ao buscar dados do vereador:", vereadorError);
        throw new Error("Dados do vereador não encontrados");
      }

      vereadorData = vereador;
    }

    return {
      id: user.id,
      email: user.email,
      role: profile.role,
      camara_id: profile.camara_id,
      profile: profile,
      vereador: vereadorData,
    };
  } catch (error) {
    logger.error("Erro na autenticação:", error);
    throw new Error("Token inválido");
  }
};

/**
 * Creates or updates a vereador vote and emits live voting updates.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const createVoto = async (req, res) => {
  logger.log("🗳️ === INÍCIO DO REGISTRO DE VOTO ===");

  try {
    const user = await authenticateToken(req);

    if (user.role !== "vereador") {
      logger.error(`❌ Acesso negado: Usuário ${user.id} não é vereador`);
      return res.status(403).json({ error: "Apenas vereadores podem votar" });
    }

    const { pauta_id, voto } = req.body;

    logger.log("📋 Dados do voto:", {
      vereador_id: user.vereador.id,
      pauta_id,
      voto,
      is_presidente: user.vereador.is_presidente,
    });

    if (!pauta_id || !voto) {
      logger.error("❌ Dados obrigatórios não fornecidos");
      return res
        .status(400)
        .json({ error: "Pauta ID e voto são obrigatórios" });
    }

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
        logger.error("❌ Voto inválido:", voto);
        return res.status(400).json({
          error: "Voto inválido. Permitidos: Sim, Não, Abstenção",
        });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: pauta, error: pautaError } = await supabase
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
      logger.error("❌ Pauta não encontrada:", pautaError);
      return res.status(404).json({ error: "Pauta não encontrada" });
    }

    if (pauta.status !== "Em Votação") {
      logger.error("❌ Pauta não está em votação:", pauta.status);
      return res.status(400).json({ error: "Esta pauta não está em votação" });
    }

    if (pauta.sessoes.camara_id !== user.camara_id) {
      logger.error("❌ Pauta de outra câmara");
      return res
        .status(403)
        .json({ error: "Você só pode votar em pautas da sua câmara" });
    }

    const { data: votoExistente, error: votoExistenteError } = await supabase
      .from("votos")
      .select("id, voto")
      .eq("pauta_id", pauta_id)
      .eq("vereador_id", user.vereador.id)
      .single();

    if (votoExistente) {
      logger.log("🔄 Atualizando voto existente");

      const { data: votoAtualizado, error: updateError } = await supabase
        .from("votos")
        .update({
          voto: votoEnum,
          era_presidente_no_voto: user.vereador.is_presidente,
          era_vice_presidente_no_voto: user.vereador.is_vice_presidente,
          partido_id_no_voto: user.vereador.partido_id,
        })
        .eq("id", votoExistente.id)
        .select()
        .single();

      if (updateError) {
        logger.error("❌ Erro ao atualizar voto:", updateError);
        return res.status(500).json({ error: "Erro ao atualizar voto" });
      }

      logger.log("✅ Voto atualizado com sucesso");
      try {
        if (typeof global !== "undefined" && global.io) {
          const { data: votosAtualizados } = await supabase
            .from("votos")
            .select("voto")
            .eq("pauta_id", pauta_id);

          const totals = { sim: 0, nao: 0, abstencao: 0 };
          if (votosAtualizados) {
            votosAtualizados.forEach((v) => {
              if (v.voto === "SIM") totals.sim++;
              else if (v.voto === "NÃO") totals.nao++;
              else if (v.voto === "ABSTENÇÃO") totals.abstencao++;
            });
          }

          const payloadVotacao = {
            pautaId: pauta_id,
            totals,
            voto: votoAtualizado,
          };

          const camaraId = pauta.sessoes.camara_id;
          logger.log(`📡 Emitindo voto ATUALIZADO para salas da câmara ${camaraId}`);
          logger.log(`   - tv-camara-${camaraId}`);
          logger.log(`   - portal-camara-${camaraId}`);
          logger.log(`   - painel-camara-${camaraId}`);
          logger.log(`   Payload:`, JSON.stringify(payloadVotacao));

          global.io
            .to(`tv-camara-${camaraId}`)
            .emit("votacao-ao-vivo-update", payloadVotacao);

          global.io
            .to(`portal-camara-${camaraId}`)
            .emit("votacao-ao-vivo-update", payloadVotacao);

          global.io
            .to(`painel-camara-${camaraId}`)
            .emit("votacao-ao-vivo-update", payloadVotacao);

          logger.log(`✅ Voto ATUALIZADO emitido para TV, Portal e Painel - Câmara ${camaraId} | Totais: SIM=${totals.sim}, NÃO=${totals.nao}, ABSTENÇÃO=${totals.abstencao}`);
        }
      } catch (emitErr) {
        logger.warn(
          "⚠️ Falha ao emitir socket de update de voto:",
          emitErr.message
        );
      }

      try {
        const http = require("http");
        const postData = JSON.stringify({
          pautaId: pauta_id,
          voto: votoAtualizado,
        });
        const options = {
          hostname: "localhost",
          port: 3003,
          path: "/api/notify/voto",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
        };
        const r = http.request(options, (resp) => {
          if (resp.statusCode < 200 || resp.statusCode >= 300)
            logger.warn(
              "⚠️ Tablet backend notify voto retornou",
              resp.statusCode
            );
        });
        r.on("error", (e) =>
          logger.warn(
            "⚠️ Erro ao notificar tablet backend sobre voto:",
            e.message
          )
        );
        r.write(postData);
        r.end();
      } catch (err) {
        logger.warn("⚠️ Erro no post para tablet backend:", err.message);
      }

      return res.json({
        message: "Voto atualizado com sucesso",
        voto: votoAtualizado,
      });
    } else {
      logger.log("🆕 Criando novo voto");

      const { data: novoVoto, error: createError } = await supabase
        .from("votos")
        .insert({
          pauta_id,
          vereador_id: user.vereador.id,
          voto: votoEnum,
          era_presidente_no_voto: user.vereador.is_presidente,
          era_vice_presidente_no_voto: user.vereador.is_vice_presidente,
          partido_id_no_voto: user.vereador.partido_id,
        })
        .select()
        .single();

      if (createError) {
        logger.error("❌ Erro ao criar voto:", createError);
        return res.status(500).json({ error: "Erro ao registrar voto" });
      }

      try {
        if (typeof global !== "undefined" && global.io) {
          const { data: votosAtualizados } = await supabase
            .from("votos")
            .select("voto")
            .eq("pauta_id", pauta_id);

          const totals = { sim: 0, nao: 0, abstencao: 0 };
          if (votosAtualizados) {
            votosAtualizados.forEach((v) => {
              if (v.voto === "SIM") totals.sim++;
              else if (v.voto === "NÃO") totals.nao++;
              else if (v.voto === "ABSTENÇÃO") totals.abstencao++;
            });
          }

          const payloadVotacao = {
            pautaId: pauta_id,
            totals,
            voto: novoVoto,
          };

          const camaraId = pauta.sessoes.camara_id;
          logger.log(`📡 Emitindo voto para salas da câmara ${camaraId}`);
          logger.log(`   - tv-camara-${camaraId}`);
          logger.log(`   - portal-camara-${camaraId}`);
          logger.log(`   - painel-camara-${camaraId}`);
          logger.log(`   Payload:`, JSON.stringify(payloadVotacao));

          global.io
            .to(`tv-camara-${camaraId}`)
            .emit("votacao-ao-vivo-update", payloadVotacao);

          global.io
            .to(`portal-camara-${camaraId}`)
            .emit("votacao-ao-vivo-update", payloadVotacao);

          global.io
            .to(`painel-camara-${camaraId}`)
            .emit("votacao-ao-vivo-update", payloadVotacao);

          logger.log(`✅ Voto NOVO emitido para TV, Portal e Painel - Câmara ${camaraId} | Totais: SIM=${totals.sim}, NÃO=${totals.nao}, ABSTENÇÃO=${totals.abstencao}`);
        }
      } catch (emitErr) {
        logger.warn("⚠️ Falha ao emitir socket de novo voto:", emitErr.message);
      }

      try {
        const http = require("http");
        const postData = JSON.stringify({ pautaId: pauta_id, voto: novoVoto });
        const options = {
          hostname: "localhost",
          port: 3003,
          path: "/api/notify/voto",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
        };
        const r = http.request(options, (resp) => {
          if (resp.statusCode < 200 || resp.statusCode >= 300)
            logger.warn(
              "⚠️ Tablet backend notify voto retornou",
              resp.statusCode
            );
        });
        r.on("error", (e) =>
          logger.warn(
            "⚠️ Erro ao notificar tablet backend sobre voto:",
            e.message
          )
        );
        r.write(postData);
        r.end();
      } catch (err) {
        logger.warn("⚠️ Erro no post para tablet backend:", err.message);
      }

      logger.log("✅ Voto registrado com sucesso");
      return res
        .status(201)
        .json({ message: "Voto registrado com sucesso", voto: novoVoto });
    }
  } catch (error) {
    logger.error("💥 Erro no registro de voto:", error);

    if (error.message === "Token de acesso requerido") {
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Token inválido" ||
      error.message.includes("não encontrado")
    ) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Lists votes for an agenda item with vereador, party, and aggregate statistics.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getVotosPorPauta = async (req, res) => {
  try {
    const user = await authenticateToken(req);
    const { pauta_id } = req.params;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: pauta, error: pautaError } = await supabase
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
      return res.status(404).json({ error: "Pauta não encontrada" });
    }

    if (
      (user.role === "admin_camara" || user.role === "vereador") &&
      user.camara_id &&
      pauta.sessoes.camara_id !== user.camara_id
    ) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const { data: votos, error: votosError } = await supabase
      .from("votos")
      .select(
        `
                id,
                voto,
                created_at,
                era_presidente_no_voto,
                era_vice_presidente_no_voto,
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
                )
            `
      )
      .eq("pauta_id", pauta_id)
      .order("created_at", { ascending: true });

    if (votosError) {
      logger.error("Erro ao buscar votos:", votosError);
      return res.status(500).json({ error: "Erro ao buscar votos" });
    }

    const stats = {
      total: votos.length,
      sim: votos.filter((v) => v.voto === "SIM").length,
      nao: votos.filter((v) => v.voto === "NÃO").length,
      abstencao: votos.filter((v) => v.voto === "ABSTENÇÃO").length,
      voto_presidente:
        votos.find((v) => v.era_presidente_no_voto)?.voto || null,
    };

    res.json({
      pauta: {
        id: pauta.id,
        nome: pauta.nome,
        status: pauta.status,
      },
      votos,
      estatisticas: stats,
    });
  } catch (error) {
    logger.error("Erro ao buscar votos:", error);

    if (error.message === "Token de acesso requerido") {
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Token inválido" ||
      error.message.includes("não encontrado")
    ) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Returns vote totals for an agenda item visible to the authenticated user.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getVotosTotals = async (req, res) => {
  try {
    const { pauta_id } = req.params;

    const user = await authenticateToken(req);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: pauta, error: pautaError } = await supabase
      .from("pautas")
      .select("id, nome, sessoes(camara_id)")
      .eq("id", pauta_id)
      .single();

    if (pautaError || !pauta) {
      return res.status(404).json({ error: "Pauta não encontrada" });
    }

    if (String(pauta.sessoes.camara_id) !== String(user.camara_id)) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const { data: votos, error: votosError } = await supabase
      .from("votos")
      .select("voto")
      .eq("pauta_id", pauta_id);

    if (votosError) {
      logger.error("Erro ao buscar votos:", votosError);
      return res.status(500).json({ error: "Erro ao buscar totais de votos" });
    }

    const totals = {
      sim: 0,
      nao: 0,
      abstencao: 0,
    };

    if (votos) {
      votos.forEach((v) => {
        if (v.voto === "SIM") totals.sim++;
        else if (v.voto === "NÃO") totals.nao++;
        else if (v.voto === "ABSTENÇÃO") totals.abstencao++;
      });
    }

    logger.log(`📊 Totais pauta ${pauta_id}: SIM=${totals.sim}, NÃO=${totals.nao}, ABSTENÇÃO=${totals.abstencao}`);

    res.json(totals);
  } catch (error) {
    logger.error("Erro ao obter totais de votos:", error);

    if (error.message === "Token de acesso requerido") {
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Token inválido" ||
      error.message.includes("não encontrado")
    ) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = {
  createVoto,
  getVotosPorPauta,
  getVotosTotals,
};
