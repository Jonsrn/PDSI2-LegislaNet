const { supabaseAdmin } = require('../config/supabase');
const createLogger = require('../config/logger');
const logger = createLogger('PAUTA_CONTROLLER');

/**
 * Shared Supabase projection used when returning agenda data to the tablet app.
 *
 * Includes the related session so requests can be restricted to the council
 * chamber associated with the authenticated profile.
 *
 * @type {string}
 */
const PAUTA_SELECT_BASE = `
    id,
    nome,
    descricao,
    anexo_url,
    status,
    resultado_votacao,
    autor,
    created_at,
    votacao_simbolica,
    ao_vivo,
    sessoes!inner (
        id,
        nome,
        tipo,
        status,
        data_sessao,
        camara_id
    )
`;

/**
 * Lists agenda items for the authenticated council member chamber.
 *
 * Results are grouped by status and paginated with `page` and `limit` query
 * parameters. Live voting agenda items are fetched separately so active votes
 * remain visible even when they fall outside the current page.
 *
 * @param {import('express').Request} req - Request containing profile and pagination query.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Grouped agenda list response.
 */
const getPautasDaCamara = async (req, res) => {
    const { profile } = req;
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    logger.info(`Buscando pautas da câmara ${profile.camara_id}, página ${page}`);

    try {
        let { data: pautas, error, count } = await supabaseAdmin
            .from('pautas')
            .select(PAUTA_SELECT_BASE, { count: 'exact' })
            .eq('sessoes.camara_id', profile.camara_id)
            .order('created_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (error) {
            logger.error('Erro ao buscar pautas.', { error: error.message });
            return res.status(500).json({ error: 'Erro ao buscar pautas.' });
        }

        const { data: aoVivoData } = await supabaseAdmin
            .from('pautas')
            .select(PAUTA_SELECT_BASE)
            .eq('sessoes.camara_id', profile.camara_id)
            .eq('status', 'Em Votação')
            .eq('ao_vivo', true)
            .order('created_at', { ascending: false })
            .limit(10);

        const pautasAoVivo = aoVivoData || [];
        const pautasList = pautas || [];

        const byId = new Map();
        [...pautasAoVivo, ...pautasList.filter(p => p.status === 'Em Votação' && p.ao_vivo === true)]
            .forEach(p => { if (p?.id) byId.set(p.id, p); });

        const pautasOrganizadas = {
            pendentes: pautasList.filter(p => p.status === 'Pendente'),
            emVotacao: Array.from(byId.values()),
            finalizadas: pautasList.filter(p => p.status === 'Finalizada'),
        };

        logger.info('✅ Pautas encontradas.', {
            pendentes: pautasOrganizadas.pendentes.length,
            emVotacao: pautasOrganizadas.emVotacao.length,
            finalizadas: pautasOrganizadas.finalizadas.length,
        });

        return res.status(200).json({
            data: pautasOrganizadas,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count,
                totalPages: Math.ceil(count / Number(limit)),
            },
        });

    } catch (error) {
        logger.error('Erro crítico ao buscar pautas.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao buscar pautas.' });
    }
};

/**
 * Fetches one agenda item by ID for the authenticated council member chamber.
 *
 * @param {import('express').Request} req - Request containing profile and agenda ID.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Agenda detail response.
 */
const getPautaById = async (req, res) => {
    const { profile } = req;
    const { id } = req.params;

    logger.info(`Buscando pauta ${id}`);

    try {
        const { data: pauta, error } = await supabaseAdmin
            .from('pautas')
            .select(PAUTA_SELECT_BASE)
            .eq('id', id)
            .eq('sessoes.camara_id', profile.camara_id)
            .single();

        if (error || !pauta) {
            logger.warn('Pauta não encontrada.', { id });
            return res.status(404).json({ error: 'Pauta não encontrada.' });
        }

        logger.info('✅ Pauta encontrada.', { id: pauta.id, status: pauta.status });
        return res.status(200).json(pauta);

    } catch (error) {
        logger.error('Erro crítico ao buscar pauta.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao buscar pauta.' });
    }
};

/**
 * Returns vote statistics for an agenda item in the current chamber.
 *
 * The response includes all votes, total counts by vote type, the president
 * vote when present, and the final agenda result.
 *
 * @param {import('express').Request} req - Request containing profile and agenda ID.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Vote statistics response.
 */
const getEstatisticasVotacao = async (req, res) => {
    const { profile } = req;
    const { id } = req.params;

    logger.info(`Buscando estatísticas da pauta ${id}`);

    try {
        const { data: pauta, error: pautaError } = await supabaseAdmin
            .from('pautas')
            .select('id, status, resultado_votacao, sessoes!inner (camara_id)')
            .eq('id', id)
            .eq('sessoes.camara_id', profile.camara_id)
            .single();

        if (pautaError || !pauta) {
            return res.status(404).json({ error: 'Pauta não encontrada.' });
        }

        const { data: votos, error: votosError } = await supabaseAdmin
            .from('votos')
            .select(`
                id,
                voto,
                created_at,
                era_presidente_no_voto,
                era_vice_presidente_no_voto,
                vereadores ( id, nome_parlamentar )
            `)
            .eq('pauta_id', id);

        if (votosError) {
            logger.error('Erro ao buscar votos.', { error: votosError.message });
            return res.status(500).json({ error: 'Erro ao buscar votos.' });
        }

        const estatisticas = {
            total: votos.length,
            sim: votos.filter(v => v.voto === 'SIM').length,
            nao: votos.filter(v => v.voto === 'NÃO').length,
            abstencao: votos.filter(v => v.voto === 'ABSTENÇÃO').length,
            voto_presidente: votos.find(v => v.era_presidente_no_voto)?.voto || null,
            resultado: pauta.resultado_votacao,
        };

        logger.info('✅ Estatísticas calculadas.', estatisticas);

        return res.status(200).json({
            pauta: { id: pauta.id, status: pauta.status, resultado_votacao: pauta.resultado_votacao },
            votos,
            estatisticas,
        });

    } catch (error) {
        logger.error('Erro crítico ao buscar estatísticas.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao buscar estatísticas.' });
    }
};

module.exports = { getPautasDaCamara, getPautaById, getEstatisticasVotacao };
