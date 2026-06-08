/**
 * YouTube webhook controller.
 *
 * Handles YouTube push notifications and subscription verification through
 * PubSubHubbub.
 */

const youtubeWebhookService = require('../services/youtubeWebhookService');

const logger = {
    log: (...args) => console.log('[WEBHOOK_CONTROLLER]', new Date().toISOString(), '-', ...args),
    error: (...args) => console.error('[WEBHOOK_CONTROLLER ERROR]', new Date().toISOString(), '-', ...args)
};

/**
 * Handles YouTube webhook verification and notification callbacks.
 *
 * GET requests respond to subscription verification challenges. POST requests
 * validate optional HMAC signatures and process video or livestream updates.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
async function handleYouTubeWebhook(req, res) {
    try {
        const isProd = process.env.NODE_ENV === 'production';

        if (req.method === 'GET') {
            const {
                'hub.mode': mode,
                'hub.topic': topic,
                'hub.challenge': challenge,
                'hub.lease_seconds': leaseSeconds
            } = req.query;

            logger.log(`📋 Verificação de webhook: ${mode} para ${topic}`);

            if (isProd && !youtubeWebhookService.webhooksEnabled) {
                logger.error('Webhooks desabilitados em produção: verificação recusada');
                return res.status(503).json({
                    error: 'Webhooks do YouTube desabilitados (configuração incompleta)'
                });
            }

            if (mode && topic && challenge) {
                const responseChallenge = youtubeWebhookService.handleVerification(mode, topic, challenge);

                res.status(200)
                   .type('text/plain')
                   .send(responseChallenge);

                logger.log(`✅ Challenge respondido: ${challenge}`);
            } else {
                logger.error('Parâmetros de verificação inválidos');
                res.status(400).json({ error: 'Parâmetros de verificação inválidos' });
            }

        } else if (req.method === 'POST') {
            const signature = req.headers['x-hub-signature'];
            const body = req.body;

            logger.log('📨 Notificação recebida do YouTube');

            if (isProd && !youtubeWebhookService.webhooksEnabled) {
                logger.error('Webhooks desabilitados em produção: notificação recusada');
                return res.status(503).json({
                    error: 'Webhooks do YouTube desabilitados (configuração incompleta)'
                });
            }

            // Production requires HMAC signatures to prevent arbitrary payload ingestion.
            if (isProd && !signature) {
                logger.error('Assinatura HMAC ausente em produção');
                return res.status(401).json({ error: 'Assinatura obrigatória' });
            }

            if (signature) {
                const isValidSignature = youtubeWebhookService.verifySignature(body, signature);
                if (!isValidSignature) {
                    logger.error('Assinatura HMAC inválida');
                    return res.status(401).json({ error: 'Assinatura inválida' });
                }
            }

            const success = await youtubeWebhookService.processWebhookNotification(body);

            if (success) {
                logger.log('✅ Notificação processada com sucesso');
                res.status(200).json({ status: 'success', message: 'Notificação processada' });
            } else {
                logger.error('Erro ao processar notificação');
                res.status(500).json({ error: 'Erro ao processar notificação' });
            }

        } else {
            res.status(405).json({ error: 'Método não permitido' });
        }

    } catch (error) {
        logger.error('Erro no webhook:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
}

/**
 * Requests a webhook subscription for a specific YouTube channel.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
async function subscribeToChannel(req, res) {
    try {
        const { channelId, camaraId } = req.body;

        if (!channelId || !camaraId) {
            return res.status(400).json({ error: 'channelId e camaraId são obrigatórios' });
        }

        logger.log(`📝 Solicitação de subscrição manual: Canal ${channelId}, Câmara ${camaraId}`);

        const success = await youtubeWebhookService.subscribeToChannel(channelId, camaraId);

        if (success) {
            res.status(200).json({
                status: 'success',
                message: `Subscrição solicitada para canal ${channelId}`,
                channelId,
                camaraId
            });
        } else {
            res.status(500).json({ error: 'Erro ao solicitar subscrição' });
        }

    } catch (error) {
        logger.error('Erro ao subscrever canal:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
}

/**
 * Cancels the webhook subscription for a specific YouTube channel.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
async function unsubscribeFromChannel(req, res) {
    try {
        const { channelId } = req.body;

        if (!channelId) {
            return res.status(400).json({ error: 'channelId é obrigatório' });
        }

        logger.log(`🗑️ Solicitação de cancelamento: Canal ${channelId}`);

        const success = await youtubeWebhookService.unsubscribeFromChannel(channelId);

        if (success) {
            res.status(200).json({
                status: 'success',
                message: `Subscrição cancelada para canal ${channelId}`,
                channelId
            });
        } else {
            res.status(500).json({ error: 'Erro ao cancelar subscrição' });
        }

    } catch (error) {
        logger.error('Erro ao cancelar subscrição:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
}

/**
 * Requests webhook subscriptions for all configured YouTube channels.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
async function subscribeToAllChannels(req, res) {
    try {
        logger.log('🔄 Solicitação para subscrever todos os canais');

        await youtubeWebhookService.subscribeToAllChannels();

        res.status(200).json({
            status: 'success',
            message: 'Subscrições solicitadas para todos os canais configurados'
        });

    } catch (error) {
        logger.error('Erro ao subscrever todos os canais:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
}

/**
 * Returns the current webhook subscription status tracked by the service.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
async function getSubscriptionStatus(req, res) {
    try {
        const status = youtubeWebhookService.getSubscriptionStatus();

        res.status(200).json({
            status: 'success',
            subscriptions: status,
            totalSubscriptions: Object.keys(status).length
        });

    } catch (error) {
        logger.error('Erro ao obter status das subscrições:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
}

/**
 * Returns webhook health diagnostics without exposing secrets.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
async function getWebhookHealth(req, res) {
    try {
        const health = typeof youtubeWebhookService.getHealth === 'function'
            ? youtubeWebhookService.getHealth()
            : {
                enabled: youtubeWebhookService.webhooksEnabled,
                callbackUrl: youtubeWebhookService.callbackUrl
            };

        res.status(200).json({ status: 'success', health });
    } catch (error) {
        logger.error('Erro ao obter health do webhook:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
}

module.exports = {
    handleYouTubeWebhook,
    subscribeToChannel,
    unsubscribeFromChannel,
    subscribeToAllChannels,
    getSubscriptionStatus,
    getWebhookHealth
};
