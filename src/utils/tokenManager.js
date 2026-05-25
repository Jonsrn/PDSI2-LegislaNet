const createLogger = require('./logger');
const logger = createLogger('TOKEN_MANAGER');

/**
 * In-memory token blacklist utilities.
 *
 * The blacklist uses a Set for fast lookups and should be replaced with a
 * shared persistent store in multi-instance deployments.
 *
 * @module utils/tokenManager
 */
const tokenBlacklist = new Set();

/**
 * Adds a JWT to the in-memory blacklist.
 *
 * @param {string} token - JWT to invalidate.
 * @returns {void}
 */
const blacklistToken = (token) => {
    if (token) {
        tokenBlacklist.add(token);
        logger.log(`Token adicionado à blacklist. Tamanho atual: ${tokenBlacklist.size}`);
    }
};

/**
 * Checks whether a JWT is currently blacklisted.
 *
 * @param {string} token - JWT to check.
 * @returns {boolean} True when the token is blacklisted.
 */
const isBlacklisted = (token) => {
    return tokenBlacklist.has(token);
};

module.exports = {
    blacklistToken,
    isBlacklisted,
};
