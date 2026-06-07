const supabaseAdmin = require("../config/supabaseAdminClient");
const createLogger = require("../utils/logger");
const logger = createLogger("PUBLIC_CONTROLLER");

/**
 * Public controller for chamber, councilor, session, agenda item, and voting data.
 *
 * All endpoints expose only active/public chamber data and shape responses for
 * the public portal.
 */

/**
 * Lists active chambers for public selection.
 *
 * Supports pagination and search by chamber name or municipality. Count fields
 * are loaded best-effort per chamber and fall back to zero on count failures.
 *
 * @param {import("express").Request} req - Express request with optional `page`, `limit`, and `search` query parameters.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getCamarasPublicas = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 8;
  const search = req.query.search || "";
  const offset = (page - 1) * limit;

  logger.log(
    `Buscando câmaras públicas - Página: ${page}, Limite: ${limit}, Busca: ${search}`,
  );

  try {
    let countQuery = supabaseAdmin
      .from("camaras")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    if (search) {
      const searchQuery = `nome_camara.ilike.%${search}%,municipio.ilike.%${search}%`;
      countQuery = countQuery.or(searchQuery);
    }

    const { count: totalItems, error: countError } = await countQuery;
    if (countError) throw countError;

    let query = supabaseAdmin
      .from("camaras")
      .select(
        `
                id,
                nome_camara,
                municipio,
                estado,
                brasao_url
            `,
      )
      .eq("is_active", true);

    if (search) {
      const searchQuery = `nome_camara.ilike.%${search}%,municipio.ilike.%${search}%`;
      query = query.or(searchQuery);
    }

    const { data: camaras, error } = await query
      .order("nome_camara", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const processedCamaras = await Promise.all(
      camaras.map(async (camara) => {
        try {
          const { count: vereadores_count } = await supabaseAdmin
            .from("vereadores")
            .select("id", { count: "exact", head: true })
            .eq("camara_id", camara.id)
            .eq("is_active", true);

          const { count: sessoes_totais } = await supabaseAdmin
            .from("sessoes")
            .select("id", { count: "exact", head: true })
            .eq("camara_id", camara.id);

          return {
            id: camara.id,
            nome_camara: camara.nome_camara,
            municipio: camara.municipio,
            estado: camara.estado,
            brasao_url: camara.brasao_url,
            vereadores_count: vereadores_count || 0,
            sessoes_totais: sessoes_totais || 0,
          };
        } catch (err) {
          console.warn(
            `Erro ao buscar estatísticas da câmara ${camara.id}:`,
            err.message,
          );
          return {
            id: camara.id,
            nome_camara: camara.nome_camara,
            municipio: camara.municipio,
            estado: camara.estado,
            brasao_url: camara.brasao_url,
            vereadores_count: 0,
            sessoes_totais: 0,
          };
        }
      }),
    );

    logger.log(
      `Câmaras encontradas: ${processedCamaras.length} de ${totalItems} total`,
    );

    res.status(200).json({
      camaras: processedCamaras,
      pagination: {
        total: totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
        hasNextPage: page < Math.ceil(totalItems / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    logger.error("Erro ao buscar câmaras públicas:", error.message);
    res.status(500).json({
      error: "Erro ao buscar câmaras",
      message:
        "Não foi possível carregar a lista de câmaras. Tente novamente mais tarde.",
    });
  }
};

/**
 * Returns public profile information and summary statistics for one chamber.
 *
 * Only active chambers are returned. Recent agenda item count is best-effort and
 * scoped to items created in the last 30 days with voting/finalized statuses.
 *
 * @param {import("express").Request} req - Express request with chamber ID.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getCamaraPublicInfo = async (req, res) => {
  const { id } = req.params;

  logger.log(`Buscando informações públicas da câmara: ${id}`);

  try {
    const { data: camara, error: camaraError } = await supabaseAdmin
      .from("camaras")
      .select(
        `
                id,
                nome_camara,
                municipio,
                estado,
                brasao_url,
                is_active,
                link_facebook,
                link_instagram,
                link_youtube,
                site_oficial
            `,
      )
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (camaraError || !camara) {
      return res.status(404).json({
        error: "Câmara não encontrada",
        message: "A câmara solicitada não foi encontrada ou não está ativa.",
      });
    }

    const [vereadorResult, sessaoResult] = await Promise.all([
      supabaseAdmin
        .from("vereadores")
        .select("id", { count: "exact", head: true })
        .eq("camara_id", id)
        .eq("is_active", true),

      supabaseAdmin
        .from("sessoes")
        .select("id", { count: "exact", head: true })
        .eq("camara_id", id)
        .eq("status", "ativa"),
    ]);

    let pautasRecentes = 0;
    try {
      const { count } = await supabaseAdmin
        .from("pautas")
        .select("id", { count: "exact", head: true })
        .gte(
          "created_at",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        )
        .in("status", ["Em Votação", "Finalizada"]);
      pautasRecentes = count || 0;
    } catch (pautaError) {
      console.warn("Erro ao buscar pautas recentes:", pautaError.message);
      pautasRecentes = 0;
    }

    const responseData = {
      info: camara,
      estatisticas: {
        vereadores_ativos: vereadorResult.count || 0,
        sessoes_ativas: sessaoResult.count || 0,
        pautas_recentes: pautasRecentes,
      },
    };

    logger.log(`Informações da câmara ${id} carregadas com sucesso`);

    res.status(200).json(responseData);
  } catch (error) {
    logger.error(`Erro ao buscar informações da câmara ${id}:`, error.message);
    res.status(500).json({
      error: "Erro interno",
      message: "Não foi possível carregar as informações da câmara.",
    });
  }
};

/**
 * Lists the next scheduled sessions for an active chamber.
 *
 * @param {import("express").Request} req - Express request with chamber ID.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getSessoesFuturas = async (req, res) => {
  const { id } = req.params;

  logger.log(`Buscando sessões futuras da câmara: ${id}`);

  try {
    const { data: camara } = await supabaseAdmin
      .from("camaras")
      .select("id")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (!camara) {
      return res.status(404).json({
        error: "Câmara não encontrada",
        message: "A câmara solicitada não foi encontrada ou não está ativa.",
      });
    }

    const agora = new Date().toISOString();
    const { data: sessoes, error } = await supabaseAdmin
      .from("sessoes")
      .select(
        `
                id,
                nome,
                tipo,
                data_sessao,
                status
            `,
      )
      .eq("camara_id", id)
      .gt("data_sessao", agora)
      .eq("status", "Agendada")
      .order("data_sessao", { ascending: true })
      .limit(10);

    if (error) throw error;

    logger.log(`Sessões futuras encontradas: ${sessoes.length}`);

    res.status(200).json({
      sessoes: sessoes || [],
      total: sessoes.length,
    });
  } catch (error) {
    logger.error(
      `Erro ao buscar sessões futuras da câmara ${id}:`,
      error.message,
    );
    res.status(500).json({
      error: "Erro interno",
      message: "Não foi possível carregar as sessões futuras.",
    });
  }
};

/**
 * Counts finalized agenda items voted by a councilor in a chamber.
 *
 * @param {string} vereadorId - Councilor ID.
 * @param {string} camaraId - Chamber ID.
 * @returns {Promise<number>} Total finalized agenda items with a councilor vote.
 */
