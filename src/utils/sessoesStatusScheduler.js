const { createClient } = require("@supabase/supabase-js");
const createLogger = require("./logger");

const logger = createLogger("SESSOES_STATUS_SCHEDULER");

/**
 * Session status scheduler utilities.
 *
 * Sessions remain "Agendada" until midnight after the session date, then move
 * directly to "Finalizada".
 *
 * @module utils/sessoesStatusScheduler
 */

/**
 * Computes the expected status for a session date.
 *
 * @param {string|Date} dataSessaoValue - Session date value.
 * @param {Date} [now=new Date()] - Reference date used for status calculation.
 * @returns {string|null} Desired status, or null when the session date is invalid.
 */
function computeDesiredStatus(dataSessaoValue, now = new Date()) {
  const startAt = new Date(dataSessaoValue);
  if (Number.isNaN(startAt.getTime())) return null;

  const endAt = new Date(startAt);
  endAt.setHours(24, 0, 0, 0);

  if (now >= endAt) return "Finalizada";

  return "Agendada";
}

/**
 * Runs one session status update cycle.
 *
 * Fetches non-finalized sessions, finalizes sessions whose date has passed,
 * cleans up speakers who did not speak, and refreshes statistics when changes
 * are made.
 *
 * @returns {Promise<void>}
 */
async function runSessaoStatusUpdateOnce() {
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  const now = new Date();

  const { data: sessoes, error } = await supabaseAdmin
    .from("sessoes")
    .select("id, status, data_sessao")
    .neq("status", "Finalizada");

  if (error) {
    logger.error("Erro ao buscar sessões para atualização automática:", error);
    return;
  }

  if (!Array.isArray(sessoes) || sessoes.length === 0) {
    logger.log("Nenhuma sessão pendente de atualização.");
    return;
  }

  let updatedCount = 0;
  for (const sessao of sessoes) {
    const desired = computeDesiredStatus(sessao.data_sessao, now);
    if (!desired || desired === sessao.status) continue;

    const { error: updateError } = await supabaseAdmin
      .from("sessoes")
      .update({ status: desired })
      .eq("id", sessao.id);

    if (updateError) {
      logger.error(
        `Erro ao atualizar status da sessão ${sessao.id} para ${desired}:`,
        updateError,
      );
      continue;
    }

    if (desired === "Finalizada") {
      await cleanupOradoresSemFala(supabaseAdmin, sessao.id);
    }
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    logger.log(
      `Atualização automática concluída: ${updatedCount} sessão(ões) atualizada(s) para Finalizada.`,
    );

    const { error: refreshError } = await supabaseAdmin.rpc(
      "refresh_vereador_estatisticas",
    );
    if (refreshError) {
      logger.error(
        "Erro ao atualizar estatísticas após finalizar sessões:",
        refreshError.message,
      );
    } else {
      logger.log("📊 Estatísticas atualizadas com sucesso.");
    }
  }
}

/**
 * Removes speakers from a finalized session when they did not speak.
 *
 * Speakers are kept when they have a finalized speech record or any recorded
 * speaking time.
 *
 * @param {object} supabase - Supabase client used for cleanup queries.
 * @param {string} sessaoId - Session identifier.
 * @returns {Promise<void>}
 */
async function cleanupOradoresSemFala(supabase, sessaoId) {
  try {
    const { data: oradores, error: oradoresError } = await supabase
      .from("oradores")
      .select("id")
      .eq("sessao_id", sessaoId);

    if (oradoresError || !oradores || oradores.length === 0) return;

    const { data: historico, error: historicoError } = await supabase
      .from("historico_falas")
      .select("orador_id, status, tempo_utilizado_minutos")
      .eq("sessao_id", sessaoId);

    if (historicoError) {
      logger.error(
        `Erro ao buscar histórico de falas da sessão ${sessaoId}:`,
        historicoError.message,
      );
      return;
    }

    const oradoresQueFalaramIds = new Set();
    if (historico) {
      for (const h of historico) {
        if (h.status === "finalizada" || h.tempo_utilizado_minutos > 0) {
          oradoresQueFalaramIds.add(h.orador_id);
        }
      }
    }

    const oradoresParaRemover = oradores
      .filter((o) => !oradoresQueFalaramIds.has(o.id))
      .map((o) => o.id);

    if (oradoresParaRemover.length === 0) return;

    const { error: deleteError } = await supabase
      .from("oradores")
      .delete()
      .in("id", oradoresParaRemover);

    if (deleteError) {
      logger.error(
        `Erro ao remover oradores sem fala da sessão ${sessaoId}:`,
        deleteError.message,
      );
    } else {
      logger.log(
        `🧹 Sessão ${sessaoId}: Removidos ${oradoresParaRemover.length} oradores que não discursaram.`,
      );
    }
  } catch (err) {
    logger.error(
      `Erro no cleanup de oradores da sessão ${sessaoId}:`,
      err.message,
    );
  }
}

/**
 * Calculates the delay until 00:01 on the next day.
 *
 * @returns {{diff: number, target: Date}} Delay in milliseconds and target run time.
 */
function msUntil0001() {
  const now = new Date();
  const target = new Date(now);

  target.setDate(target.getDate() + 1);
  target.setHours(0, 1, 0, 0);

  const diff = target.getTime() - now.getTime();
  return { diff, target };
}

/**
 * Starts the daily session status scheduler.
 *
 * Runs once immediately, then schedules the update cycle every day at 00:01.
 *
 * @returns {void}
 */
function startSessaoStatusScheduler() {
  runSessaoStatusUpdateOnce().catch((err) =>
    logger.error("Falha na execução inicial do scheduler:", err),
  );

  const schedule = () => {
    const { diff, target } = msUntil0001();

    logger.log(
      `📅 Próxima verificação de sessões agendada para: ${target.toLocaleString("pt-BR")}`,
    );

    setTimeout(async () => {
      try {
        await runSessaoStatusUpdateOnce();
      } catch (err) {
        logger.error("Erro na execução do scheduler:", err.message);
      }
      schedule();
    }, diff);
  };

  schedule();
  logger.log("🕒 Scheduler de sessões iniciado (diário às 00:01)");
}

module.exports = {
  startSessaoStatusScheduler,
  runSessaoStatusUpdateOnce,
  computeDesiredStatus,
};
