const { createClient } = require("@supabase/supabase-js");
const createLogger = require("./logger");

const logger = createLogger("STATS_REFRESH_SCHEDULER");

/**
 * Daily scheduler utilities for refreshing vereador statistics.
 *
 * @module utils/statsRefreshScheduler
 */

/**
 * Refreshes the materialized view containing vereador statistics.
 *
 * @returns {Promise<boolean>} True when the refresh succeeds, otherwise false.
 */
async function refreshVereadorEstatisticas() {
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  logger.log("🔄 Iniciando refresh da materialized view de estatísticas...");

  try {
    const { error } = await supabaseAdmin.rpc("refresh_vereador_estatisticas");

    if (error) {
      logger.error("Erro ao executar refresh:", error.message);
      return false;
    }

    logger.log("✅ Refresh da mv_vereador_estatisticas concluído com sucesso!");
    return true;
  } catch (err) {
    logger.error("Exceção ao executar refresh:", err.message);
    return false;
  }
}

/**
 * Calculates the delay until the next 23:59 run time.
 *
 * @returns {{diff: number, target: Date}} Delay in milliseconds and target run time.
 */
function msUntil2359() {
  const now = new Date();
  const target = new Date(now);

  target.setHours(23, 59, 0, 0);

  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }

  const diff = target.getTime() - now.getTime();
  return { diff, target };
}

/**
 * Starts the daily statistics refresh scheduler.
 *
 * @returns {void}
 */
function startStatsRefreshScheduler() {
  const schedule = () => {
    const { diff, target } = msUntil2359();

    logger.log(
      `📅 Próximo refresh agendado para: ${target.toLocaleString("pt-BR")}`,
    );

    setTimeout(async () => {
      try {
        await refreshVereadorEstatisticas();
      } catch (err) {
        logger.error("Erro não tratado no refresh:", err.message);
      }
      schedule();
    }, diff);
  };

  schedule();
  logger.log("🕒 Scheduler de estatísticas iniciado (diário às 23:59)");
}

module.exports = {
  startStatsRefreshScheduler,
  refreshVereadorEstatisticas,
};