const calcularVotacoes = async (vereadorId, camaraId) => {
  try {
    const { data: sessoes, error: sessoesError } = await supabaseAdmin
      .from("sessoes")
      .select("id")
      .eq("camara_id", camaraId);

    if (sessoesError) {
      console.warn(
        `Erro ao buscar sessões para votações:`,
        sessoesError.message,
      );
      return 0;
    }

    if (!sessoes || sessoes.length === 0) {
      return 0;
    }

    const sessaoIds = sessoes.map((s) => s.id);

    const { data: pautas, error: pautasError } = await supabaseAdmin
      .from("pautas")
      .select("id")
      .eq("status", "Finalizada")
      .in("sessao_id", sessaoIds);

    if (pautasError) {
      console.warn(`Erro ao buscar pautas finalizadas:`, pautasError.message);
      return 0;
    }

    if (!pautas || pautas.length === 0) {
      return 0;
    }

    const pautaIds = pautas.map((p) => p.id);

    const { count: totalVotacoes, error: votosError } = await supabaseAdmin
      .from("votos")
      .select("id", { count: "exact", head: true })
      .eq("vereador_id", vereadorId)
      .in("pauta_id", pautaIds);

    if (votosError) {
      console.warn(
        `Erro ao contar votos do vereador ${vereadorId}:`,
        votosError.message,
      );
      return 0;
    }

    console.log(
      `Vereador ${vereadorId}: ${totalVotacoes || 0} votações em ${
        pautas.length
      } pautas finalizadas`,
    );
    return totalVotacoes || 0;
  } catch (error) {
    console.warn(
      `Erro ao calcular votações do vereador ${vereadorId}:`,
      error.message,
    );
    return 0;
  }
};

