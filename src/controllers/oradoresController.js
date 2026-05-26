const supabaseAdmin = require('../config/supabaseAdminClient');
const createLogger = require('../utils/logger');
const logger = createLogger('ORADORES_CONTROLLER');

/**
 * Controller actions for managing session speakers.
 *
 * @module controllers/oradoresController
 */

/**
 * Creates a speaker for a session after validating camara ownership and duplicate registration.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const createOrador = async (req, res) => {
    try {
        const { profile } = req;
        const { sessao_id, vereador_id, tempo_fala_minutos } = req.body;
        
        logger.log(`Criando orador: sessao_id=${sessao_id}, vereador_id=${vereador_id}, tempo=${tempo_fala_minutos}`);

        if (!sessao_id || !vereador_id) {
            return res.status(400).json({ 
                error: 'Sessão e vereador são obrigatórios' 
            });
        }

        const { data: sessao, error: sessaoError } = await supabaseAdmin
            .from('sessoes')
            .select('id, camara_id')
            .eq('id', sessao_id)
            .eq('camara_id', profile.camara_id)
            .single();

        if (sessaoError || !sessao) {
            return res.status(404).json({ 
                error: 'Sessão não encontrada ou não pertence à sua câmara' 
            });
        }

        const { data: vereador, error: vereadorError } = await supabaseAdmin
            .from('vereadores')
            .select('id, camara_id')
            .eq('id', vereador_id)
            .eq('camara_id', profile.camara_id)
            .eq('is_active', true)
            .single();

        if (vereadorError || !vereador) {
            return res.status(404).json({ 
                error: 'Vereador não encontrado ou não ativo na sua câmara' 
            });
        }

        const { data: oradorExistente, error: checkError } = await supabaseAdmin
            .from('oradores')
            .select('id')
            .eq('sessao_id', sessao_id)
            .eq('vereador_id', vereador_id)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            logger.error('Erro ao verificar orador existente:', checkError);
            return res.status(500).json({ error: 'Erro ao verificar duplicidade' });
        }

        if (oradorExistente) {
            return res.status(409).json({ 
                error: 'Este vereador já está cadastrado como orador nesta sessão' 
            });
        }

        const { data: ultimaOrdem, error: ordemError } = await supabaseAdmin
            .from('oradores')
            .select('ordem')
            .eq('sessao_id', sessao_id)
            .order('ordem', { ascending: false })
            .limit(1);

        const proximaOrdem = (ultimaOrdem && ultimaOrdem.length > 0) 
            ? ultimaOrdem[0].ordem + 1 
            : 1;

        const { data: novoOrador, error: insertError } = await supabaseAdmin
            .from('oradores')
            .insert({
                sessao_id,
                vereador_id,
                ordem: proximaOrdem,
                tempo_fala_minutos: tempo_fala_minutos || null
            })
            .select(`
                id,
                ordem,
                tempo_fala_minutos,
                vereadores (
                    nome_parlamentar,
                    partidos (sigla, nome)
                ),
                sessoes (
                    nome,
                    data_sessao
                )
            `)
            .single();

        if (insertError) {
            logger.error('Erro ao criar orador:', insertError);
            return res.status(500).json({ error: 'Erro ao cadastrar orador' });
        }

        logger.log(`Orador criado com sucesso: ID=${novoOrador.id}, ordem=${proximaOrdem}`);
        
        res.status(201).json({
            message: 'Orador cadastrado com sucesso!',
            data: novoOrador
        });

    } catch (error) {
        logger.error('Erro inesperado ao criar orador:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

/**
 * Lists speakers for a specific session owned by the authenticated user's camara.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getOradoresBySessao = async (req, res) => {
    try {
        const { profile } = req;
        const { sessaoId } = req.params;

        logger.log(`Buscando oradores da sessão ID: ${sessaoId}`);

        const { data: sessao, error: sessaoError } = await supabaseAdmin
            .from('sessoes')
            .select('id, camara_id')
            .eq('id', sessaoId)
            .eq('camara_id', profile.camara_id)
            .single();

        if (sessaoError || !sessao) {
            return res.status(404).json({ 
                error: 'Sessão não encontrada ou não pertence à sua câmara' 
            });
        }

        const { data: oradores, error } = await supabaseAdmin
            .from('oradores')
            .select(`
                id,
                ordem,
                tempo_fala_minutos,
                created_at,
                vereadores (
                    id,
                    nome_parlamentar,
                    foto_url,
                    partidos (
                        id,
                        nome,
                        sigla,
                        logo_url
                    )
                )
            `)
            .eq('sessao_id', sessaoId)
            .order('ordem', { ascending: true });

        if (error) {
            logger.error('Erro ao buscar oradores:', error);
            return res.status(500).json({ error: 'Erro ao buscar oradores' });
        }

        logger.log(`Encontrados ${oradores.length} oradores para a sessão ${sessaoId}`);
        res.json({ data: oradores });

    } catch (error) {
        logger.error('Erro inesperado ao buscar oradores:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

/**
 * Updates the speaking time assigned to a speaker.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const updateTempoOrador = async (req, res) => {
    try {
        const { profile } = req;
        const { id } = req.params;
        const { tempo_fala_minutos } = req.body;

        logger.log(`Atualizando tempo do orador ID: ${id} para ${tempo_fala_minutos} minutos`);

        const { data: orador, error: checkError } = await supabaseAdmin
            .from('oradores')
            .select(`
                id,
                sessoes!inner(camara_id)
            `)
            .eq('id', id)
            .eq('sessoes.camara_id', profile.camara_id)
            .single();

        if (checkError || !orador) {
            return res.status(404).json({ 
                error: 'Orador não encontrado ou não pertence à sua câmara' 
            });
        }

        const { data: oradorAtualizado, error: updateError } = await supabaseAdmin
            .from('oradores')
            .update({ tempo_fala_minutos })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            logger.error('Erro ao atualizar orador:', updateError);
            return res.status(500).json({ error: 'Erro ao atualizar tempo de fala' });
        }

        logger.log(`Tempo do orador ${id} atualizado com sucesso`);
        res.json({
            message: 'Tempo de fala atualizado com sucesso!',
            data: oradorAtualizado
        });

    } catch (error) {
        logger.error('Erro inesperado ao atualizar orador:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

/**
 * Deletes a speaker and reorders the remaining speakers in the same session.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const deleteOrador = async (req, res) => {
    try {
        const { profile } = req;
        const { id } = req.params;

        logger.log(`Removendo orador ID: ${id}`);

        const { data: orador, error: checkError } = await supabaseAdmin
            .from('oradores')
            .select(`
                id,
                ordem,
                sessao_id,
                sessoes!inner(camara_id)
            `)
            .eq('id', id)
            .eq('sessoes.camara_id', profile.camara_id)
            .single();

        if (checkError || !orador) {
            return res.status(404).json({ 
                error: 'Orador não encontrado ou não pertence à sua câmara' 
            });
        }

        const { error: deleteError } = await supabaseAdmin
            .from('oradores')
            .delete()
            .eq('id', id);

        if (deleteError) {
            logger.error('Erro ao remover orador:', deleteError);
            return res.status(500).json({ error: 'Erro ao remover orador' });
        }

        const { data: oradoresParaReordenar, error: reorderError } = await supabaseAdmin
            .from('oradores')
            .select('id, ordem')
            .eq('sessao_id', orador.sessao_id)
            .gt('ordem', orador.ordem)
            .order('ordem', { ascending: true });

        if (reorderError) {
            logger.warn('Aviso: Erro ao buscar oradores para reordenação:', reorderError);
        } else if (oradoresParaReordenar && oradoresParaReordenar.length > 0) {
            for (const oradorReorder of oradoresParaReordenar) {
                const { error: updateError } = await supabaseAdmin
                    .from('oradores')
                    .update({ ordem: oradorReorder.ordem - 1 })
                    .eq('id', oradorReorder.id);
                
                if (updateError) {
                    logger.warn(`Aviso: Erro ao reordenar orador ${oradorReorder.id}:`, updateError);
                }
            }
        }

        logger.log(`Orador ${id} removido com sucesso`);
        res.json({ message: 'Orador removido com sucesso!' });

    } catch (error) {
        logger.error('Erro inesperado ao remover orador:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

/**
 * Lists all speakers associated with the authenticated user's camara.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {Promise<void>}
 */
const getAllOradores = async (req, res) => {
    try {
        const { profile } = req;

        logger.log(`Buscando todos os oradores da câmara ID: ${profile.camara_id}`);

        const { data: oradores, error } = await supabaseAdmin
            .from('oradores')
            .select(`
                id,
                ordem,
                tempo_fala_minutos,
                created_at,
                vereadores (
                    id,
                    nome_parlamentar,
                    foto_url,
                    partidos (
                        id,
                        nome,
                        sigla,
                        logo_url
                    )
                ),
                sessoes!inner (
                    id,
                    nome,
                    tipo,
                    data_sessao,
                    status
                )
            `)
            .eq('sessoes.camara_id', profile.camara_id);

        if (error) {
            logger.error('Erro ao buscar oradores:', error);
            return res.status(500).json({ error: 'Erro ao buscar oradores' });
        }

        logger.log(`Encontrados ${oradores.length} oradores na câmara ${profile.camara_id}`);
        res.json({ data: oradores });

    } catch (error) {
        logger.error('Erro inesperado ao buscar oradores:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

module.exports = {
    createOrador,
    getOradoresBySessao,
    updateTempoOrador,
    deleteOrador,
    getAllOradores
};
