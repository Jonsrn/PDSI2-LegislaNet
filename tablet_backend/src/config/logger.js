const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

/**
 * Creates a context-aware logger for tablet backend modules.
 *
 * Log entries are written to the console and daily rotating files. Error-level
 * messages are also written to a dedicated error log.
 *
 * @param {string} context - Module or component name included in each log line.
 * @returns {{info: Function, error: Function, warn: Function, debug: Function}} Logger facade.
 */
const createLogger = (context) => {
    const logsDir = path.join(__dirname, '../../logs');

    const logger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.errors({ stack: true }),
            winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
                let log = `[${timestamp}] [${context}] [${level.toUpperCase()}] ${message}`;
                if (stack) log += `\nStack: ${stack}`;
                if (Object.keys(meta).length > 0) log += `\nMeta: ${JSON.stringify(meta, null, 2)}`;
                return log;
            })
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }),
            new DailyRotateFile({
                filename: path.join(logsDir, 'tablet_backend_%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: process.env.LOG_MAX_SIZE || '20m',
                maxFiles: process.env.LOG_MAX_FILES || '14d',
                level: 'info'
            }),
            new DailyRotateFile({
                filename: path.join(logsDir, 'tablet_errors_%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: process.env.LOG_MAX_SIZE || '20m',
                maxFiles: process.env.LOG_MAX_FILES || '14d',
                level: 'error'
            })
        ]
    });

    return {
        info: (message, meta = {}) => logger.info(message, meta),
        error: (message, meta = {}) => logger.error(message, meta),
        warn: (message, meta = {}) => logger.warn(message, meta),
        debug: (message, meta = {}) => logger.debug(message, meta),
    };
};

module.exports = createLogger;
