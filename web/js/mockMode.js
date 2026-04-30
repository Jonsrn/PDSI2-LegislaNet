/**
 * @file Mock API layer for Legisla Net development and Sprint validation.
 * Intercepts frontend API calls, serves localStorage-backed mock data, and
 * preserves real authentication endpoints.
 */

/**
 * Initializes mock mode once and installs the fetch interceptor.
 *
 * @returns {void}
 */
(function initLegislaMockMode() {
  if (window.legislaMockApi) {
    return;
  }

  const STORAGE_KEY = "legisla_mock_state_sprint1_v1";
  const originalFetch = window.fetch.bind(window);

  window.__LEGISLA_MOCK_MODE__ = true;
  window.__LEGISLA_MOCK_STRICT__ = true;

  /**
   * Builds an ISO timestamp offset by a number of days.
   *
   * @param {number} [dayOffset=0] - Number of days to add to the current date.
   * @returns {string} ISO timestamp.
   */
  function nowIso(dayOffset = 0) {
    return new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000).toISOString();
  }

  /**
   * Generates a mock unique identifier with a stable prefix.
   *
   * @param {string} prefix - Identifier prefix.
   * @returns {string} Generated identifier.
   */
  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
  }

  /**
   * Creates a JSON-safe deep clone of a value.
   *
   * @param {*} value - Value to clone.
   * @returns {*} Cloned value.
   */
  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Parses JSON safely and returns a fallback on failure.
   *
   * @param {*} value - Value to parse when it is a string.
   * @param {*} fallback - Value returned when parsing fails.
   * @returns {*} Parsed value or fallback.
   */
  function safeJsonParse(value, fallback) {
    try {
      if (typeof value === "string") {
        return JSON.parse(value);
      }
      return value;
    } catch (error) {
      return fallback;
    }
  }

  /**
   * Converts common form values to a boolean.
   *
   * @param {*} value - Value to normalize.
   * @returns {boolean} Boolean representation.
   */
  function toBool(value) {
    if (typeof value === "boolean") return value;
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "on";
  }

  /**
   * Converts a value to a finite number.
   *
   * @param {*} value - Value to convert.
   * @param {number} fallback - Value returned when conversion fails.
   * @returns {number} Parsed number or fallback.
   */
  function toNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  /**
   * Normalizes supported fetch request bodies into plain objects.
   *
   * @param {*} body - Request body from fetch options.
   * @returns {object} Parsed request body.
   */
  function parseRequestBody(body) {
    if (!body) return {};

    if (typeof body === "string") {
      return safeJsonParse(body, {});
    }

    if (body instanceof URLSearchParams) {
      return Object.fromEntries(body.entries());
    }

    if (body instanceof FormData) {
      const result = {};
      for (const [key, value] of body.entries()) {
        if (typeof File !== "undefined" && value instanceof File) {
          continue;
        }

        if (result[key] !== undefined) {
          if (!Array.isArray(result[key])) {
            result[key] = [result[key]];
          }
          result[key].push(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    return {};
  }

  /**
   * Creates the default in-browser mock database.
   *
   * @returns {object} Initial mock state.
   */
  function createInitialState() {
    const partidos = [
      {
        id: "partido-pp",
        nome: "Partido Progressista",
        sigla: "PP",
        logo_url: "https://ui-avatars.com/api/?name=PP&background=161B22&color=fff&size=40",
      },
      {
        id: "partido-mdb",
        nome: "Movimento Democratico Brasileiro",
        sigla: "MDB",
        logo_url: "https://ui-avatars.com/api/?name=MDB&background=1E2A44&color=fff&size=40",
      },
      {
        id: "partido-pt",
        nome: "Partido dos Trabalhadores",
        sigla: "PT",
        logo_url: "https://ui-avatars.com/api/?name=PT&background=7A1F1F&color=fff&size=40",
      },
      {
        id: "partido-psd",
        nome: "Partido Social Democratico",
        sigla: "PSD",
        logo_url: "https://ui-avatars.com/api/?name=PSD&background=3E3E3E&color=fff&size=40",
      },
      {
        id: "partido-uniao",
        nome: "Uniao Brasil",
        sigla: "UNI",
        logo_url: "https://ui-avatars.com/api/?name=UNI&background=204D39&color=fff&size=40",
      },
    ];

    const camaras = [
      {
        id: "camara-1",
        nome_camara: "Camara Municipal de Dom Expedito Lopes",
        municipio: "Dom Expedito Lopes",
        estado: "PI",
        is_active: true,
        brasao_url: "",
        admin: {
          id: "user-admin-camara-1",
          email: "admin@domexpedito.mock",
        },
        tv: {
          id: "user-tv-camara-1",
          email: "tv@domexpedito.mock",
        },
        link_facebook: "",
        link_instagram: "",
        link_youtube: "",
        site_oficial: "",
        youtube_stream_key: "",
        youtube_rtmp_url: "",
        youtube_channel_id: "",
        youtube_channel_url: "",
      },
      {
        id: "camara-2",
        nome_camara: "Camara Municipal de Picos",
        municipio: "Picos",
        estado: "PI",
        is_active: true,
        brasao_url: "",
        admin: {
          id: "user-admin-camara-2",
          email: "admin@picos.mock",
        },
        tv: {
          id: "user-tv-camara-2",
          email: "tv@picos.mock",
        },
        link_facebook: "",
        link_instagram: "",
        link_youtube: "",
        site_oficial: "",
        youtube_stream_key: "",
        youtube_rtmp_url: "",
        youtube_channel_id: "",
        youtube_channel_url: "",
      },
      {
        id: "camara-3",
        nome_camara: "Camara Municipal de Oeiras",
        municipio: "Oeiras",
        estado: "PI",
        is_active: false,
        brasao_url: "",
        admin: {
          id: "user-admin-camara-3",
          email: "admin@oeiras.mock",
        },
        tv: null,
        link_facebook: "",
        link_instagram: "",
        link_youtube: "",
        site_oficial: "",
        youtube_stream_key: "",
        youtube_rtmp_url: "",
        youtube_channel_id: "",
        youtube_channel_url: "",
      },
    ];

    const sessoes = [
      {
        id: "sessao-1",
        camara_id: "camara-1",
        numero: 5,
        tipo: "Ordinaria",
        data_sessao: nowIso(-2),
        status: "Finalizada",
        nome: "5a Sessao Ordinaria de 2026",
      },
      {
        id: "sessao-2",
        camara_id: "camara-1",
        numero: 6,
        tipo: "Ordinaria",
        data_sessao: nowIso(3),
        status: "Agendada",
        nome: "6a Sessao Ordinaria de 2026",
      },
      {
        id: "sessao-3",
        camara_id: "camara-2",
        numero: 2,
        tipo: "Extraordinaria",
        data_sessao: nowIso(-1),
        status: "Finalizada",
        nome: "2a Sessao Extraordinaria de 2026",
      },
    ];

    const pautas = [
      {
        id: "pauta-1",
        camara_id: "camara-1",
        sessao_id: "sessao-1",
        nome: "Projeto de Lei 001/2026",
        descricao: "Institui programa municipal de incentivo a cultura local.",
        autor: "Mesa Diretora",
        status: "Finalizada",
        resultado_votacao: "Aprovada",
        created_at: nowIso(-5),
        updated_at: nowIso(-2),
      },
      {
        id: "pauta-2",
        camara_id: "camara-1",
        sessao_id: "sessao-2",
        nome: "Requerimento 002/2026",
        descricao: "Solicita melhorias na iluminacao publica do centro.",
        autor: "Ver. Marcilene",
        status: "Em Votacao",
        resultado_votacao: "Nao Votada",
        created_at: nowIso(-1),
        updated_at: nowIso(-1),
      },
      {
        id: "pauta-3",
        camara_id: "camara-1",
        sessao_id: "sessao-2",
        nome: "Projeto de Lei Complementar 003/2026",
        descricao: "Atualiza regras de funcionamento das comissoes permanentes.",
        autor: "Mesa Diretora",
        status: "Pendente",
        resultado_votacao: "Nao Votada",
        created_at: nowIso(0),
        updated_at: nowIso(0),
      },
      {
        id: "pauta-4",
        camara_id: "camara-2",
        sessao_id: "sessao-3",
        nome: "Projeto de Lei 010/2026",
        descricao: "Regulamenta o uso de espacos publicos para eventos.",
        autor: "Chefe do Executivo",
        status: "Finalizada",
        resultado_votacao: "Reprovada",
        created_at: nowIso(-8),
        updated_at: nowIso(-1),
      },
      {
        id: "pauta-5",
        camara_id: "camara-2",
        sessao_id: "sessao-3",
        nome: "Indicacao 011/2026",
        descricao: "Indica construcao de praca no bairro Junco.",
        autor: "Ver. Carlos",
        status: "Finalizada",
        resultado_votacao: "Aprovada",
        created_at: nowIso(-6),
        updated_at: nowIso(-1),
      },
    ];

    const vereadores = [
      {
        id: "vereador-1",
        camara_id: "camara-1",
        nome_parlamentar: "Marcilene Barros",
        partido_id: "partido-pp",
        foto_url: "",
        is_presidente: true,
        is_vice_presidente: false,
        is_active: true,
        email: "marcilene@camara.mock",
      },
      {
        id: "vereador-2",
        camara_id: "camara-1",
        nome_parlamentar: "Joao de Assis",
        partido_id: "partido-mdb",
        foto_url: "",
        is_presidente: false,
        is_vice_presidente: true,
        is_active: true,
        email: "joao@camara.mock",
      },
      {
        id: "vereador-3",
        camara_id: "camara-1",
        nome_parlamentar: "Ana Paula",
        partido_id: "partido-pt",
        foto_url: "",
        is_presidente: false,
        is_vice_presidente: false,
        is_active: true,
        email: "ana@camara.mock",
      },
      {
        id: "vereador-4",
        camara_id: "camara-1",
        nome_parlamentar: "Carlos Mendes",
        partido_id: "partido-psd",
        foto_url: "",
        is_presidente: false,
        is_vice_presidente: false,
        is_active: false,
        email: "carlos@camara.mock",
      },
      {
        id: "vereador-5",
        camara_id: "camara-2",
        nome_parlamentar: "Juliana Rocha",
        partido_id: "partido-uniao",
        foto_url: "",
        is_presidente: true,
        is_vice_presidente: false,
        is_active: true,
        email: "juliana@camara.mock",
      },
    ];

    const votos = [
      {
        id: "voto-1",
        pauta_id: "pauta-1",
        vereador_id: "vereador-1",
        voto: "SIM",
        created_at: nowIso(-2),
        era_presidente_no_voto: true,
      },
      {
        id: "voto-2",
        pauta_id: "pauta-1",
        vereador_id: "vereador-2",
        voto: "SIM",
        created_at: nowIso(-2),
        era_presidente_no_voto: false,
      },
      {
        id: "voto-3",
        pauta_id: "pauta-1",
        vereador_id: "vereador-3",
        voto: "NAO",
        created_at: nowIso(-2),
        era_presidente_no_voto: false,
      },
      {
        id: "voto-4",
        pauta_id: "pauta-1",
        vereador_id: "vereador-4",
        voto: "ABSTENCAO",
        created_at: nowIso(-2),
        era_presidente_no_voto: false,
      },
      {
        id: "voto-5",
        pauta_id: "pauta-4",
        vereador_id: "vereador-5",
        voto: "NAO",
        created_at: nowIso(-1),
        era_presidente_no_voto: true,
      },
    ];

    const userEmails = [
      "admin@domexpedito.mock",
      "admin@picos.mock",
      "tv@domexpedito.mock",
      "tv@picos.mock",
      ...vereadores.map((v) => v.email),
    ];

    return {
      partidos,
      camaras,
      sessoes,
      pautas,
      vereadores,
      votos,
      userEmails,
      liveVoting: {
        isLive: false,
        camaraId: null,
        pautaId: null,
      },
      updatedAt: nowIso(),
    };
  }

  /**
   * Loads mock state from localStorage or creates a default state.
   *
   * @returns {object} Current mock state.
   */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return createInitialState();
      return parsed;
    } catch (error) {
      console.warn("[MOCK] Falha ao ler estado local, restaurando padrao.", error);
      return createInitialState();
    }
  }

  let state = loadState();

  /**
   * Persists the current mock state to localStorage.
   *
   * @returns {void}
   */
  function saveState() {
    state.updatedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /**
   * Reads the authenticated user stored by the frontend.
   *
   * @returns {object|null} Stored user data, or null when unavailable.
   */
  function getCurrentUser() {
    try {
      const raw = localStorage.getItem("userData");
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Gets the primary chamber id for the current user scope.
   *
   * @returns {string|null} Current chamber id.
   */
  function getCurrentCamaraId() {
    return getCurrentCamaraScope().primaryCamaraId;
  }

  /**
   * Resolves the chamber ids visible to the current user.
   *
   * @returns {{primaryCamaraId: string|null, scopeCamaraIds: string[]}} Chamber scope.
   */
  function getCurrentCamaraScope() {
    const user = getCurrentUser();
    const userCamaraId = user?.camara_id || user?.camaraId || user?.camara?.id || null;
    const firstMockCamaraId = state.camaras[0]?.id || null;

    // Sem camara no user: segue o comportamento antigo com a primeira camara mock.
    if (!userCamaraId) {
      return {
        primaryCamaraId: firstMockCamaraId,
        scopeCamaraIds: firstMockCamaraId ? [firstMockCamaraId] : [],
      };
    }

    const hasUserCamaraInMock = state.camaras.some(
      (camara) => String(camara.id) === String(userCamaraId),
    );

    // Quando o camara_id real nao existe no seed mock, exibimos seed + dados criados no id real.
    if (!hasUserCamaraInMock && firstMockCamaraId) {
      const mergedScope =
        String(firstMockCamaraId) === String(userCamaraId)
          ? [userCamaraId]
          : [userCamaraId, firstMockCamaraId];

      return {
        primaryCamaraId: userCamaraId,
        scopeCamaraIds: mergedScope,
      };
    }

    return {
      primaryCamaraId: userCamaraId,
      scopeCamaraIds: [userCamaraId],
    };
  }

  /**
   * Checks whether a chamber id is allowed by a scope list.
   *
   * @param {string} itemCamaraId - Chamber id to check.
   * @param {string[]} scopeCamaraIds - Allowed chamber ids.
   * @returns {boolean} True when the item is in scope.
   */
  function isInCamaraScope(itemCamaraId, scopeCamaraIds) {
    if (!Array.isArray(scopeCamaraIds) || scopeCamaraIds.length === 0) {
      return true;
    }

    return scopeCamaraIds.some((scopeId) => String(scopeId) === String(itemCamaraId));
  }

  /**
   * Enriches a councilor with party data.
   *
   * @param {object} vereador - Councilor record.
   * @returns {object} Councilor with a partidos object.
   */
  function withPartido(vereador) {
    const partido = state.partidos.find((p) => p.id === vereador.partido_id) || null;
    return {
      ...vereador,
      partidos: partido
        ? {
            id: partido.id,
            nome: partido.nome,
            sigla: partido.sigla,
            logo_url: partido.logo_url,
          }
        : null,
    };
  }

  /**
   * Calculates aggregate counts for a chamber.
   *
   * @param {string} camaraId - Chamber id.
   * @returns {{vereadoresCount: number, sessoesCount: number, pautasCount: number}} Chamber metrics.
   */
  function camaraMetrics(camaraId) {
    const vereadoresCount = state.vereadores.filter((v) => v.camara_id === camaraId).length;
    const sessoesCount = state.sessoes.filter((s) => s.camara_id === camaraId).length;
    const pautasCount = state.pautas.filter((p) => p.camara_id === camaraId).length;
    return {
      vereadoresCount,
      sessoesCount,
      pautasCount,
    };
  }

  /**
   * Applies simple pagination to an array.
   *
   * @param {Array} items - Items to paginate.
   * @param {*} pageParam - Requested page value.
   * @param {*} limitParam - Requested page size value.
   * @returns {{currentPage: number, totalPages: number, totalItems: number, limit: number, data: Array}} Paginated result.
   */
  function paginate(items, pageParam, limitParam) {
    const page = Math.max(1, toNumber(pageParam, 1));
    const limit = Math.max(1, toNumber(limitParam, 20));
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * limit;
    return {
      currentPage,
      totalPages,
      totalItems,
      limit,
      data: items.slice(offset, offset + limit),
    };
  }

  /**
   * Creates a JSON fetch Response.
   *
   * @param {*} body - Response payload.
   * @param {number} [status=200] - HTTP status code.
   * @returns {Response} JSON response.
   */
  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Creates an empty 204 fetch Response.
   *
   * @returns {Response} No-content response.
   */
  function noContentResponse() {
    return new Response(null, {
      status: 204,
    });
  }

  /**
   * Normalizes vote labels to internal mock constants.
   *
   * @param {*} vote - Vote value to normalize.
   * @returns {string} Internal vote label.
   */
  function normalizeVoteLabel(vote) {
    const normalized = String(vote || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    if (normalized === "SIM") return "SIM";
    if (normalized === "NAO") return "NAO";
    if (normalized === "ABSTENCAO") return "ABSTENCAO";
    return "ABSTENCAO";
  }

  /**
   * Converts an internal vote label to its public display label.
   *
   * @param {string} vote - Internal vote label.
   * @returns {string} Public vote label.
   */
  function publicVoteLabel(vote) {
    if (vote === "SIM") return "SIM";
    if (vote === "NAO") return "NÃO";
    return "ABSTENÇÃO";
  }

  /**
   * Builds the default admin email for a chamber.
   *
   * @param {object} camara - Chamber record.
   * @returns {string} Default admin email.
   */
  function defaultAdminEmailForCamara(camara) {
    const defaults = {
      "camara-1": "admin@domexpedito.mock",
      "camara-2": "admin@picos.mock",
      "camara-3": "admin@oeiras.mock",
    };

    if (defaults[camara.id]) return defaults[camara.id];

    const base = String(camara.municipio || camara.nome_camara || camara.id || "camara")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");

    return `admin@${base || "camara"}.mock`;
  }

  /**
   * Builds the default TV user email for a chamber.
   *
   * @param {object} camara - Chamber record.
   * @returns {string} Default TV email, or an empty string.
   */
  function defaultTvEmailForCamara(camara) {
    const defaults = {
      "camara-1": "tv@domexpedito.mock",
      "camara-2": "tv@picos.mock",
    };

    if (defaults[camara.id]) return defaults[camara.id];
    return "";
  }

  /**
   * Ensures a chamber has normalized admin and TV contact objects.
   *
   * @param {object} camara - Chamber record to mutate.
   * @returns {void}
   */
  function ensureCamaraContacts(camara) {
    if (!camara || typeof camara !== "object") return;

    if (!camara.admin || typeof camara.admin !== "object") {
      camara.admin = {};
    }

    if (!camara.admin.id) {
      camara.admin.id = `user-admin-${camara.id}`;
    }

    if (!camara.admin.email) {
      camara.admin.email = defaultAdminEmailForCamara(camara);
    }

    const tvFallback = defaultTvEmailForCamara(camara);
    const hasTvObject = camara.tv && typeof camara.tv === "object";

    if (hasTvObject || tvFallback) {
      if (!hasTvObject) {
        camara.tv = {};
      }

      if (!camara.tv.id) {
        camara.tv.id = `user-tv-${camara.id}`;
      }

      if (!camara.tv.email && tvFallback) {
        camara.tv.email = tvFallback;
      }
    } else if (camara.tv === undefined) {
      camara.tv = null;
    }
  }

  /**
   * Rebuilds the mock email index from users and councilors.
   *
   * @returns {void}
   */
  function refreshEmailIndex() {
    const fromVereadores = state.vereadores
      .map((v) => String(v.email || "").trim().toLowerCase())
      .filter(Boolean);

    const fromCamaras = state.camaras
      .flatMap((camara) => {
        ensureCamaraContacts(camara);
        return [camara.admin?.email || "", camara.tv?.email || ""];
      })
      .map((email) => String(email || "").trim().toLowerCase())
      .filter(Boolean);

    state.userEmails = Array.from(
      new Set([...(state.userEmails || []), ...fromVereadores, ...fromCamaras]),
    );
  }

  /**
   * Ensures only one councilor keeps a given chamber role.
   *
   * @param {string} camaraId - Chamber id.
   * @param {string} field - Boolean role field to enforce.
   * @param {string} vereadorIdToKeep - Councilor id that should keep the role.
   * @returns {void}
   */
  function ensureSingleCargo(camaraId, field, vereadorIdToKeep) {
    state.vereadores.forEach((vereador) => {
      if (vereador.camara_id !== camaraId) return;
      if (vereador.id === vereadorIdToKeep) return;
      vereador[field] = false;
    });
  }

  /**
   * Finds a mock admin or TV user by id.
   *
   * @param {string} userId - User id to locate.
   * @returns {{camara: object, slot: string, user: object}|null} Matching user entry.
   */
  function findMockUserById(userId) {
    for (const camara of state.camaras) {
      ensureCamaraContacts(camara);

      if (camara.admin && String(camara.admin.id) === String(userId)) {
        return {
          camara,
          slot: "admin",
          user: camara.admin,
        };
      }

      if (camara.tv && String(camara.tv.id) === String(userId)) {
        return {
          camara,
          slot: "tv",
          user: camara.tv,
        };
      }
    }

    return null;
  }

  /**
   * Initializes optional state branches used by later mock features.
   *
   * @returns {void}
   */
  function ensureExtendedState() {
    if (!Array.isArray(state.oradores)) {
      state.oradores = [];
    }

    if (!state.liveSpeech || typeof state.liveSpeech !== "object") {
      state.liveSpeech = null;
    }
  }

  /**
   * Calculates vote totals for a pauta.
   *
   * @param {string} pautaId - Pauta id.
   * @returns {{sim: number, nao: number, abstencao: number, total: number}} Vote totals.
   */
  function voteTotalsForPauta(pautaId) {
    return state.votos
      .filter((item) => String(item.pauta_id) === String(pautaId))
      .reduce(
        (acc, item) => {
          const normalized = normalizeVoteLabel(item.voto);
          if (normalized === "SIM") acc.sim += 1;
          else if (normalized === "NAO") acc.nao += 1;
          else acc.abstencao += 1;
          acc.total += 1;
          return acc;
        },
        { sim: 0, nao: 0, abstencao: 0, total: 0 },
      );
  }

  /**
   * Resolves the voting result for a pauta based on vote totals.
   *
   * @param {string} pautaId - Pauta id.
   * @returns {string} Voting result label.
   */
  function resolveResultadoVotacao(pautaId) {
    const totals = voteTotalsForPauta(pautaId);
    if (totals.total === 0) return "Não Votada";
    if (totals.sim > totals.nao) return "Aprovada";
    if (totals.nao > totals.sim) return "Reprovada";
    return "Empate";
  }

  /**
   * Enriches a pauta with its session relationship.
   *
   * @param {object|null} pauta - Pauta record.
   * @returns {object|null} Enriched pauta or null.
   */
  function enrichPauta(pauta) {
    if (!pauta) return null;

    const sessao = state.sessoes.find((item) => String(item.id) === String(pauta.sessao_id));

    return {
      ...pauta,
      sessoes: sessao
        ? {
            id: sessao.id,
            nome: sessao.nome,
            data_sessao: sessao.data_sessao,
            tipo: sessao.tipo,
            status: sessao.status,
            camara_id: sessao.camara_id,
          }
        : null,
    };
  }

  /**
   * Enriches a speaker entry with councilor and session data.
   *
   * @param {object|null} orador - Speaker record.
   * @returns {object|null} Enriched speaker or null.
   */
  function enrichOrador(orador) {
    if (!orador) return null;

    const sessao = state.sessoes.find((item) => String(item.id) === String(orador.sessao_id));
    const vereador = state.vereadores.find(
      (item) => String(item.id) === String(orador.vereador_id),
    );

    return {
      ...orador,
      vereadores: vereador ? withPartido(vereador) : null,
      sessoes: sessao
        ? {
            id: sessao.id,
            nome: sessao.nome,
            data_sessao: sessao.data_sessao,
            tipo: sessao.tipo,
            status: sessao.status,
            camara_id: sessao.camara_id,
          }
        : null,
    };
  }

  /**
   * Maps a councilor to the public portal response shape.
   *
   * @param {object} vereador - Councilor record.
   * @returns {object} Portal-ready councilor record.
   */
  function mapPortalVereador(vereador) {
    const vereadorWithPartido = withPartido(vereador);
    const votos = state.votos.filter((item) => String(item.vereador_id) === String(vereador.id));

    return {
      ...vereadorWithPartido,
      nome: vereadorWithPartido.nome_parlamentar,
      partido: vereadorWithPartido.partidos,
      estatisticas: {
        total_votos: votos.length,
      },
    };
  }

  /**
   * Normalizes and formats a vote for public responses.
   *
   * @param {*} voto - Vote value.
   * @returns {string} Public vote label.
   */
  function toPublicVote(voto) {
    return publicVoteLabel(normalizeVoteLabel(voto));
  }

  /**
   * Gets the current Unix timestamp in seconds.
   *
   * @returns {number} Current timestamp in seconds.
   */
  function currentTimestampSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Advances active speech timing based on elapsed wall-clock time.
   *
   * @returns {void}
   */
  function ensureLiveSpeechTiming() {
    if (!state.liveSpeech || state.liveSpeech.status !== "iniciada") {
      return;
    }

    if (!state.liveSpeech.lastTickAt) {
      state.liveSpeech.lastTickAt = currentTimestampSeconds();
      return;
    }

    const now = currentTimestampSeconds();
    const elapsed = Math.max(0, now - Number(state.liveSpeech.lastTickAt || now));

    if (elapsed <= 0) return;

    const previous = Math.max(0, toNumber(state.liveSpeech.tempoRestanteSegundos, 0));
    const next = Math.max(0, previous - elapsed);
    state.liveSpeech.tempoRestanteSegundos = next;
    state.liveSpeech.lastTickAt = now;

    if (next === 0) {
      state.liveSpeech.status = "tempo_esgotado";
    }
  }

  /**
   * Builds a mock livestream payload for a chamber display endpoint.
   *
   * @param {string} camaraId - Chamber id.
   * @returns {object} Livestream payload.
   */
  function buildLivestreamPayload(camaraId) {
    const camara = state.camaras.find((item) => String(item.id) === String(camaraId));
    const activeSession = state.sessoes.find(
      (sessao) =>
        String(sessao.camara_id) === String(camaraId) &&
        ["Em andamento", "Aberta"].includes(String(sessao.status || "")),
    );

    const titleBase = camara?.nome_camara || "Camara Municipal";
    const title = activeSession
      ? `${titleBase} - ${activeSession.nome}`
      : `${titleBase} - Ultima transmissao`;

    return {
      id: `livestream-${camaraId}`,
      camara_id: camaraId,
      title,
      youtube_video_id: "M7lc1UVf-VE",
      concurrent_viewers: activeSession ? 58 : 0,
      started_at: activeSession?.data_sessao || nowIso(-1),
    };
  }

  /**
   * Routes a mock API request to the matching in-memory handler.
   *
   * @param {URL} urlObj - Parsed request URL.
   * @param {string} method - HTTP method.
   * @param {object} body - Parsed request body.
   * @returns {Response|null} Mock response, or null to fall back to real fetch.
   */
  function handleMockRequest(urlObj, method, body) {
    const path = urlObj.pathname.replace(/\/+$/, "") || "/";

    // Mantem autenticacao real no backend
    if (path.startsWith("/api/auth/")) {
      return null;
    }

    ensureExtendedState();

    if (path === "/api/admin/camaras" && method === "GET") {
      const search = String(urlObj.searchParams.get("search") || "")
        .trim()
        .toLowerCase();

      const source = state.camaras.filter((camara) => {
        if (!search) return true;
        return (
          String(camara.nome_camara || "").toLowerCase().includes(search) ||
          String(camara.municipio || "").toLowerCase().includes(search) ||
          String(camara.estado || "").toLowerCase().includes(search)
        );
      });

      const mapped = source.map((camara) => {
        ensureCamaraContacts(camara);
        const metrics = camaraMetrics(camara.id);
        return {
          ...camara,
          vereadores: [{ count: metrics.vereadoresCount }],
          sessoes: [{ count: metrics.sessoesCount }],
          pautas: [{ count: metrics.pautasCount }],
        };
      });

      const pageData = paginate(
        mapped,
        urlObj.searchParams.get("page"),
        urlObj.searchParams.get("limit"),
      );

      const stats = {
        total: state.camaras.length,
        active: state.camaras.filter((c) => c.is_active).length,
        inactive: state.camaras.filter((c) => !c.is_active).length,
      };

      return jsonResponse({
        data: pageData.data,
        pagination: {
          currentPage: pageData.currentPage,
          totalPages: pageData.totalPages,
          totalItems: pageData.totalItems,
          limit: pageData.limit,
        },
        stats,
      });
    }

    if (path === "/api/admin/camaras" && method === "POST") {
      const municipio = String(body.municipio || "Nova Cidade").trim();
      const estado = String(body.estado || "PI").trim().toUpperCase();
      const nomeCamara = String(body.nome_camara || "").trim() || `Camara Municipal de ${municipio}`;
      const adminEmail = String(body.admin_email || "")
        .trim()
        .toLowerCase();
      const tvEmail = String(body.tv_email || "")
        .trim()
        .toLowerCase();
      const camaraId = uid("camara");

      const newCamara = {
        id: camaraId,
        nome_camara: nomeCamara,
        municipio,
        estado,
        is_active: true,
        brasao_url: "",
        admin: {
          id: `user-admin-${camaraId}`,
          email: adminEmail || `admin@${camaraId}.mock`,
        },
        tv: tvEmail
          ? {
              id: `user-tv-${camaraId}`,
              email: tvEmail,
            }
          : null,
        link_facebook: "",
        link_instagram: "",
        link_youtube: "",
        site_oficial: "",
        youtube_stream_key: "",
        youtube_rtmp_url: "",
        youtube_channel_id: "",
        youtube_channel_url: "",
      };

      state.camaras.unshift(newCamara);
      ensureCamaraContacts(newCamara);

      if (newCamara.admin?.email) {
        state.userEmails.push(newCamara.admin.email);
      }
      if (newCamara.tv?.email) {
        state.userEmails.push(newCamara.tv.email);
      }

      const vereadoresPayload = safeJsonParse(body.vereadores, []) || [];
      if (Array.isArray(vereadoresPayload)) {
        vereadoresPayload.forEach((item) => {
          const vereador = {
            id: uid("vereador"),
            camara_id: newCamara.id,
            nome_parlamentar: String(item.nome_parlamentar || "Vereador"),
            partido_id: String(item.partido_id || state.partidos[0]?.id || ""),
            foto_url: "",
            is_presidente: !!item.is_presidente,
            is_vice_presidente: !!item.is_vice_presidente,
            is_active: true,
            email: String(item.email || "").trim().toLowerCase(),
          };

          if (vereador.is_presidente) {
            ensureSingleCargo(newCamara.id, "is_presidente", vereador.id);
          }
          if (vereador.is_vice_presidente) {
            ensureSingleCargo(newCamara.id, "is_vice_presidente", vereador.id);
          }

          state.vereadores.push(vereador);

          if (vereador.email) {
            state.userEmails.push(vereador.email);
          }
        });
      }

      refreshEmailIndex();
      saveState();

      return jsonResponse(
        {
          message: "Camara criada com sucesso (mock)",
          data: newCamara,
        },
        201,
      );
    }

    if ((path === "/api/admin/check-email" || path === "/api/users/check-email") && method === "GET") {
      const email = String(urlObj.searchParams.get("email") || "")
        .trim()
        .toLowerCase();
      refreshEmailIndex();
      return jsonResponse({
        exists: state.userEmails.includes(email),
      });
    }

    if (path === "/api/admin/partidos/check" && method === "GET") {
      const nome = String(urlObj.searchParams.get("nome") || "")
        .trim()
        .toLowerCase();
      const sigla = String(urlObj.searchParams.get("sigla") || "")
        .trim()
        .toUpperCase();

      const exists = state.partidos.some((partido) => {
        const sameNome = nome && partido.nome.toLowerCase() === nome;
        const sameSigla = sigla && partido.sigla.toUpperCase() === sigla;
        return sameNome || sameSigla;
      });

      return jsonResponse({ exists });
    }

    if (path === "/api/admin/partidos" && method === "POST") {
      const nome = String(body.nome || "").trim();
      const sigla = String(body.sigla || "").trim().toUpperCase();

      if (!nome || !sigla) {
        return jsonResponse({ error: "Nome e sigla sao obrigatorios." }, 422);
      }

      const exists = state.partidos.some(
        (partido) =>
          partido.nome.toLowerCase() === nome.toLowerCase() ||
          partido.sigla.toUpperCase() === sigla,
      );

      if (exists) {
        return jsonResponse({ error: "Partido ja cadastrado." }, 409);
      }

      const newPartido = {
        id: uid("partido"),
        nome,
        sigla,
        logo_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(sigla)}&background=161B22&color=fff&size=40`,
      };

      state.partidos.push(newPartido);
      saveState();

      return jsonResponse(newPartido, 201);
    }

    if (/^\/api\/admin\/partidos\/[^/]+$/.test(path) && method === "PUT") {
      const partidoId = path.split("/").pop();
      const partido = state.partidos.find((item) => item.id === partidoId);

      if (!partido) {
        return jsonResponse({ error: "Partido nao encontrado." }, 404);
      }

      if (body.nome) partido.nome = String(body.nome).trim();
      if (body.sigla) partido.sigla = String(body.sigla).trim().toUpperCase();
      if (body.logo_url) partido.logo_url = String(body.logo_url);

      saveState();
      return jsonResponse({ data: partido });
    }

    if (/^\/api\/admin\/partidos\/[^/]+$/.test(path) && method === "DELETE") {
      const partidoId = path.split("/").pop();
      const before = state.partidos.length;
      state.partidos = state.partidos.filter((item) => item.id !== partidoId);

      if (state.partidos.length === before) {
        return jsonResponse({ error: "Partido nao encontrado." }, 404);
      }

      saveState();
      return noContentResponse();
    }

    if (path === "/api/partidos" && method === "GET") {
      const pageData = paginate(
        state.partidos,
        urlObj.searchParams.get("page"),
        urlObj.searchParams.get("limit"),
      );

      return jsonResponse({
        data: pageData.data,
        count: pageData.totalItems,
        pagination: {
          currentPage: pageData.currentPage,
          totalPages: pageData.totalPages,
          totalItems: pageData.totalItems,
          limit: pageData.limit,
        },
      });
    }

    const camaraByIdMatch = path.match(/^\/api\/camaras\/([^/]+)$/);

    if (camaraByIdMatch && camaraByIdMatch[1] !== "publicas" && method === "GET") {
      const camaraId = camaraByIdMatch[1];
      const camara = state.camaras.find((item) => String(item.id) === String(camaraId));

      if (!camara) {
        return jsonResponse({ error: "Camara nao encontrada." }, 404);
      }

      ensureCamaraContacts(camara);
      return jsonResponse(deepClone(camara));
    }

    if (camaraByIdMatch && camaraByIdMatch[1] !== "publicas" && method === "PUT") {
      const camaraId = camaraByIdMatch[1];
      const camara = state.camaras.find((item) => String(item.id) === String(camaraId));

      if (!camara) {
        return jsonResponse({ error: "Camara nao encontrada." }, 404);
      }

      ensureCamaraContacts(camara);

      if (body.nome_camara !== undefined) {
        const nomeCamara = String(body.nome_camara || "").trim();
        if (nomeCamara) camara.nome_camara = nomeCamara;
      }

      if (body.municipio !== undefined) {
        const municipio = String(body.municipio || "").trim();
        if (municipio) camara.municipio = municipio;
      }

      if (body.estado !== undefined) {
        const estado = String(body.estado || "").trim().toUpperCase();
        if (estado) camara.estado = estado;
      }

      if (body.is_active !== undefined) {
        camara.is_active = toBool(body.is_active);
      }

      if (body.brasao_url !== undefined) {
        camara.brasao_url = String(body.brasao_url || "").trim();
      }

      const socialFields = [
        "link_facebook",
        "link_instagram",
        "link_youtube",
        "site_oficial",
        "youtube_stream_key",
        "youtube_rtmp_url",
        "youtube_channel_id",
        "youtube_channel_url",
      ];

      socialFields.forEach((field) => {
        if (body[field] !== undefined) {
          camara[field] = String(body[field] || "").trim();
        }
      });

      if (body.tv_email !== undefined) {
        const tvEmail = String(body.tv_email || "")
          .trim()
          .toLowerCase();

        if (tvEmail) {
          if (!camara.tv || typeof camara.tv !== "object") {
            camara.tv = {
              id: `user-tv-${camara.id}`,
              email: tvEmail,
            };
          } else {
            camara.tv.email = tvEmail;
            if (!camara.tv.id) {
              camara.tv.id = `user-tv-${camara.id}`;
            }
          }
        } else {
          camara.tv = null;
        }
      }

      refreshEmailIndex();
      saveState();

      return jsonResponse({
        message: "Camara atualizada com sucesso (mock)",
        data: camara,
      });
    }

    if (/^\/api\/users\/[^/]+$/.test(path) && method === "PUT") {
      const userId = path.split("/").pop();
      const entry = findMockUserById(userId);

      if (!entry) {
        return jsonResponse({ error: "Usuario nao encontrado." }, 404);
      }

      if (body.email !== undefined) {
        const email = String(body.email || "")
          .trim()
          .toLowerCase();

        if (!email) {
          return jsonResponse({ error: "Email invalido." }, 422);
        }

        entry.user.email = email;
      }

      refreshEmailIndex();
      saveState();

      return jsonResponse({
        message: "Usuario atualizado com sucesso (mock)",
        data: {
          id: entry.user.id,
          email: entry.user.email,
          slot: entry.slot,
        },
      });
    }

    if (/^\/api\/admin\/camaras\/[^/]+\/vereadores$/.test(path) && method === "GET") {
      const camaraId = path.split("/")[4];
      const camara = state.camaras.find((item) => String(item.id) === String(camaraId));

      if (!camara) {
        return jsonResponse({ error: "Camara nao encontrada." }, 404);
      }

      const vereadores = state.vereadores
        .filter((vereador) => String(vereador.camara_id) === String(camaraId))
        .map(withPartido);

      return jsonResponse({ vereadores });
    }

    if (/^\/api\/camaras\/[^/]+\/vereadores$/.test(path) && method === "POST") {
      const camaraId = path.split("/")[3];
      const camara = state.camaras.find((item) => String(item.id) === String(camaraId));

      if (!camara) {
        return jsonResponse({ details: "Camara nao encontrada." }, 404);
      }

      const nome = String(body.nome_parlamentar || "").trim();
      const partidoId = String(body.partido_id || "").trim();
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const senha = String(body.senha || "").trim();

      if (!nome || !partidoId || !email || !senha) {
        return jsonResponse({ details: "Dados obrigatorios incompletos." }, 422);
      }

      const newVereador = {
        id: uid("vereador"),
        camara_id: camaraId,
        nome_parlamentar: nome,
        partido_id: partidoId,
        foto_url: "",
        is_presidente: toBool(body.is_presidente),
        is_vice_presidente: toBool(body.is_vice_presidente),
        is_active: true,
        email,
      };

      if (newVereador.is_presidente) {
        ensureSingleCargo(camaraId, "is_presidente", newVereador.id);
      }
      if (newVereador.is_vice_presidente) {
        ensureSingleCargo(camaraId, "is_vice_presidente", newVereador.id);
      }

      state.vereadores.unshift(newVereador);
      refreshEmailIndex();
      saveState();

      return jsonResponse(
        {
          message: "Vereador criado com sucesso (mock)",
          data: withPartido(newVereador),
        },
        201,
      );
    }

    if (/^\/api\/vereadores\/[^/]+$/.test(path) && method === "PUT") {
      const vereadorId = path.split("/").pop();
      const vereador = state.vereadores.find((item) => item.id === vereadorId);

      if (!vereador) {
        return jsonResponse({ details: "Vereador nao encontrado." }, 404);
      }

      if (body.nome_parlamentar !== undefined) {
        vereador.nome_parlamentar = String(body.nome_parlamentar || "").trim();
      }
      if (body.partido_id !== undefined) {
        vereador.partido_id = String(body.partido_id || "").trim();
      }
      if (body.email !== undefined) {
        const email = String(body.email || "")
          .trim()
          .toLowerCase();
        if (email) {
          vereador.email = email;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
        vereador.is_active = toBool(body.is_active);
      }

      if (Object.prototype.hasOwnProperty.call(body, "is_presidente")) {
        vereador.is_presidente = toBool(body.is_presidente);
        if (vereador.is_presidente) {
          ensureSingleCargo(vereador.camara_id, "is_presidente", vereador.id);
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, "is_vice_presidente")) {
        vereador.is_vice_presidente = toBool(body.is_vice_presidente);
        if (vereador.is_vice_presidente) {
          ensureSingleCargo(vereador.camara_id, "is_vice_presidente", vereador.id);
        }
      }

      refreshEmailIndex();
      saveState();

      return jsonResponse({
        message: "Vereador atualizado com sucesso (mock)",
        data: withPartido(vereador),
      });
    }

    if (/^\/api\/vereadores\/[^/]+$/.test(path) && method === "DELETE") {
      const vereadorId = path.split("/").pop();
      const vereador = state.vereadores.find((item) => item.id === vereadorId);

      if (!vereador) {
        return jsonResponse({ details: "Vereador nao encontrado." }, 404);
      }

      state.vereadores = state.vereadores.filter((item) => item.id !== vereadorId);
      state.votos = state.votos.filter((voto) => voto.vereador_id !== vereadorId);

      refreshEmailIndex();
      saveState();

      return noContentResponse();
    }

    if (path === "/api/pautas/autores" && method === "GET") {
      const autores = Array.from(
        new Set(
          state.pautas
            .map((item) => String(item.autor || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "pt-BR"));

      return jsonResponse({ data: autores });
    }

    if (path === "/api/pautas" && method === "POST") {
      const payload = body || {};
      const { primaryCamaraId, scopeCamaraIds } = getCurrentCamaraScope();

      const camaraId = String(payload.camara_id || primaryCamaraId || "");
      if (!camaraId) {
        return jsonResponse({ error: "Camara nao encontrada para criar pauta." }, 422);
      }

      if (scopeCamaraIds.length > 0 && !isInCamaraScope(camaraId, scopeCamaraIds)) {
        return jsonResponse({ error: "Sem permissao para criar pauta nesta camara." }, 403);
      }

      const nome = String(payload.nome || payload.titulo || "").trim();
      if (!nome) {
        return jsonResponse({ error: "Nome da pauta e obrigatorio." }, 422);
      }

      const sessaoIdRaw = String(payload.sessao_id || payload.sessaoId || "").trim();
      const sessao = state.sessoes.find((item) => {
        const sameCamara = String(item.camara_id) === String(camaraId);
        if (!sameCamara) return false;
        if (!sessaoIdRaw) return true;
        return String(item.id) === sessaoIdRaw;
      });

      if (!sessao) {
        return jsonResponse({ error: "Sessao nao encontrada para a pauta." }, 422);
      }

      const now = nowIso();
      const newPauta = {
        id: uid("pauta"),
        camara_id: camaraId,
        sessao_id: sessao.id,
        nome,
        ementa: String(payload.ementa || payload.descricao || "").trim(),
        autor: String(payload.autor || payload.autoria || "Autor nao informado").trim(),
        status: String(payload.status || "Pendente").trim() || "Pendente",
        resultado_votacao:
          payload.resultado_votacao !== undefined && payload.resultado_votacao !== null
            ? String(payload.resultado_votacao).trim()
            : null,
        data_apresentacao: String(payload.data_apresentacao || sessao.data_sessao || now),
        observacoes: String(payload.observacoes || "").trim(),
        created_at: now,
        updated_at: now,
      };

      state.pautas.unshift(newPauta);
      saveState();

      return jsonResponse(
        {
          message: "Pauta criada com sucesso (mock)",
          data: enrichPauta(newPauta),
        },
        201,
      );
    }

    if (/^\/api\/pautas\/[^/]+\/status$/.test(path) && method === "PUT") {
      const pautaId = path.split("/")[3];
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const pauta = state.pautas.find(
        (item) =>
          String(item.id) === String(pautaId) &&
          isInCamaraScope(item.camara_id, scopeCamaraIds),
      );

      if (!pauta) {
        return jsonResponse({ error: "Pauta nao encontrada." }, 404);
      }

      const status = String((body && body.status) || pauta.status || "Pendente").trim();
      if (!status) {
        return jsonResponse({ error: "Status e obrigatorio." }, 422);
      }

      pauta.status = status;

      const normalizedStatus = status.toLowerCase();

      if (normalizedStatus === "finalizada") {
        pauta.resultado_votacao = resolveResultadoVotacao(pauta.id);
      }

      if (["em votacao", "em votação"].includes(normalizedStatus)) {
        state.liveVoting = {
          isLive: true,
          camaraId: pauta.camara_id,
          pautaId: pauta.id,
        };
      } else if (String(state.liveVoting.pautaId) === String(pauta.id)) {
        state.liveVoting = {
          isLive: false,
          camaraId: null,
          pautaId: null,
        };
      }

      pauta.updated_at = nowIso();
      saveState();

      return jsonResponse({
        message: "Status da pauta atualizado com sucesso (mock)",
        data: enrichPauta(pauta),
      });
    }

    if (/^\/api\/pautas\/[^/]+$/.test(path) && method === "GET") {
      const pautaId = path.split("/").pop();
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const pauta = state.pautas.find(
        (item) =>
          String(item.id) === String(pautaId) &&
          isInCamaraScope(item.camara_id, scopeCamaraIds),
      );

      if (!pauta) {
        return jsonResponse({ error: "Pauta nao encontrada." }, 404);
      }

      const payload = enrichPauta(pauta);
      return jsonResponse({
        ...payload,
        data: payload,
      });
    }

    if (/^\/api\/pautas\/[^/]+$/.test(path) && method === "PUT") {
      const pautaId = path.split("/").pop();
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const pauta = state.pautas.find(
        (item) =>
          String(item.id) === String(pautaId) &&
          isInCamaraScope(item.camara_id, scopeCamaraIds),
      );

      if (!pauta) {
        return jsonResponse({ error: "Pauta nao encontrada." }, 404);
      }

      const payload = body || {};

      if (payload.nome !== undefined) {
        pauta.nome = String(payload.nome || "").trim() || pauta.nome;
      }

      if (payload.ementa !== undefined || payload.descricao !== undefined) {
        pauta.ementa = String(payload.ementa || payload.descricao || "").trim();
      }

      if (payload.autor !== undefined || payload.autoria !== undefined) {
        pauta.autor =
          String(payload.autor || payload.autoria || "").trim() || pauta.autor;
      }

      if (payload.status !== undefined) {
        pauta.status = String(payload.status || pauta.status).trim() || pauta.status;
      }

      if (payload.resultado_votacao !== undefined) {
        pauta.resultado_votacao = payload.resultado_votacao
          ? String(payload.resultado_votacao)
          : null;
      }

      if (payload.data_apresentacao !== undefined) {
        pauta.data_apresentacao = String(payload.data_apresentacao || pauta.data_apresentacao);
      }

      if (payload.observacoes !== undefined) {
        pauta.observacoes = String(payload.observacoes || "").trim();
      }

      if (payload.sessao_id !== undefined || payload.sessaoId !== undefined) {
        const sessaoId = String(payload.sessao_id || payload.sessaoId || "").trim();
        const sessao = state.sessoes.find(
          (item) =>
            String(item.id) === String(sessaoId) &&
            isInCamaraScope(item.camara_id, scopeCamaraIds),
        );

        if (!sessao) {
          return jsonResponse({ error: "Sessao informada nao encontrada." }, 422);
        }

        pauta.sessao_id = sessao.id;
        pauta.camara_id = sessao.camara_id;
      }

      if (String(pauta.status || "").toLowerCase() === "finalizada" && !pauta.resultado_votacao) {
        pauta.resultado_votacao = resolveResultadoVotacao(pauta.id);
      }

      pauta.updated_at = nowIso();
      saveState();

      return jsonResponse({
        message: "Pauta atualizada com sucesso (mock)",
        data: enrichPauta(pauta),
      });
    }

    if (/^\/api\/pautas\/[^/]+$/.test(path) && method === "DELETE") {
      const pautaId = path.split("/").pop();
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const pauta = state.pautas.find(
        (item) =>
          String(item.id) === String(pautaId) &&
          isInCamaraScope(item.camara_id, scopeCamaraIds),
      );

      if (!pauta) {
        return jsonResponse({ error: "Pauta nao encontrada." }, 404);
      }

      const hasVotes = state.votos.some((item) => String(item.pauta_id) === String(pautaId));
      if (hasVotes) {
        return jsonResponse(
          { error: "Nao e possivel excluir pauta com votos registrados." },
          409,
        );
      }

      state.pautas = state.pautas.filter((item) => String(item.id) !== String(pautaId));
      saveState();
      return jsonResponse({ message: "Pauta removida com sucesso (mock)" });
    }

    if (path === "/api/pautas" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();
      let source = state.pautas;

      if (scopeCamaraIds.length > 0) {
        source = source.filter((pauta) => isInCamaraScope(pauta.camara_id, scopeCamaraIds));
      }

      const order = String(urlObj.searchParams.get("sortOrder") || "desc").toLowerCase();
      source = source.slice().sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return order === "asc" ? timeA - timeB : timeB - timeA;
      });

      const pageData = paginate(
        source,
        urlObj.searchParams.get("page"),
        urlObj.searchParams.get("limit"),
      );

      return jsonResponse({
        data: pageData.data,
        pagination: {
          total: pageData.totalItems,
          totalPages: pageData.totalPages,
          currentPage: pageData.currentPage,
          limit: pageData.limit,
        },
      });
    }

    if (path === "/api/sessoes/opcoes" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();
      const futurasOnly = toBool(urlObj.searchParams.get("futuras"));
      const now = Date.now();

      let source = state.sessoes.filter((sessao) =>
        isInCamaraScope(sessao.camara_id, scopeCamaraIds),
      );

      if (futurasOnly) {
        source = source.filter((sessao) => {
          const status = String(sessao.status || "").toLowerCase();
          const when = new Date(sessao.data_sessao).getTime();
          return status === "agendada" || status === "aberta" || when >= now;
        });
      }

      source = source.slice().sort((a, b) => {
        const timeA = new Date(a.data_sessao).getTime();
        const timeB = new Date(b.data_sessao).getTime();
        return (Number.isFinite(timeA) ? timeA : 0) - (Number.isFinite(timeB) ? timeB : 0);
      });

      return jsonResponse({ data: source });
    }

    if (path === "/api/sessoes/disponiveis" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();
      const now = Date.now();

      const source = state.sessoes
        .filter((sessao) => isInCamaraScope(sessao.camara_id, scopeCamaraIds))
        .filter((sessao) => {
          const status = String(sessao.status || "").toLowerCase();
          const when = new Date(sessao.data_sessao).getTime();
          if (["encerrada", "cancelada", "finalizada"].includes(status)) return false;
          if (status === "agendada" || status === "aberta") return true;
          return Number.isFinite(when) ? when >= now : true;
        })
        .sort((a, b) => {
          const timeA = new Date(a.data_sessao).getTime();
          const timeB = new Date(b.data_sessao).getTime();
          return (Number.isFinite(timeA) ? timeA : 0) - (Number.isFinite(timeB) ? timeB : 0);
        });

      return jsonResponse({ data: source });
    }

    if (path === "/api/sessoes/vereadores-ativos" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const data = state.vereadores
        .filter((vereador) => vereador.is_active)
        .filter((vereador) => isInCamaraScope(vereador.camara_id, scopeCamaraIds))
        .map(withPartido)
        .sort((a, b) =>
          String(a.nome_parlamentar || "").localeCompare(String(b.nome_parlamentar || ""), "pt-BR"),
        );

      return jsonResponse({ data });
    }

    if (path === "/api/sessoes/oradores" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();
      const sessaoIdFilter = String(urlObj.searchParams.get("sessao_id") || "").trim();

      const data = state.oradores
        .filter((orador) => {
          if (sessaoIdFilter && String(orador.sessao_id) !== sessaoIdFilter) return false;
          const sessao = state.sessoes.find(
            (item) => String(item.id) === String(orador.sessao_id),
          );
          if (!sessao) return false;
          return isInCamaraScope(sessao.camara_id, scopeCamaraIds);
        })
        .sort((a, b) => toNumber(a.ordem, 0) - toNumber(b.ordem, 0))
        .map(enrichOrador);

      return jsonResponse({ total: data.length, data });
    }

    if (path === "/api/sessoes/oradores" && method === "POST") {
      const payload = body || {};
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const sessaoId = String(payload.sessao_id || payload.sessaoId || "").trim();
      const vereadorId = String(payload.vereador_id || payload.vereadorId || "").trim();

      if (!sessaoId || !vereadorId) {
        return jsonResponse({ error: "Sessao e vereador sao obrigatorios." }, 422);
      }

      const sessao = state.sessoes.find((item) => String(item.id) === sessaoId);
      if (!sessao || !isInCamaraScope(sessao.camara_id, scopeCamaraIds)) {
        return jsonResponse({ error: "Sessao nao encontrada." }, 404);
      }

      const vereador = state.vereadores.find((item) => String(item.id) === vereadorId);
      if (!vereador || String(vereador.camara_id) !== String(sessao.camara_id)) {
        return jsonResponse({ error: "Vereador nao encontrado para esta sessao." }, 404);
      }

      const alreadyExists = state.oradores.some(
        (item) =>
          String(item.sessao_id) === sessaoId &&
          String(item.vereador_id) === vereadorId,
      );

      if (alreadyExists) {
        return jsonResponse({ error: "Este vereador ja esta na lista de oradores." }, 409);
      }

      const sameSessao = state.oradores.filter((item) => String(item.sessao_id) === sessaoId);
      const ordemPadrao = sameSessao.length + 1;

      const newOrador = {
        id: uid("orador"),
        sessao_id: sessaoId,
        vereador_id: vereadorId,
        ordem: Math.max(1, toNumber(payload.ordem, ordemPadrao)),
        tempo_fala_minutos: Math.max(1, toNumber(payload.tempo_fala_minutos, 5)),
        created_at: nowIso(),
      };

      state.oradores.push(newOrador);
      saveState();

      return jsonResponse(
        {
          message: "Orador cadastrado com sucesso (mock)",
          data: enrichOrador(newOrador),
        },
        201,
      );
    }

    if (/^\/api\/sessoes\/oradores\/[^/]+$/.test(path) && method === "PUT") {
      const oradorId = path.split("/")[4];
      const payload = body || {};
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const orador = state.oradores.find((item) => String(item.id) === String(oradorId));
      if (!orador) {
        return jsonResponse({ error: "Orador nao encontrado." }, 404);
      }

      const sessao = state.sessoes.find((item) => String(item.id) === String(orador.sessao_id));
      if (!sessao || !isInCamaraScope(sessao.camara_id, scopeCamaraIds)) {
        return jsonResponse({ error: "Sessao nao encontrada para este orador." }, 404);
      }

      if (payload.ordem !== undefined) {
        orador.ordem = Math.max(1, toNumber(payload.ordem, orador.ordem || 1));
      }

      if (payload.tempo_fala_minutos !== undefined) {
        orador.tempo_fala_minutos = Math.max(
          1,
          toNumber(payload.tempo_fala_minutos, orador.tempo_fala_minutos || 5),
        );
      }

      saveState();

      return jsonResponse({
        message: "Orador atualizado com sucesso (mock)",
        data: enrichOrador(orador),
      });
    }

    if (/^\/api\/sessoes\/oradores\/[^/]+$/.test(path) && method === "DELETE") {
      const oradorId = path.split("/")[4];
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const orador = state.oradores.find((item) => String(item.id) === String(oradorId));
      if (!orador) {
        return jsonResponse({ error: "Orador nao encontrado." }, 404);
      }

      const sessao = state.sessoes.find((item) => String(item.id) === String(orador.sessao_id));
      if (!sessao || !isInCamaraScope(sessao.camara_id, scopeCamaraIds)) {
        return jsonResponse({ error: "Sessao nao encontrada para este orador." }, 404);
      }

      state.oradores = state.oradores.filter((item) => String(item.id) !== String(oradorId));
      if (state.liveSpeech && String(state.liveSpeech.oradorId) === String(oradorId)) {
        state.liveSpeech = null;
      }

      saveState();
      return jsonResponse({ message: "Orador removido com sucesso (mock)" });
    }

    if (path === "/api/sessoes" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();
      const status = String(urlObj.searchParams.get("status") || "")
        .trim()
        .toLowerCase();
      const tipo = String(urlObj.searchParams.get("tipo") || "")
        .trim()
        .toLowerCase();
      const search = String(urlObj.searchParams.get("search") || "")
        .trim()
        .toLowerCase();

      let source = state.sessoes.filter((sessao) => {
        if (!isInCamaraScope(sessao.camara_id, scopeCamaraIds)) return false;

        if (status) {
          const sessaoStatus = String(sessao.status || "")
            .trim()
            .toLowerCase();
          if (sessaoStatus !== status) return false;
        }

        if (tipo) {
          const sessaoTipo = String(sessao.tipo || "")
            .trim()
            .toLowerCase();
          if (sessaoTipo !== tipo) return false;
        }

        if (search) {
          const haystack = `${sessao.nome || ""} ${sessao.tipo || ""} ${sessao.numero || ""}`
            .toLowerCase()
            .trim();
          if (!haystack.includes(search)) return false;
        }

        return true;
      });

      const order = String(urlObj.searchParams.get("sortOrder") || "desc").toLowerCase();
      source = source.slice().sort((a, b) => {
        const timeA = new Date(a.data_sessao).getTime();
        const timeB = new Date(b.data_sessao).getTime();
        const safeA = Number.isFinite(timeA) ? timeA : 0;
        const safeB = Number.isFinite(timeB) ? timeB : 0;
        return order === "asc" ? safeA - safeB : safeB - safeA;
      });

      const pageData = paginate(
        source,
        urlObj.searchParams.get("page"),
        urlObj.searchParams.get("limit"),
      );

      return jsonResponse({
        data: pageData.data,
        pagination: {
          currentPage: pageData.currentPage,
          totalPages: pageData.totalPages,
          totalItems: pageData.totalItems,
          limit: pageData.limit,
        },
      });
    }

    if (/^\/api\/sessoes\/[^/]+$/.test(path) && method === "GET") {
      const sessaoId = path.split("/").pop();
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const sessao = state.sessoes.find(
        (item) =>
          item.id === sessaoId &&
          isInCamaraScope(item.camara_id, scopeCamaraIds),
      );

      if (!sessao) {
        return jsonResponse({ error: "Sessao nao encontrada." }, 404);
      }

      return jsonResponse(sessao);
    }

    if (path === "/api/sessoes" && method === "POST") {
      const numero = Math.max(1, toNumber(body.numero, state.sessoes.length + 1));
      const tipo = String(body.tipo || "Ordinaria");
      const dataSessao = String(body.data_sessao || nowIso(1));
      const status = String(body.status || "Agendada");

      const currentCamaraId = getCurrentCamaraId();
      const nome = `${numero}a Sessao ${tipo} de ${new Date(dataSessao).getFullYear()}`;

      const newSessao = {
        id: uid("sessao"),
        camara_id: currentCamaraId,
        numero,
        tipo,
        data_sessao: dataSessao,
        status,
        nome,
      };

      state.sessoes.unshift(newSessao);
      saveState();

      return jsonResponse({ data: newSessao }, 201);
    }

    if (/^\/api\/sessoes\/[^/]+$/.test(path) && method === "PUT") {
      const sessaoId = path.split("/").pop();
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const sessao = state.sessoes.find(
        (item) =>
          item.id === sessaoId &&
          isInCamaraScope(item.camara_id, scopeCamaraIds),
      );

      if (!sessao) {
        return jsonResponse({ error: "Sessao nao encontrada." }, 404);
      }

      if (String(sessao.status || "") !== "Agendada") {
        return jsonResponse(
          { error: "Nao e possivel editar uma sessao que ja iniciou ou terminou." },
          403,
        );
      }

      const numero = Math.max(1, toNumber(body.numero, sessao.numero || 1));
      const tipo = String(body.tipo || sessao.tipo || "Ordinaria").trim() || "Ordinaria";
      const dataSessao = String(body.data_sessao || sessao.data_sessao || nowIso(1));
      const status = String(body.status || sessao.status || "Agendada").trim() || "Agendada";

      const yearValue = new Date(dataSessao).getFullYear();
      const safeYear = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();

      sessao.numero = numero;
      sessao.tipo = tipo;
      sessao.data_sessao = dataSessao;
      sessao.status = status;
      sessao.nome = `${numero}a Sessao ${tipo} de ${safeYear}`;

      saveState();

      return jsonResponse({ data: sessao });
    }

    if (/^\/api\/sessoes\/[^/]+$/.test(path) && method === "DELETE") {
      const sessaoId = path.split("/").pop();
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const sessao = state.sessoes.find(
        (item) =>
          item.id === sessaoId &&
          isInCamaraScope(item.camara_id, scopeCamaraIds),
      );

      if (!sessao) {
        return jsonResponse({ error: "Sessao nao encontrada." }, 404);
      }

      if (String(sessao.status || "") !== "Agendada") {
        return jsonResponse(
          { error: "Nao e possivel remover uma sessao que ja iniciou ou terminou." },
          403,
        );
      }

      const pautaIdsToRemove = state.pautas
        .filter((pauta) => pauta.sessao_id === sessaoId)
        .map((pauta) => pauta.id);

      state.sessoes = state.sessoes.filter((item) => item.id !== sessaoId);
      state.pautas = state.pautas.filter((pauta) => pauta.sessao_id !== sessaoId);
      if (pautaIdsToRemove.length > 0) {
        state.votos = state.votos.filter((voto) => !pautaIdsToRemove.includes(voto.pauta_id));
      }

      saveState();

      return noContentResponse();
    }

    if (path === "/api/app/vereadores" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();
      const vereadores = state.vereadores
        .filter((v) => isInCamaraScope(v.camara_id, scopeCamaraIds))
        .map(withPartido);
      return jsonResponse(vereadores);
    }

    if (path === "/api/app/sessoes" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();
      const status = String(urlObj.searchParams.get("status") || "")
        .trim()
        .toLowerCase();

      let source = state.sessoes.filter((s) => isInCamaraScope(s.camara_id, scopeCamaraIds));
      if (status) {
        source = source.filter(
          (sessao) => String(sessao.status || "").trim().toLowerCase() === status,
        );
      }

      return jsonResponse({ data: source });
    }

    if (path === "/api/app/pautas" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();
      const status = String(urlObj.searchParams.get("status") || "")
        .trim()
        .toLowerCase();

      let source = state.pautas.filter((p) => isInCamaraScope(p.camara_id, scopeCamaraIds));
      if (status) {
        source = source.filter(
          (pauta) => String(pauta.status || "").trim().toLowerCase() === status,
        );
      }

      return jsonResponse({ data: source });
    }

    if (path === "/api/app/vereadores" && method === "POST") {
      const camaraId = getCurrentCamaraId();
      const nome = String(body.nome_parlamentar || "").trim();
      const partidoId = String(body.partido_id || state.partidos[0]?.id || "");
      const email = String(body.email || "").trim().toLowerCase();
      const senha = String(body.senha || "").trim();

      if (!nome || !partidoId || !email || !senha) {
        return jsonResponse({ error: "Dados obrigatorios incompletos." }, 422);
      }

      const newVereador = {
        id: uid("vereador"),
        camara_id: camaraId,
        nome_parlamentar: nome,
        partido_id: partidoId,
        foto_url: "",
        is_presidente: toBool(body.is_presidente),
        is_vice_presidente: toBool(body.is_vice_presidente),
        is_active: true,
        email,
      };

      if (newVereador.is_presidente) {
        ensureSingleCargo(camaraId, "is_presidente", newVereador.id);
      }
      if (newVereador.is_vice_presidente) {
        ensureSingleCargo(camaraId, "is_vice_presidente", newVereador.id);
      }

      state.vereadores.unshift(newVereador);
      state.userEmails.push(email);
      refreshEmailIndex();
      saveState();

      return jsonResponse({ data: withPartido(newVereador) }, 201);
    }

    if (/^\/api\/app\/vereadores\/[^/]+$/.test(path) && method === "PUT") {
      const vereadorId = path.split("/").pop();
      const vereador = state.vereadores.find((item) => item.id === vereadorId);

      if (!vereador) {
        return jsonResponse({ error: "Vereador nao encontrado." }, 404);
      }

      if (body.nome_parlamentar !== undefined) {
        vereador.nome_parlamentar = String(body.nome_parlamentar).trim();
      }
      if (body.partido_id !== undefined) {
        vereador.partido_id = String(body.partido_id);
      }
      if (body.email !== undefined && String(body.email).trim()) {
        vereador.email = String(body.email).trim().toLowerCase();
        state.userEmails.push(vereador.email);
      }
      if (body.is_active !== undefined) {
        vereador.is_active = toBool(body.is_active);
      }
      if (body.is_presidente !== undefined) {
        vereador.is_presidente = toBool(body.is_presidente);
        if (vereador.is_presidente) {
          ensureSingleCargo(vereador.camara_id, "is_presidente", vereador.id);
        }
      }
      if (body.is_vice_presidente !== undefined) {
        vereador.is_vice_presidente = toBool(body.is_vice_presidente);
        if (vereador.is_vice_presidente) {
          ensureSingleCargo(vereador.camara_id, "is_vice_presidente", vereador.id);
        }
      }

      refreshEmailIndex();
      saveState();

      return jsonResponse({ data: withPartido(vereador) });
    }

    if (/^\/api\/camaras\/[^/]+\/info$/.test(path) && method === "GET") {
      const camaraId = path.split("/")[3];
      const camara = state.camaras.find((item) => String(item.id) === String(camaraId));

      if (!camara || !camara.is_active) {
        return jsonResponse({ error: "Camara nao encontrada." }, 404);
      }

      const metrics = camaraMetrics(camara.id);

      return jsonResponse({
        data: {
          ...camara,
          vereadores_count: metrics.vereadoresCount,
          sessoes_count: metrics.sessoesCount,
          pautas_count: metrics.pautasCount,
        },
      });
    }

    if (/^\/api\/camaras\/[^/]+\/sessoes-futuras$/.test(path) && method === "GET") {
      const camaraId = path.split("/")[3];
      const camara = state.camaras.find((item) => String(item.id) === String(camaraId));

      if (!camara || !camara.is_active) {
        return jsonResponse({ error: "Camara nao encontrada." }, 404);
      }

      const now = Date.now();
      const sessoes = state.sessoes
        .filter((sessao) => String(sessao.camara_id) === String(camaraId))
        .filter((sessao) => {
          const status = String(sessao.status || "").toLowerCase();
          const when = new Date(sessao.data_sessao).getTime();
          if (["agendada", "aberta", "em andamento"].includes(status)) return true;
          return Number.isFinite(when) ? when >= now : false;
        })
        .sort((a, b) => new Date(a.data_sessao) - new Date(b.data_sessao));

      return jsonResponse({ sessoes, data: sessoes });
    }

    if (/^\/api\/camaras\/[^/]+\/vereadores$/.test(path) && method === "GET") {
      const camaraId = path.split("/")[3];
      const camara = state.camaras.find((item) => String(item.id) === String(camaraId));

      if (!camara || !camara.is_active) {
        return jsonResponse({ error: "Camara nao encontrada." }, 404);
      }

      const vereadores = state.vereadores
        .filter((item) => String(item.camara_id) === String(camaraId) && item.is_active)
        .map(mapPortalVereador)
        .sort((a, b) =>
          String(a.nome_parlamentar || "").localeCompare(
            String(b.nome_parlamentar || ""),
            "pt-BR",
          ),
        );

      return jsonResponse({ vereadores, data: vereadores });
    }

    if (/^\/api\/camaras\/[^/]+\/votacoes-recentes$/.test(path) && method === "GET") {
      const camaraId = path.split("/")[3];
      const camara = state.camaras.find((item) => String(item.id) === String(camaraId));

      if (!camara || !camara.is_active) {
        return jsonResponse({ error: "Camara nao encontrada." }, 404);
      }

      const pautas = state.pautas
        .filter((item) => String(item.camara_id) === String(camaraId))
        .filter((item) => {
          const status = String(item.status || "").toLowerCase();
          return ["finalizada", "encerrada", "votada"].includes(status);
        })
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 6)
        .map((item) => {
          const totals = voteTotalsForPauta(item.id);
          return {
            ...enrichPauta(item),
            total_votos: totals.total,
            votos_sim: totals.sim,
            votos_nao: totals.nao,
            votos_abstencao: totals.abstencao,
            resultado_votacao: item.resultado_votacao || resolveResultadoVotacao(item.id),
          };
        });

      return jsonResponse({ pautas, data: pautas });
    }

    if (/^\/api\/livestreams\/camara\/[^/]+\/display$/.test(path) && method === "GET") {
      const camaraId = path.split("/")[4];
      const camara = state.camaras.find((item) => String(item.id) === String(camaraId));

      if (!camara || !camara.is_active) {
        return jsonResponse({ error: "Camara nao encontrada." }, 404);
      }

      const isLive = state.sessoes.some(
        (sessao) =>
          String(sessao.camara_id) === String(camaraId) &&
          ["Em andamento", "Aberta"].includes(String(sessao.status || "")),
      );

      return jsonResponse({
        isLive,
        data: buildLivestreamPayload(camaraId),
      });
    }

    if (path === "/api/camaras/publicas" && method === "GET") {
      const search = String(urlObj.searchParams.get("search") || "")
        .trim()
        .toLowerCase();

      const source = state.camaras.filter((camara) => {
        if (!camara.is_active) return false;
        if (!search) return true;
        return (
          String(camara.nome_camara || "").toLowerCase().includes(search) ||
          String(camara.municipio || "").toLowerCase().includes(search)
        );
      });

      const mapped = source.map((camara) => {
        const metrics = camaraMetrics(camara.id);
        return {
          ...camara,
          vereadores_count: metrics.vereadoresCount,
          sessoes_totais: metrics.sessoesCount,
          pautas_count: metrics.pautasCount,
        };
      });

      const pageData = paginate(
        mapped,
        urlObj.searchParams.get("page"),
        urlObj.searchParams.get("limit"),
      );

      return jsonResponse({
        camaras: pageData.data,
        pagination: {
          currentPage: pageData.currentPage,
          totalPages: pageData.totalPages,
          total: pageData.totalItems,
          limit: pageData.limit,
        },
      });
    }

    if (/^\/api\/camaras\/[^/]+\/todas-pautas$/.test(path) && method === "GET") {
      const camaraId = path.split("/")[3];
      const camara = state.camaras.find((item) => item.id === camaraId);
      if (!camara) {
        return jsonResponse({ error: "Camara nao encontrada." }, 404);
      }

      const source = state.pautas
        .filter((pauta) => pauta.camara_id === camaraId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const pageData = paginate(
        source,
        urlObj.searchParams.get("page"),
        urlObj.searchParams.get("limit"),
      );

      return jsonResponse({
        camara: {
          id: camara.id,
          nome: camara.nome_camara,
        },
        pautas: pageData.data,
        paginacao: {
          total_pages: pageData.totalPages,
          total_items: pageData.totalItems,
          current_page: pageData.currentPage,
          limit: pageData.limit,
        },
      });
    }

    if (/^\/api\/pautas\/[^/]+\/publica$/.test(path) && method === "GET") {
      const pautaId = path.split("/")[3];
      const pauta = state.pautas.find((item) => item.id === pautaId);
      if (!pauta) {
        return jsonResponse({ error: "Pauta nao encontrada." }, 404);
      }

      const sessao = state.sessoes.find((item) => item.id === pauta.sessao_id);

      return jsonResponse({
        ...pauta,
        sessoes: sessao
          ? {
              id: sessao.id,
              nome: sessao.nome,
              data_sessao: sessao.data_sessao,
              tipo: sessao.tipo,
              status: sessao.status,
            }
          : null,
      });
    }

    if (/^\/api\/votos\/pauta\/[^/]+\/publico$/.test(path) && method === "GET") {
      const pautaId = path.split("/")[4];
      const votos = state.votos
        .filter((item) => item.pauta_id === pautaId)
        .map((item) => {
          const vereador = state.vereadores.find((v) => v.id === item.vereador_id);
          const vereadorComPartido = vereador ? withPartido(vereador) : null;

          return {
            id: item.id,
            voto: publicVoteLabel(item.voto),
            created_at: item.created_at,
            era_presidente_no_voto: !!item.era_presidente_no_voto,
            vereadores: vereadorComPartido
              ? {
                  id: vereadorComPartido.id,
                  nome_parlamentar: vereadorComPartido.nome_parlamentar,
                  foto_url: vereadorComPartido.foto_url,
                  partidos: vereadorComPartido.partidos,
                }
              : {
                  id: "",
                  nome_parlamentar: "Vereador nao encontrado",
                  foto_url: "",
                  partidos: null,
                },
          };
        });

      const estatisticas = votos.reduce(
        (acc, item) => {
          if (item.voto === "SIM") acc.sim += 1;
          else if (item.voto === "NÃO") acc.nao += 1;
          else acc.abstencao += 1;
          acc.total += 1;
          return acc;
        },
        { sim: 0, nao: 0, abstencao: 0, total: 0 },
      );

      return jsonResponse({ votos, estatisticas });
    }

    if (/^\/api\/votos\/pauta\/[^/]+\/totals$/.test(path) && method === "GET") {
      const pautaId = path.split("/")[4];
      const totals = voteTotalsForPauta(pautaId);
      return jsonResponse(totals);
    }

    if (/^\/api\/votos\/pauta\/[^/]+$/.test(path) && method === "GET") {
      const pautaId = path.split("/")[4];
      const pauta = state.pautas.find((item) => String(item.id) === String(pautaId));

      if (!pauta) {
        return jsonResponse({ error: "Pauta nao encontrada." }, 404);
      }

      const votos = state.votos
        .filter((item) => String(item.pauta_id) === String(pautaId))
        .map((item) => {
          const vereador = state.vereadores.find((v) => String(v.id) === String(item.vereador_id));
          const vereadorWithPartido = vereador ? withPartido(vereador) : null;

          return {
            id: item.id,
            voto: toPublicVote(item.voto),
            created_at: item.created_at,
            vereadores: vereadorWithPartido
              ? {
                  id: vereadorWithPartido.id,
                  nome_parlamentar: vereadorWithPartido.nome_parlamentar,
                  foto_url: vereadorWithPartido.foto_url,
                  partidos: vereadorWithPartido.partidos,
                }
              : null,
          };
        });

      const estatisticas = votos.reduce(
        (acc, item) => {
          if (item.voto === "SIM") acc.sim += 1;
          else if (item.voto === "NÃO") acc.nao += 1;
          else acc.abstencao += 1;
          acc.total += 1;
          return acc;
        },
        { sim: 0, nao: 0, abstencao: 0, total: 0 },
      );

      return jsonResponse({
        pauta: enrichPauta(pauta),
        votos,
        estatisticas,
      });
    }

    if (path === "/api/painel-controle/pautas-em-votacao" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();
      const data = state.pautas
        .filter((item) => isInCamaraScope(item.camara_id, scopeCamaraIds))
        .filter((item) => {
          const status = String(item.status || "").toLowerCase();
          return ["pendente", "em votacao", "em votação"].includes(status);
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(enrichPauta);

      return jsonResponse({ total: data.length, data });
    }

    if (path === "/api/painel-controle/oradores" && method === "GET") {
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const data = state.oradores
        .filter((orador) => {
          const sessao = state.sessoes.find(
            (item) => String(item.id) === String(orador.sessao_id),
          );
          return !!sessao && isInCamaraScope(sessao.camara_id, scopeCamaraIds);
        })
        .sort((a, b) => {
          const sessaoA = state.sessoes.find((item) => String(item.id) === String(a.sessao_id));
          const sessaoB = state.sessoes.find((item) => String(item.id) === String(b.sessao_id));
          const dateA = new Date(sessaoA?.data_sessao || 0).getTime();
          const dateB = new Date(sessaoB?.data_sessao || 0).getTime();
          if (dateA !== dateB) return dateB - dateA;
          return toNumber(a.ordem, 0) - toNumber(b.ordem, 0);
        })
        .map(enrichOrador);

      return jsonResponse({ total: data.length, data });
    }

    if (/^\/api\/painel-controle\/iniciar-votacao\/[^/]+$/.test(path) && method === "POST") {
      const pautaId = path.split("/")[4];
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const pauta = state.pautas.find(
        (item) =>
          String(item.id) === String(pautaId) &&
          isInCamaraScope(item.camara_id, scopeCamaraIds),
      );

      if (!pauta) {
        return jsonResponse({ error: "Pauta nao encontrada." }, 404);
      }

      if (
        state.liveVoting.isLive &&
        state.liveVoting.camaraId &&
        String(state.liveVoting.camaraId) === String(pauta.camara_id) &&
        String(state.liveVoting.pautaId) !== String(pauta.id)
      ) {
        return jsonResponse({ error: "Ja existe votacao ativa nesta camara." }, 409);
      }

      pauta.status = "Em Votação";
      pauta.updated_at = nowIso();

      state.liveVoting = {
        isLive: true,
        camaraId: pauta.camara_id,
        pautaId: pauta.id,
      };

      saveState();

      return jsonResponse({
        message: "Votacao iniciada com sucesso (mock)",
        data: enrichPauta(pauta),
      });
    }

    if (path === "/api/painel-controle/fala-ativa" && method === "GET") {
      ensureLiveSpeechTiming();
      saveState();

      const isLive = !!state.liveSpeech && state.liveSpeech.status !== "encerrada";
      return jsonResponse({
        isLive,
        fala: isLive ? state.liveSpeech : null,
      });
    }

    if (/^\/api\/painel-controle\/iniciar-fala\/[^/]+$/.test(path) && method === "POST") {
      const oradorId = path.split("/")[4];
      const { scopeCamaraIds } = getCurrentCamaraScope();

      const orador = state.oradores.find((item) => String(item.id) === String(oradorId));
      if (!orador) {
        return jsonResponse({ error: "Orador nao encontrado." }, 404);
      }

      const oradorEnriched = enrichOrador(orador);
      if (
        !oradorEnriched?.sessoes ||
        !isInCamaraScope(oradorEnriched.sessoes.camara_id, scopeCamaraIds)
      ) {
        return jsonResponse({ error: "Sem permissao para este orador." }, 403);
      }

      if (
        state.liveSpeech &&
        state.liveSpeech.status !== "encerrada" &&
        String(state.liveSpeech.oradorId) !== String(oradorId)
      ) {
        return jsonResponse(
          {
            message: "Ja existe uma fala ativa no momento.",
            fala: state.liveSpeech,
          },
          409,
        );
      }

      const tempoFalaMinutos = Math.max(1, toNumber(orador.tempo_fala_minutos, 5));
      const agora = currentTimestampSeconds();

      state.liveSpeech = {
        historicoFalaId:
          state.liveSpeech && state.liveSpeech.status !== "encerrada"
            ? state.liveSpeech.historicoFalaId
            : uid("fala"),
        oradorId: orador.id,
        oradorNome: oradorEnriched.vereadores?.nome_parlamentar || "Orador",
        oradorFotoUrl: oradorEnriched.vereadores?.foto_url || "",
        partidoSigla: oradorEnriched.vereadores?.partidos?.sigla || "S/P",
        camaraId: oradorEnriched.sessoes.camara_id,
        status: "preparada",
        tempoFalaMinutos,
        tempoAdicionadoTotalMinutos: 0,
        totalPausas: 0,
        recomecos: 0,
        tempoRestanteSegundos: tempoFalaMinutos * 60,
        startedAt: null,
        lastTickAt: agora,
      };

      saveState();

      return jsonResponse({
        message: "Fala preparada com sucesso (mock)",
        fala: state.liveSpeech,
      });
    }

    if (/^\/api\/painel-controle\/fala\/[^/]+\/(iniciar|pausar|retomar|adicionar-tempo|recomecar|encerrar)$/.test(path) && method === "POST") {
      const parts = path.split("/");
      const historicoFalaId = parts[4];
      const action = parts[5];

      if (!state.liveSpeech || String(state.liveSpeech.historicoFalaId) !== String(historicoFalaId)) {
        return jsonResponse({ error: "Fala ativa nao encontrada." }, 404);
      }

      ensureLiveSpeechTiming();

      if (action === "iniciar") {
        state.liveSpeech.status = "iniciada";
        state.liveSpeech.startedAt = state.liveSpeech.startedAt || nowIso();
        state.liveSpeech.lastTickAt = currentTimestampSeconds();
      }

      if (action === "pausar") {
        if (state.liveSpeech.status === "iniciada") {
          state.liveSpeech.status = "pausada";
          state.liveSpeech.totalPausas = toNumber(state.liveSpeech.totalPausas, 0) + 1;
        }
      }

      if (action === "retomar") {
        if (state.liveSpeech.status === "pausada") {
          state.liveSpeech.status = "iniciada";
          state.liveSpeech.lastTickAt = currentTimestampSeconds();
        }
      }

      if (action === "adicionar-tempo") {
        const minutos = Math.max(1, toNumber((body && body.minutos) || 1, 1));
        state.liveSpeech.tempoAdicionadoTotalMinutos =
          toNumber(state.liveSpeech.tempoAdicionadoTotalMinutos, 0) + minutos;
        state.liveSpeech.tempoRestanteSegundos =
          Math.max(0, toNumber(state.liveSpeech.tempoRestanteSegundos, 0)) + minutos * 60;

        if (state.liveSpeech.status === "tempo_esgotado") {
          state.liveSpeech.status = "pausada";
        }
      }

      if (action === "recomecar") {
        state.liveSpeech.recomecos = toNumber(state.liveSpeech.recomecos, 0) + 1;
        state.liveSpeech.status = "preparada";
        state.liveSpeech.tempoRestanteSegundos =
          Math.max(1, toNumber(state.liveSpeech.tempoFalaMinutos, 5)) * 60;
        state.liveSpeech.lastTickAt = currentTimestampSeconds();
      }

      if (action === "encerrar") {
        state.liveSpeech.status = "encerrada";
      }

      saveState();

      return jsonResponse({
        message: "Controle de fala atualizado (mock)",
        fala: state.liveSpeech,
      });
    }

    if (/^\/api\/fala-ao-vivo\/status\/[^/]+$/.test(path) && method === "GET") {
      const camaraId = path.split("/")[4];
      ensureLiveSpeechTiming();
      saveState();

      const isLive =
        !!state.liveSpeech &&
        String(state.liveSpeech.camaraId) === String(camaraId) &&
        state.liveSpeech.status !== "encerrada";

      return jsonResponse({
        isLive,
        fala: isLive ? state.liveSpeech : null,
      });
    }

    if (/^\/api\/fala-ao-vivo\/tempo-esgotado\/[^/]+$/.test(path) && method === "POST") {
      const historicoFalaId = path.split("/")[4];

      if (!state.liveSpeech || String(state.liveSpeech.historicoFalaId) !== String(historicoFalaId)) {
        return jsonResponse({ error: "Fala ativa nao encontrada." }, 404);
      }

      state.liveSpeech.status = "tempo_esgotado";
      state.liveSpeech.tempoRestanteSegundos = 0;
      saveState();

      return jsonResponse({
        message: "Fala marcada como tempo esgotado (mock)",
        fala: state.liveSpeech,
      });
    }

    if (path === "/api/notify/encerrar-votacao" && method === "POST") {
      return jsonResponse({ ok: true, message: "Notificacao mock recebida." });
    }

    if (path === "/api/me" && method === "GET") {
      const user = getCurrentUser() || {
        id: "mock-user-tv",
        role: "tv",
      };

      const camaraId =
        user.camara_id || user.camaraId || user.camara?.id || state.camaras[0]?.id;
      const camara = state.camaras.find((item) => item.id === camaraId) || state.camaras[0];

      return jsonResponse({
        user,
        profile: {
          camara_id: camara?.id || null,
          nome: camara?.nome_camara || "Camara Mock",
        },
        camara: camara || null,
      });
    }

    if (/^\/api\/votacao-ao-vivo\/status\/[^/]+$/.test(path) && method === "GET") {
      const camaraId = path.split("/")[4];
      const isLive =
        state.liveVoting.isLive &&
        state.liveVoting.camaraId &&
        String(state.liveVoting.camaraId) === String(camaraId);

      return jsonResponse({
        isLive,
        votacoes: isLive
          ? [
              {
                pautaId: state.liveVoting.pautaId,
              },
            ]
          : [],
      });
    }

    return null;
  }

  /**
   * Intercepts API fetch calls and serves matching mock responses.
   *
   * @param {Request|string} input - Fetch input.
   * @param {RequestInit} [init={}] - Fetch options.
   * @returns {Promise<Response>} Mocked or real fetch response.
   */
  window.fetch = async function mockAwareFetch(input, init = {}) {
    try {
      const requestUrl =
        typeof input === "string"
          ? input
          : input && input.url
            ? input.url
            : "";

      const method = String(
        (init && init.method) ||
          (typeof input !== "string" && input && input.method) ||
          "GET",
      ).toUpperCase();

      const urlObj = new URL(requestUrl, window.location.origin);
      if (!urlObj.pathname.startsWith("/api/")) {
        return originalFetch(input, init);
      }

      const body = parseRequestBody(init && init.body ? init.body : null);
      const mockedResponse = handleMockRequest(urlObj, method, body);

      if (mockedResponse) {
        return mockedResponse;
      }

      if (window.__LEGISLA_MOCK_STRICT__ === true && !urlObj.pathname.startsWith("/api/auth/")) {
        return jsonResponse(
          {
            error: "Endpoint não mockado para Sprint 1",
            endpoint: urlObj.pathname,
            method,
          },
          501,
        );
      }

      return originalFetch(input, init);
    } catch (error) {
      console.warn("[MOCK] Falha no interceptador, usando fetch real.", error);
      return originalFetch(input, init);
    }
  };

  window.legislaMockApi = {
    /**
     * Returns a clone of the current mock state.
     *
     * @returns {object} Current mock state.
     */
    getState() {
      return deepClone(state);
    },
    /**
     * Resets mock state to its default seed data.
     *
     * @returns {object} Reset mock state.
     */
    resetState() {
      state = createInitialState();
      saveState();
      return deepClone(state);
    },
    /**
     * Sets or clears the active live voting marker.
     *
     * @param {string|null} camaraId - Chamber id for live voting.
     * @param {string|null} pautaId - Pauta id for live voting.
     * @returns {void}
     */
    setLiveVoting(camaraId, pautaId) {
      state.liveVoting = {
        isLive: Boolean(camaraId && pautaId),
        camaraId: camaraId || null,
        pautaId: pautaId || null,
      };
      saveState();
    },
  };

  console.log("[MOCK] Sprint 1 mock mode ativado.");
})();
