/**
 * Livestream Controller
 *
 * Express handlers for querying chamber livestreams and triggering manual
 * livestream checks.
 */

const livestreamService = require('../services/livestreamService');
const youtubeService = require('../services/youtubeService');

const logger = {
    log: (...args) => console.log('[LIVESTREAM_CONTROLLER]', new Date().toISOString(), '-', ...args),
    error: (...args) => console.error('[LIVESTREAM_CONTROLLER ERROR]', new Date().toISOString(), '-', ...args)
};

/**
 * GET /api/livestreams/camara/:camaraId/current
 *
 * Returns the currently active livestream for a chamber.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getCurrentLivestream = async (req, res) => {
    const { camaraId } = req.params;

    try {
        logger.log(`Buscando livestream atual da câmara: ${camaraId}`);

        const currentLivestream = await livestreamService.getCurrentLivestream(camaraId);

        if (!currentLivestream) {
            return res.status(404).json({
                message: 'Nenhuma livestream ativa encontrada',
                data: null
            });
        }

        logger.log(`Livestream atual encontrada: ${currentLivestream.title}`);

        res.json({
            message: 'Livestream atual encontrada',
            data: currentLivestream
        });

    } catch (error) {
        logger.error('Erro ao buscar livestream atual:', error.message);
        res.status(500).json({
            error: 'Erro interno do servidor',
            message: error.message
        });
    }
};

/**
 * GET /api/livestreams/camara/:camaraId/last
 *
 * Returns the most recent finished livestream for a chamber.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getLastLivestream = async (req, res) => {
    const { camaraId } = req.params;

    try {
        logger.log(`Buscando última livestream da câmara: ${camaraId}`);

        const lastLivestream = await livestreamService.getLastLivestream(camaraId);

        if (!lastLivestream) {
            return res.status(404).json({
                message: 'Nenhuma livestream finalizada encontrada',
                data: null
            });
        }

        logger.log(`Última livestream encontrada: ${lastLivestream.title}`);

        res.json({
            message: 'Última livestream encontrada',
            data: lastLivestream
        });

    } catch (error) {
        logger.error('Erro ao buscar última livestream:', error.message);
        res.status(500).json({
            error: 'Erro interno do servidor',
            message: error.message
        });
    }
};

/**
 * GET /api/livestreams/camara/:camaraId
 *
 * Lists chamber livestreams with pagination and optional status filtering.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getCamaraLivestreams = async (req, res) => {
    const { camaraId } = req.params;
    const {
        page = 1,
        limit = 10,
        status = null
    } = req.query;

    try {
        logger.log(`Listando livestreams da câmara: ${camaraId} (página ${page})`);

        const result = await livestreamService.getCamaraLivestreams(camaraId, {
            page: parseInt(page),
            limit: parseInt(limit),
            status
        });

        logger.log(`Encontradas ${result.data.length} livestreams (total: ${result.pagination.total})`);

        res.json({
            message: 'Livestreams encontradas',
            data: result.data,
            pagination: result.pagination
        });

    } catch (error) {
        logger.error('Erro ao listar livestreams:', error.message);
        res.status(500).json({
            error: 'Erro interno do servidor',
            message: error.message
        });
    }
};

/**
 * GET /api/livestreams/camara/:camaraId/display
 *
 * Returns the active livestream for portal display, falling back to the most
 * recent livestream when no live stream is active.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getDisplayLivestream = async (req, res) => {
    const { camaraId } = req.params;

    try {
        logger.log(`Buscando livestream para exibição da câmara: ${camaraId}`);

        let livestream = await livestreamService.getCurrentLivestream(camaraId);
        let isLive = true;

        if (!livestream) {
            livestream = await livestreamService.getLastLivestream(camaraId);
            isLive = false;
        }

        if (!livestream) {
            return res.status(404).json({
                message: 'Nenhuma livestream encontrada para exibição',
                data: null,
                isLive: false
            });
        }

        logger.log(`Livestream para exibição: ${livestream.title} (${isLive ? 'AO VIVO' : 'ÚLTIMA'})`);

        res.json({
            message: `Livestream ${isLive ? 'ao vivo' : 'mais recente'} encontrada`,
            data: livestream,
            isLive
        });

    } catch (error) {
        logger.error('Erro ao buscar livestream para exibição:', error.message);
        res.status(500).json({
            error: 'Erro interno do servidor',
            message: error.message
        });
    }
};

/**
 * POST /api/livestreams/camara/:camaraId/check
 *
 * Forces an immediate livestream check for a chamber with a configured YouTube
 * channel ID.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const forceCheckCamara = async (req, res) => {
    const { camaraId } = req.params;

    try {
        logger.log(`Forçando verificação da câmara: ${camaraId}`);

        const supabaseAdmin = require('../config/supabaseAdminClient');
        const { data: camara, error } = await supabaseAdmin
            .from('camaras')
            .select('id, nome_camara, youtube_channel_id')
            .eq('id', camaraId)
            .single();

        if (error || !camara) {
            return res.status(404).json({
                error: 'Câmara não encontrada',
                message: 'ID da câmara inválido ou não existe'
            });
        }

        if (!camara.youtube_channel_id) {
            return res.status(400).json({
                error: 'Câmara não configurada',
                message: 'Câmara não possui Channel ID do YouTube configurado'
            });
        }

        await livestreamService.checkCamaraLivestreams(camara.id, camara.youtube_channel_id);

        logger.log(`Verificação forçada concluída para: ${camara.nome_camara}`);

        res.json({
            message: 'Verificação de livestreams executada com sucesso',
            camara: {
                id: camara.id,
                nome: camara.nome_camara
            }
        });

    } catch (error) {
        logger.error('Erro na verificação forçada:', error.message);
        res.status(500).json({
            error: 'Erro interno do servidor',
            message: error.message
        });
    }
};

/**
 * GET /api/livestreams/status
 *
 * Returns livestream system health, YouTube API connectivity, and aggregate
 * livestream counts.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getSystemStatus = async (req, res) => {
    try {
        logger.log('Verificando status do sistema de livestreams');

        const youtubeConnected = await youtubeService.testConnection();

        const supabaseAdmin = require('../config/supabaseAdminClient');

        const { count: totalCamaras } = await supabaseAdmin
            .from('camaras')
            .select('id', { count: 'exact', head: true })
            .not('youtube_channel_id', 'is', null)
            .neq('youtube_channel_id', '');

        const { count: activeLivestreams } = await supabaseAdmin
            .from('livestreams')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'live');

        const { count: totalLivestreams } = await supabaseAdmin
            .from('livestreams')
            .select('id', { count: 'exact', head: true });

        res.json({
            message: 'Status do sistema de livestreams',
            data: {
                youtube_api_connected: youtubeConnected,
                cameras_configured: totalCamaras || 0,
                active_livestreams: activeLivestreams || 0,
                total_livestreams: totalLivestreams || 0,
                last_check: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Erro ao verificar status do sistema:', error.message);
        res.status(500).json({
            error: 'Erro interno do servidor',
            message: error.message
        });
    }
};

module.exports = {
    getCurrentLivestream,
    getLastLivestream,
    getCamaraLivestreams,
    getDisplayLivestream,
    forceCheckCamara,
    getSystemStatus
};
