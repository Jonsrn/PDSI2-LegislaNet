const { createClient } = require("@supabase/supabase-js");
const createLogger = require("../utils/logger");
const upsertAndEmitVotacaoAoVivo = () => { logger.log("Mock de upsertAndEmitVotacaoAoVivo para Sprint 12"); };

const logger = createLogger("PAUTA_CONTROLLER");

/**
 * Controller actions for agenda items, voting status, and public/tablet
 * notifications.
 *
 * @module controllers/pautaController
 */

/**
 * Logs warnings through the configured logger when available.
 *
 * @param {...*} args - Warning values to log.
 * @returns {void}
 */
const warnSeguro = (...args) => {
  try {
    if (logger && typeof logger.warn === "function")
      return logger.warn(...args);
    if (logger && typeof logger.log === "function") return logger.log(...args);
    if (logger && typeof logger.error === "function")
      return logger.error("WARN (fallback):", args);
    console.warn("[PAUTA_CONTROLLER WARN]", ...args);
  } catch (_) {
  }
};

/**
 * Authenticates a request using its Supabase bearer token and returns the
 * associated profile data.
 *
 * @param {object} req - Express request object.
 * @returns {Promise<object>} Authenticated user and profile metadata.
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
      { global: { headers: { Authorization: `Bearer ${token}` } } },
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
      process.env.SUPABASE_SERVICE_KEY,
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

    return {
      id: user.id,
      email: user.email,
      role: profile.role,
      camara_id: profile.camara_id,
      profile: profile,
    };
  } catch (error) {
    logger.error("Erro na autenticação:", error);
    throw new Error("Token inválido");
  }
};

/**
 * Lists agenda items visible to the authenticated user with filtering,
 * pagination, and duplicate-check support.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getAllPautas = async (req, res) => {
  try {
    const user = await authenticateToken(req);

    const { page = 1, limit = 8, status, search, autor, sessao_id } = req.query;
    const offset = (page - 1) * limit;

    logger.log(
      `Buscando pautas para usuário ${user.id}... Página: ${page}, Limite: ${limit}, Status: "${status}", Autor: "${autor}", Busca: "${search}"`,
    );

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    const selectWithUpdatedAt = `
                id,
                nome,
                descricao,
                anexo_url,
                status,
                votacao_simbolica,
                autor,
                created_at,
                updated_at,
                resultado_votacao,
                sessoes!inner (
                    id,
                    nome,
                    tipo,
                    status,
                    data_sessao,
                    camara_id,
                    camaras (nome_camara)
                )
            `;

    const selectWithoutUpdatedAt = `
                id,
                nome,
                descricao,
                anexo_url,
                status,
                votacao_simbolica,
                autor,
                created_at,
                resultado_votacao,
                sessoes!inner (
                    id,
                    nome,
                    tipo,
                    status,
                    data_sessao,
                    camara_id,
                    camaras (nome_camara)
                )
    `;

    const applyFilters = (q) => {
      if (
        (user.role === "admin_camara" || user.role === "vereador") &&
        user.camara_id
      ) {
        q = q.eq("sessoes.camara_id", user.camara_id);
      }

      if (status) {
        q = q.eq("status", status);
      }

      if (typeof sessao_id === "string" && sessao_id.trim()) {
        q = q.eq("sessao_id", sessao_id.trim());
      }

      if (typeof autor === "string" && autor.trim()) {
        q = q.ilike("autor", autor.trim());
      }

      if (search) {
        q = q.or(`nome.ilike.%${search}%,descricao.ilike.%${search}%`);
      }

      return q;
    };

    const buildBaseQuery = (selectClause) =>
      applyFilters(
        supabase
          .from("pautas")
          .select(selectClause, { count: "exact" })
          .order("created_at", { ascending: false }),
      );

    let query = buildBaseQuery(selectWithUpdatedAt);

    if (req.query.nome && req.query.sessao_id) {
      logger.log(
        `🔍 Verificando duplicidade: "${req.query.nome}" na sessão ${req.query.sessao_id}`,
      );
      query = query
        .eq("nome", req.query.nome)
        .eq("sessao_id", req.query.sessao_id);

      let duplicatas = null;
      let duplicataError = null;

      {
        const { data, error } = await query;
        duplicatas = data;
        duplicataError = error;
      }

      // Fall back when the schema does not include updated_at.
      if (
        duplicataError &&
        /updated_at/i.test(duplicataError.message || duplicataError.details)
      ) {
        logger.warn(
          "updated_at não disponível no schema para GET /api/pautas (duplicidade). Recuando para select sem updated_at.",
          duplicataError,
        );
        query = buildBaseQuery(selectWithoutUpdatedAt)
          .eq("nome", req.query.nome)
          .eq("sessao_id", req.query.sessao_id);

        const { data, error } = await query;
        duplicatas = data;
        duplicataError = error;
      }

      if (duplicataError) {
        logger.error("Erro ao verificar duplicidade:", duplicataError);
        return res.status(500).json({ error: "Erro ao verificar duplicidade" });
      }

      logger.log(
        `📊 Resultado duplicidade: ${duplicatas.length} pauta(s) encontrada(s)`,
      );
      return res.json({ data: duplicatas });
    }

    let pautas = null;
    let pautasError = null;
    let count = null;

    {
      const result = await query.range(offset, offset + parseInt(limit) - 1);
      pautas = result.data;
      pautasError = result.error;
      count = result.count;
    }

    // Fall back when the schema does not include updated_at.
    if (
      pautasError &&
      /updated_at/i.test(pautasError.message || pautasError.details)
    ) {
      logger.warn(
        "updated_at não disponível no schema para GET /api/pautas. Recuando para select sem updated_at.",
        pautasError,
      );
      const retryQuery = buildBaseQuery(selectWithoutUpdatedAt);
      const result = await retryQuery.range(
        offset,
        offset + parseInt(limit) - 1,
      );
      pautas = result.data;
      pautasError = result.error;
      count = result.count;
    }

    if (pautasError) {
      logger.error("Erro ao buscar pautas:", pautasError);
      return res.status(500).json({ error: "Erro ao buscar pautas" });
    }

    const processedPautas = (pautas || []).map((pauta) => ({
      id: pauta.id,
      nome: pauta.nome,
      descricao: pauta.descricao || "",
      anexo_url: pauta.anexo_url,
      status: pauta.status,
      votacao_simbolica: pauta.votacao_simbolica,
      created_at: pauta.created_at,
      updated_at: pauta.updated_at || pauta.created_at,
      autor: pauta.autor || "Não informado",
      resultado_votacao: pauta.resultado_votacao,
      sessoes: {
        id: pauta.sessoes?.id,
        nome: pauta.sessoes?.nome,
        tipo: pauta.sessoes?.tipo,
        status: pauta.sessoes?.status,
        data_sessao: pauta.sessoes?.data_sessao,
        camaras: {
          nome_camara: pauta.sessoes?.camaras?.nome_camara,
        },
      },
    }));

    logger.log(
      `Encontradas ${processedPautas.length} pautas de um total de ${count} para o usuário ${user.role}.`,
    );

    res.json({
      data: processedPautas,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    logger.error("Erro no endpoint de pautas:", error);

    if (error.message === "Token de acesso requerido") {
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Usuário não encontrado" ||
      error.message === "Token inválido"
    ) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Lists distinct agenda authors visible to the authenticated user's camara scope.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getAutoresPautas = async (req, res) => {
  try {
    const user = await authenticateToken(req);

    logger.log(`Buscando autores globais de pautas para usuário ${user.id}...`);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    const pageSize = 1000;
    const maxRows = 20000;
    let from = 0;

    const autoresSet = new Set();

    let sessaoIds = null;
    if (
      (user.role === "admin_camara" || user.role === "vereador") &&
      user.camara_id
    ) {
      const { data: sessoes, error: sessoesError } = await supabase
        .from("sessoes")
        .select("id")
        .eq("camara_id", user.camara_id);

      if (sessoesError) {
        logger.error(
          "Erro ao buscar sessões da câmara para autores:",
          sessoesError,
        );
        return res
          .status(500)
          .json({ error: "Erro ao buscar sessões da câmara" });
      }

      sessaoIds = (sessoes || []).map((s) => s.id).filter(Boolean);

      if (sessaoIds.length === 0) {
        return res.json({ data: [] });
      }
    }

    const buildBaseQuery = () => {
      let query = supabase
        .from("pautas")
        .select("autor")
        .not("autor", "is", null)
        .order("autor", { ascending: true });

      if (Array.isArray(sessaoIds)) {
        query = query.in("sessao_id", sessaoIds);
      }

      return query;
    };

    while (from < maxRows) {
      const to = from + pageSize - 1;
      const { data, error } = await buildBaseQuery().range(from, to);

      if (error) {
        logger.error("Erro ao buscar autores de pautas:", error);
        return res.status(500).json({ error: "Erro ao buscar autores" });
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const row of data) {
        const autor = typeof row.autor === "string" ? row.autor.trim() : "";
        if (autor) autoresSet.add(autor);
      }

      if (data.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    const autores = Array.from(autoresSet).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );

    res.json({ data: autores });
  } catch (error) {
    logger.error("Erro no endpoint de autores de pautas:", error);

    if (error.message === "Token de acesso requerido") {
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Usuário não encontrado" ||
      error.message === "Token inválido"
    ) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Retrieves a single agenda item by id within the authenticated user's scope.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getPautaById = async (req, res) => {
  try {
    const user = await authenticateToken(req);

    const { id } = req.params;

    logger.log(`Buscando pauta ${id} para usuário ${user.id}...`);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    let query = supabase
      .from("pautas")
      .select(
        `
                *,
                sessoes!inner (
                    *,
                    camaras (nome_camara)
                ),
                votos (
                    id,
                    voto,
                    vereadores (nome_parlamentar)
                )
            `,
      )
      .eq("id", id);

    if (
      (user.role === "admin_camara" || user.role === "vereador") &&
      user.camara_id
    ) {
      query = query.eq("sessoes.camara_id", user.camara_id);
    }

    const { data: pauta, error } = await query.single();

    if (error) {
      logger.error("Erro ao buscar pauta:", error);
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Pauta não encontrada" });
      }
      return res.status(500).json({ error: "Erro ao buscar pauta" });
    }

    logger.log(`Pauta ${id} encontrada com sucesso.`);

    res.json(pauta);
  } catch (error) {
    logger.error("Erro no endpoint de pauta específica:", error);

    if (error.message === "Token de acesso requerido") {
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Usuário não encontrado" ||
      error.message === "Token inválido"
    ) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Creates one or more agenda items, including an optional symbolic voting item
 * and attached file metadata.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const createPauta = async (req, res) => {
  logger.log("📝 === INÍCIO DO PROCESSO DE CADASTRO DE PAUTA ===");

  try {
    logger.log("🔐 Autenticando usuário...");
    const user = await authenticateToken(req);
    logger.log(
      `✅ Usuário autenticado: ${user.id} (${user.email}) - Role: ${user.role}`,
    );

    const {
      nome,
      descricao,
      status = "Pendente",
      sessao_id,
      autor,
      votacao_simbolica,
    } = req.body;

    const criarVotacaoSimbolica =
      votacao_simbolica === "true" || votacao_simbolica === true;

    let anexo_url = null;
    if (req.file) {
      anexo_url = req.file.url;
      logger.log(
        `📎 Arquivo anexado: ${req.file.originalname} -> ${anexo_url}`,
      );
    }

    logger.log("📋 Dados recebidos:", {
      nome: nome || "[não informado]",
      autor: autor || "[não informado]",
      status,
      sessao_id: sessao_id || "[não informado]",
      criarVotacaoSimbolica: criarVotacaoSimbolica
        ? "SIM (2 pautas)"
        : "NÃO (1 pauta)",
      descricao: descricao ? `${descricao.length} caracteres` : "[vazia]",
      arquivo: req.file ? req.file.originalname : "[não enviado]",
      anexo_url: anexo_url || "[nenhum]",
    });

    logger.log("🔍 Validando campos obrigatórios...");
    if (!nome) {
      logger.error("❌ Validação falhou: Nome da pauta não informado");
      return res.status(400).json({ error: "Nome da pauta é obrigatório" });
    }

    if (!sessao_id) {
      logger.error("❌ Validação falhou: Sessão não informada");
      return res.status(400).json({ error: "Sessão é obrigatória" });
    }
    logger.log("✅ Campos obrigatórios validados com sucesso");

    logger.log(`🚀 Iniciando criação de pauta para usuário ${user.id}...`);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    logger.log(`🔍 Verificando sessão ${sessao_id}...`);
    const { data: sessao, error: sessaoError } = await supabase
      .from("sessoes")
      .select("id, camara_id, nome, status, data_sessao")
      .eq("id", sessao_id)
      .single();

    if (sessaoError || !sessao) {
      logger.error(`❌ Sessão não encontrada: ${sessao_id}`, sessaoError);
      return res.status(404).json({ error: "Sessão não encontrada" });
    }
    logger.log(
      `✅ Sessão encontrada: "${sessao.nome}" - Status: ${sessao.status} - Câmara: ${sessao.camara_id}`,
    );

    if (
      (user.role === "admin_camara" || user.role === "vereador") &&
      user.camara_id &&
      sessao.camara_id !== user.camara_id
    ) {
      logger.error(
        `❌ Acesso negado: Usuário ${user.id} tentou criar pauta para sessão de outra câmara`,
      );
      logger.error(
        `   Câmara do usuário: ${user.camara_id} | Câmara da sessão: ${sessao.camara_id}`,
      );
      return res.status(403).json({
        error: "Você só pode criar pautas para sessões da sua câmara",
      });
    }
    logger.log("✅ Verificação de permissões aprovada");

    if (autor && typeof autor !== "string") {
      logger.error("❌ Validação falhou: Autor deve ser texto");
      return res.status(400).json({ error: "Autor deve ser um texto" });
    }
    logger.log("✅ Validação do autor aprovada");

    logger.log("💾 Inserindo pauta(s) no banco de dados...");

    const pautasParaCriar = [];

    const pautaPrincipal = {
      nome,
      descricao,
      anexo_url,
      status,
      sessao_id,
      autor,
      votacao_simbolica: false,
      resultado_votacao: "Não Votada",
      created_by: user.id,
    };
    pautasParaCriar.push(pautaPrincipal);
    logger.log("📊 Pauta principal:", pautaPrincipal);

    if (criarVotacaoSimbolica) {
      const pautaSimbolica = {
        nome: `${nome} - Votação Simbólica`,
        descricao: descricao
          ? `${descricao} (Votação Simbólica)`
          : "Votação Simbólica",
        anexo_url,
        status,
        sessao_id,
        autor,
        votacao_simbolica: true,
        resultado_votacao: "Não Votada",
        created_by: user.id,
      };
      pautasParaCriar.push(pautaSimbolica);
      logger.log("📊 Pauta simbólica:", pautaSimbolica);
    }

    logger.log(`🔢 Total de pautas a criar: ${pautasParaCriar.length}`);

    const { data: pautas, error: pautaError } = await supabase
      .from("pautas")
      .insert(pautasParaCriar).select(`
                id,
                nome,
                descricao,
                anexo_url,
                status,
                votacao_simbolica,
                autor,
                created_at,
                resultado_votacao,
                sessoes (
                    id,
                    nome,
                    tipo,
                    status,
                    data_sessao,
                    camaras (nome_camara)
                )
            `);

    if (pautaError) {
      logger.error("❌ ERRO ao inserir pauta(s) no banco:", pautaError);
      logger.error("📊 Dados que causaram o erro:", pautasParaCriar);
      return res.status(500).json({ error: "Erro ao criar pauta(s)" });
    }

    logger.log(`✅ SUCESSO! ${pautas.length} pauta(s) criada(s)`);
    pautas.forEach((pauta, index) => {
      logger.log(`📋 Pauta ${index + 1}:`, {
        id: pauta.id,
        nome: pauta.nome,
        autor: pauta.autor,
        status: pauta.status,
        votacao_simbolica: pauta.votacao_simbolica,
        sessao: pauta.sessoes?.nome,
        created_at: pauta.created_at,
      });
    });
    logger.log("🎉 === CADASTRO DE PAUTA(S) CONCLUÍDO COM SUCESSO ===");

    const http = require("http");
    pautas.forEach((pauta) => {
      const payload = JSON.stringify({
        pautaId: pauta.id,
        pautaNome: pauta.nome,
        status: pauta.status,
        camaraId: sessao.camara_id,
      });

      const options = {
        hostname: "localhost",
        port: 3003,
        path: "/api/notify/nova-pauta",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 2000,
      };

      const request = http.request(options, (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          logger.log(
            `✅ Notificação de nova pauta enviada para backend tablet: ${pauta.nome}`,
          );
        }
      });

      request.on("error", (error) => {
        warnSeguro(
          `⚠️ Erro ao notificar backend tablet sobre nova pauta: ${error.message}`,
        );
      });

      request.write(payload);
      request.end();
    });

    res.status(201).json({
      message: `${pautas.length} pauta(s) criada(s) com sucesso`,
      data: pautas,
      info: {
        total: pautas.length,
        principal: pautas.find((p) => !p.votacao_simbolica),
        simbolica: pautas.find((p) => p.votacao_simbolica) || null,
      },
    });
  } catch (error) {
    logger.error(
      "💥 ERRO CRÍTICO no endpoint de criação de pauta:",
      error.message,
    );
    logger.error("📊 Stack trace:", error.stack);
    logger.error("❌ === CADASTRO DE PAUTA FALHOU ===");

    if (error.message === "Token de acesso requerido") {
      logger.error("🔐 Erro de autenticação: Token ausente");
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Usuário não encontrado" ||
      error.message === "Token inválido"
    ) {
      logger.error(
        "🔐 Erro de autenticação: Token inválido ou usuário não encontrado",
      );
      return res.status(401).json({ error: error.message });
    }

    logger.error("💀 Erro interno não tratado, retornando erro 500");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Updates the stored voting result for an agenda item.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const updateResultadoVotacao = async (req, res) => {
  logger.log("📝 === INÍCIO DA ATUALIZAÇÃO DE RESULTADO DE VOTAÇÃO ===");

  try {
    logger.log("🔐 Autenticando usuário...");
    const user = await authenticateToken(req);
    logger.log(
      `✅ Usuário autenticado: ${user.id} (${user.email}) - Role: ${user.role}`,
    );

    const { id } = req.params;
    const { resultado_votacao } = req.body;

    logger.log("📋 Dados recebidos:", {
      pauta_id: id,
      novo_resultado: resultado_votacao,
      usuario: user.id,
    });

    if (!id) {
      logger.error("❌ Validação falhou: ID da pauta não informado");
      return res.status(400).json({ error: "ID da pauta é obrigatório" });
    }

    if (!resultado_votacao) {
      logger.error("❌ Validação falhou: Resultado da votação não informado");
      return res
        .status(400)
        .json({ error: "Resultado da votação é obrigatório" });
    }

    const resultadosPermitidos = ["Não Votada", "Aprovada", "Reprovada"];
    if (!resultadosPermitidos.includes(resultado_votacao)) {
      logger.error(
        "❌ Validação falhou: Resultado inválido",
        resultado_votacao,
      );
      return res.status(400).json({
        error:
          "Resultado inválido. Permitidos: " + resultadosPermitidos.join(", "),
      });
    }

    logger.log(
      `🚀 Atualizando resultado da pauta ${id} para "${resultado_votacao}"...`,
    );

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    logger.log(`🔍 Verificando pauta ${id}...`);
    const { data: pauta, error: pautaError } = await supabase
      .from("pautas")
      .select(
        `
                id,
                nome,
                resultado_votacao,
                sessao_id,
                sessoes!inner (
                    id,
                    camara_id
                )
            `,
      )
      .eq("id", id)
      .single();

    if (pautaError || !pauta) {
      logger.error(`❌ Pauta não encontrada: ${id}`, pautaError);
      return res.status(404).json({ error: "Pauta não encontrada" });
    }

    logger.log(
      `✅ Pauta encontrada: "${pauta.nome}" - Resultado atual: ${pauta.resultado_votacao}`,
    );

    if (
      (user.role === "admin_camara" || user.role === "vereador") &&
      user.camara_id &&
      pauta.sessoes.camara_id !== user.camara_id
    ) {
      logger.error(
        `❌ Acesso negado: Usuário ${user.id} tentou alterar pauta de outra câmara`,
      );
      return res
        .status(403)
        .json({ error: "Você só pode alterar pautas da sua câmara" });
    }

    logger.log("💾 Atualizando resultado no banco de dados...");
    const { data: pautaAtualizada, error: updateError } = await supabase
      .from("pautas")
      .update({
        resultado_votacao: resultado_votacao,
      })
      .eq("id", id)
      .select(
        `
                id,
                nome,
                resultado_votacao,
                created_at
            `,
      )
      .single();

    if (updateError) {
      logger.error("❌ ERRO ao atualizar resultado da votação:", updateError);
      return res
        .status(500)
        .json({ error: "Erro ao atualizar resultado da votação" });
    }

    logger.log(`✅ SUCESSO! Resultado da votação atualizado:`, {
      id: pautaAtualizada.id,
      nome: pautaAtualizada.nome,
      resultado_anterior: pauta.resultado_votacao,
      resultado_novo: pautaAtualizada.resultado_votacao,
      created_at: pautaAtualizada.created_at,
    });

    logger.log(
      "🎉 === ATUALIZAÇÃO DE RESULTADO DE VOTAÇÃO CONCLUÍDA COM SUCESSO ===",
    );

    res.json({
      message: "Resultado da votação atualizado com sucesso",
      data: pautaAtualizada,
    });
  } catch (error) {
    logger.error("💥 ERRO CRÍTICO na atualização de resultado:", error.message);
    logger.error("📊 Stack trace:", error.stack);
    logger.error("❌ === ATUALIZAÇÃO DE RESULTADO FALHOU ===");

    if (error.message === "Token de acesso requerido") {
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Usuário não encontrado" ||
      error.message === "Token inválido"
    ) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Updates agenda status, recalculates voting results when finalized, and emits
 * tablet/public notification events.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const updatePautaStatus = async (req, res) => {
  logger.log("📝 === INÍCIO DA ATUALIZAÇÃO DE STATUS DE PAUTA ===");

  try {
    logger.log("🔐 Autenticando usuário...");
    const user = await authenticateToken(req);
    logger.log(
      `✅ Usuário autenticado: ${user.id} (${user.email}) - Role: ${user.role}`,
    );

    const { id } = req.params;
    const { status } = req.body;

    logger.log("📋 Dados recebidos:", {
      pauta_id: id,
      novo_status: status,
      usuario: user.id,
    });

    if (!id) {
      logger.error("❌ Validação falhou: ID da pauta não informado");
      return res.status(400).json({ error: "ID da pauta é obrigatório" });
    }

    if (!status) {
      logger.error("❌ Validação falhou: Status não informado");
      return res.status(400).json({ error: "Status é obrigatório" });
    }

    const statusPermitidos = ["Pendente", "Em Votação", "Finalizada"];
    if (!statusPermitidos.includes(status)) {
      logger.error("❌ Validação falhou: Status inválido", status);
      return res.status(400).json({
        error: "Status inválido. Permitidos: " + statusPermitidos.join(", "),
      });
    }

    logger.log(`🚀 Atualizando status da pauta ${id} para "${status}"...`);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    logger.log(`🔍 Verificando pauta ${id}...`);
    const { data: pauta, error: pautaError } = await supabase
      .from("pautas")
      .select(
        `
                id,
                nome,
                status,
                sessao_id,
                sessoes!inner (
                    id,
                    camara_id
                )
            `,
      )
      .eq("id", id)
      .single();

    if (pautaError || !pauta) {
      logger.error(`❌ Pauta não encontrada: ${id}`, pautaError);
      return res.status(404).json({ error: "Pauta não encontrada" });
    }

    logger.log(
      `✅ Pauta encontrada: "${pauta.nome}" - Status atual: ${pauta.status}`,
    );

    if (
      (user.role === "admin_camara" || user.role === "vereador") &&
      user.camara_id &&
      pauta.sessoes.camara_id !== user.camara_id
    ) {
      logger.error(
        `❌ Acesso negado: Usuário ${user.id} tentou alterar pauta de outra câmara`,
      );
      return res
        .status(403)
        .json({ error: "Você só pode alterar pautas da sua câmara" });
    }

    logger.log("💾 Atualizando status no banco de dados...");

    // Keep live-vote state aligned with the agenda status.
    const updatePayload = { status };
    if (status === "Em Votação") {
      updatePayload.ao_vivo = true;
    } else {
      updatePayload.ao_vivo = false;
    }

    let { data: pautaAtualizada, error: updateError } = await supabase
      .from("pautas")
      .update(updatePayload)
      .eq("id", id)
      .select(
        `
                id,
                nome,
                status,
                created_at,
                updated_at
            `,
      )
      .single();

    // Fall back when older schemas do not include the ao_vivo column.
    if (updateError) {
      const msg = (updateError?.message || "").toLowerCase();
      const missingAoVivoColumn =
        msg.includes("ao_vivo") &&
        (msg.includes("does not exist") ||
          msg.includes("column") ||
          msg.includes("schema"));
      if (missingAoVivoColumn) {
        logger.log(
          "⚠️ Coluna ao_vivo ausente; atualizando apenas status (fallback compatível)",
        );
        ({ data: pautaAtualizada, error: updateError } = await supabase
          .from("pautas")
          .update({ status })
          .eq("id", id)
          .select(
            `
                    id,
                    nome,
                    status,
                    created_at,
                    updated_at
                `,
          )
          .single());
      }
    }

    if (updateError) {
      logger.error("❌ ERRO ao atualizar status da pauta:", updateError);
      return res
        .status(500)
        .json({ error: "Erro ao atualizar status da pauta" });
    }

    if (status === "Finalizada") {
      logger.log("🗳️ Pauta finalizada - iniciando contagem de votos...");
      await _calcularResultadoVotacao(supabase, id, logger);

      const { data: pautaFinalizada } = await supabase
        .from("pautas")
        .select("*, sessoes!inner(camara_id)")
        .eq("id", id)
        .single();

      if (pautaFinalizada) {
        pautaAtualizada = pautaFinalizada;
      }
    }

    try {
      const appRef = req.app;
      const notificationPayload = {
        pautaId: id,
        pautaNome: pautaAtualizada.nome,
        oldStatus: pauta.status,
        newStatus: pautaAtualizada.status,
        resultado: pautaAtualizada.resultado_votacao || null,
        camaraId: pautaAtualizada.sessoes?.camara_id,
      };

      const http = require("http");
      const postData = JSON.stringify(notificationPayload);

      const options = {
        hostname: "localhost",
        port: 3003,
        path: "/api/notify/pauta-status-change",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      };

      const req = http.request(options, (res) => {
        res.on("data", () => {});
        res.on("end", () => {});

        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.log("📡 Notificação para tablet backend enviada com sucesso");
        } else {
          warnSeguro(
            "⚠️ Falha ao enviar notificação para tablet backend:",
            res.statusCode,
          );
        }
      });

      req.setTimeout(2500, () => {
        try {
          warnSeguro("⚠️ Timeout ao notificar tablet backend");
          req.destroy(new Error("timeout"));
        } catch (_) {
        }
      });

      req.on("error", (error) => {
        try {
          warnSeguro("⚠️ Erro ao notificar tablet backend:", error.message);
        } catch (_) {
        }
      });

      req.write(postData);
      req.end();

      // Notify tablet clients to close any active voting screen after finalization.
      if (
        status === "Finalizada" &&
        pautaAtualizada?.sessoes?.camara_id &&
        pautaAtualizada?.nome
      ) {
        try {
          const postDataEncerrar = JSON.stringify({
            camaraId: pautaAtualizada.sessoes.camara_id,
            pautaId: id,
            pautaNome: pautaAtualizada.nome,
            resultado: pautaAtualizada.resultado_votacao || null,
          });

          const optionsEncerrar = {
            hostname: "localhost",
            port: 3003,
            path: "/api/notify/encerrar-votacao",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postDataEncerrar),
            },
          };

          const reqEncerrar = http.request(optionsEncerrar, (res) => {
            res.on("data", () => {});
            res.on("end", () => {});
          });

          reqEncerrar.setTimeout(2500, () => {
            try {
              reqEncerrar.destroy(new Error("timeout"));
            } catch (_) {}
          });

          reqEncerrar.on("error", () => {
          });

          reqEncerrar.write(postDataEncerrar);
          reqEncerrar.end();
        } catch (_) {
        }
      }

      if (
        status === "Finalizada" &&
        typeof global !== "undefined" &&
        global.io
      ) {
        logger.log(
          "📡 Emitindo notificação para portal público: pauta finalizada",
        );

        // Prefer updated_at when the schema supports it.
        let pautaCompleta = null;
        try {
          const resp = await supabase
            .from("pautas")
            .select(
              `
                            id,
                            nome,
                            descricao,
                            autor,
                            resultado_votacao,
                            created_at,
                            updated_at,
                            sessoes!inner (
                                nome,
                                data_sessao,
                                camara_id
                            )
                        `,
            )
            .eq("id", id)
            .single();

          if (resp.error) throw resp.error;
          pautaCompleta = resp.data;
        } catch (err) {
          warnSeguro(
            "updated_at não disponível ou erro ao buscar pauta com updated_at, recuando para select sem updated_at:",
            err.message || err,
          );
          const resp2 = await supabase
            .from("pautas")
            .select(
              `
                            id,
                            nome,
                            descricao,
                            autor,
                            resultado_votacao,
                            created_at,
                            sessoes!inner (
                                nome,
                                data_sessao,
                                camara_id
                            )
                        `,
            )
            .eq("id", id)
            .single();

          if (resp2.error) {
            warnSeguro(
              "Erro ao buscar pauta completa para notificação do portal:",
              resp2.error.message || resp2.error,
            );
          } else {
            pautaCompleta = resp2.data;
          }
        }

        if (pautaCompleta) {
          const eventData = {
            camaraId: pautaCompleta.sessoes.camara_id,
            pauta: {
              id: pautaCompleta.id,
              nome: pautaCompleta.nome,
              descricao: pautaCompleta.descricao,
              autor: pautaCompleta.autor,
              resultado_votacao: pautaCompleta.resultado_votacao,
              created_at: pautaCompleta.created_at,
              updated_at: pautaCompleta.updated_at || pautaCompleta.created_at,
              sessao: {
                nome: pautaCompleta.sessoes.nome,
                data_sessao: pautaCompleta.sessoes.data_sessao,
              },
            },
            timestamp: new Date().toISOString(),
          };

          global.io
            .to(`portal-camara-${pautaCompleta.sessoes.camara_id}`)
            .emit("pauta-finalizada", eventData);

          global.io
            .to(`tv-camara-${pautaCompleta.sessoes.camara_id}`)
            .emit("tv:encerrar-votacao", {
              pautaId: pautaCompleta.id,
              camaraId: pautaCompleta.sessoes.camara_id,
              timestamp: new Date().toISOString(),
            });

          global.io
            .to(`tv-camara-${pautaCompleta.sessoes.camara_id}`)
            .emit("votacao-finalizada", { pautaId: pautaCompleta.id });

          logger.log(
            `📡 Notificação emitida para portal da câmara ${pautaCompleta.sessoes.camara_id}`,
          );
          logger.log(
            `📺 Notificação de encerramento emitida para TVs da câmara ${pautaCompleta.sessoes.camara_id}`,
          );

          // Clear live voting state so public clients do not remain marked as live.
          try {
            upsertAndEmitVotacaoAoVivo(appRef, {
              camaraId: pautaCompleta.sessoes.camara_id,
              pautaId: pautaCompleta.id,
              pautaNome: pautaCompleta.nome,
              pautaDescricao: pautaCompleta.descricao,
              sessaoNome: pautaCompleta.sessoes.nome,
              sessaoTipo: "",
              sessaoDataHora: pautaCompleta.sessoes.data_sessao,
              vereadoresOnline: 0,
              status: "encerrada",
              timestamp: new Date().toISOString(),
            });
          } catch (err) {
            warnSeguro(
              "⚠️ Falha ao atualizar estado de votação ao vivo (encerrada):",
              err?.message || err,
            );
          }
        } else {
          warnSeguro(
            "⚠️ Não foi possível buscar dados completos da pauta para notificação do portal",
          );
        }
      }
    } catch (notificationError) {
      warnSeguro(
        "⚠️ Erro ao notificar via WebSocket:",
        notificationError.message,
      );
    }

    logger.log(`✅ SUCESSO! Status da pauta atualizado:`, {
      id: pautaAtualizada.id,
      nome: pautaAtualizada.nome,
      status_anterior: pauta.status,
      status_novo: pautaAtualizada.status,
      resultado_votacao: pautaAtualizada.resultado_votacao,
      created_at: pautaAtualizada.created_at,
    });

    logger.log("🎉 === ATUALIZAÇÃO DE STATUS CONCLUÍDA COM SUCESSO ===");

    res.json({
      message: "Status da pauta atualizado com sucesso",
      data: pautaAtualizada,
    });
  } catch (error) {
    logger.error("💥 ERRO CRÍTICO na atualização de status:", error.message);
    logger.error("📊 Stack trace:", error.stack);
    logger.error("❌ === ATUALIZAÇÃO DE STATUS FALHOU ===");

    if (error.message === "Token de acesso requerido") {
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Usuário não encontrado" ||
      error.message === "Token inválido"
    ) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Deletes an agenda item after permission checks and blocks deletion when votes exist.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const deletePauta = async (req, res) => {
  logger.log("🗑️ === INÍCIO DO PROCESSO DE REMOÇÃO DE PAUTA ===");

  try {
    logger.log("🔐 Autenticando usuário...");
    const user = await authenticateToken(req);
    logger.log(
      `✅ Usuário autenticado: ${user.id} (${user.email}) - Role: ${user.role}`,
    );

    const { id } = req.params;

    logger.log("📋 Dados recebidos:", {
      pauta_id: id,
      usuario: user.id,
    });

    if (!id) {
      logger.error("❌ Validação falhou: ID da pauta não informado");
      return res.status(400).json({ error: "ID da pauta é obrigatório" });
    }

    logger.log(`🚀 Iniciando remoção da pauta ${id}...`);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    logger.log(`🔍 Verificando pauta ${id}...`);
    const { data: pauta, error: pautaError } = await supabase
      .from("pautas")
      .select(
        `
                id,
                nome,
                status,
                sessao_id,
                votacao_simbolica,
                sessoes!inner (
                    id,
                    camara_id,
                    nome
                ),
                votos (
                    id,
                    voto
                )
            `,
      )
      .eq("id", id)
      .single();

    if (pautaError || !pauta) {
      logger.error(`❌ Pauta não encontrada: ${id}`, pautaError);
      return res.status(404).json({ error: "Pauta não encontrada" });
    }

    logger.log(
      `✅ Pauta encontrada: "${pauta.nome}" - Status: ${pauta.status}`,
    );
    logger.log(`📊 Votos registrados: ${pauta.votos ? pauta.votos.length : 0}`);

    if (
      (user.role === "admin_camara" || user.role === "vereador") &&
      user.camara_id &&
      pauta.sessoes.camara_id !== user.camara_id
    ) {
      logger.error(
        `❌ Acesso negado: Usuário ${user.id} tentou remover pauta de outra câmara`,
      );
      return res
        .status(403)
        .json({ error: "Você só pode remover pautas da sua câmara" });
    }

    if (pauta.votos && pauta.votos.length > 0) {
      logger.error(
        `❌ Remoção bloqueada: Pauta possui ${pauta.votos.length} voto(s) registrado(s)`,
      );
      return res.status(400).json({
        error:
          "Não é possível remover uma pauta que já possui votos registrados",
        details: `Esta pauta possui ${pauta.votos.length} voto(s) registrado(s)`,
      });
    }

    logger.log("✅ Validação de votos aprovada - nenhum voto encontrado");

    logger.log("🗑️ Removendo pauta do banco de dados...");
    const { error: deleteError } = await supabase
      .from("pautas")
      .delete()
      .eq("id", id);

    if (deleteError) {
      logger.error("❌ ERRO ao remover pauta:", deleteError);
      return res.status(500).json({ error: "Erro ao remover pauta" });
    }

    logger.log(`✅ SUCESSO! Pauta removida:`, {
      id: pauta.id,
      nome: pauta.nome,
      status: pauta.status,
      sessao: pauta.sessoes.nome,
      votacao_simbolica: pauta.votacao_simbolica,
    });

    logger.log("🎉 === REMOÇÃO DE PAUTA CONCLUÍDA COM SUCESSO ===");

    res.json({
      message: "Pauta removida com sucesso",
      data: {
        id: pauta.id,
        nome: pauta.nome,
        sessao: pauta.sessoes.nome,
      },
    });
  } catch (error) {
    logger.error("💥 ERRO CRÍTICO na remoção de pauta:", error.message);
    logger.error("📊 Stack trace:", error.stack);
    logger.error("❌ === REMOÇÃO DE PAUTA FALHOU ===");

    if (error.message === "Token de acesso requerido") {
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Usuário não encontrado" ||
      error.message === "Token inválido"
    ) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Updates an agenda item while enforcing vote, session-date, and camara-scope rules.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const updatePauta = async (req, res) => {
  logger.log("✏️ === INÍCIO DO PROCESSO DE EDIÇÃO DE PAUTA ===");

  try {
    logger.log("🔐 Autenticando usuário...");
    const user = await authenticateToken(req);
    logger.log(
      `✅ Usuário autenticado: ${user.id} (${user.email}) - Role: ${user.role}`,
    );

    const { id } = req.params;
    const {
      nome,
      descricao,
      status,
      autor,
      sessao_id,
    } = req.body;

    let anexo_url = undefined;
    if (req.file) {
      anexo_url = req.file.url;
      logger.log(
        `📎 Novo arquivo anexado: ${req.file.originalname} -> ${anexo_url}`,
      );
    }

    logger.log("📋 Dados recebidos para edição:", {
      pauta_id: id,
      nome: nome || "[não alterado]",
      autor: autor || "[não alterado]",
      status: status || "[não alterado]",
      sessao_id: sessao_id || "[não alterado]",
      descricao: descricao
        ? `${descricao.length} caracteres`
        : "[não alterado]",
      arquivo: req.file ? req.file.originalname : "[não alterado]",
      usuario: user.id,
    });

    logger.log("🔍 Validando campos...");
    if (!id) {
      logger.error("❌ Validação falhou: ID da pauta não informado");
      return res.status(400).json({ error: "ID da pauta é obrigatório" });
    }

    if (nome && nome.trim().length === 0) {
      logger.error("❌ Validação falhou: Nome da pauta não pode estar vazio");
      return res
        .status(400)
        .json({ error: "Nome da pauta não pode estar vazio" });
    }

    if (status && !["Pendente", "Em Votação", "Finalizada"].includes(status)) {
      logger.error("❌ Validação falhou: Status inválido", status);
      return res.status(400).json({ error: "Status inválido" });
    }
    logger.log("✅ Campos validados com sucesso");

    logger.log(`🚀 Iniciando edição da pauta ${id}...`);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );

    logger.log(`🔍 Verificando pauta ${id}...`);
    const { data: pautaAtual, error: pautaError } = await supabase
      .from("pautas")
      .select(
        `
                id,
                nome,
                descricao,
                status,
                autor,
                anexo_url,
                votacao_simbolica,
                resultado_votacao,
                sessao_id,
                sessoes!inner (
                    id,
                    nome,
                    camara_id,
                    data_sessao,
                    status
                ),
                votos (
                    id,
                    voto
                )
            `,
      )
      .eq("id", id)
      .single();

    if (pautaError || !pautaAtual) {
      logger.error(`❌ Pauta não encontrada: ${id}`, pautaError);
      return res.status(404).json({ error: "Pauta não encontrada" });
    }

    logger.log(
      `✅ Pauta encontrada: "${pautaAtual.nome}" - Status: ${pautaAtual.status}`,
    );
    logger.log(
      `📊 Votos registrados: ${pautaAtual.votos ? pautaAtual.votos.length : 0}`,
    );
    logger.log(`📅 Data da sessão: ${pautaAtual.sessoes?.data_sessao}`);

    if (
      (user.role === "admin_camara" || user.role === "vereador") &&
      user.camara_id &&
      pautaAtual.sessoes.camara_id !== user.camara_id
    ) {
      logger.error(
        `❌ Acesso negado: Usuário ${user.id} tentou editar pauta de outra câmara`,
      );
      return res
        .status(403)
        .json({ error: "Você só pode editar pautas da sua câmara" });
    }

    logger.log("🔒 Aplicando validações de edição...");

    const agora = new Date();
    const dataSessao = new Date(pautaAtual.sessoes.data_sessao);

    // Allow moving a past-session agenda item only when it has no votes.
    const isRemanejamento = sessao_id && sessao_id !== pautaAtual.sessao_id;
    const temVotos = pautaAtual.votos && pautaAtual.votos.length > 0;

    if (agora > dataSessao) {
      if (!isRemanejamento || temVotos) {
        logger.error(
          `❌ Edição bloqueada: Data da sessão já passou (${dataSessao.toISOString()} < ${agora.toISOString()})`,
        );

        let errorMessage =
          "Não é possível editar uma pauta após o término da sessão";
        if (isRemanejamento && temVotos) {
          errorMessage =
            "Não é possível remanejar uma pauta que já possui votos registrados.";
        }

        return res.status(400).json({
          error: errorMessage,
          details: isRemanejamento
            ? "Pautas com votos não podem ser remanejadas."
            : `A sessão ocorreu em ${dataSessao.toLocaleDateString(
                "pt-BR",
              )} às ${dataSessao.toLocaleTimeString("pt-BR")}`,
        });
      }
      logger.log(
        "⚠️ Edição permitida EXCEPCIONALMENTE: Remanejamento de sessão passada (sem votos)",
      );
    }
    logger.log("✅ Validação de data aprovada - sessão ainda não ocorreu");

    if (
      pautaAtual.status === "Finalizada" &&
      pautaAtual.votos &&
      pautaAtual.votos.length > 0
    ) {
      logger.error(
        `❌ Edição bloqueada: Pauta finalizada possui ${pautaAtual.votos.length} voto(s) registrado(s)`,
      );
      return res.status(400).json({
        error:
          "Não é possível editar uma pauta finalizada que já possui votos registrados",
        details: `Esta pauta possui ${pautaAtual.votos.length} voto(s) registrado(s)`,
      });
    }
    logger.log("✅ Validação de status/votos aprovada");

    if (sessao_id && sessao_id !== pautaAtual.sessao_id) {
      logger.log(
        `🔄 Validando mudança de sessão: ${pautaAtual.sessao_id} → ${sessao_id}`,
      );

      const { data: novaSessao, error: sessaoError } = await supabase
        .from("sessoes")
        .select("id, nome, camara_id, data_sessao, status")
        .eq("id", sessao_id)
        .single();

      if (sessaoError || !novaSessao) {
        logger.error(
          `❌ Nova sessão não encontrada: ${sessao_id}`,
          sessaoError,
        );
        return res.status(404).json({ error: "Sessão não encontrada" });
      }

      if (
        (user.role === "admin_camara" || user.role === "vereador") &&
        novaSessao.camara_id !== user.camara_id
      ) {
        logger.error(`❌ Nova sessão pertence a outra câmara`);
        return res.status(403).json({
          error: "Você só pode mover pautas para sessões da sua câmara",
        });
      }

      const novaDataSessao = new Date(novaSessao.data_sessao);
      if (agora > novaDataSessao) {
        logger.error(
          `❌ Nova sessão já ocorreu: ${novaDataSessao.toISOString()}`,
        );
        return res.status(400).json({
          error: "Não é possível mover pauta para uma sessão que já ocorreu",
        });
      }

      logger.log(`✅ Nova sessão aprovada: "${novaSessao.nome}"`);
    }

    const dadosParaAtualizar = {};
    if (nome !== undefined) dadosParaAtualizar.nome = nome.trim();
    if (descricao !== undefined)
      dadosParaAtualizar.descricao = descricao?.trim() || "";
    if (status !== undefined) dadosParaAtualizar.status = status;
    if (autor !== undefined) dadosParaAtualizar.autor = autor?.trim() || "";
    if (sessao_id !== undefined) dadosParaAtualizar.sessao_id = sessao_id;
    if (anexo_url !== undefined) dadosParaAtualizar.anexo_url = anexo_url;

    logger.log("💾 Atualizando pauta no banco de dados...");
    logger.log("📋 Campos a atualizar:", Object.keys(dadosParaAtualizar));

    const { data: pautaAtualizada, error: updateError } = await supabase
      .from("pautas")
      .update(dadosParaAtualizar)
      .eq("id", id)
      .select(
        `
                id,
                nome,
                descricao,
                status,
                autor,
                anexo_url,
                votacao_simbolica,
                resultado_votacao,
                created_at,
                sessoes (
                    id,
                    nome,
                    tipo,
                    status,
                    data_sessao,
                    camaras (nome_camara)
                )
            `,
      )
      .single();

    if (updateError) {
      logger.error("❌ ERRO ao atualizar pauta:", updateError);
      return res.status(500).json({ error: "Erro ao atualizar pauta" });
    }

    logger.log(`✅ SUCESSO! Pauta atualizada:`, {
      id: pautaAtualizada.id,
      nome: pautaAtualizada.nome,
      status: pautaAtualizada.status,
      autor: pautaAtualizada.autor,
      sessao: pautaAtualizada.sessoes?.nome,
      created_at: pautaAtualizada.created_at,
    });

    logger.log("🎉 === EDIÇÃO DE PAUTA CONCLUÍDA COM SUCESSO ===");

    res.json({
      message: "Pauta atualizada com sucesso",
      data: pautaAtualizada,
    });
  } catch (error) {
    logger.error("💥 ERRO CRÍTICO na edição de pauta:", error.message);
    logger.error("📊 Stack trace:", error.stack);
    logger.error("❌ === EDIÇÃO DE PAUTA FALHOU ===");

    if (error.message === "Token de acesso requerido") {
      return res.status(401).json({ error: error.message });
    }
    if (
      error.message === "Usuário não encontrado" ||
      error.message === "Token inválido"
    ) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Calculates and stores the final voting result for an agenda item.
 *
 * @param {object} supabase - Supabase client used for vote and agenda updates.
 * @param {string} pautaId - Agenda item identifier.
 * @param {object} logger - Logger used for calculation diagnostics.
 * @returns {Promise<void>}
 */