/**
 * Calculates attendance for a councilor.
 *
 * A councilor is considered present in a past session when they voted in at
 * least one finalized agenda item from that session.
 *
 * @param {string} vereadorId - Councilor ID.
 * @param {string} camaraId - Chamber ID.
 * @returns {Promise<{sessoes_presentes: number, total_sessoes: number, percentual: number}>} Attendance summary.
 */
const calcularPresenca = async (vereadorId, camaraId) => {
  try {
    const agora = new Date().toISOString();
    console.log(`🕐 Data atual para filtro: ${agora}`);

    const { data: sessoes, error: sessoesError } = await supabaseAdmin
      .from("sessoes")
      .select("id, nome, data_sessao, status")
      .eq("camara_id", camaraId)
      .lt("data_sessao", agora);

    if (sessoesError) {
      console.warn(
        `Erro ao buscar sessões para presença:`,
        sessoesError.message,
      );
      return { sessoes_presentes: 0, total_sessoes: 0, percentual: 0 };
    }

    console.log(
      `🎯 Sessões não futuras encontradas (${sessoes?.length || 0}):`,
    );
    if (sessoes) {
      sessoes.forEach((s) => {
        console.log(`  - ${s.nome}: ${s.data_sessao} (${s.status})`);
      });
    }

    if (!sessoes || sessoes.length === 0) {
      console.log(`⚠️ Nenhuma sessão passada encontrada`);
      return { sessoes_presentes: 0, total_sessoes: 0, percentual: 0 };
    }

    const totalSessoes = sessoes.length;
    let sessoesPresentes = 0;

    console.log(
      `\n📊 Analisando presença em ${totalSessoes} sessões para vereador ${vereadorId}`,
    );

    for (const sessao of sessoes) {
      console.log(`\n🔍 Sessão: ${sessao.nome} (${sessao.data_sessao})`);

      const { data: pautasFinalizadas, error: pautasError } =
        await supabaseAdmin
          .from("pautas")
          .select("id, nome, status")
          .eq("sessao_id", sessao.id)
          .eq("status", "Finalizada");

      if (pautasError) {
        console.warn(
          `❌ Erro ao buscar pautas finalizadas:`,
          pautasError.message,
        );
        continue;
      }

      console.log(
        `   📝 Pautas FINALIZADAS: ${pautasFinalizadas?.length || 0}`,
      );
      if (pautasFinalizadas && pautasFinalizadas.length > 0) {
        pautasFinalizadas.forEach((p) => {
          console.log(`      - ${p.nome} (${p.status})`);
        });
      }

      if (!pautasFinalizadas || pautasFinalizadas.length === 0) {
        console.log(`   ⚠️ Sessão sem pautas finalizadas, vereador ausente`);
        continue;
      }

      const pautaIds = pautasFinalizadas.map((p) => p.id);

      const { count: votosEmPautasFinalizadas, error: votosError } =
        await supabaseAdmin
          .from("votos")
          .select("id", { count: "exact", head: true })
          .eq("vereador_id", vereadorId)
          .in("pauta_id", pautaIds);

      if (votosError) {
        console.warn(`❌ Erro ao verificar votos:`, votosError.message);
        continue;
      }

      console.log(
        `   🗳️ Votos em pautas finalizadas: ${votosEmPautasFinalizadas || 0}`,
      );

      if (votosEmPautasFinalizadas && votosEmPautasFinalizadas > 0) {
        sessoesPresentes++;
        console.log(
          `   ✅ PRESENTE (votou em ${votosEmPautasFinalizadas} pautas finalizadas)`,
        );
      } else {
        console.log(`   ❌ AUSENTE (não votou em nenhuma pauta finalizada)`);
      }
    }

    const percentual =
      totalSessoes > 0
        ? Math.round((sessoesPresentes / totalSessoes) * 100)
        : 0;

    console.log(
      `\n📋 RESULTADO - Vereador ${vereadorId}: ${sessoesPresentes}/${totalSessoes} sessões = ${percentual}%`,
    );

    return {
      sessoes_presentes: sessoesPresentes,
      total_sessoes: totalSessoes,
      percentual: percentual,
    };
  } catch (error) {
    console.warn(
      `Erro ao calcular presença do vereador ${vereadorId}:`,
      error.message,
    );
    return { sessoes_presentes: 0, total_sessoes: 0, percentual: 0 };
  }
};

