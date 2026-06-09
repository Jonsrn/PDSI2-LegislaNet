const { supabaseAdmin } = require('../config/supabase');
const createLogger = require('../config/logger');
const logger = createLogger('TABLET_PAUTA_CONTROLLER');

/**
 * Lists pautas for the authenticated vereador chamber, grouped by status.
 *
 * Live-voting pautas are fetched best-effort outside the current page so the
 * tablet app can open an active voting screen even when pagination excludes it.
 *
 * @param {import('express').Request} req - Request containing profile and pagination query.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<import('express').Response|void>} Grouped pauta response.
 */
const getPautasDaCamara = async (req, res) => {
    const { profile } = req;
    const { page = 1, limit = 50 } = req.query;

    logger.info(`Buscando pautas da câmara ${profile.camara_id}, página ${page}`);

    try {
        const offset = (page - 1) * limit;

        const selectWithAoVivo = `
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

        const selectWithoutAoVivo = `
                id,
                nome,
                descricao,
                anexo_url,
                status,
                resultado_votacao,
                autor,
                created_at,
                votacao_simbolica,
                sessoes!inner (
                    id,
                    nome,
                    tipo,
                    status,
                    data_sessao,
                    camara_id
                )
            `;

        let aoVivoSupported = true;
        let { data: pautas, error, count } = await supabaseAdmin
            .from('pautas')
            .select(selectWithAoVivo, { count: 'exact' })
            .eq('sessoes.camara_id', profile.camara_id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Backward-compatible fallback for databases that do not have ao_vivo yet.
        if (error) {
            const msg = (error?.message || '').toLowerCase();
            const missingAoVivoColumn =
                msg.includes('ao_vivo') &&
                (msg.includes('does not exist') || msg.includes('column') || msg.includes('schema'));

            if (missingAoVivoColumn) {
                aoVivoSupported = false;
                logger.warn('⚠️ Coluna ao_vivo ausente; listando pautas sem filtro ao vivo (fallback compatível)');
                ({ data: pautas, error, count } = await supabaseAdmin
                    .from('pautas')
                    .select(selectWithoutAoVivo, { count: 'exact' })
                    .eq('sessoes.camara_id', profile.camara_id)
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1));
            }
        }

        if (error) {
            logger.error('Erro ao buscar pautas:', { error: error.message });
            return res.status(500).json({ error: 'Erro ao buscar pautas.' });
        }

        let pautasAoVivo = [];
        if (aoVivoSupported) {
            const { data: aoVivoData, error: aoVivoError } = await supabaseAdmin
                .from('pautas')
                .select(selectWithAoVivo)
                .eq('sessoes.camara_id', profile.camara_id)
                .eq('status', 'Em Votação')
                .eq('ao_vivo', true)
                .order('created_at', { ascending: false })
                .limit(10);

            if (aoVivoError) {
                logger.warn('⚠️ Falha ao buscar pautas ao vivo (best-effort):', { error: aoVivoError.message });
            } else {
                pautasAoVivo = aoVivoData || [];
            }
        }

        const pautasList = Array.isArray(pautas) ? pautas : [];

        // When ao_vivo exists, show only truly live "Em Votação" pautas.
        let emVotacao = [];
        if (aoVivoSupported) {
            const emVotacaoFromPage = pautasList.filter(
                (p) => p.status === 'Em Votação' && p.ao_vivo === true
            );
            const byId = new Map();
            [...pautasAoVivo, ...emVotacaoFromPage].forEach((p) => {
                if (p?.id != null) byId.set(p.id, p);
            });
            emVotacao = Array.from(byId.values());
        } else {
            emVotacao = pautasList.filter(p => p.status === 'Em Votação');
        }

        const pautasOrganizadas = {
            pendentes: pautasList.filter(p => p.status === 'Pendente'),
            emVotacao,
            finalizadas: pautasList.filter(p => p.status === 'Finalizada')
        };

        logger.info(`✅ Encontradas ${pautasList.length} pautas da câmara:`, {
            pendentes: pautasOrganizadas.pendentes.length,
            emVotacao: pautasOrganizadas.emVotacao.length,
            finalizadas: pautasOrganizadas.finalizadas.length,
            total: count,
            aoVivoSupported
        });

        res.status(200).json({
            data: pautasOrganizadas,
            meta: {
                aoVivoSupported
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                totalPages: Math.ceil(count / limit)
            }
        });

    } catch (error) {
        logger.error('Erro crítico ao buscar pautas:', {
            error: error.message,
            stack: error.stack,
            camaraId: profile.camara_id
        });
        res.status(500).json({ error: 'Erro interno ao buscar pautas.' });
    }
};

/**
 * Fetches one pauta by ID for the authenticated vereador chamber.
 *
 * @param {import('express').Request} req - Request containing profile and pauta ID.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<import('express').Response|void>} Pauta detail response.
 */
const getPautaById = async (req, res) => {
    const { profile } = req;
    const { id } = req.params;

    logger.info(`Buscando pauta ${id} da câmara ${profile.camara_id}`);

    try {
        const selectWithAoVivo = `
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
        const selectWithoutAoVivo = `
                id,
                nome,
                descricao,
                anexo_url,
                status,
                resultado_votacao,
                autor,
                created_at,
                votacao_simbolica,
                sessoes!inner (
                    id,
                    nome,
                    tipo,
                    status,
                    data_sessao,
                    camara_id
                )
            `;

        let { data: pauta, error } = await supabaseAdmin
            .from('pautas')
            .select(selectWithAoVivo)
            .eq('id', id)
            .eq('sessoes.camara_id', profile.camara_id)
            .single();

        if (error) {
            const msg = (error?.message || '').toLowerCase();
            const missingAoVivoColumn =
                msg.includes('ao_vivo') &&
                (msg.includes('does not exist') || msg.includes('column') || msg.includes('schema'));
            if (missingAoVivoColumn) {
                ({ data: pauta, error } = await supabaseAdmin
                    .from('pautas')
                    .select(selectWithoutAoVivo)
                    .eq('id', id)
                    .eq('sessoes.camara_id', profile.camara_id)
                    .single());
            }
        }

        if (error || !pauta) {
            logger.warn('Pauta não encontrada:', { pautaId: id, error: error?.message });
            return res.status(404).json({ error: 'Pauta não encontrada.' });
        }

        logger.info('✅ Pauta encontrada:', { pautaId: pauta.id, status: pauta.status });
        res.status(200).json(pauta);

    } catch (error) {
        logger.error('Erro crítico ao buscar pauta:', {
            error: error.message,
            stack: error.stack,
            pautaId: id
        });
        res.status(500).json({ error: 'Erro interno ao buscar pauta.' });
    }
};

