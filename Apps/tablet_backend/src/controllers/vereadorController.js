const { supabaseAdmin } = require('../config/supabase');
const createLogger = require('../config/logger');
const logger = createLogger('VEREADOR_CONTROLLER');

/**
 * Returns the authenticated council member profile.
 *
 * The lookup is scoped to the authenticated user's chamber and includes party
 * metadata used by the tablet app.
 *
 * @param {import('express').Request} req - Request containing authenticated user and profile.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Council member profile response.
 */
const getVereadorProfile = async (req, res) => {
    const { user, profile } = req;
    logger.info(`Buscando perfil do vereador ${user.id}`);

    try {
        const { data, error } = await supabaseAdmin
            .from('vereadores')
            .select(`
                id,
                nome_parlamentar,
                foto_url,
                is_presidente,
                is_vice_presidente,
                is_active,
                partidos (
                    id,
                    nome,
                    sigla,
                    logo_url
                )
            `)
            .eq('profile_id', user.id)
            .eq('camara_id', profile.camara_id)
            .single();

        if (error || !data) {
            logger.warn('Dados do vereador não encontrados.', { userId: user.id });
            return res.status(404).json({ error: 'Dados de vereador não encontrados.' });
        }

        logger.info(`✅ Perfil encontrado: ${data.nome_parlamentar}`);
        return res.status(200).json(data);

    } catch (error) {
        logger.error('Erro ao buscar perfil do vereador.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao buscar dados do vereador.' });
    }
};

/**
 * Lists active council members from the authenticated user's chamber.
 *
 * Results are ordered by parliamentary name and include party metadata.
 *
 * @param {import('express').Request} req - Request containing authenticated profile.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Active council member list response.
 */
const getVereadoresDaCamara = async (req, res) => {
    const { profile } = req;
    logger.info(`Listando vereadores ativos da câmara ${profile.camara_id}`);

    try {
        const { data, error } = await supabaseAdmin
            .from('vereadores')
            .select(`
                id,
                nome_parlamentar,
                foto_url,
                is_presidente,
                is_vice_presidente,
                partidos (
                    id,
                    nome,
                    sigla,
                    logo_url
                )
            `)
            .eq('camara_id', profile.camara_id)
            .eq('is_active', true)
            .order('nome_parlamentar', { ascending: true });

        if (error) {
            logger.error('Erro ao listar vereadores.', { error: error.message });
            return res.status(500).json({ error: 'Erro ao buscar vereadores da câmara.' });
        }

        logger.info(`✅ ${data.length} vereadores encontrados.`);
        return res.status(200).json({ data });

    } catch (error) {
        logger.error('Erro crítico ao listar vereadores.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao buscar vereadores da câmara.' });
    }
};

/**
 * Updates the authenticated council member profile photo URL.
 *
 * Requires `foto_url` in the request body.
 *
 * @param {import('express').Request} req - Request containing authenticated user and photo URL.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Photo update result response.
 */
const updateVereadorFoto = async (req, res) => {
    const { user } = req;
    const { foto_url } = req.body;

    if (!foto_url) {
        return res.status(400).json({ error: 'URL da foto é obrigatória.' });
    }

    logger.info(`Atualizando foto do vereador ${user.id}`);

    try {
        const { data, error } = await supabaseAdmin
            .from('vereadores')
            .update({ foto_url })
            .eq('profile_id', user.id)
            .select()
            .single();

        if (error) {
            logger.error('Erro ao atualizar foto.', { error: error.message });
            return res.status(500).json({ error: 'Erro ao atualizar foto do vereador.' });
        }

        logger.info('✅ Foto atualizada com sucesso.');
        return res.status(200).json({ message: 'Foto atualizada com sucesso.', data });

    } catch (error) {
        logger.error('Erro crítico ao atualizar foto.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao atualizar foto do vereador.' });
    }
};

module.exports = { getVereadorProfile, getVereadoresDaCamara, updateVereadorFoto };