/**
 * Loads councilor statistics with the fastest available source.
 *
 * Attempts the materialized view first, then an RPC function, then a direct
 * fallback query that always works but is slower.
 *
 * @param {string} camaraId - Chamber ID.
 * @returns {Promise<object>} Statistics keyed by councilor ID.
 */
const calcularEstatisticasOtimizadas = async (camaraId) => {
  try {
    console.log(
      `🚀 Calculando estatísticas otimizadas para câmara: ${camaraId}`,
    );

    const { data: mvData, error: mvError } = await supabaseAdmin
      .from("mv_vereador_estatisticas")
      .select("*")
      .eq("camara_id", camaraId);

    if (!mvError && mvData && mvData.length > 0) {
      console.log(`✅ Usando materialized view - ${mvData.length} vereadores`);
      const statsMap = {};
      mvData.forEach((stat) => {
        const percentual =
          stat.total_sessoes_mandato > 0
            ? Math.round(
                (stat.sessoes_presentes / stat.total_sessoes_mandato) * 100,
              )
            : 0;
        statsMap[stat.vereador_id] = {
          total_votacoes: stat.total_votacoes || 0,
          percentual_presenca: percentual,
          sessoes_presentes: stat.sessoes_presentes || 0,
          total_sessoes: stat.total_sessoes_mandato || 0,
        };
      });
      return statsMap;
    }

    const agora = new Date().toISOString();
    const { data: estatisticas, error } = await supabaseAdmin.rpc(
      "calcular_estatisticas_vereadores",
      {
        p_camara_id: camaraId,
        p_data_atual: agora,
      },
    );

    if (!error && estatisticas) {
      console.log(`✅ Usando RPC - ${estatisticas.length} vereadores`);
      const statsMap = {};
      estatisticas.forEach((stat) => {
        statsMap[stat.vereador_id] = {
          total_votacoes: stat.total_votacoes || 0,
          percentual_presenca: stat.percentual_presenca || 0,
          sessoes_presentes: stat.sessoes_presentes || 0,
          total_sessoes: stat.total_sessoes || 0,
        };
      });
      return statsMap;
    }

    console.warn(
      "Materialized view e RPC indisponíveis, usando consulta alternativa",
    );
    return await calcularEstatisticasAlternativa(camaraId);
  } catch (error) {
    console.warn("Erro ao calcular estatísticas otimizadas:", error.message);
    return await calcularEstatisticasAlternativa(camaraId);
  }
};

/**
 * Calculates councilor statistics with direct Supabase queries.
 *
 * This fallback filters attendance by each councilor mandate period and counts
 * only past sessions that have finalized agenda items with votes.
 *
 * @param {string} camaraId - Chamber ID.
 * @returns {Promise<object>} Statistics keyed by councilor ID.
 */