/**
 * Returns voting statistics for a pauta in the authenticated vereador chamber.
 *
 * @param {import('express').Request} req - Request containing profile and pauta ID.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<import('express').Response|void>} Voting statistics response.
 */
const getEstatisticasVotacao = async (req, res) => {
    const { profile } = req;
    const { id } = req.params;

    logger.info(`Buscando estatísticas da pauta ${id}`);

    try {
        const { data: pauta, error: pautaError } = await supabaseAdmin
            .from('pautas')
            .select(`
                id,
                status,
                resultado_votacao,
                sessoes!inner (camara_id)
            `)
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
                vereadores (
                    id,
                    nome_parlamentar
                )
            `)
            .eq('pauta_id', id);

        if (votosError) {
            logger.error('Erro ao buscar votos:', { error: votosError.message });
            return res.status(500).json({ error: 'Erro ao buscar votos.' });
        }

        const stats = {
            total: votos.length,
            sim: votos.filter(v => v.voto === 'SIM').length,
            nao: votos.filter(v => v.voto === 'NÃO').length,
            abstencao: votos.filter(v => v.voto === 'ABSTENÇÃO').length,
            voto_presidente: votos.find(v => v.era_presidente_no_voto)?.voto || null,
            resultado: pauta.resultado_votacao
        };

        logger.info('✅ Estatísticas calculadas:', stats);

        res.status(200).json({
            pauta: {
                id: pauta.id,
                status: pauta.status,
                resultado_votacao: pauta.resultado_votacao
            },
            votos,
            estatisticas: stats
        });

    } catch (error) {
        logger.error('Erro crítico ao buscar estatísticas:', {
            error: error.message,
            stack: error.stack,
            pautaId: id
        });
        res.status(500).json({ error: 'Erro interno ao buscar estatísticas.' });
    }
};

module.exports = {
    getPautasDaCamara,
    getPautaById,
    getEstatisticasVotacao
};
