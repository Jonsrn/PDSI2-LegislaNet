/**
 * Tablet backend entry point.
 *
 * Configures security middleware, CORS, request logging, API routes, static APK
 * downloads, health checks, and process-level shutdown/error handlers.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const createLogger = require('./src/config/logger');

const logger = createLogger('TABLET_SERVER');
const app = express();
const PORT = process.env.PORT || 3001;

logger.info('🚀 === INICIANDO TABLET BACKEND ===');

/**
 * Global rate limiter for tablet API requests.
 *
 * @type {import('express').RequestHandler}
 */
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10000,
    message: { error: 'Limite de requisições excedido. Aguarde 5 minutos.', code: 'RATE_LIMIT_EXCEEDED' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", process.env.SUPABASE_URL],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

/**
 * Allowed CORS origins, configured by environment or local defaults.
 *
 * @type {string[]}
 */
const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:61188', 'http://localhost:3000', 'http://127.0.0.1:3001'];

app.use(cors({
    /**
     * Validates incoming CORS origins.
     *
     * Requests without an origin are allowed for mobile clients and API tools.
     * Localhost origins are allowed outside production to support development.
     *
     * @param {string|undefined} origin - Origin header from the incoming request.
     * @param {(error: Error|null, allow?: boolean) => void} callback - CORS decision callback.
     * @returns {void}
     */
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        if (process.env.NODE_ENV !== 'production') {
            if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
                return callback(null, true);
            }
        }

        if (corsOrigins.includes(origin)) return callback(null, true);

        logger.warn(`CORS bloqueou origem: ${origin}`);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
}));

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Logs each request and wraps `res.send` to record response status and latency.
 *
 * @param {import('express').Request} req - Incoming HTTP request.
 * @param {import('express').Response} res - HTTP response object.
 * @param {import('express').NextFunction} next - Express continuation callback.
 * @returns {void}
 */
app.use((req, res, next) => {
    const start = Date.now();
    logger.info(`📥 ${req.method} ${req.url}`);

    const originalSend = res.send;
    /**
     * Sends the response body after logging completion metadata.
     *
     * @param {*} data - Response payload passed to Express.
     * @returns {void}
     */
    res.send = function (data) {
        logger.info(`📤 ${req.method} ${req.url} → ${res.statusCode} (${Date.now() - start}ms)`);
        originalSend.call(this, data);
    };

    next();
});

logger.info('📍 Registrando rotas...');

const authRoutes = require('./src/routes/auth');
const vereadorRoutes = require('./src/routes/vereador');
const pautaRoutes = require('./src/routes/pauta');
const votoRoutes = require('./src/routes/voto');
const systemRoutes = require('./src/routes/system');

app.use('/api/auth', authRoutes);
app.use('/api/vereador', vereadorRoutes);
app.use('/api/pautas', pautaRoutes);
app.use('/api/votos', votoRoutes);
app.use('/api/system', systemRoutes);

const path = require('path');
app.use('/downloads', express.static(path.join(__dirname, 'public/downloads')));

logger.info('✅ Rotas registradas com sucesso!');

/**
 * Returns service health metadata for load balancers and monitoring.
 *
 * @param {import('express').Request} _req - Incoming health check request.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {void}
 */
app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'tablet-backend',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    });
});

/**
 * Handles unmatched routes with a JSON 404 response.
 *
 * @param {import('express').Request} req - Incoming HTTP request.
 * @param {import('express').Response} res - HTTP response object.
 * @returns {void}
 */
app.use('*', (req, res) => {
    logger.warn(`404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Rota não encontrada.', url: req.originalUrl });
});

/**
 * Handles uncaught Express errors and hides details in production responses.
 *
 * @param {Error} error - Error raised by previous middleware or routes.
 * @param {import('express').Request} req - Incoming HTTP request.
 * @param {import('express').Response} res - HTTP response object.
 * @param {import('express').NextFunction} next - Express continuation callback.
 * @returns {void}
 */
app.use((error, req, res, next) => {
    logger.error('💥 ERRO GLOBAL:', { error: error.message, url: req.url });
    res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message,
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString(),
    });
});

/**
 * Gracefully stops the HTTP server after a SIGTERM signal.
 *
 * @returns {void}
 */
process.on('SIGTERM', () => {
    logger.info('SIGTERM recebido — encerrando servidor.');
    server.close(() => logger.info('Servidor encerrado.'));
});

/**
 * Logs uncaught exceptions and exits the process.
 *
 * @param {Error} error - Uncaught exception.
 * @returns {void}
 */
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { error: error.message });
    process.exit(1);
});

/**
 * Logs unhandled promise rejections for operational visibility.
 *
 * @param {*} reason - Rejection reason.
 * @returns {void}
 */
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', { reason });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🎯 Tablet Backend rodando na porta ${PORT}`);
    logger.info(`📱 Aguardando requisições do aplicativo tablet!`);
});

module.exports = app;
