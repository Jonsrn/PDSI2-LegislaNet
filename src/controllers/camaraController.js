const supabaseAdmin = require("../config/supabaseAdminClient");
const createLogger = require("../utils/logger");
const logger = createLogger("CAMARA_CONTROLLER");

/**
 * Chamber controller.
 *
 * Fetches chamber details and updates chamber records, including related admin,
 * TV, YouTube webhook, and livestream synchronization workflows.
 */

/**
 * Fetches a chamber by ID with its administrator and optional TV credentials.
 *
 * The administrator profile is required to include admin auth data. TV data is
 * best-effort and omitted when unavailable.
 *
 * @param {import("express").Request} req - Express request with chamber ID route parameter.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getCamaraById = async (req, res) => {
  const { id } = req.params;
  logger.log(`Buscando dados completos da câmara com ID: ${id}`);

  try {
    const { data: camaraData, error: camaraError } = await supabaseAdmin
      .from("camaras")
      .select("*")
      .eq("id", id)
      .single();

    if (camaraError) throw camaraError;
    if (!camaraData)
      return res.status(404).json({ error: "Câmara não encontrada." });

    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("camara_id", id)
      .eq("role", "admin_camara")
      .single();

    if (profileError) {
      logger.warn(
        `Administrador não encontrado para a câmara ${id}, retornando dados parciais.`,
      );
      return res.status(200).json({ ...camaraData, admin: null });
    }

    const {
      data: { user: adminUser },
      error: userError,
    } = await supabaseAdmin.auth.admin.getUserById(adminProfile.id);
    if (userError) throw userError;

    const responseData = {
      ...camaraData,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
      },
    };

    try {
      const { data: tvProfile, error: tvProfileError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("camara_id", id)
        .eq("role", "tv")
        .single();

      if (!tvProfileError && tvProfile) {
        const {
          data: { user: tvUser },
          error: tvUserError,
        } = await supabaseAdmin.auth.admin.getUserById(tvProfile.id);
        if (!tvUserError && tvUser) {
          responseData.tv = { id: tvUser.id, email: tvUser.email };
        }
      }
    } catch (err) {
      logger.warn("Falha ao buscar dados da TV para a câmara:", err.message);
    }

    res.status(200).json(responseData);
  } catch (error) {
    logger.error("Erro ao buscar dados completos da câmara.", error.message);
    res.status(500).json({ error: "Erro ao buscar dados da câmara." });
  }
};

/**
 * Updates a chamber and related operational integrations.
 *
 * Undefined fields are ignored so partial updates do not overwrite existing
 * values. When the YouTube channel changes, webhook subscriptions are refreshed
 * and livestream detection is forced once. Optional TV credential changes are
 * processed best-effort and do not fail the chamber update.
 *
 * @param {import("express").Request} req - Express request with chamber ID, update body, and optional crest upload.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const updateCamara = async (req, res) => {
  const { id } = req.params;
  const {
    nome_camara,
    municipio,
    estado,
    is_active,
    link_facebook,
    link_instagram,
    link_youtube,
    site_oficial,
    youtube_stream_key,
    youtube_rtmp_url,
    youtube_channel_id,
    youtube_channel_url,
  } = req.body;

  logger.log(`Atualizando câmara com ID: ${id}`);

  let brasao_url = req.body.brasao_url;
  if (req.file && req.file.url) {
    brasao_url = req.file.url;
    logger.log("-> Brasão processado pelo novo middleware:", {
      url: brasao_url,
    });
  }

  // Preserve existing database values by excluding undefined fields.
  const updateData = Object.entries({
    nome_camara,
    municipio,
    estado,
    is_active,
    brasao_url,
    link_facebook,
    link_instagram,
    link_youtube,
    site_oficial,
    youtube_stream_key,
    youtube_rtmp_url,
    youtube_channel_id,
    youtube_channel_url,
  }).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});

  if (Object.keys(updateData).length === 0) {
    return res
      .status(400)
      .json({ error: "Nenhum dado válido para atualização fornecido." });
  }

  // Store the previous channel ID so webhook subscriptions can be reconciled.
  let oldYoutubeChannelId = null;
  try {
    const { data: currentCamara } = await supabaseAdmin
      .from("camaras")
      .select("youtube_channel_id")
      .eq("id", id)
      .single();
    if (currentCamara) {
      oldYoutubeChannelId = currentCamara.youtube_channel_id;
    }
  } catch (errFetcher) {
    logger.warn(
      "Erro ao buscar dados atuais da câmara (ignorando):",
      errFetcher.message,
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("camaras")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    logger.log("Câmara atualizada com sucesso.", data);

    const newYoutubeChannelId = updateData.youtube_channel_id;

    if (
      newYoutubeChannelId !== undefined &&
      newYoutubeChannelId !== oldYoutubeChannelId
    ) {
      logger.log(
        `🔄 Canal do YouTube alterado: ${oldYoutubeChannelId} -> ${newYoutubeChannelId}`,
      );

      const youtubeWebhookService = require("../services/youtubeWebhookService");
      const livestreamService = require("../services/livestreamService");

      if (oldYoutubeChannelId) {
        try {
          await youtubeWebhookService.unsubscribeFromChannel(
            oldYoutubeChannelId,
          );
        } catch (unsubErr) {
          logger.warn(
            `Falha ao desinscrever canal antigo ${oldYoutubeChannelId}:`,
            unsubErr.message,
          );
        }
      }

      if (newYoutubeChannelId && newYoutubeChannelId.trim().length > 0) {
        try {
          await youtubeWebhookService.subscribeToChannel(
            newYoutubeChannelId,
            id,
          );

          // Force an immediate check so an already-live channel updates the portal.
          await livestreamService.checkCamaraLivestreams(
            id,
            newYoutubeChannelId,
            { force: true },
          );
        } catch (subErr) {
          logger.error(
            `Falha ao configurar novo canal ${newYoutubeChannelId}:`,
            subErr.message,
          );
        }
      } else {
        logger.log("ℹ️ Canal do YouTube removido/vazio - sem nova subscrição.");
      }
    }
    // TV credential updates are best-effort and should not block chamber edits.
    try {
      const tvEmail = req.body.tv_email;
      const tvSenha = req.body.tv_senha;
      if (tvEmail || tvSenha) {
        const { data: existingTv, error: existingTvError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("camara_id", id)
          .eq("role", "tv")
          .limit(1)
          .single();

        if (!existingTvError && existingTv && existingTv.id) {
          const updatePayload = {};
          if (tvEmail) {
            updatePayload.email = tvEmail;
            updatePayload.email_confirm = true;
          }
          if (tvSenha) updatePayload.password = tvSenha;

          if (Object.keys(updatePayload).length > 0) {
            const { error: tvUpdateError } =
              await supabaseAdmin.auth.admin.updateUserById(
                existingTv.id,
                updatePayload,
              );
            if (tvUpdateError)
              throw new Error(
                `Falha ao atualizar credenciais da TV: ${tvUpdateError.message}`,
              );
            logger.log("Credenciais da TV atualizadas com sucesso.");
          }
        } else {
          // A new TV user requires an email; a password alone is ignored.
          if (!tvEmail) {
            logger.log(
              "Senha da TV informada, mas não existe TV e nenhum email foi fornecido; ignorando.",
            );
          } else {
            const { data: tvAuthData, error: tvAuthError } =
              await supabaseAdmin.auth.admin.createUser({
                email: tvEmail,
                password: tvSenha || Math.random().toString(36).slice(-10),
                email_confirm: true,
              });
            if (tvAuthError)
              throw new Error(
                `Falha ao criar usuário TV: ${tvAuthError.message}`,
              );
            const { error: tvProfileInsertError } = await supabaseAdmin
              .from("profiles")
              .insert([
                {
                  id: tvAuthData.user.id,
                  nome: `TV ${data.nome_camara}`,
                  role: "tv",
                  camara_id: id,
                },
              ]);
            if (tvProfileInsertError)
              throw new Error(
                `Falha ao criar profile da TV: ${tvProfileInsertError.message}`,
              );
            const { error: tvDisplayError } = await supabaseAdmin
              .from("tv_displays")
              .insert([{ profile_id: tvAuthData.user.id, camara_id: id }]);
            if (tvDisplayError)
              throw new Error(
                `Falha ao criar registro em tv_displays: ${tvDisplayError.message}`,
              );
            logger.log("TV criada e associada com sucesso à câmara.");
          }
        }
      }
    } catch (err) {
      logger.error("Erro ao criar/associar TV:", err.message);
    }

    res.status(200).json({ message: "Câmara atualizada com sucesso!", data });
  } catch (error) {
    logger.error("Erro ao atualizar câmara.", error.message);
    res.status(500).json({ error: "Erro ao atualizar dados da câmara." });
  }
};

module.exports = {
  getCamaraById,
  updateCamara,
};
