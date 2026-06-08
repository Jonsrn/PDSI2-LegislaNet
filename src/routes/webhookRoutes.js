/**
 * YouTube webhook routes for push notifications and subscription management.
 */

const express = require('express');
const {
    handleYouTubeWebhook,
    subscribeToChannel,
    unsubscribeFromChannel,
    subscribeToAllChannels,
    getSubscriptionStatus,
    getWebhookHealth
} = require('../controllers/webhookController');

const router = express.Router();

// Preserve XML webhook bodies as text for signature verification and parsing.
router.use('/youtube', express.text({ type: 'application/atom+xml' }));
router.use('/youtube', express.text({ type: 'text/xml' }));

/**
 * Main YouTube webhook endpoint.
 *
 * GET handles subscription verification challenges. POST handles video and
 * livestream notifications.
 */
router.all('/youtube', handleYouTubeWebhook);

/**
 * Administrative subscription management endpoints.
 */
router.post('/youtube/subscribe', subscribeToChannel);
router.post('/youtube/unsubscribe', unsubscribeFromChannel);
router.post('/youtube/subscribe-all', subscribeToAllChannels);
router.get('/youtube/status', getSubscriptionStatus);

router.get('/health', getWebhookHealth);

module.exports = router;
