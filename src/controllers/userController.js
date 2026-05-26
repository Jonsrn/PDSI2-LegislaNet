const supabaseAdmin = require("../config/supabaseAdminClient");
const createLogger = require("../utils/logger");
const logger = createLogger("USER_CONTROLLER");

/**
 * Controller actions for camara user lookup and credential updates.
 *
 * @module controllers/userController
 */

/**
 * Lists profiles for a camara with matching auth user and vereador metadata.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getUsersByCamara = async (req, res) => {
  const { camaraId } = req.params;
  logger.log(`Buscando usuários da câmara ID: ${camaraId}`);

  try {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, role")
      .eq("camara_id", camaraId);
    if (profileError) throw profileError;

    const { data: vereadores, error: vereadorError } = await supabaseAdmin
      .from("vereadores")
      .select("id, profile_id, foto_url, is_active")
      .eq("camara_id", camaraId);
    if (vereadorError) throw vereadorError;

    const {
      data: { users },
      error: usersError,
    } = await supabaseAdmin.auth.admin.listUsers();
    if (usersError) throw usersError;

    const usersMap = new Map(users.map((u) => [u.id, u]));
    const vereadoresMap = new Map(vereadores.map((v) => [v.profile_id, v]));

    const responseData = profiles.map((p) => {
      const authUser = usersMap.get(p.id);
      const vereadorData = vereadoresMap.get(p.id);
      const isAdmin = p.role === "admin_camara";

      return {
        profile_id: p.id,
        vereador_id: vereadorData ? vereadorData.id : null,
        nome: p.nome,
        role: p.role,
        email: authUser ? authUser.email : "Email não encontrado",
        foto_url: vereadorData ? vereadorData.foto_url : null,
        is_active: isAdmin
          ? true
          : vereadorData
          ? vereadorData.is_active
          : false,
      };
    });

    res.status(200).json(responseData);
  } catch (error) {
    logger.error("Erro ao buscar usuários.", error.message);
    res.status(500).json({ error: "Erro ao buscar usuários da câmara." });
  }
};

/**
 * Updates Supabase Auth credentials for a user.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { password, email } = req.body;

  if (!password && !email) {
    return res
      .status(400)
      .json({ error: "Informe um email e/ou senha para atualizar." });
  }

  const updatePayload = {};
  if (password) updatePayload.password = password;
  if (email) {
    updatePayload.email = email;
    // Keep behavior consistent with createUser(email_confirm: true).
    updatePayload.email_confirm = true;
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      id,
      updatePayload
    );
    if (error) throw error;

    logger.log(`Usuário ${id} foi atualizado.`, {
      email: !!email,
      password: !!password,
    });
    res
      .status(200)
      .json({ message: "Credenciais do usuário atualizadas com sucesso." });
  } catch (error) {
    logger.error("Erro ao atualizar usuário.", error.message);
    res
      .status(500)
      .json({ error: error.message || "Erro ao atualizar usuário." });
  }
};

module.exports = {
  getUsersByCamara,
  updateUser,
};
