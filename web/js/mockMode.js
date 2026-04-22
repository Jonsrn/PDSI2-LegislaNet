/**
 * File: mockMode.js
 * Purpose: Provides a local mock API layer for Sprint 1 flows by intercepting
 * fetch requests, serving seeded data, persisting mock state, and exposing a
 * small control surface for tests and demos.
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
   * Returns an ISO timestamp relative to the current date.
   * @param {number} [dayOffset=0] - Number of days to offset from now.
   * @returns {string}
   */
  function nowIso(dayOffset = 0) {
    return new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000).toISOString();
  }

  /**
   * Generates a lightweight unique identifier with a prefix.
   * @param {string} prefix - Prefix for the generated identifier.
   * @returns {string}
   */
  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
  }

  /**
   * Produces a deep clone of a JSON-serializable value.
   * @param {*} value - Value to clone.
   * @returns {*}
   */
  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Safely parses JSON and returns a fallback value on failure.
   * @param {*} value - Raw value or JSON string to parse.
   * @param {*} fallback - Fallback value returned when parsing fails.
   * @returns {*}
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
   * Converts common truthy string values to a boolean.
   * @param {*} value - Value to normalize.
   * @returns {boolean}
   */
  function toBool(value) {
    if (typeof value === "boolean") return value;
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "on";
  }

  /**
   * Converts a value to a finite number or returns a fallback.
   * @param {*} value - Value to convert.
   * @param {*} fallback - Value returned when conversion fails.
   * @returns {number|*}
   */
  function toNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  /**
   * Normalizes supported request body formats into a plain object.
   * @param {*} body - Request body to normalize.
   * @returns {Object}
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
   * Creates the default mock application state.
   * @returns {Object}
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
   * Loads persisted mock state from localStorage or recreates the default state.
   * @returns {Object}
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
   * @returns {void}
   */
  function saveState() {
    state.updatedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /**
   * Returns the currently stored user payload.
   * @returns {Object|null}
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
   * Returns the primary chamber ID for the current user scope.
   * @returns {string|null}
   */
  function getCurrentCamaraId() {
    return getCurrentCamaraScope().primaryCamaraId;
  }

  /**
   * Resolves the current chamber scope used to filter mock data.
   * @returns {{primaryCamaraId: (string|null), scopeCamaraIds: string[]}}
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
   * Determines whether an item belongs to the active chamber scope.
   * @param {*} itemCamaraId - Chamber ID associated with the item.
   * @param {string[]} scopeCamaraIds - Allowed chamber IDs.
   * @returns {boolean}
   */
  function isInCamaraScope(itemCamaraId, scopeCamaraIds) {
    if (!Array.isArray(scopeCamaraIds) || scopeCamaraIds.length === 0) {
      return true;
    }

    return scopeCamaraIds.some((scopeId) => String(scopeId) === String(itemCamaraId));
  }

  /**
   * Enriches a council member record with its associated party data.
   * @param {Object} vereador - Council member record.
   * @returns {Object}
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
   * @param {string} camaraId - Chamber identifier.
   * @returns {{vereadoresCount: number, sessoesCount: number, pautasCount: number}}
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
   * Applies simple page-based pagination to an array.
   * @param {Array} items - Collection to paginate.
   * @param {*} pageParam - Requested page number.
   * @param {*} limitParam - Requested page size.
   * @returns {{currentPage: number, totalPages: number, totalItems: number, limit: number, data: Array}}
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
   * Creates a JSON Response object for a mock endpoint.
   * @param {*} body - Response payload.
   * @param {number} [status=200] - HTTP status code.
   * @returns {Response}
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
   * Creates an empty 204 Response object.
   * @returns {Response}
   */
  function noContentResponse() {
    return new Response(null, {
      status: 204,
    });
  }

  /**
   * Normalizes vote labels to the internal canonical values.
   * @param {*} vote - Raw vote label.
   * @returns {string}
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
   * Converts an internal vote label to the public display value.
   * @param {string} vote - Canonical vote label.
   * @returns {string}
   */
  function publicVoteLabel(vote) {
    if (vote === "SIM") return "SIM";
    if (vote === "NAO") return "NÃO";
    return "ABSTENÇÃO";
  }

  /**
   * Returns the default admin email for a chamber.
   * @param {Object} camara - Chamber record.
   * @returns {string}
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
   * Returns the default TV email for a chamber.
   * @param {Object} camara - Chamber record.
   * @returns {string}
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
   * Ensures a chamber contains the expected admin and TV contact objects.
   * @param {Object} camara - Chamber record to normalize.
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
   * Rebuilds the email index used by uniqueness checks in mock mode.
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
   * Ensures only one council member holds a unique leadership flag per chamber.
   * @param {string} camaraId - Chamber identifier.
   * @param {string} field - Leadership field to normalize.
   * @param {string} vereadorIdToKeep - Council member ID that should retain the role.
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
   * Finds a mock admin or TV user by its synthetic user ID.
   * @param {string} userId - User identifier.
   * @returns {{camara: Object, slot: string, user: Object}|null}
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
   * Handles a supported mock API request and returns a mock response when matched.
   * @param {URL} urlObj - Parsed request URL.
   * @param {string} method - HTTP method.
   * @param {Object} body - Normalized request body.
   * @returns {Response|null}
   */
  function handleMockRequest(urlObj, method, body) {
    const path = urlObj.pathname.replace(/\/+$/, "") || "/";

    // Mantem autenticacao real no backend
    if (path.startsWith("/api/auth/")) {
      return null;
    }

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
          else if (item.voto === "NAO") acc.nao += 1;
          else acc.abstencao += 1;
          acc.total += 1;
          return acc;
        },
        { sim: 0, nao: 0, abstencao: 0, total: 0 },
      );

      return jsonResponse({ votos, estatisticas });
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
     * Returns a deep-cloned snapshot of the current mock state.
     * @returns {Object}
     */
    getState() {
      return deepClone(state);
    },
    /**
     * Resets the mock state to its seeded defaults and returns the new snapshot.
     * @returns {Object}
     */
    resetState() {
      state = createInitialState();
      saveState();
      return deepClone(state);
    },
    /**
     * Updates the live voting marker in mock state.
     * @param {string|null} camaraId - Chamber identifier.
     * @param {string|null} pautaId - Agenda item identifier.
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
