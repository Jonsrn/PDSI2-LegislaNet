const fs = require("fs");
const path = require("path");

/**
 * Context-aware file and console logger factory.
 *
 * @module utils/logger
 */

const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Creates a logger that writes context-specific entries to the console and log files.
 *
 * @param {string} context - Log context used in output labels and file names.
 * @returns {object} Logger with `log`, `warn`, and `error` methods.
 */
const createLogger = (context) => {
  const logFile = path.join(logsDir, `${context.toLowerCase()}.log`);
  const errorFile = path.join(logsDir, "errors.log");

  /**
   * Writes a formatted log entry to the console and target log file.
   *
   * @param {string} file - Destination log file path.
   * @param {string} level - Log severity level.
   * @param {string} message - Log message.
   * @param {*} [data=""] - Optional structured data to include.
   * @returns {void}
   */
  const writeLog = (file, level, message, data = "") => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${level}] [${context}] ${timestamp} - ${message} ${
      data ? JSON.stringify(data) : ""
    }\n`;

    if (level === "ERROR") {
      console.error(`[${context} ERROR] ${timestamp} - ${message}`, data);
    } else if (level === "WARN") {
      console.warn(`[${context} WARN] ${timestamp} - ${message}`, data);
    } else {
      console.log(`[${context}] ${timestamp} - ${message}`, data);
    }

    try {
      fs.appendFileSync(file, logEntry);
    } catch (err) {
      console.error(`Erro ao escrever no arquivo de log: ${err.message}`);
    }
  };

  return {
    log: (message, data = "") => writeLog(logFile, "INFO", message, data),
    warn: (message, data = "") => writeLog(logFile, "WARN", message, data),
    error: (message, error = "") => {
      writeLog(errorFile, "ERROR", message, error);
      writeLog(logFile, "ERROR", message, error);
    },
  };
};

module.exports = createLogger;
