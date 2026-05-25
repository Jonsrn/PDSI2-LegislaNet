const NodeCache = require("node-cache");

/**
 * In-memory cache for validated authentication data.
 *
 * Entries expire after five minutes, expired keys are checked every minute,
 * and cached values are stored by reference for better performance.
 *
 * @module utils/authCache
 */
const authCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false,
});

module.exports = authCache;
