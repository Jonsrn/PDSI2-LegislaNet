const { supabaseAdmin } = require('../config/supabase');
const createLogger = require('../config/logger');
const logger = createLogger('VOTO_CONTROLLER');

/**
 * Maps tablet-facing vote labels to the database enum values.
 *
 * @type {Record<string, string>}
 */
const VOTO_MAP = {
    'Sim': 'SIM',
    'Não': 'NÃO',
    'Abstenção': 'ABSTENÇÃO',
};

/**
 * Registers or updates a council member vote for an agenda item.
 *
 * Validates the agenda, voting status, chamber ownership, council member data,
 * and vote value before writing to the `votos` table. This handler currently
 * persists the vote without emitting WebSocket notifications.
 *
 * @param {import('express').Request} req - Request containing user, profile, agenda ID, and vote.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Vote registration result response.
 */
const registrarVoto = async (req, res) => {
    const { user, profile } = req;
    const { pauta_id, voto } = req.body;

    logger.info(`Registrando voto do vereador ${user.id} na pauta ${pauta_id}: ${voto}`);

    if (!pauta_id || !voto) {
        return res.status(400).json({ error: 'pauta_id e voto são obrigatórios.' });
    }

    const votoEnum = VOTO_MAP[voto];
    if (!votoEnum) {
        return res.status(400).json({ error: 'Voto inválido. Valores permitidos: Sim, Não, Abstenção.' });
    }

    try {
        const { data: pauta, error: pautaError } = await supabaseAdmin
            .from('pautas')
            .select('id, nome, status, sessoes!inner (id, camara_id)')
            .eq('id', pauta_id)
            .single();

        if (pautaError || !pauta) {
            return res.status(404).json({ error: 'Pauta não encontrada.' });
        }

        if (pauta.status !== 'Em Votação') {
            return res.status(400).json({ error: 'Esta pauta não está em votação.' });
        }

        if (pauta.sessoes.camara_id !== profile.camara_id) {
            return res.status(403).json({ error: 'Você só pode votar em pautas da sua câmara.' });
        }

        const { data: vereadorData, error: vereadorError } = await supabaseAdmin
            .from('vereadores')
            .select('id, is_presidente, is_vice_presidente, partido_id')
            .eq('profile_id', user.id)
            .single();

        if (vereadorError || !vereadorData) {
            return res.status(404).json({ error: 'Dados do vereador não encontrados.' });
        }

        const { data: votoExistente } = await supabaseAdmin
            .from('votos')
            .select('id, voto')
            .eq('pauta_id', pauta_id)
            .eq('vereador_id', vereadorData.id)
            .single();

        const votoPayload = {
            voto: votoEnum,
            era_presidente_no_voto: vereadorData.is_presidente,
            era_vice_presidente_no_voto: vereadorData.is_vice_presidente,
            partido_id_no_voto: vereadorData.partido_id,
        };

        if (votoExistente) {
            const { data: votoAtualizado, error: updateError } = await supabaseAdmin
                .from('votos')
                .update(votoPayload)
                .eq('id', votoExistente.id)
                .select()
                .single();

            if (updateError) {
                logger.error('Erro ao atualizar voto.', { error: updateError.message });
                return res.status(500).json({ error: 'Erro ao atualizar voto.' });
            }

            logger.info('✅ Voto atualizado.', { votoId: votoAtualizado.id });
            return res.status(200).json({ message: 'Voto atualizado com sucesso.', voto: votoAtualizado });

        } else {
            const { data: novoVoto, error: createError } = await supabaseAdmin
                .from('votos')
                .insert({ pauta_id, vereador_id: vereadorData.id, ...votoPayload })
                .select()
                .single();

            if (createError) {
                logger.error('Erro ao registrar voto.', { error: createError.message });
                return res.status(500).json({ error: 'Erro ao registrar voto.' });
            }

            logger.info('✅ Voto registrado.', { votoId: novoVoto.id });
            return res.status(201).json({ message: 'Voto registrado com sucesso.', voto: novoVoto });
        }

    } catch (error) {
        logger.error('Erro crítico ao registrar voto.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao registrar voto.' });
    }
};

/**
 * Returns all votes cast by the authenticated council member.
 *
 * The response includes both the ordered vote list and an agenda-ID index for
 * efficient tablet lookups.
 *
 * @param {import('express').Request} req - Request containing authenticated user.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Council member votes response.
 */