const _calcularResultadoVotacao = async (supabase, pautaId, logger) => {
  try {
    logger.log("📊 Buscando votos da pauta...");

    const { data: votos, error: votosError } = await supabase
      .from("votos")
      .select(
        `
                id,
                voto,
                era_presidente_no_voto,
                vereadores (
                    id,
                    nome_parlamentar
                )
            `,
      )
      .eq("pauta_id", pautaId);

    if (votosError) {
      logger.error("❌ Erro ao buscar votos:", votosError);
      return;
    }

    logger.log(`📋 Total de votos encontrados: ${votos.length}`);

    const votoPresidente = votos.find((v) => v.era_presidente_no_voto);

    // Count regular votes separately because the president only breaks ties.
    const votosNaoPresidentes = votos.filter((v) => !v.era_presidente_no_voto);
    const votosSim = votosNaoPresidentes.filter((v) => v.voto === "SIM").length;
    const votosNao = votosNaoPresidentes.filter((v) => v.voto === "NÃO").length;
    const abstencoes = votosNaoPresidentes.filter(
      (v) => v.voto === "ABSTENÇÃO",
    ).length;

    logger.log("📊 Contagem de votos (sem presidente):", {
      sim: votosSim,
      nao: votosNao,
      abstencoes: abstencoes,
      voto_presidente: votoPresidente?.voto || "Não votou",
    });

    let resultado;

    if (votosSim > votosNao) {
      resultado = "Aprovada";
      logger.log("✅ Resultado: APROVADA (maioria simples dos vereadores)");
    } else if (votosSim < votosNao) {
      resultado = "Reprovada";
      logger.log("❌ Resultado: REPROVADA (maioria simples dos vereadores)");
    } else {
      if (votoPresidente) {
        if (votoPresidente.voto === "SIM") {
          resultado = "Aprovada";
          logger.log(
            "✅ Resultado: APROVADA (empate + voto de minerva do presidente: SIM)",
          );
        } else if (votoPresidente.voto === "NÃO") {
          resultado = "Reprovada";
          logger.log(
            "❌ Resultado: REPROVADA (empate + voto de minerva do presidente: NÃO)",
          );
        } else {
          resultado = "Reprovada";
          logger.log(
            "❌ Resultado: REPROVADA (empate + presidente se absteve)",
          );
        }
      } else {
        resultado = "Reprovada";
        logger.log("❌ Resultado: REPROVADA (empate + presidente não votou)");
      }
    }

    const { error: updateError } = await supabase
      .from("pautas")
      .update({
        resultado_votacao: resultado,
      })
      .eq("id", pautaId);

    if (updateError) {
      logger.error("❌ Erro ao atualizar resultado da votação:", updateError);
    } else {
      logger.log(`✅ Resultado da votação atualizado: ${resultado}`);
    }
  } catch (error) {
    logger.error("💥 Erro no cálculo do resultado:", error);
  }
};

module.exports = {
  getAllPautas,
  getAutoresPautas,
  getPautaById,
  createPauta,
  updateResultadoVotacao,
  updatePautaStatus,
  deletePauta,
  updatePauta,
};
