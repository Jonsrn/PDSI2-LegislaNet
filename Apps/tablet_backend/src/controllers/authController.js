const { supabasePublic, supabaseAdmin } = require('../config/supabase');
const { validationResult } = require('express-validator');
const createLogger = require('../config/logger');
const logger = createLogger('AUTH_CONTROLLER');

/**
 * Decodes the payload section of a JWT without verifying the signature.
 *
 * @param {string} token - JWT access token.
 * @returns {object|null} Parsed payload, or `null` when decoding fails.
 */
const decodeJwtPayload = (token) => {
    try {
        const payloadBase64 = token.split('.')[1];
        const decodedJson = Buffer.from(payloadBase64, 'base64').toString();
        return JSON.parse(decodedJson);
    } catch {
        return null;
    }
};

/**
 * Handles council member login requests.
 *
 * Authenticates credentials through Supabase, stores the current token issue
 * time in the profile to invalidate older sessions, and only allows users with
 * the `vereador` role.
 *
 * @param {import('express').Request} req - Login request containing email and password.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Login result response.
 */
const handleVereadorLogin = async (req, res) => {
    logger.info('=== INÍCIO DO PROCESSO DE LOGIN VEREADOR ===');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        const { data: authData, error: authError } = await supabasePublic.auth.signInWithPassword({
            email,
            password,
        });

        if (authError || !authData?.user || !authData?.session) {
            logger.error('Falha na autenticação.', { error: authError?.message });
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const { user, session } = authData;
        const accessToken = session.access_token;

        const payload = decodeJwtPayload(accessToken);
        if (!payload?.iat) {
            return res.status(500).json({ error: 'Falha ao processar o token da sessão.' });
        }

        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ min_token_iat: payload.iat })
            .eq('id', user.id);

        if (updateError) {
            logger.error('Erro ao atualizar min_token_iat.', { error: updateError.message });
            return res.status(500).json({ error: 'Falha ao iniciar sessão de forma segura.' });
        }

        const { data: profileData, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role, nome, camara_id')
            .eq('id', user.id)
            .single();

        if (profileError || !profileData) {
            return res.status(404).json({ error: 'Perfil de usuário não encontrado.' });
        }

        if (profileData.role !== 'vereador') {
            logger.error('Acesso negado. Role não é vereador.', { role: profileData.role });
            return res.status(403).json({ error: 'Acesso restrito a vereadores.' });
        }

        logger.info(`✅ Login bem-sucedido: ${profileData.nome}`);

        return res.status(200).json({
            message: 'Login bem-sucedido!',
            user: {
                id: user.id,
                email: user.email,
                nome: profileData.nome,
                role: profileData.role,
                camara_id: profileData.camara_id,
            },
            token: accessToken,
        });

    } catch (error) {
        logger.error('Erro inesperado no login.', { error: error.message, stack: error.stack });
        return res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
    }
};

/**
 * Handles council member logout requests.
 *
 * Signs out through Supabase and returns a JSON status response.
 *
 * @param {import('express').Request} req - Logout request.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {Promise<import('express').Response>} Logout result response.
 */
const handleVereadorLogout = async (req, res) => {
    logger.info('=== PROCESSO DE LOGOUT VEREADOR ===');
    try {
        await supabasePublic.auth.signOut();
        logger.info('✅ Logout realizado com sucesso.');
        return res.status(200).json({ message: 'Logout realizado com sucesso.' });
    } catch (error) {
        logger.error('Erro no logout.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno ao processar logout.' });
    }
};

module.exports = { handleVereadorLogin, handleVereadorLogout };
