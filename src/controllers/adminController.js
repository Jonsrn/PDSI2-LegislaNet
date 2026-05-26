const supabaseAdmin = require("../config/supabaseAdminClient");
const { validationResult } = require("express-validator");
const createLogger = require("../utils/logger");
const logger = createLogger("ADMIN_CONTROLLER");

/**
 * Administrative controller actions for partidos, camaras, vereadores, and
 * related account provisioning flows.
 *
 * @module controllers/adminController
 */

/**
 * Checks whether a partido exists by name or acronym.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const checkPartidoExists = async (req, res) => {
  const { nome, sigla } = req.query;
  if (!nome || !sigla) {
    return res
      .status(400)
      .json({ error: "Nome e Sigla são obrigatórios para a verificação." });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("partidos")
      .select("id")
      .or(`nome.eq.${nome},sigla.eq.${sigla}`)
      .limit(1);

    if (error) throw error;

    res.status(200).json({ exists: data.length > 0 });
  } catch (error) {
    logger.error("Erro ao verificar existência do partido.", error.message);
    res.status(500).json({ error: "Erro ao verificar partido." });
  }
};

/**
 * Creates a partido record and optionally stores its logo in Supabase Storage.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const createPartido = async (req, res) => {
  logger.log("Requisição recebida para criar partido com upload.");

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { nome, sigla } = req.body;
  const logoFile = req.file;

  try {
    let logo_url = null;
    if (logoFile) {
      logger.log("Processando logo do partido...");

      // Prefer metadata already added by the upload middleware.
      if (logoFile.url) {
        logo_url = logoFile.url;
        logger.log("-> Logo processado pelo novo middleware:", {
          url: logo_url,
        });
      } else {
        // Preserve compatibility with legacy memory-storage uploads.
        logger.log("Fazendo upload do logo do partido via Supabase Storage...");
        const filePath = `public/logos-partidos/${Date.now()}-${
          logoFile.originalname
        }`;

        const { data: uploadData, error: uploadError } =
          await supabaseAdmin.storage
            .from("logos-partidos")
            .upload(filePath, logoFile.buffer, {
              contentType: logoFile.mimetype,
            });

        if (uploadError) {
          throw new Error(`Falha no upload do logo: ${uploadError.message}`);
        }

        logo_url = supabaseAdmin.storage
          .from("logos-partidos")
          .getPublicUrl(uploadData.path).data.publicUrl;
        logger.log("-> Upload do logo concluído via Supabase:", {
          url: logo_url,
        });
      }
    }

    const { data, error } = await supabaseAdmin
      .from("partidos")
      .insert([{ nome, sigla, logo_url }])
      .select()
      .single();

    if (error) throw error;

    logger.log("Partido criado com sucesso.", data);
    res.status(201).json(data);
  } catch (error) {
    logger.error("Erro ao criar partido.", error.message);
    res
      .status(500)
      .json({ error: "Erro ao criar partido.", details: error.message });
  }
};

/**
 * Updates a partido record and replaces its logo when a new file is provided.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const updatePartido = async (req, res) => {
  logger.log("Requisição recebida para atualizar partido.");

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { nome, sigla } = req.body;
  const newLogoFile = req.file;

  let updateData = { nome, sigla };

  try {
    if (newLogoFile) {
      logger.log(`Nova logo recebida para o partido ${id}.`);

      // Prefer metadata already added by the upload middleware.
      if (newLogoFile.url) {
        updateData.logo_url = newLogoFile.url;
        logger.log("-> Logo processado pelo novo middleware:", {
          url: newLogoFile.url,
        });
      } else {
        // Preserve compatibility with legacy memory-storage uploads.
        const { data: partidoAtual, error: fetchError } = await supabaseAdmin
          .from("partidos")
          .select("logo_url")
          .eq("id", id)
          .single();

        if (fetchError)
          throw new Error("Erro ao buscar partido existente para atualização.");

        const newFilePath = `public/logos-partidos/${Date.now()}-${
          newLogoFile.originalname
        }`;
        const { data: uploadData, error: uploadError } =
          await supabaseAdmin.storage
            .from("logos-partidos")
            .upload(newFilePath, newLogoFile.buffer, {
              contentType: newLogoFile.mimetype,
            });

        if (uploadError)
          throw new Error(
            `Falha no upload da nova logo: ${uploadError.message}`
          );

        const new_logo_url = supabaseAdmin.storage
          .from("logos-partidos")
          .getPublicUrl(uploadData.path).data.publicUrl;
        updateData.logo_url = new_logo_url;
        logger.log("-> Upload da nova logo concluído via Supabase:", {
          url: new_logo_url,
        });

        if (partidoAtual && partidoAtual.logo_url) {
          const oldFilePath =
            partidoAtual.logo_url.split("/logos-partidos/")[1];
          logger.log(`Removendo logo antiga do storage: ${oldFilePath}`);
          await supabaseAdmin.storage
            .from("logos-partidos")
            .remove([oldFilePath]);
        }
      }
    }

    const { data: updatedPartido, error: updateError } = await supabaseAdmin
      .from("partidos")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;
    if (!updatedPartido)
      return res.status(404).json({ error: "Partido não encontrado." });

    logger.log("Partido atualizado com sucesso.", updatedPartido);
    res.status(200).json(updatedPartido);
  } catch (error) {
    logger.error(`Erro ao atualizar partido ${id}.`, error.message);
    res
      .status(500)
      .json({ error: "Erro ao atualizar partido.", details: error.message });
  }
};

/**
 * Deletes a partido record and removes its logo from Supabase Storage when present.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const deletePartido = async (req, res) => {
  logger.log("Requisição recebida para deletar partido.");
  const { id } = req.params;

  try {
    const { data: partido, error: fetchError } = await supabaseAdmin
      .from("partidos")
      .select("logo_url")
      .eq("id", id)
      .single();

    if (fetchError) {
      logger.warn(
        `Partido ${id} não encontrado para deleção, mas prosseguindo.`
      );
    }

    if (partido && partido.logo_url) {
      const filePath = partido.logo_url.split("/logos-partidos/")[1];
      logger.log(`Removendo logo do partido ${id} do storage: ${filePath}`);
      const { error: removeError } = await supabaseAdmin.storage
        .from("logos-partidos")
        .remove([filePath]);
      if (removeError)
        logger.error(`Falha ao remover logo: ${removeError.message}`);
    }

    const { error: deleteError } = await supabaseAdmin
      .from("partidos")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    logger.log(`Partido ${id} deletado com sucesso.`);
    res.status(204).send();
  } catch (error) {
    logger.error(`Erro ao deletar partido ${id}.`, error.message);
    res
      .status(500)
      .json({ error: "Erro ao deletar partido.", details: error.message });
  }
};

/**
 * Checks whether an email already exists through the Supabase RPC helper.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const checkEmailExists = async (req, res) => {
  const { email } = req.query;
  if (!email || email.trim() === "") {
    return res.status(200).json({ exists: false });
  }
  try {
    logger.log(`Verificando email '${email.trim()}' com RPC...`);
    const { data, error } = await supabaseAdmin.rpc("email_exists", {
      email_to_check: email.trim(),
    });
    if (error) {
      throw error;
    }
    res.status(200).json({ exists: data });
  } catch (error) {
    logger.error(`Erro no RPC ao verificar email ${email}:`, error.message);
    res.status(500).json({ error: "Erro no servidor ao verificar email." });
  }
};

/**
 * Creates a camara, its admin profile, vereador accounts, optional TV account,
 * and related uploaded images as a single provisioning flow.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const createCamaraCompleta = async (req, res) => {
  logger.log("Processo de cadastro completo com upload iniciado.");
  const {
    municipio,
    estado,
    admin_email,
    admin_senha,
    vereadores,
    link_facebook,
    link_instagram,
    link_youtube,
    site_oficial,
    youtube_stream_key,
    youtube_rtmp_url,
    youtube_channel_id,
    youtube_channel_url,
  } = req.body;
  const brasaoFile = req.files.brasao ? req.files.brasao[0] : null;
  const vereadorFotos = req.files.vereador_fotos || [];
  let createdAuthUserIds = [];
  try {
    if (!municipio || !estado || !admin_email || !admin_senha || !vereadores) {
      throw new Error("Campos obrigatórios estão faltando.");
    }
    const vereadoresPayload = JSON.parse(vereadores);
    logger.log(
      `Payload recebido. ${vereadoresPayload.length} vereadores para cadastrar.`
    );
    let brasao_url = null;
    if (brasaoFile) {
      logger.log("Processando brasão...");

      // Prefer metadata already added by the upload middleware.
      if (brasaoFile.url) {
        brasao_url = brasaoFile.url;
        logger.log("-> Brasão processado pelo novo middleware:", {
          url: brasao_url,
        });
      } else {
        // Preserve compatibility with legacy memory-storage uploads.
        logger.log("Fazendo upload do brasão via Supabase Storage...");
        const filePath = `public/brasoes-camara/${Date.now()}-${
          brasaoFile.originalname
        }`;
        const { data, error } = await supabaseAdmin.storage
          .from("brasoes-camara")
          .upload(filePath, brasaoFile.buffer, {
            contentType: brasaoFile.mimetype,
          });
        if (error)
          throw new Error(`Falha no upload do brasão: ${error.message}`);
        brasao_url = supabaseAdmin.storage
          .from("brasoes-camara")
          .getPublicUrl(data.path).data.publicUrl;
        logger.log("-> Brasão processado via Supabase:", { url: brasao_url });
      }
    }
    for (let i = 0; i < vereadoresPayload.length; i++) {
      const fotoFile = vereadorFotos[i];
      vereadoresPayload[i].foto_url = null;
      if (fotoFile) {
        // Prefer metadata already added by the upload middleware.
        if (fotoFile.url) {
          vereadoresPayload[i].foto_url = fotoFile.url;
          logger.log(
            `-> Foto do vereador ${vereadoresPayload[i].nome_parlamentar} processada pelo novo middleware:`,
            { url: fotoFile.url }
          );
        } else {
          // Preserve compatibility with legacy memory-storage uploads.
          const filePath = `public/fotos-vereadores/${Date.now()}-${
            fotoFile.originalname
          }`;
          const { data, error } = await supabaseAdmin.storage
            .from("fotos-vereadores")
            .upload(filePath, fotoFile.buffer, {
              contentType: fotoFile.mimetype,
            });
          if (error)
            throw new Error(
              `Falha no upload da foto do vereador ${vereadoresPayload[i].nome_parlamentar}: ${error.message}`
            );
          vereadoresPayload[i].foto_url = supabaseAdmin.storage
            .from("fotos-vereadores")
            .getPublicUrl(data.path).data.publicUrl;
          logger.log(
            `-> Foto do vereador ${vereadoresPayload[i].nome_parlamentar} processada via Supabase:`,
            { url: vereadoresPayload[i].foto_url }
          );
        }
      }
    }
    const nome_camara = `Câmara Municipal de ${municipio}`;
    logger.log("Iniciando criação de registros...");
    const { data: adminAuthData, error: adminAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email: admin_email,
        password: admin_senha,
        email_confirm: true,
      });
    if (adminAuthError)
      throw new Error(
        `Falha ao criar usuário admin: ${adminAuthError.message}`
      );
    createdAuthUserIds.push(adminAuthData.user.id);
    const { data: novaCamara, error: camaraError } = await supabaseAdmin
      .from("camaras")
      .insert([
        {
          nome_camara,
          municipio,
          estado,
          brasao_url,
          link_facebook,
          link_instagram,
          link_youtube,
          site_oficial,
          youtube_stream_key,
          youtube_rtmp_url,
          youtube_channel_id,
          youtube_channel_url,
        },
      ])
      .select("id")
      .single();
    if (camaraError)
      throw new Error(`Falha ao criar câmara: ${camaraError.message}`);
    const camaraId = novaCamara.id;
    const { error: adminProfileError } = await supabaseAdmin
      .from("profiles")
      .insert([
        {
          id: adminAuthData.user.id,
          nome: `Admin ${nome_camara}`,
          role: "admin_camara",
          camara_id: camaraId,
        },
      ]);
    if (adminProfileError)
      throw new Error(
        `Falha ao criar perfil do admin: ${adminProfileError.message}`
      );
    for (const vereador of vereadoresPayload) {
      const { data: vAuthData, error: vAuthError } =
        await supabaseAdmin.auth.admin.createUser({
          email: vereador.email,
          password: vereador.senha,
          email_confirm: true,
        });
      if (vAuthError)
        throw new Error(
          `Falha ao criar auth para ${vereador.email}: ${vAuthError.message}`
        );
      createdAuthUserIds.push(vAuthData.user.id);
      const { error: vProfileError } = await supabaseAdmin
        .from("profiles")
        .insert([
          {
            id: vAuthData.user.id,
            nome: vereador.nome_parlamentar,
            role: "vereador",
            camara_id: camaraId,
          },
        ]);
      if (vProfileError)
        throw new Error(
          `Falha ao criar perfil para ${vereador.email}: ${vProfileError.message}`
        );
      const { error: vError } = await supabaseAdmin
        .from("vereadores")
        .insert([
          {
            profile_id: vAuthData.user.id,
            camara_id: camaraId,
            partido_id: vereador.partido_id,
            nome_parlamentar: vereador.nome_parlamentar,
            foto_url: vereador.foto_url,
            is_presidente: vereador.is_presidente,
            is_vice_presidente: vereador.is_vice_presidente,
          },
        ]);
      if (vError)
        throw new Error(
          `Falha ao criar registro de vereador para ${vereador.email}: ${vError.message}`
        );
    }
    try {
      const tv_email = req.body.tv_email;
      const tv_senha = req.body.tv_senha;
      if (tv_email) {
        const { data: tvAuthData, error: tvAuthError } =
          await supabaseAdmin.auth.admin.createUser({
            email: tv_email,
            password: tv_senha || Math.random().toString(36).slice(-10),
            email_confirm: true,
          });
        if (tvAuthError)
          throw new Error(`Falha ao criar usuário TV: ${tvAuthError.message}`);
        createdAuthUserIds.push(tvAuthData.user.id);
        const { error: tvProfileError } = await supabaseAdmin
          .from("profiles")
          .insert([
            {
              id: tvAuthData.user.id,
              nome: `TV ${nome_camara}`,
              role: "tv",
              camara_id: camaraId,
            },
          ]);
        if (tvProfileError)
          throw new Error(
            `Falha ao criar profile da TV: ${tvProfileError.message}`
          );
        const { error: tvDisplayError } = await supabaseAdmin
          .from("tv_displays")
          .insert([{ profile_id: tvAuthData.user.id, camara_id: camaraId }]);
        if (tvDisplayError)
          throw new Error(
            `Falha ao criar registro tv_displays: ${tvDisplayError.message}`
          );
      }
    } catch (err) {
      logger.error(
        "Erro ao criar usuário TV durante cadastro completo:",
        err.message
      );
      // Roll back all created auth users if optional TV provisioning fails.
      if (createdAuthUserIds.length > 0) {
        await Promise.all(
          createdAuthUserIds.map((id) =>
            supabaseAdmin.auth.admin.deleteUser(id)
          )
        );
      }
      throw err;
    }
    logger.log("✅ PROCESSO CONCLUÍDO!");
    res
      .status(201)
      .json({ message: "Câmara cadastrada com sucesso!", camaraId: camaraId });
  } catch (error) {
    logger.error("ERRO CRÍTICO durante o cadastro.", error.message);
    if (createdAuthUserIds.length > 0) {
      logger.warn(
        `Iniciando rollback para ${createdAuthUserIds.length} usuários...`
      );
      await Promise.all(
        createdAuthUserIds.map((id) => supabaseAdmin.auth.admin.deleteUser(id))
      );
    }
    res
      .status(500)
      .json({ error: "Erro interno do servidor.", details: error.message });
  }
};

/**
 * Lists camaras with pagination, search filtering, and aggregate status counts.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getCamarasPaginado = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 8;
  const search = req.query.search || "";
  const offset = (page - 1) * limit;
  try {
    const countQuery = supabaseAdmin
      .from("camaras")
      .select("*", { count: "exact", head: true });
    const activeCountQuery = supabaseAdmin
      .from("camaras")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    if (search) {
      const searchQuery = `nome_camara.ilike.%${search}%,municipio.ilike.%${search}%`;
      countQuery.or(searchQuery);
      activeCountQuery.or(searchQuery);
    }
    const [totalResult, activeResult] = await Promise.all([
      countQuery,
      activeCountQuery,
    ]);
    const totalItems = totalResult.count || 0;
    const activeItems = activeResult.count || 0;
    let query = supabaseAdmin
      .from("camaras")
      .select(
        `id, nome_camara, municipio, estado, brasao_url, is_active, vereadores(count), sessoes(count)`
      );
    if (search) {
      query = query.or(
        `nome_camara.ilike.%${search}%,municipio.ilike.%${search}%`
      );
    }
    const { data: camaras, error } = await query
      .order("nome_camara", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    res.status(200).json({
      data: camaras,
      stats: {
        total: totalItems,
        active: activeItems,
        inactive: totalItems - activeItems,
      },
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    logger.error("Erro ao buscar câmaras.", error.message);
    res
      .status(500)
      .json({ error: "Erro ao buscar câmaras.", details: error.message });
  }
};

/**
 * Lists all vereadores for a camara, including inactive records, for admin use.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getVereadoresByCamaraAdmin = async (req, res) => {
  const { camaraId } = req.params;
  logger.log(`Buscando TODOS os vereadores da câmara ID: ${camaraId} (admin)`);

  try {
    const { data, error } = await supabaseAdmin
      .from("vereadores")
      .select(
        `
                id,
                profile_id,
                nome_parlamentar,
                foto_url,
                is_presidente,
                is_vice_presidente,
                is_active,
                partidos ( id, nome, sigla, logo_url )
            `
      )
      .eq("camara_id", camaraId)
      .order("nome_parlamentar", { ascending: true });

    if (error) throw error;
    res.status(200).json({
      vereadores: data,
      total: data.length,
    });
  } catch (error) {
    logger.error("Erro ao buscar vereadores (admin).", error.message);
    res.status(500).json({ error: "Erro ao buscar vereadores." });
  }
};

module.exports = {
  checkPartidoExists,
  createPartido,
  updatePartido,
  deletePartido,
  checkEmailExists,
  createCamaraCompleta,
  getCamarasPaginado,
  getVereadoresByCamaraAdmin,
};
