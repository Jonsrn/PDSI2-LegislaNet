const { createClient } = require('@supabase/supabase-js');
const createLogger = require('../utils/logger');
const logger = createLogger('PARTIDO_CONTROLLER');

/**
 * Controller actions for partido lookup routes.
 *
 * @module controllers/partidoController
 */

/**
 * Lists partidos visible to the authenticated user with optional search and pagination.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getAllPartidos = async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 1000;
    const searchTerm = req.query.search || '';
    const offset = (page - 1) * limit;

    logger.log(`Buscando partidos... Página: ${page}, Limite: ${limit}, Busca: "${searchTerm}"`);
    
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Token de autenticação ausente.' });
        }

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        let query = supabase
            .from('partidos')
            .select('id, nome, sigla, logo_url', { count: 'exact' });

        if (searchTerm) {
            query = query.or(`nome.ilike.%${searchTerm}%,sigla.ilike.%${searchTerm}%`);
        }

        const { data, error, count } = await query
            .order('nome', { ascending: true })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        
        logger.log(`Encontrados ${data.length} partidos de um total de ${count}.`);
        
        res.status(200).json({ data, count });

    } catch (error) {
        logger.error('Erro ao buscar partidos.', error.message);
        res.status(500).json({ error: 'Erro ao buscar partidos.' });
    }
};

module.exports = { getAllPartidos };