const calcularEstatisticasAlternativa = async (camaraId) => {
  try {
    const agora = new Date().toISOString();
    console.log(`🔄 Usando consulta alternativa para câmara: ${camaraId}`);

    const { data: vereadores } = await supabaseAdmin
      .from("vereadores")
      .select("id, created_at, data_saida")
      .eq("camara_id", camaraId)
      .eq("is_active", true);

    if (!vereadores || vereadores.length === 0) {
      return {};
    }

    const vereadorIds = vereadores.map((v) => v.id);

    const mandatoMap = {};
    vereadores.forEach((v) => {
      mandatoMap[v.id] = {
        inicio: v.created_at,
        fim: v.data_saida || agora,
      };
    });

    const statsMap = {};

    const { data: votacoes } = await supabaseAdmin
      .from("votos")
      .select(
        `
                vereador_id,
                pautas!inner (
                    status,
                    sessoes!inner (
                        camara_id
                    )
                )
            `,
      )
      .in("vereador_id", vereadorIds)
      .eq("pautas.status", "Finalizada")
      .eq("pautas.sessoes.camara_id", camaraId);

    votacoes?.forEach((voto) => {
      if (!statsMap[voto.vereador_id]) {
        statsMap[voto.vereador_id] = {
          total_votacoes: 0,
          sessoes_presentes: new Set(),
        };
      }
      statsMap[voto.vereador_id].total_votacoes++;
    });

    const { data: presencas } = await supabaseAdmin
      .from("votos")
      .select(
        `
                vereador_id,
                pautas!inner (
                    status,
                    sessao_id,
                    sessoes!inner (
                        camara_id,
                        data_sessao
                    )
                )
            `,
      )
      .in("vereador_id", vereadorIds)
      .eq("pautas.status", "Finalizada")
      .eq("pautas.sessoes.camara_id", camaraId)
      .lt("pautas.sessoes.data_sessao", agora);

    presencas?.forEach((presenca) => {
      const vereadorId = presenca.vereador_id;
      const dataSessao = presenca.pautas.sessoes.data_sessao;
      const mandato = mandatoMap[vereadorId];

      if (
        mandato &&
        dataSessao >= mandato.inicio &&
        dataSessao <= mandato.fim
      ) {
        if (!statsMap[vereadorId]) {
          statsMap[vereadorId] = {
            total_votacoes: 0,
            sessoes_presentes: new Set(),
          };
        }
        statsMap[vereadorId].sessoes_presentes.add(presenca.pautas.sessao_id);
      }
    });

    // Count only sessions with at least one finalized agenda item that has votes.
    const { data: sessoesComVotos } = await supabaseAdmin
      .from("sessoes")
      .select(
        `
        id,
        data_sessao,
        pautas!inner (
          id,
          status,
          votos!inner (
            id
          )
        )
      `,
      )
      .eq("camara_id", camaraId)
      .eq("pautas.status", "Finalizada")
      .lt("data_sessao", agora);

    const sessoesValidasIds = new Set();
    sessoesComVotos?.forEach((sessao) => {
      if (
        sessao.pautas &&
        sessao.pautas.some((p) => p.votos && p.votos.length > 0)
      ) {
        sessoesValidasIds.add(sessao.id);
      }
    });

    const sessoesValidasMap = {};
    sessoesComVotos?.forEach((sessao) => {
      if (sessoesValidasIds.has(sessao.id)) {
        sessoesValidasMap[sessao.id] = sessao.data_sessao;
      }
    });

    const finalStats = {};
    vereadores.forEach((vereador) => {
      const mandato = mandatoMap[vereador.id];

      let sessoesNoMandato = 0;
      Object.entries(sessoesValidasMap).forEach(([, dataSessao]) => {
        if (dataSessao >= mandato.inicio && dataSessao <= mandato.fim) {
          sessoesNoMandato++;
        }
      });

      const stats = statsMap[vereador.id] || {
        total_votacoes: 0,
        sessoes_presentes: new Set(),
      };
      const sessoesPresentes = stats.sessoes_presentes?.size || 0;
      const percentual =
        sessoesNoMandato > 0
          ? Math.round((sessoesPresentes / sessoesNoMandato) * 100)
          : 0;

      finalStats[vereador.id] = {
        total_votacoes: stats.total_votacoes || 0,
        percentual_presenca: percentual,
        sessoes_presentes: sessoesPresentes,
        total_sessoes: sessoesNoMandato,
      };
    });

    console.log(
      `✅ Estatísticas alternativas calculadas para ${
        Object.keys(finalStats).length
      } vereadores`,
    );
    return finalStats;
  } catch (error) {
    console.warn("Erro na consulta alternativa:", error.message);
    return {};
  }
};