const getVotosDoVereador = async (req, res) => {
    const { user } = req;
    logger.info(`Buscando votos do vereador ${user.id}`);

    try {
        const { data: vereadorData, error: vereadorError } = await supabaseAdmin
            .from('vereadores').select('id').eq('profile_id', user.id).single();

        if (vereadorError || !vereadorData) {
            return res.status(404).json({ error: 'Dados do vereador não encontrados.' });
        }

        const { data: votos, error: votosError } = await supabaseAdmin
            .from('votos')
            .select(`
                id, pauta_id, voto, created_at,
                era_presidente_no_voto, era_vice_presidente_no_voto,
                pautas ( id, nome, status, resultado_votacao )
            `)
            .eq('vereador_id', vereadorData.id)
            .order('created_at', { ascending: false });

        if (votosError) {
            return res.status(500).json({ error: 'Erro ao buscar votos.' });
        }

        const votosPorPauta = {};
        votos.forEach(v => { votosPorPauta[v.pauta_id] = v; });

        logger.info(`✅ ${votos.length} votos encontrados.`);
        return res.status(200).json({ votos, votosPorPauta });

    } catch (error) {
        logger.error('Erro crítico ao buscar votos.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao buscar votos.' });
    }
};

/**
 * Returns the authenticated council member vote for one agenda item.
 *
 * A missing vote is a valid response and returns `{ voto: null }`.
 *
 * @param {import('express').Request} req - Request containing authenticated user and agenda ID.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Agenda vote response.
 */
const getVotoEmPauta = async (req, res) => {
    const { user } = req;
    const { pauta_id } = req.params;

    try {
        const { data: vereadorData, error: vereadorError } = await supabaseAdmin
            .from('vereadores').select('id').eq('profile_id', user.id).single();

        if (vereadorError || !vereadorData) {
            return res.status(404).json({ error: 'Dados do vereador não encontrados.' });
        }

        const { data: voto, error: votoError } = await supabaseAdmin
            .from('votos')
            .select('id, pauta_id, voto, created_at, era_presidente_no_voto, era_vice_presidente_no_voto')
            .eq('pauta_id', pauta_id)
            .eq('vereador_id', vereadorData.id)
            .single();

        if (votoError && votoError.code !== 'PGRST116') {
            return res.status(500).json({ error: 'Erro ao buscar voto.' });
        }

        if (!voto) {
            return res.status(200).json({ voto: null, message: 'Vereador ainda não votou nesta pauta.' });
        }

        logger.info(`✅ Voto encontrado: ${voto.voto}`);
        return res.status(200).json({ voto });

    } catch (error) {
        logger.error('Erro crítico ao buscar voto em pauta.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao buscar voto.' });
    }
};

/**
 * Returns current vote totals for an agenda item.
 *
 * Access is restricted to agenda items from the authenticated council member's
 * chamber.
 *
 * @param {import('express').Request} req - Request containing authenticated user and agenda ID.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Agenda vote statistics response.
 */
const getEstatisticasPauta = async (req, res) => {
    const { user } = req;
    const { pauta_id } = req.params;

    try {
        const { data: vereadorData, error: vereadorError } = await supabaseAdmin
            .from('vereadores').select('id, camara_id').eq('profile_id', user.id).single();

        if (vereadorError || !vereadorData) {
            return res.status(404).json({ error: 'Dados do vereador não encontrados.' });
        }

        const { data: pauta, error: pautaError } = await supabaseAdmin
            .from('pautas')
            .select('id, nome, status, sessoes!inner (camara_id)')
            .eq('id', pauta_id)
            .single();

        if (pautaError || !pauta) {
            return res.status(404).json({ error: 'Pauta não encontrada.' });
        }

        if (pauta.sessoes.camara_id !== vereadorData.camara_id) {
            return res.status(403).json({ error: 'Acesso negado — pauta de outra câmara.' });
        }

        const { data: votos, error: votosError } = await supabaseAdmin
            .from('votos').select('voto').eq('pauta_id', pauta_id);

        if (votosError) {
            return res.status(500).json({ error: 'Erro ao buscar votos.' });
        }

        const estatisticas = {
            total: votos.length,
            sim: votos.filter(v => v.voto === 'SIM').length,
            nao: votos.filter(v => v.voto === 'NÃO').length,
            abstencao: votos.filter(v => v.voto === 'ABSTENÇÃO').length,
        };

        logger.info('✅ Estatísticas calculadas.', estatisticas);
        return res.status(200).json({
            pauta: { id: pauta.id, nome: pauta.nome, status: pauta.status },
            estatisticas,
        });

    } catch (error) {
        logger.error('Erro crítico ao buscar estatísticas.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao buscar estatísticas.' });
    }
};

module.exports = { registrarVoto, getVotosDoVereador, getVotoEmPauta, getEstatisticasPauta };
