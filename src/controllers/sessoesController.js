const { createClient } = require("@supabase/supabase-js");
const { validationResult } = require("express-validator");
const createLogger = require("../utils/logger");
const logger = createLogger("SESSOES_CONTROLLER");

/**
 * Controller actions for managing legislative sessions.
 *
 * @module controllers/sessoesController
 */

/**
 * Creates a session with annual duplicate protection.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const createSessao = async (req, res) => {
  const { user, profile } = req;
  const { numero, tipo, data_sessao, status = "Agendada" } = req.body;

  try {
    // Treat timezone-less datetime-local values as Brasília time.
    let dataSessaoIso = data_sessao;
    if (
      data_sessao &&
      !data_sessao.includes("Z") &&
      !data_sessao.match(/[+-]\d{2}:\d{2}$/)
    ) {
      dataSessaoIso = `${data_sessao}-03:00`;
    }
    const dataSessaoDate = new Date(dataSessaoIso);

    if (!dataSessaoDate || Number.isNaN(dataSessaoDate.getTime())) {
      return res.status(400).json({
        error: "Dados inválidos.",
        details: "Data da sessão inválida.",
      });
    }

    const ano = dataSessaoDate.getFullYear();
    const nomeSessao = `${numero}ª Sessão ${tipo} de ${ano}`;
    logger.log(`Nome da sessão montado: "${nomeSessao}"`);

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    // Use the year range plus name prefix to support legacy names without "de ANO".
    const inicioAno = new Date(ano, 0, 1, 0, 0, 0, 0);
    const inicioProximoAno = new Date(ano + 1, 0, 1, 0, 0, 0, 0);

    logger.log(
      `Verificando duplicidade para número ${numero}, tipo "${tipo}" e ano ${ano} na câmara ${profile.camara_id}`,
    );

    const nomePrefix = `${numero}ª Sessão ${tipo}`;
    const { data: sessaoExistente, error: checkError } = await supabaseAdmin
      .from("sessoes")
      .select("id, nome, data_sessao")
      .eq("camara_id", profile.camara_id)
      .eq("tipo", tipo)
      .gte("data_sessao", inicioAno.toISOString())
      .lt("data_sessao", inicioProximoAno.toISOString())
      .ilike("nome", `${nomePrefix}%`)
      .limit(1)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      logger.error("Erro ao verificar duplicidade de sessão:", checkError);
      throw checkError;
    }

    if (sessaoExistente) {
      logger.warn(`Tentativa de criar sessão duplicada: "${nomeSessao}"`);
      return res.status(409).json({
        error: "Conflito: Já existe uma sessão com este número, tipo e ano.",
        details: `A sessão "${nomeSessao}" já está cadastrada.`,
      });
    }
    logger.log("Nenhuma duplicidade encontrada. Prosseguindo com a criação.");

    const sessionData = {
      nome: nomeSessao,
      tipo: tipo,
      status: status,
      data_sessao: dataSessaoDate.toISOString(),
      camara_id: profile.camara_id,
    };

    const { data: novaSessao, error: insertError } = await supabaseAdmin
      .from("sessoes")
      .insert([sessionData])
      .select("*")
      .single();

    if (insertError) {
      logger.error("Erro do Supabase ao criar sessão:", insertError);
      return res
        .status(500)
        .json({ error: "Erro ao salvar a sessão no banco de dados." });
    }

    logger.log(
      `Sessão "${nomeSessao}" criada com sucesso com o ID: ${novaSessao.id}`,
    );
    res
      .status(201)
      .json({ message: "Sessão criada com sucesso!", data: novaSessao });
  } catch (error) {
    logger.error("Erro inesperado no controller de criação de sessão:", error);
    res.status(500).json({ error: "Ocorreu um erro interno no servidor." });
  }
};

/**
 * Lists sessions for the authenticated user's camara with optional filters.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getAllSessoes = async (req, res) => {
  const { profile } = req;
  const { page = 1, limit = 10, status, tipo, search } = req.query;
  const offset = (page - 1) * limit;

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    let query = supabaseAdmin
      .from("sessoes")
      .select(`*, camaras (nome_camara, municipio)`, { count: "exact" })
      .eq("camara_id", profile.camara_id)
      .order("data_sessao", { ascending: false });

    if (status) query = query.eq("status", status);
    if (tipo) query = query.eq("tipo", tipo);
    if (search) query = query.ilike("nome", `%${search}%`);

    const {
      data: sessoes,
      error,
      count,
    } = await query.range(offset, offset + parseInt(limit) - 1);

    if (error) {
      logger.error("Erro do Supabase ao buscar sessões:", error);
      return res.status(500).json({ error: "Erro ao buscar sessões." });
    }

    res.status(200).json({
      data: sessoes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalItems: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    logger.error("Erro inesperado no controller de busca de sessões:", error);
    res.status(500).json({ error: "Ocorreu um erro interno no servidor." });
  }
};

/**
 * Retrieves a session by id within the authenticated user's camara.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getSessaoById = async (req, res) => {
  const { profile } = req;
  const { id } = req.params;

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    const { data: sessao, error } = await supabaseAdmin
      .from("sessoes")
      .select(`*, camaras (*)`)
      .eq("id", id)
      .eq("camara_id", profile.camara_id)
      .single();

    if (error) {
      logger.error(`Erro do Supabase ao buscar sessão ${id}:`, error);
      if (error.code === "PGRST116") {
        return res.status(404).json({
          error: "Sessão não encontrada ou não pertence à sua câmara.",
        });
      }
      return res.status(500).json({ error: "Erro ao buscar a sessão." });
    }

    res.status(200).json(sessao);
  } catch (error) {
    logger.error(
      "Erro inesperado no controller de busca de sessão por ID:",
      error,
    );
    res.status(500).json({ error: "Ocorreu um erro interno no servidor." });
  }
};

/**
 * Updates a scheduled future session and prevents annual duplicates.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const updateSessao = async (req, res) => {
  const { profile } = req;
  const { id } = req.params;
  const { numero, tipo, data_sessao, status } = req.body;

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    const { data: sessaoExistente, error: checkError } = await supabaseAdmin
      .from("sessoes")
      .select("id, nome, status, data_sessao")
      .eq("id", id)
      .eq("camara_id", profile.camara_id)
      .single();

    if (checkError) {
      if (checkError.code === "PGRST116") {
        return res.status(404).json({
          error: "Sessão não encontrada ou não pertence à sua câmara.",
        });
      }
      logger.error("Erro ao verificar sessão existente:", checkError);
      return res.status(500).json({ error: "Erro ao verificar a sessão." });
    }

    // Only scheduled future sessions can be edited.
    const agora = new Date();
    const dataSessaoAtual = new Date(sessaoExistente.data_sessao);

    if (sessaoExistente.status !== "Agendada") {
      return res.status(403).json({
        error: "Não é possível editar esta sessão.",
        details:
          "Não é possível editar uma sessão que já iniciou ou já terminou.",
      });
    }

    if (!dataSessaoAtual || Number.isNaN(dataSessaoAtual.getTime())) {
      return res.status(400).json({
        error: "Não é possível editar esta sessão.",
        details: "Data da sessão inválida para validação de segurança.",
      });
    }

    if (agora >= dataSessaoAtual) {
      return res.status(403).json({
        error: "Não é possível editar esta sessão.",
        details:
          "Não é possível editar uma sessão que já iniciou ou já terminou.",
      });
    }

    // Treat timezone-less datetime-local values as Brasília time.
    let dataSessaoIso = data_sessao;
    if (
      data_sessao &&
      !data_sessao.includes("Z") &&
      !data_sessao.match(/[+-]\d{2}:\d{2}$/)
    ) {
      dataSessaoIso = `${data_sessao}-03:00`;
    }
    const dataSessaoDate = new Date(dataSessaoIso);

    if (!dataSessaoDate || Number.isNaN(dataSessaoDate.getTime())) {
      return res.status(400).json({
        error: "Dados inválidos.",
        details: "Data da sessão inválida.",
      });
    }

    const ano = dataSessaoDate.getFullYear();
    const novoNome = `${numero}ª Sessão ${tipo} de ${ano}`;

    if (novoNome !== sessaoExistente.nome) {
      const inicioAno = new Date(ano, 0, 1, 0, 0, 0, 0);
      const inicioProximoAno = new Date(ano + 1, 0, 1, 0, 0, 0, 0);
      const nomePrefix = `${numero}ª Sessão ${tipo}`;

      const { data: duplicata, error: dupError } = await supabaseAdmin
        .from("sessoes")
        .select("id, nome")
        .eq("camara_id", profile.camara_id)
        .eq("tipo", tipo)
        .gte("data_sessao", inicioAno.toISOString())
        .lt("data_sessao", inicioProximoAno.toISOString())
        .ilike("nome", `${nomePrefix}%`)
        .neq("id", id)
        .limit(1);

      if (dupError && dupError.code !== "PGRST116") {
        logger.error("Erro ao verificar duplicidade:", dupError);
        return res
          .status(500)
          .json({ error: "Erro ao verificar duplicidade." });
      }

      if (duplicata && duplicata.length > 0) {
        return res.status(409).json({
          error: "Conflito: Já existe uma sessão com este número, tipo e ano.",
          details: `A sessão "${novoNome}" já está cadastrada.`,
        });
      }
    }

    const updateData = {
      nome: novoNome,
      tipo: tipo,
      status: "Agendada",
      data_sessao: dataSessaoDate.toISOString(),
    };

    const { data: sessaoAtualizada, error: updateError } = await supabaseAdmin
      .from("sessoes")
      .update(updateData)
      .eq("id", id)
      .eq("camara_id", profile.camara_id)
      .select("*")
      .single();

    if (updateError) {
      logger.error("Erro ao atualizar sessão:", updateError);
      return res.status(500).json({ error: "Erro ao atualizar a sessão." });
    }

    logger.log(`Sessão ${id} atualizada com sucesso`);
    res.status(200).json({
      message: "Sessão atualizada com sucesso!",
      data: sessaoAtualizada,
    });
  } catch (error) {
    logger.error("Erro inesperado ao atualizar sessão:", error);
    res.status(500).json({ error: "Ocorreu um erro interno no servidor." });
  }
};

/**
 * Deletes a scheduled future session and its linked agenda items.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const deleteSessao = async (req, res) => {
  const { profile } = req;
  const { id } = req.params;

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    const { data: sessaoExistente, error: checkError } = await supabaseAdmin
      .from("sessoes")
      .select("id, nome, status, data_sessao")
      .eq("id", id)
      .eq("camara_id", profile.camara_id)
      .single();

    if (checkError) {
      if (checkError.code === "PGRST116") {
        return res.status(404).json({
          error: "Sessão não encontrada ou não pertence à sua câmara.",
        });
      }
      logger.error("Erro ao verificar sessão existente:", checkError);
      return res.status(500).json({ error: "Erro ao verificar a sessão." });
    }

    // Only scheduled future sessions can be deleted.
    const agora = new Date();
    const dataSessao = new Date(sessaoExistente.data_sessao);

    if (sessaoExistente.status !== "Agendada") {
      return res.status(403).json({
        error: "Não é possível remover esta sessão.",
        details: "Só é permitido remover sessões com status 'Agendada'.",
      });
    }

    if (!dataSessao || Number.isNaN(dataSessao.getTime())) {
      return res.status(400).json({
        error: "Não é possível remover esta sessão.",
        details: "Data da sessão inválida para validação de segurança.",
      });
    }

    if (agora >= dataSessao) {
      return res.status(403).json({
        error: "Não é possível remover esta sessão.",
        details: "Esta sessão já iniciou (ou está no horário de início).",
      });
    }

    const { error: deletePautasError } = await supabaseAdmin
      .from("pautas")
      .delete()
      .eq("sessao_id", id);

    if (deletePautasError) {
      logger.error("Erro ao excluir pautas da sessão:", deletePautasError);
      return res.status(500).json({
        error: "Erro ao remover pautas vinculadas à sessão.",
      });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("sessoes")
      .delete()
      .eq("id", id)
      .eq("camara_id", profile.camara_id);

    if (deleteError) {
      logger.error("Erro ao excluir sessão:", deleteError);
      return res.status(500).json({ error: "Erro ao excluir a sessão." });
    }

    logger.log(`Sessão "${sessaoExistente.nome}" (${id}) excluída com sucesso`);
    res.status(200).json({ message: "Sessão excluída com sucesso!" });
  } catch (error) {
    logger.error("Erro inesperado ao excluir sessão:", error);
    res.status(500).json({ error: "Ocorreu um erro interno no servidor." });
  }
};

/**
 * Lists sessions for select inputs and filters.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getSessoesOpcoes = async (req, res) => {
  const { profile } = req;

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    const { data: sessoes, error } = await supabaseAdmin
      .from("sessoes")
      .select("id, nome, tipo, status, data_sessao")
      .eq("camara_id", profile.camara_id)
      .order("data_sessao", { ascending: false });

    if (error) {
      logger.error("Erro ao buscar opções de sessões:", error);
      return res.status(500).json({ error: "Erro ao buscar sessões." });
    }

    res.json({ data: sessoes || [] });
  } catch (error) {
    logger.error("Erro inesperado ao buscar opções de sessões:", error);
    res.status(500).json({ error: "Ocorreu um erro interno no servidor." });
  }
};

/**
 * Lists available scheduled sessions, including a short grace period for
 * recently started sessions.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getSessoesDisponiveis = async (req, res) => {
  try {
    const { user, profile } = req;

    logger.log(`Buscando sessões disponíveis para usuário ${user.id}...`);

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    const tolerancia = new Date();
    tolerancia.setHours(tolerancia.getHours() - 4);
    const dataCorte = tolerancia.toISOString();

    let query = supabaseAdmin
      .from("sessoes")
      .select(
        `
        id,
        nome,
        tipo,
        status,
        data_sessao,
        camaras (nome_camara)
      `,
      )
      .eq("status", "Agendada")
      .gte("data_sessao", dataCorte)
      .order("data_sessao", { ascending: true });

    if (profile.role === "admin_camara" && profile.camara_id) {
      query = query.eq("camara_id", profile.camara_id);
    }

    const { data: sessoes, error } = await query;

    if (error) {
      logger.error("Erro ao buscar sessões disponíveis:", error);
      return res
        .status(500)
        .json({ error: "Erro ao buscar sessões disponíveis" });
    }

    logger.log(`Encontradas ${sessoes.length} sessões disponíveis.`);

    res.json({ data: sessoes });
  } catch (error) {
    logger.error("Erro no endpoint de sessões disponíveis:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = {
  createSessao,
  getAllSessoes,
  getSessaoById,
  updateSessao,
  deleteSessao,
  getSessoesDisponiveis,
  getSessoesOpcoes,
};