/**
 * Lists active councilors for an active chamber with party and statistics data.
 *
 * @param {import("express").Request} req - Express request with chamber ID.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getVereadores = async (req, res) => {
  const { id } = req.params;

  logger.log(`Buscando vereadores ativos da câmara: ${id}`);

  try {
    const { data: camara } = await supabaseAdmin
      .from("camaras")
      .select("id")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (!camara) {
      return res.status(404).json({
        error: "Câmara não encontrada",
        message: "A câmara solicitada não foi encontrada ou não está ativa.",
      });
    }

    const [vereadoresResult, estatisticas] = await Promise.all([
      supabaseAdmin
        .from("vereadores")
        .select(
          `
                    id,
                    nome_parlamentar,
                    foto_url,
                    is_presidente,
                    is_vice_presidente,
                    partidos!inner (
                        id,
                        nome,
                        sigla,
                        logo_url
                    )
                `,
        )
        .eq("camara_id", id)
        .eq("is_active", true)
        .order("nome_parlamentar", { ascending: true }),
      calcularEstatisticasOtimizadas(id),
    ]);

    if (vereadoresResult.error) throw vereadoresResult.error;

    const vereadoresComEstatisticas = vereadoresResult.data.map((vereador) => {
      let cargo = "Vereador";

      if (vereador.is_presidente) {
        cargo = "Presidente da Câmara";
      } else if (vereador.is_vice_presidente) {
        cargo = "Vice-Presidente";
      }

      const stats = estatisticas[vereador.id] || {
        total_votacoes: 0,
        percentual_presenca: 0,
        sessoes_presentes: 0,
        total_sessoes: 0,
      };

      return {
        id: vereador.id,
        nome: vereador.nome_parlamentar,
        foto_url: vereador.foto_url,
        cargo: cargo,
        partido: {
          id: vereador.partidos.id,
          nome: vereador.partidos.nome,
          sigla: vereador.partidos.sigla,
          logo_url: vereador.partidos.logo_url,
        },
        estatisticas: stats,
      };
    });

    logger.log(
      `Vereadores ativos encontrados: ${vereadoresComEstatisticas.length}`,
    );

    res.status(200).json({
      vereadores: vereadoresComEstatisticas,
      total: vereadoresComEstatisticas.length,
    });
  } catch (error) {
    logger.error(`Erro ao buscar vereadores da câmara ${id}:`, error.message);
    res.status(500).json({
      error: "Erro interno",
      message: "Não foi possível carregar os vereadores.",
    });
  }
};

/**
 * Returns the latest finalized public votes for an active chamber.
 *
 * Prefers `updated_at` ordering and falls back to `created_at` for older
 * schemas.
 *
 * @param {import("express").Request} req - Express request with chamber ID.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getVotacoesRecentes = async (req, res) => {
  const { id } = req.params;

  logger.log(`Buscando votações recentes da câmara: ${id}`);

  try {
    const { data: camara } = await supabaseAdmin
      .from("camaras")
      .select("id")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (!camara) {
      return res.status(404).json({
        error: "Câmara não encontrada",
        message: "A câmara solicitada não foi encontrada ou não está ativa.",
      });
    }

    let pautas = null;
    try {
      const resp = await supabaseAdmin
        .from("pautas")
        .select(
          `
                    id,
                    nome,
                    descricao,
                    autor,
                    resultado_votacao,
                    created_at,
                    updated_at,
                    sessoes!inner (
                        id,
                        nome,
                        data_sessao,
                        camara_id
                    )
                `,
        )
        .eq("status", "Finalizada")
        .eq("sessoes.camara_id", id)
        .order("updated_at", { ascending: false })
        .limit(9);

      if (resp.error) throw resp.error;
      pautas = resp.data;
    } catch (err) {
      logger.warn(
        "updated_at não disponível ou erro ao ordenar por updated_at, recuando para created_at:",
        err.message || err,
      );
      const resp2 = await supabaseAdmin
        .from("pautas")
        .select(
          `
                    id,
                    nome,
                    descricao,
                    autor,
                    resultado_votacao,
                    created_at,
                    sessoes!inner (
                        id,
                        nome,
                        data_sessao,
                        camara_id
                    )
                `,
        )
        .eq("status", "Finalizada")
        .eq("sessoes.camara_id", id)
        .order("created_at", { ascending: false })
        .limit(9);

      if (resp2.error) throw resp2.error;
      pautas = resp2.data;
    }

    const votacoesFormatadas = pautas.map((pauta) => {
      let status = "Pendente";
      let statusClass = "pending";

      if (pauta.resultado_votacao === "Aprovada") {
        status = "APROVADA";
        statusClass = "approved";
      } else if (pauta.resultado_votacao === "Reprovada") {
        status = "REPROVADA";
        statusClass = "rejected";
      } else if (pauta.resultado_votacao === "Não Votada") {
        status = "NÃO VOTADA";
        statusClass = "not-voted";
      }

      return {
        id: pauta.id,
        nome: pauta.nome,
        descricao: pauta.descricao || "Descrição não informada",
        autor: pauta.autor || "Autor não informado",
        status: status,
        statusClass: statusClass,
        sessao: {
          nome: pauta.sessoes.nome,
          data: pauta.sessoes.data_sessao,
        },
        data_criacao: pauta.created_at,
        data_finalizacao: pauta.updated_at,
      };
    });

    logger.log(`Votações recentes encontradas: ${votacoesFormatadas.length}`);

    res.status(200).json({
      pautas: votacoesFormatadas,
      total: votacoesFormatadas.length,
    });
  } catch (error) {
    logger.error(
      `Erro ao buscar votações recentes da câmara ${id}:`,
      error.message,
    );
    res.status(500).json({
      error: "Erro interno",
      message: "Não foi possível carregar as votações recentes.",
    });
  }
};

/**
 * Returns public details for one agenda item from an active chamber.
 *
 * @param {import("express").Request} req - Express request with agenda item ID.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getPautaPublica = async (req, res) => {
  const { id } = req.params;

  logger.log(`Buscando pauta pública: ${id}`);

  try {
    const { data: pauta, error } = await supabaseAdmin
      .from("pautas")
      .select(
        `
                id,
                nome,
                descricao,
                autor,
                status,
                resultado_votacao,
        created_at,
        updated_at,
                sessoes!inner (
                    id,
                    nome,
                    data_sessao,
                    camaras!inner (
                        id,
                        nome_camara,
                        is_active
                    )
                )
            `,
      )
      .eq("id", id)
      .eq("sessoes.camaras.is_active", true)
      .single();

    if (error || !pauta) {
      return res.status(404).json({
        error: "Pauta não encontrada",
        message:
          "A pauta solicitada não foi encontrada ou não está disponível publicamente.",
      });
    }

    logger.log(`Pauta pública encontrada: ${pauta.nome}`);

    res.status(200).json(pauta);
  } catch (error) {
    logger.error(`Erro ao buscar pauta pública ${id}:`, error.message);
    res.status(500).json({
      error: "Erro interno",
      message: "Não foi possível carregar as informações da pauta.",
    });
  }
};

/**
 * Returns public votes and aggregate vote counts for one agenda item.
 *
 * @param {import("express").Request} req - Express request with agenda item ID.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getVotosPublicos = async (req, res) => {
  const { id } = req.params;

  logger.log(`Buscando votos públicos da pauta: ${id}`);

  try {
    const { data: pauta } = await supabaseAdmin
      .from("pautas")
      .select(
        `
                id,
                nome,
                sessoes!inner (
                    camaras!inner (
                        id,
                        is_active
                    )
                )
            `,
      )
      .eq("id", id)
      .eq("sessoes.camaras.is_active", true)
      .single();

    if (!pauta) {
      return res.status(404).json({
        error: "Pauta não encontrada",
        message:
          "A pauta solicitada não foi encontrada ou não está disponível publicamente.",
      });
    }

    const { data: votos, error: votosError } = await supabaseAdmin
      .from("votos")
      .select(
        `
                id,
                voto,
                created_at,
                era_presidente_no_voto,
                vereadores!inner (
                    id,
                    nome_parlamentar,
                    foto_url,
                    partidos (
                        id,
                        nome,
                        sigla,
                        logo_url
                    )
                )
            `,
      )
      .eq("pauta_id", id)
      .order("created_at", { ascending: true });

    if (votosError) throw votosError;

    let estatisticas = {
      sim: 0,
      nao: 0,
      abstencao: 0,
      total: 0,
    };

    if (votos && votos.length > 0) {
      votos.forEach((voto) => {
        switch (voto.voto) {
          case "SIM":
            estatisticas.sim++;
            break;
          case "NÃO":
            estatisticas.nao++;
            break;
          case "ABSTENÇÃO":
            estatisticas.abstencao++;
            break;
        }
      });
      estatisticas.total = votos.length;
    }

    logger.log(`Votos públicos encontrados: ${votos?.length || 0}`);

    res.status(200).json({
      votos: votos || [],
      estatisticas: estatisticas,
    });
  } catch (error) {
    logger.error(
      `Erro ao buscar votos públicos da pauta ${id}:`,
      error.message,
    );
    res.status(500).json({
      error: "Erro interno",
      message: "Não foi possível carregar os votos da pauta.",
    });
  }
};

/**
 * Lists public agenda items for an active chamber with pagination.
 *
 * Finalized agenda items are enriched with vote totals when available.
 *
 * @param {import("express").Request} req - Express request with chamber ID and optional pagination query.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>}
 */
