const { createClient } = require("@supabase/supabase-js");
const { validationResult } = require("express-validator");
const tokenManager = require("../utils/tokenManager");
const createLogger = require("../utils/logger");
const logger = createLogger("AUTH_CONTROLLER");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Authentication controller actions for login, logout, token refresh, and
 * authenticated profile lookups.
 *
 * @module controllers/authController
 */

/**
 * Decodes the payload section of a JWT without verifying its signature.
 *
 * @param {string} token - JWT access token.
 * @returns {object|null} Decoded payload, or null when the token cannot be parsed.
 */
const decodeJwtPayload = (token) => {
  try {
    const payloadBase64 = token.split(".")[1];
    const decodedJson = Buffer.from(payloadBase64, "base64").toString();
    return JSON.parse(decodedJson);
  } catch (error) {
    logger.error("Erro ao decodificar o payload do JWT:", error);
    return null;
  }
};

/**
 * Authenticates a user with Supabase, updates the minimum token issue time,
 * and returns session/profile data.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const handleLogin = async (req, res) => {
  logger.log("🔐 === INÍCIO DO PROCESSO DE LOGIN ===");

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error("❌ Erros de validação:", errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;
  logger.log("📧 Email recebido:", email);

  try {
    logger.log("🚀 Tentando autenticar com Supabase...");
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

    if (authError) {
      logger.error("❌ Erro de autenticação do Supabase:", authError.message);
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const user = authData.user;
    const session = authData.session;
    logger.log("✅ Usuário autenticado com sucesso! ID:", user.id);

    if (!session || !session.access_token) {
      logger.error("❌ Sessão não retornou access_token.");
      return res.status(500).json({ error: "Falha ao criar sessão." });
    }

    const accessToken = session.access_token;
    const refreshToken = session.refresh_token;

    const payload = decodeJwtPayload(accessToken);
    if (!payload || !payload.iat) {
      logger.error(
        "Falha ao decodificar o payload do novo token ou encontrar o iat."
      );
      return res
        .status(500)
        .json({ error: "Falha ao processar o token da sessão." });
    }
    const newIat = payload.iat;
    logger.log(`[DEBUG-BACKEND] Novo IAT extraído do token: ${newIat}`);
    if (!newIat) {
      logger.error(
        "[DEBUG-BACKEND] ATENÇÃO: IAT não encontrado no payload do token!"
      );
    }

    logger.log(
      `Atualizando min_token_iat para o usuário ${user.id} com o novo timestamp: ${newIat}`
    );

    // Store the minimum accepted JWT issue time to invalidate older sessions.
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ min_token_iat: newIat })
      .eq("id", user.id);

    if (updateError) {
      logger.error("Erro ao atualizar o timestamp do token:", updateError);
      return res
        .status(500)
        .json({ error: "Falha ao iniciar a sessão de forma segura." });
    }
    logger.log("✅ Timestamp do token atualizado com sucesso no perfil.");

    logger.log("🔍 Buscando perfil na tabela profiles...");
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, nome, camara_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      logger.error("❌ Perfil não encontrado para o usuário ID:", user.id);
      return res
        .status(404)
        .json({ error: "Perfil de usuário não encontrado." });
    }

    logger.log("✅ Perfil encontrado:", profileData);
    logger.log("🏆 Login concluído com sucesso!");

    return res.status(200).json({
      message: "Login bem-sucedido!",
      user: {
        id: user.id,
        email: user.email,
        nome: profileData.nome,
        role: profileData.role,
        camara_id: profileData.camara_id,
      },
      token: accessToken,
      refreshToken: refreshToken || null,
      expiresIn: typeof session.expires_in === "number" ? session.expires_in : null,
    });
  } catch (error) {
    logger.error("💥 ERRO INESPERADO NO CONTROLLER:", error);
    return res
      .status(500)
      .json({ error: "Ocorreu um erro interno no servidor." });
  }
};

/**
 * Logs out the current user by blacklisting the provided bearer token.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const handleLogout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    logger.log(
      `[DEBUG-BACKEND] Rota de logout acessada. Cabeçalho Auth: ${
        authHeader ? "Presente" : "Ausente"
      }`
    );

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      tokenManager.blacklistToken(token);
    }
    res.status(200).json({ message: "Logout realizado com sucesso." });
  } catch (error) {
    logger.error("Erro no processo de logout:", error);
    res.status(500).json({ error: "Erro interno ao processar logout." });
  }
};

/**
 * Returns the authenticated vereador profile with camara and partido details.
 *
 * @param {object} req - Express request object populated by authentication middleware.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getVereadorProfile = async (req, res) => {
  logger.log("👤 === BUSCANDO PERFIL DO VEREADOR ===");

  try {
    const { user } = req;
    logger.log(
      "🔍 Buscando dados completos do vereador para usuário ID:",
      user.id
    );

    const { data: vereadorData, error: vereadorError } = await supabaseAdmin
      .from("vereadores")
      .select(
        `
                id,
                nome_parlamentar,
                foto_url,
                is_presidente,
                is_vice_presidente,
                is_active,
                created_at,
                camaras (
                    id,
                    nome_camara,
                    municipio,
                    estado
                ),
                partidos (
                    id,
                    nome,
                    sigla,
                    logo_url
                )
            `
      )
      .eq("profile_id", user.id)
      .single();

    if (vereadorError || !vereadorData) {
      logger.error("❌ Dados do vereador não encontrados:", vereadorError);
      return res
        .status(404)
        .json({ error: "Dados do vereador não encontrados" });
    }

    logger.log("✅ Dados do vereador encontrados:", {
      id: vereadorData.id,
      nome: vereadorData.nome_parlamentar,
      foto_url: vereadorData.foto_url,
    });

    return res.status(200).json(vereadorData);
  } catch (error) {
    logger.error("💥 ERRO INESPERADO ao buscar perfil do vereador:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Returns the authenticated user's basic account, profile, and camara data.
 *
 * @param {object} req - Express request object with an Authorization bearer token.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getMe = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token de acesso ausente" });
    }

    const token = authHeader.split(" ")[1];

    const supabaseUser = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, nome, camara_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "Perfil não encontrado" });
    }

    let camara = null;
    if (profile.camara_id) {
      const { data: camaraData, error: camaraError } = await supabaseAdmin
        .from("camaras")
        .select("id, nome_camara, brasao_url")
        .eq("id", profile.camara_id)
        .single();

      if (!camaraError && camaraData) camara = camaraData;
    }

    return res.status(200).json({
      user: { id: user.id, email: user.email },
      profile,
      camara,
    });
  } catch (error) {
    logger.error("Erro em getMe:", error.message || error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

/**
 * Refreshes a Supabase session when a refresh token is provided, or validates
 * the current access token for legacy clients.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const handleRefreshToken = async (req, res) => {
  logger.log("🔄 === INÍCIO DO PROCESSO DE REFRESH TOKEN ===");

  try {
    const providedRefreshToken = req.body?.refreshToken;

    if (providedRefreshToken) {
      const supabaseTmp = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      );

      const { data: refreshData, error: refreshError } =
        await supabaseTmp.auth.refreshSession({
          refresh_token: providedRefreshToken,
        });

      if (refreshError || !refreshData?.session || !refreshData?.user) {
        logger.error("❌ Falha ao renovar sessão:", refreshError?.message);
        return res.status(401).json({ error: "Refresh token inválido ou expirado" });
      }

      const newAccessToken = refreshData.session.access_token;
      const newRefreshToken =
        refreshData.session.refresh_token || providedRefreshToken;

      const tokenPayload = decodeJwtPayload(newAccessToken);

      const { data: profileData, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("role, nome, camara_id, min_token_iat")
        .eq("id", refreshData.user.id)
        .single();

      if (profileError || !profileData) {
        logger.error(
          "❌ Perfil não encontrado para o usuário ID:",
          refreshData.user.id
        );
        return res.status(404).json({ error: "Perfil de usuário não encontrado." });
      }

      const allowedRoles = ["super_admin", "admin_camara", "tv"];
      if (!allowedRoles.includes(profileData.role)) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Preserve single-session enforcement based on the minimum accepted token iat.
      if (
        !tokenPayload ||
        typeof tokenPayload.iat !== "number" ||
        tokenPayload.iat < (profileData.min_token_iat || 0)
      ) {
        return res
          .status(401)
          .json({ error: "Sessão expirada. Por favor, faça login novamente." });
      }

      return res.status(200).json({
        message: "Token renovado com sucesso!",
        user: {
          id: refreshData.user.id,
          email: refreshData.user.email,
          nome: profileData.nome,
          role: profileData.role,
          camara_id: profileData.camara_id,
        },
        token: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn:
          typeof refreshData.session.expires_in === "number"
            ? refreshData.session.expires_in
            : null,
      });
    }

    // Legacy fallback: validate the current access token without refreshing it.
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.error("❌ Token de autorização ausente ou mal formatado");
      return res.status(401).json({ error: "Token de autorização requerido" });
    }

    const currentToken = authHeader.split(" ")[1];

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(currentToken);

    if (userError || !user) {
      logger.error("❌ Token atual inválido:", userError?.message);
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    const tokenParts = currentToken.split(".");
    if (tokenParts.length !== 3) {
      logger.error("❌ Formato de token inválido");
      return res.status(401).json({ error: "Token malformado" });
    }

    const payload = JSON.parse(Buffer.from(tokenParts[1], "base64").toString());
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = payload.exp - now;

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, nome, camara_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      return res.status(404).json({ error: "Perfil de usuário não encontrado." });
    }

    return res.status(200).json({
      message: "Token validado com sucesso!",
      user: {
        id: user.id,
        email: user.email,
        nome: profileData.nome,
        role: profileData.role,
        camara_id: profileData.camara_id,
      },
      token: currentToken,
      refreshToken: null,
      expiresIn: timeUntilExpiry,
    });
  } catch (error) {
    logger.error("💥 ERRO INESPERADO NO REFRESH TOKEN:", error);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
};

module.exports = {
  handleLogin,
  handleLogout,
  handleRefreshToken,
  getVereadorProfile,
  getMe,
};
