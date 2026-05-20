const { supabaseAdmin } = require('../config/supabase');
const createLogger = require('../config/logger');
const logger = createLogger('AUTH_MIDDLEWARE');

/**
 * Decodes the payload section of a JWT without verifying the signature.
 *
 * The middleware only uses this helper to read the token `iat` value for
 * single-session enforcement.
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
 * Authenticates requests that require a council member session.
 *
 * Validates the bearer token with Supabase Auth, loads the matching profile,
 * enforces the `vereador` role, and rejects tokens older than the profile
 * `min_token_iat` value. On success, attaches `user` and `profile` to the
 * request for downstream controllers.
 *
 * @param {import('express').Request} req - Incoming HTTP request.
 * @param {import('express').Response} res - HTTP response object.
 * @param {import('express').NextFunction} next - Express continuation callback.
 * @returns {Promise<import('express').Response|void>} Authentication result or continuation.
 */
const authenticateVereador = async (req, res, next) => {
    logger.info('--- VERIFICANDO AUTENTICAÇÃO DE VEREADOR ---');

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de acesso ausente ou mal formatado.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
            logger.error('Token inválido ou expirado.', { error: userError?.message });
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role, camara_id, min_token_iat, nome')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            logger.error('Perfil não encontrado.', { userId: user.id });
            return res.status(404).json({ error: 'Perfil de usuário não encontrado.' });
        }

        if (profile.role !== 'vereador') {
            logger.error('Role inválida.', { role: profile.role });
            return res.status(403).json({ error: 'Acesso negado. Apenas vereadores podem acessar esta aplicação.' });
        }

        const payload = decodeJwtPayload(token);
        if (!payload || payload.iat < profile.min_token_iat) {
            logger.warn('Token de sessão antiga detectado.', { tokenIat: payload?.iat, minIat: profile.min_token_iat });
            return res.status(401).json({ error: 'Sessão expirada. Por favor, faça login novamente.' });
        }

        req.user = user;
        req.profile = profile;

        logger.info(`✅ Acesso autorizado: ${profile.nome} (câmara: ${profile.camara_id})`);
        next();

    } catch (error) {
        logger.error('Erro crítico na autenticação.', { error: error.message });
        return res.status(500).json({ error: 'Erro interno no servidor durante a autenticação.' });
    }
};

module.exports = { authenticateVereador };