const getAllPautasPublicas = async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const offset = (page - 1) * limit;

  logger.log(
    `Buscando todas as pautas da câmara ${id} - Página: ${page}, Limite: ${limit}`,
  );

  try {
    const { data: camara } = await supabaseAdmin
      .from("camaras")
      .select("id, nome_camara")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (!camara) {
      return res.status(404).json({
        error: "Câmara não encontrada",
        message: "A câmara solicitada não foi encontrada ou não está ativa.",
      });
    }

    const { count: totalPautas } = await supabaseAdmin
      .from("pautas")
      .select("id, sessoes!inner(camara_id)", { count: "exact", head: true })
      .eq("sessoes.camara_id", id)
      .neq("status", "Arquivada");

    const { data: pautas, error: pautasError } = await supabaseAdmin
      .from("pautas")
      .select(
        `
                id,
                nome,
                descricao,
                autor,
                status,
                resultado_votacao,
                created_at,
                sessoes!inner (
                    id,
                    nome,
                    tipo,
                    data_sessao,
                    camara_id
                )
            `,
      )
      .eq("sessoes.camara_id", id)
      .neq("status", "Arquivada")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (pautasError) throw pautasError;

    const pautasComEstatisticas = await Promise.all(
      pautas.map(async (pauta) => {
        if (pauta.status === "Finalizada") {
          try {
            const { data: votos } = await supabaseAdmin
              .from("votos")
              .select("voto")
              .eq("pauta_id", pauta.id);

            const estatisticas = {
              total: votos?.length || 0,
              sim: votos?.filter((v) => v.voto === "SIM").length || 0,
              nao: votos?.filter((v) => v.voto === "NÃO").length || 0,
              abstencao:
                votos?.filter((v) => v.voto === "ABSTENÇÃO").length || 0,
            };

            return { ...pauta, estatisticas };
          } catch (error) {
            logger.error(
              `Erro ao buscar estatísticas da pauta ${pauta.id}:`,
              error,
            );
            return pauta;
          }
        }
        return pauta;
      }),
    );

    const totalPages = Math.ceil(totalPautas / limit);

    const responseData = {
      camara: {
        id: camara.id,
        nome: camara.nome_camara,
      },
      pautas: pautasComEstatisticas,
      paginacao: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalPautas,
        items_per_page: limit,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    };

    logger.log(
      `${pautasComEstatisticas.length} pautas encontradas para câmara ${id}`,
    );
    res.status(200).json(responseData);
  } catch (error) {
    logger.error(`Erro ao buscar pautas da câmara ${id}:`, error.message);
    res.status(500).json({
      error: "Erro interno",
      message: "Não foi possível carregar as pautas da câmara.",
    });
  }
};

module.exports = {
  getCamarasPublicas,
  getCamaraPublicInfo,
  getSessoesFuturas,
  getVereadores,
  getVotacoesRecentes,
  getPautaPublica,
  getVotosPublicos,
  getAllPautasPublicas,
};
