/**
 * File: global.js
 * Purpose: Provides shared application infrastructure for layout loading,
 * navigation, animations, route protection, authentication lifecycle
 * handling, and global UI helpers across admin, app, and portal contexts.
 */

/**
 * Initializes the page layout by loading the appropriate shared components
 * and wiring the required global UI behaviors.
 * @param {Object} pageConfig - Page-specific layout configuration.
 * @param {string} [pageConfig.title] - Header title text.
 * @param {string} [pageConfig.icon] - Font Awesome class suffix for the header icon.
 * @param {string} [pageConfig.navActive] - Navigation item ID to mark as active.
 * @returns {Promise<void>}
 */
async function initLayout(pageConfig) {
  const path = window.location.pathname;

  /**
   * Ensures the footer placeholder exists in the document.
   * @returns {HTMLElement}
   */
  const ensureFooterPlaceholder = () => {
    let placeholder = document.getElementById("footer-placeholder");
    if (placeholder) return placeholder;

    placeholder = document.createElement("div");
    placeholder.id = "footer-placeholder";

    const appLayout = document.querySelector(".app-layout");
    if (appLayout) {
      appLayout.insertAdjacentElement("afterend", placeholder);
    } else {
      document.body.appendChild(placeholder);
    }

    return placeholder;
  };

  // Determina o contexto (admin, app ou portal) com base no caminho do URL
  if (path.includes("/admin/")) {
    await loadComponent(
      "../components/admin_sidebar.html",
      "sidebar-placeholder",
    );
    await loadComponent(
      "../components/admin_header.html",
      "header-placeholder",
    );

    ensureFooterPlaceholder();
    await loadComponent(
      "../components/admin_footer.html",
      "footer-placeholder",
    );
  } else if (path.includes("/app/")) {
    await loadComponent(
      "../components/app_sidebar.html",
      "sidebar-placeholder",
    );
    await loadComponent("../components/app_header.html", "header-placeholder");

    ensureFooterPlaceholder();
    await loadComponent("../components/app_footer.html", "footer-placeholder");
    document.body.classList.add("has-footer");
  } else if (path.includes("/portal/")) {
    await loadComponent(
      "../components/portal_navbar.html",
      "navbar-placeholder",
    );

    ensureFooterPlaceholder();
    await loadComponent(
      "../components/portal_footer.html",
      "footer-placeholder",
    );
  }

  // Após carregar os componentes, configura os elementos dinâmicos
  setupDynamicContent(pageConfig);
  setupSidebarMobileToggle();
  autoFixFormSectionLayout(); // Corrige o layout se necessário
  setupEventListeners();
}

/**
 * Configures the responsive sidebar toggle behavior and related mobile actions.
 * @returns {void}
 */
function setupSidebarMobileToggle() {
  /**
   * Returns the current sidebar element.
   * @returns {Element|null}
   */
  const getSidebar = () => document.querySelector(".sidebar");
  const sidebar = getSidebar();
  if (!sidebar) return;

  const isMobile = window.matchMedia("(max-width: 768px)");

  let toggleBtn = document.getElementById("sidebarToggleBtn");
  if (!toggleBtn) {
    toggleBtn = document.createElement("button");
    toggleBtn.id = "sidebarToggleBtn";
    toggleBtn.type = "button";
    toggleBtn.className = "sidebar-toggle-btn";
    toggleBtn.setAttribute("aria-label", "Abrir/fechar menu lateral");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    document.body.appendChild(toggleBtn);
  }

  /**
   * Updates the expanded accessibility state of the sidebar toggle button.
   * @param {boolean} expanded - Whether the sidebar is expanded.
   * @returns {void}
   */
  const setExpanded = (expanded) => {
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  /**
   * Closes the mobile sidebar and resets related UI state.
   * @returns {void}
   */
  const closeSidebar = () => {
    const currentSidebar = getSidebar();
    if (currentSidebar) {
      currentSidebar.classList.remove("is-open");
    }
    document.body.classList.remove("sidebar-open");
    setExpanded(false);
  };

  /**
   * Toggles the mobile sidebar open or closed.
   * @returns {void}
   */
  const toggleSidebar = () => {
    const currentSidebar = getSidebar();
    if (!currentSidebar) {
      document.body.classList.remove("sidebar-open");
      setExpanded(false);
      return;
    }

    const willOpen = !currentSidebar.classList.contains("is-open");
    currentSidebar.classList.toggle("is-open", willOpen);
    document.body.classList.toggle("sidebar-open", willOpen);
    setExpanded(willOpen);
  };

  if (!toggleBtn.dataset.bound) {
    toggleBtn.addEventListener("click", toggleSidebar);
    toggleBtn.dataset.bound = "true";
  }

  // Item "Sair" no sidebar (logout)
  const logoutLink = sidebar.querySelector('[data-action="logout"]');
  if (logoutLink && !logoutLink.dataset.bound) {
    logoutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await logout();
      } catch (err) {
        console.error("Erro ao executar logout:", err);
        // fallback: limpeza local + redirect
        localStorage.removeItem("authToken");
        localStorage.removeItem("userData");
        window.location.href = "/app/login.html";
      }
    });
    logoutLink.dataset.bound = "true";
  }

  // Botão de fechar (X) dentro do sidebar (mobile)
  const sidebarHeader = sidebar.querySelector(".sidebar-header");
  if (sidebarHeader) {
    let closeBtn = sidebarHeader.querySelector("#sidebarCloseBtn");
    if (!closeBtn) {
      closeBtn = document.createElement("button");
      closeBtn.id = "sidebarCloseBtn";
      closeBtn.type = "button";
      closeBtn.className = "sidebar-close-btn";
      closeBtn.setAttribute("aria-label", "Fechar menu lateral");
      closeBtn.innerHTML =
        '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
      sidebarHeader.appendChild(closeBtn);
    }

    if (!closeBtn.dataset.bound) {
      closeBtn.addEventListener("click", closeSidebar);
      closeBtn.dataset.bound = "true";
    }
  }

  /**
   * Resets mobile sidebar state when leaving the mobile breakpoint.
   * @returns {void}
   */
  const handleViewportChange = () => {
    if (!isMobile.matches) {
      closeSidebar();
    }
  };

  if (!sidebar.dataset.mobileToggleBound) {
    isMobile.addEventListener("change", handleViewportChange);
    sidebar.dataset.mobileToggleBound = "true";
  }

  // Fechar ao clicar/tocar fora do sidebar (somente mobile)
  if (!document.body.dataset.sidebarOutsideCloseBound) {
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!isMobile.matches) return;
        const currentSidebar = getSidebar();
        if (!currentSidebar || !currentSidebar.classList.contains("is-open"))
          return;

        const target = e.target;
        if (currentSidebar.contains(target)) return;
        if (toggleBtn && toggleBtn.contains(target)) return;

        closeSidebar();
      },
      { capture: true },
    );

    document.body.dataset.sidebarOutsideCloseBound = "true";
  }

  handleViewportChange();
}

// ===================================================================================
// FUNÇÕES AUXILIARES DE CARREGAMENTO E CONFIGURAÇÃO
// ===================================================================================

/**
 * Loads an HTML component and injects it into the target placeholder element.
 * @param {string} componentPath - Path to the component HTML file.
 * @param {string} targetElementId - ID of the target placeholder element.
 * @returns {Promise<void>}
 */
async function loadComponent(componentPath, targetElementId) {
  const targetElement = document.getElementById(targetElementId);
  if (!targetElement) return; // Não faz nada se o placeholder não existir

  try {
    // Adiciona timestamp para evitar cache durante desenvolvimento
    const urlWithCacheBuster = `${componentPath}?t=${new Date().getTime()}`;
    const response = await fetch(urlWithCacheBuster);
    if (!response.ok) {
      throw new Error(`Componente não encontrado: ${componentPath}`);
    }
    targetElement.innerHTML = await response.text();
  } catch (error) {
    console.error("Erro ao carregar componente:", error);
    targetElement.innerHTML = `<p style="color:red;">Erro ao carregar componente: ${componentPath}</p>`;
  }
}

/**
 * Applies page-specific dynamic layout content such as header text and
 * active navigation state.
 * @param {Object} pageConfig - Page-specific layout configuration.
 * @param {string} [pageConfig.title] - Header title text.
 * @param {string} [pageConfig.icon] - Font Awesome class suffix for the header icon.
 * @param {string} [pageConfig.navActive] - Navigation item ID to mark as active.
 * @returns {void}
 */
function setupDynamicContent(pageConfig) {
  if (!pageConfig) return;

  // Define o título e o ícone do cabeçalho, se existirem
  const headerTitle = document.getElementById("header-title");
  const headerIcon = document.getElementById("header-icon");
  if (headerTitle && pageConfig.title) {
    headerTitle.textContent = pageConfig.title;
  }
  if (headerIcon && pageConfig.icon) {
    headerIcon.className = `fa-solid ${pageConfig.icon}`;
  }

  // Define o item de navegação ativo na sidebar
  if (pageConfig.navActive) {
    const activeNavItem = document.getElementById(pageConfig.navActive);
    if (activeNavItem) {
      activeNavItem.classList.add("active");
    }
  }
}

/**
 * Registers shared event listeners after layout components have been loaded.
 * @returns {void}
 */
function setupEventListeners() {
  // Listener para o dropdown do perfil de usuário
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");
  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      profileDropdown.classList.toggle("active");
      profileBtn.classList.toggle("active");
    });
  }

  // Listener para fechar o dropdown ao clicar fora
  window.addEventListener("click", () => {
    if (profileDropdown && profileDropdown.classList.contains("active")) {
      profileDropdown.classList.remove("active");
      profileBtn.classList.remove("active");
    }
  });

  // Listeners para os links de navegação da sidebar
  const navLinks = document.querySelectorAll("a[data-page]");
  navLinks.forEach((link) => {
    // Remove listeners antigos para evitar duplicação, se houver
    link.replaceWith(link.cloneNode(true));
  });
  // Adiciona os novos listeners
  document.querySelectorAll("a[data-page]").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const pageName = this.getAttribute("data-page");
      navigateToPage(pageName);
    });
  });

  // Animações de fade-in
  initializeFadeInObserver();
}

// ===================================================================================
// LÓGICA DE NAVEGAÇÃO (ADAPTADA DO SEU ARQUIVO ORIGINAL)
// ===================================================================================

/**
 * Indicates whether the current route belongs to the admin module.
 * @returns {boolean}
 */
function isAdminContext() {
  return window.location.pathname.includes("/admin/");
}

const SPRINT1_ALLOWED_PAGES_IN_MOCK = new Set([
  "dashboard",
  "nova-camara",
  "novo-partido",
  "partidos",
  "sessoes",
  "vereadores",
  "perfil",
  "nova_sessao",
  "selecionar_camara",
  "todas_pautas",
  "votacao_publica",
]);

const SPRINT1_LOCKED_PAGES_IN_MOCK = new Set([
  "cadastro",
  "nova_pauta",
  "editar_pauta",
  "ordem_do_dia",
  "relatorio",
  "painel_controle",
  "configuracoes",
  "relatorios",
]);

/**
 * Determines whether a page is blocked while running mock mode for Sprint 1.
 * @param {string} pageName - The logical page name.
 * @returns {boolean}
 */
function isPageBlockedInSprint1Mock(pageName) {
  if (!isMockModeEnabled()) return false;
  if (SPRINT1_ALLOWED_PAGES_IN_MOCK.has(pageName)) return false;
  return SPRINT1_LOCKED_PAGES_IN_MOCK.has(pageName);
}

/**
 * Notifies the user that the requested page is outside the current mock scope.
 * @returns {void}
 */
function notifySprintScopeLock() {
  const message =
    "Tela fora do escopo da Sprint 1 no modo mock. Disponível na Parte 2.";

  if (typeof window.showToast === "function") {
    window.showToast(message, "warning");
    return;
  }

  window.alert(message);
}

/**
 * Navigates to the requested logical page, applying transition and mock guards.
 * @param {string} pageName - The logical page name.
 * @returns {void}
 */
function navigateToPage(pageName) {
  if (isPageBlockedInSprint1Mock(pageName)) {
    notifySprintScopeLock();
    return;
  }

  const mainContent = document.getElementById("mainContent");
  const targetUrl = getPageUrl(pageName);

  if (!targetUrl) {
    console.warn(`URL não encontrada para a página: ${pageName}`);
    return;
  }

  if (mainContent) {
    mainContent.classList.add("transitioning");
    setTimeout(() => {
      window.location.href = targetUrl;
    }, 200);
  } else {
    window.location.href = targetUrl;
  }
}

/**
 * Resolves the URL for a logical page name based on the current module context.
 * @param {string} pageName - The logical page name.
 * @returns {string|undefined}
 */
function getPageUrl(pageName) {
  // CORREÇÃO: Caminhos alterados para absolutos
  const pageMap = {
    // Admin pages
    dashboard_admin: "/admin/dashboard_admin.html",
    "nova-camara": "/admin/nova_camara.html",
    "novo-partido": "/admin/novo_partido.html",
    partidos: "/admin/partidos.html", // ADICIONADO
    configuracoes: "/admin/configuracoes.html", // ADICIONADO
    relatorios: "/admin/relatorios.html", // ADICIONADO
    // App pages
    dashboard: "/app/dashboard.html",
    cadastro: "/app/cadastro_de_pautas.html",
    nova_pauta: "/app/nova_pauta.html",
    editar_pauta: "/app/editar_pauta.html",
    vereadores: "/app/vereadores.html",
    editar_vereador: "/app/editar_vereador.html",
    ordem_do_dia: "/app/ordem_do_dia.html",
    relatorio: "/app/relatorio.html",
    perfil: "/app/perfil_camara.html",
    sessoes: "/app/sessoes.html",
    painel_controle: "/app/painel_controle.html",
  };

  // Adapta a chave de busca para o contexto admin
  const key =
    isAdminContext() && pageName === "dashboard" ? "dashboard_admin" : pageName;

  return pageMap[key];
}

// ===================================================================================
// ANIMAÇÕES (ADAPTADO DO SEU ARQUIVO ORIGINAL)
// ===================================================================================

/**
 * Initializes an IntersectionObserver for legacy fade-in elements.
 * @returns {void}
 */
function initializeFadeInObserver() {
  const elementsToFadeIn = document.querySelectorAll(".fade-in");
  if (elementsToFadeIn.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 },
  );

  elementsToFadeIn.forEach((el) => observer.observe(el));
}

/**
 * Initializes the unified animation system for immediate and scroll-triggered
 * reveal effects.
 * @returns {void}
 */
function initUnifiedAnimations() {
  // 1. Animações imediatas (hero sections e elementos marcados)
  const immediateElements = document.querySelectorAll(
    ".animate-on-load, [data-animate].animate-on-load",
  );
  immediateElements.forEach((el, index) => {
    setTimeout(
      () => {
        el.classList.add("animated");
        el.classList.add("visible"); // Manter compatibilidade
      },
      (index + 1) * 200,
    );
  });

  // 2. Animações durante scroll (Intersection Observer)
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Adiciona ambas as classes para garantir compatibilidade
          entry.target.classList.add("animated");
          entry.target.classList.add("visible");

          // Se tiver delay definido via data-delay
          const delay = entry.target.getAttribute("data-delay");
          if (delay) {
            entry.target.style.transitionDelay = `${delay}ms`;
          }

          observer.unobserve(entry.target); // Para de observar após animar
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px", // Ativa um pouco antes
    },
  );

  // Observar todos os tipos de elementos
  const scrollElements = document.querySelectorAll(
    ".fade-in, .fade-in-section, [data-animate]",
  );
  scrollElements.forEach((el) => observer.observe(el));
}

/**
 * Compatibility wrapper for legacy fade-in initialization calls.
 * @returns {void}
 */
function initFadeInAnimations() {
  initUnifiedAnimations();
}

// Adiciona um listener global que espera o DOM carregar, mas não inicia o layout.
// O layout será iniciado por uma chamada explícita em cada página HTML.
document.addEventListener("DOMContentLoaded", () => {
  // Funções que não dependem de componentes podem ser chamadas aqui,
  // mas a maioria agora está em setupEventListeners().
  if (localStorage.getItem("showLoginSuccessToast") === "true") {
    // Se a flag existir, mostra o toast
    showToast("Login bem-sucedido!", "success");
    // E remove a flag para não mostrar novamente ao recarregar a página
    localStorage.removeItem("showLoginSuccessToast");
  }
});

// ===================================================================================
// INICIALIZADOR DE COMPONENTES DE UI (ex: Dropdowns de Tabela)
// ===================================================================================

/**
 * Initializes interactive status dropdown controls found on the page.
 * @returns {void}
 */
function initStatusDropdowns() {
  const statusDropdowns = document.querySelectorAll(".status-dropdown");
  if (statusDropdowns.length === 0) return;

  /**
   * Closes all open status dropdowns except the optional preserved one.
   * @param {Element|null} [exceptThisOne=null] - Dropdown to keep open.
   * @returns {void}
   */
  const closeAllDropdowns = (exceptThisOne = null) => {
    document.querySelectorAll(".status-dropdown.open").forEach((dropdown) => {
      if (dropdown !== exceptThisOne) {
        dropdown.classList.remove("open");
      }
    });
  };

  statusDropdowns.forEach((dropdown) => {
    const badgeWrapper = dropdown.querySelector(".status-badge-wrapper");
    const dropdownMenu = dropdown.querySelector(".dropdown-menu");

    if (!badgeWrapper || !dropdownMenu) return;

    badgeWrapper.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = dropdown.classList.contains("open");
      closeAllDropdowns();
      if (!wasOpen) {
        dropdown.classList.add("open");
      }
    });

    dropdownMenu.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", () => {
        const newValue = item.getAttribute("data-value");
        const newText = item.textContent;
        const mainBadge = dropdown.querySelector(
          ".status-badge-wrapper .status-badge",
        );
        if (mainBadge) {
          mainBadge.className = "status-badge"; // Limpa classes antigas
          mainBadge.classList.add(newValue);
          mainBadge.textContent = newText.toUpperCase();
        }
        console.log(`Status alterado para: ${newValue}`);
      });
    });
  });

  window.addEventListener("click", () => {
    closeAllDropdowns();
  });
}

// ===================================================================================
// SISTEMA DE AUTENTICAÇÃO E PROTEÇÃO DE ROTAS MELHORADO
// ===================================================================================

/**
 * Route configuration keyed by authenticated user role.
 */
const ROLE_ROUTES = {
  super_admin: {
    module: "admin",
    defaultPage: "/admin/dashboard_admin.html",
    allowedPaths: ["/admin/"],
  },
  admin_camara: {
    module: "app",
    defaultPage: "/app/dashboard.html",
    allowedPaths: ["/app/"],
  },
  tv: {
    module: "tv",
    defaultPage: "/tv/espera.html",
    allowedPaths: ["/tv/"],
  },
  vereador: {
    module: "tablet",
    defaultPage: "/tablet/", // Será usado pelo app tablet
    allowedPaths: ["/tablet/"],
  },
};

/**
 * Indicates whether the frontend is running with mock business data enabled.
 * @returns {boolean}
 */
function isMockModeEnabled() {
  return window.__LEGISLA_MOCK_MODE__ === true;
}

/**
 * Safely reads the locally stored user payload.
 * @returns {Object|null}
 */
function getStoredUserData() {
  try {
    const userData = localStorage.getItem("userData");
    if (!userData) return null;
    return JSON.parse(userData);
  } catch (error) {
    console.warn("[AUTH_GUARD] ⚠️ userData inválido no localStorage:", error);
    return null;
  }
}

/**
 * Decodes a JWT payload without validating its signature.
 * @param {string} token - The JWT token.
 * @returns {Object|null}
 */
function decodeJwtPayload(token) {
  try {
    const payloadBase64 = token.split(".")[1];
    const decodedJson = atob(payloadBase64);
    return JSON.parse(decodedJson);
  } catch (error) {
    console.error("[AUTH_GUARD] Erro ao decodificar token:", error);
    return null;
  }
}

/**
 * Determines whether a token should be refreshed soon.
 * @param {Object|null} tokenPayload - Decoded token payload.
 * @returns {boolean}
 */
function shouldRefreshToken(tokenPayload) {
  if (!tokenPayload || !tokenPayload.exp) return true;

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = tokenPayload.exp - now;
  const thirtyMinutes = 30 * 60; // 30 minutos em segundos

  // Token dura 3h (10800s), renova quando faltam 30 minutos ou menos
  return timeUntilExpiry <= thirtyMinutes;
}

/**
 * Attempts to validate or refresh the authentication token.
 * @returns {Promise<boolean>}
 */
async function refreshAuthToken() {
  console.log("[AUTH_GUARD] 🔄 Tentando validar/renovar token...");

  try {
    const authToken = localStorage.getItem("authToken");
    const refreshToken = localStorage.getItem("refreshToken");
    if (!authToken && !refreshToken) return false;

    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        refreshToken: refreshToken || null,
      }),
    });

    if (response.ok) {
      const data = await response.json();

      // Atualiza os dados no localStorage
      if (data.token) localStorage.setItem("authToken", data.token);
      if (data.refreshToken)
        localStorage.setItem("refreshToken", data.refreshToken);
      if (data.user) {
        localStorage.setItem("userData", JSON.stringify(data.user));
        window.currentUser = data.user;
      }

      console.log("[AUTH_GUARD] ✅ Token validado e dados atualizados");
      return true;
    } else {
      console.warn("[AUTH_GUARD] ⚠️ Falha na validação do token");
      return false;
    }
  } catch (error) {
    console.error("[AUTH_GUARD] ❌ Erro ao validar token:", error);
    return false;
  }
}

/**
 * Determines whether a user role is allowed to access the current route.
 * @param {string} userRole - The user role.
 * @param {string} currentPath - The current path.
 * @returns {boolean}
 */
function hasRoutePermission(userRole, currentPath) {
  const roleConfig = ROLE_ROUTES[userRole];
  if (!roleConfig) return false;

  return roleConfig.allowedPaths.some((allowedPath) =>
    currentPath.startsWith(allowedPath),
  );
}

/**
 * Redirects the user to the correct module based on role.
 * @param {string} userRole - The user role.
 * @param {string} [currentPath=window.location.pathname] - The current path.
 * @returns {void}
 */
function redirectToCorrectModule(
  userRole,
  currentPath = window.location.pathname,
) {
  const roleConfig = ROLE_ROUTES[userRole];

  if (!roleConfig) {
    console.error(`[AUTH_GUARD] ❌ Role desconhecido: ${userRole}`);
    clearAuthAndRedirectToLogin();
    return;
  }

  // Se já está na rota correta, não redireciona
  if (hasRoutePermission(userRole, currentPath)) {
    console.log(
      `[AUTH_GUARD] ✅ Usuário já está no módulo correto: ${roleConfig.module}`,
    );
    return;
  }

  // Redireciona para o módulo correto
  console.log(
    `[AUTH_GUARD] 🔀 Redirecionando ${userRole} para: ${roleConfig.defaultPage}`,
  );
  window.location.href = roleConfig.defaultPage;
}

/**
 * Clears authentication data and redirects the user to the login page.
 * @returns {void}
 */
function clearAuthAndRedirectToLogin() {
  console.log(
    "[AUTH_GUARD] 🔄 Limpando autenticação e redirecionando para login...",
  );
  localStorage.removeItem("authToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userData");
  window.currentUser = null;
  if (window.location.pathname !== "/app/login.html") {
    window.location.href = "/app/login.html";
  }
}

/**
 * Protects a page by validating authentication, authorization, and route access.
 * @param {Object} [options={}] - Guard configuration.
 * @param {string[]|null} [options.allowedRoles=null] - Roles allowed on the page.
 * @param {boolean} [options.requireAuth=true] - Whether authentication is required.
 * @param {boolean} [options.autoRedirect=true] - Whether to redirect automatically by role.
 * @returns {Promise<boolean>}
 */
async function protectPage(options = {}) {
  const {
    allowedRoles = null,
    requireAuth = true,
    autoRedirect = true,
  } = options;

  console.log("[AUTH_GUARD] 🛡️ Iniciando verificação de autenticação...");

  if (!requireAuth) {
    console.log("[AUTH_GUARD] ℹ️ Página não requer autenticação");
    return true;
  }

  // Modo híbrido: login real + dados de negócio mockados.
  // Nesse modo a validação é local (token + role), sem refresh obrigatório.
  if (isMockModeEnabled()) {
    const token = localStorage.getItem("authToken");
    const currentUser = getStoredUserData();

    if (!token || !currentUser) {
      console.warn("[AUTH_GUARD] ❌ Sessão inválida em modo mock");
      clearAuthAndRedirectToLogin();
      throw new Error("Não autenticado em modo mock");
    }

    window.currentUser = currentUser;

    if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
      console.error(
        `[AUTH_GUARD] ❌ Acesso negado (mock). Role ${
          currentUser.role
        } não permitido. Permitidos: ${allowedRoles.join(", ")}`,
      );

      if (autoRedirect) {
        redirectToCorrectModule(currentUser.role);
      } else {
        throw new Error("Acesso negado");
      }
      return false;
    }

    if (autoRedirect) {
      const currentPath = window.location.pathname;
      if (!hasRoutePermission(currentUser.role, currentPath)) {
        redirectToCorrectModule(currentUser.role, currentPath);
        return false;
      }
    }

    console.log("[AUTH_GUARD] ✅ Autenticação mock validada com sucesso");
    return true;
  }

  const token = localStorage.getItem("authToken");
  const userData = localStorage.getItem("userData");

  // Verifica se há token
  if (!token) {
    console.warn("[AUTH_GUARD] ❌ Token não encontrado");
    clearAuthAndRedirectToLogin();
    throw new Error("Não autenticado");
  }

  // Decodifica e valida o token
  const tokenPayload = decodeJwtPayload(token);
  if (!tokenPayload) {
    console.warn("[AUTH_GUARD] ❌ Token inválido");
    clearAuthAndRedirectToLogin();
    throw new Error("Token inválido");
  }

  // Verifica se o token expirou
  const now = Math.floor(Date.now() / 1000);
  if (tokenPayload.exp && tokenPayload.exp <= now) {
    console.warn("[AUTH_GUARD] ⏰ Token expirado");

    // Tenta renovar o token
    const refreshSuccess = await refreshAuthToken();
    if (!refreshSuccess) {
      clearAuthAndRedirectToLogin();
      throw new Error("Token expirado e não foi possível renovar");
    }
  }
  // Verifica se precisa renovar em breve
  else if (shouldRefreshToken(tokenPayload)) {
    console.log("[AUTH_GUARD] 🔄 Token próximo do vencimento, renovando...");
    try {
      await refreshAuthToken();
      console.log("[AUTH_GUARD] ✅ Token renovado preventivamente");
    } catch (error) {
      console.warn("[AUTH_GUARD] ⚠️ Renovação automática falhou:", error);
      // Token ainda válido, não bloqueia acesso
    }
  }

  // Valida e carrega dados do usuário
  let currentUser;
  try {
    if (userData) {
      currentUser = JSON.parse(userData);
      window.currentUser = currentUser;
    } else {
      console.warn("[AUTH_GUARD] ⚠️ Dados do usuário não encontrados");
      clearAuthAndRedirectToLogin();
      throw new Error("Dados do usuário não encontrados");
    }
  } catch (error) {
    console.error("[AUTH_GUARD] ❌ Erro ao parsear dados do usuário:", error);
    clearAuthAndRedirectToLogin();
    throw new Error("Dados do usuário corrompidos");
  }

  console.log(
    `[AUTH_GUARD] ✅ Usuário autenticado: ${currentUser.email} (${currentUser.role})`,
  );

  // Verifica permissões específicas da página
  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    console.error(
      `[AUTH_GUARD] ❌ Acesso negado. Role ${
        currentUser.role
      } não permitido. Permitidos: ${allowedRoles.join(", ")}`,
    );

    if (autoRedirect) {
      redirectToCorrectModule(currentUser.role);
    } else {
      throw new Error("Acesso negado");
    }
    return false;
  }

  // Auto-redirecionamento baseado no role (se habilitado)
  if (autoRedirect) {
    const currentPath = window.location.pathname;
    if (!hasRoutePermission(currentUser.role, currentPath)) {
      redirectToCorrectModule(currentUser.role, currentPath);
      return false;
    }
  }

  console.log("[AUTH_GUARD] ✅ Autenticação e autorização bem-sucedidas");

  // Iniciar monitoramento automático de token para evitar expiração em sessões longas
  startAutoTokenRefresh();

  return true;
}

let _tokenRefreshInterval = null;

/**
 * Starts the recurring token refresh loop for long-lived sessions.
 * @returns {void}
 */
function startAutoTokenRefresh() {
  if (_tokenRefreshInterval) return; // Já iniciado

  console.log(
    "[AUTH_GUARD] 🔄 Monitoramento automático de token iniciado (verificação a cada 5min)",
  );

  // Verificar a cada 5 minutos
  _tokenRefreshInterval = setInterval(
    async () => {
      const token = localStorage.getItem("authToken");
      if (!token) {
        clearInterval(_tokenRefreshInterval);
        _tokenRefreshInterval = null;
        return;
      }

      const payload = decodeJwtPayload(token);
      // Se precisar renovar (faltando < 30min), renova
      // Se já expirou, o refreshAuthToken também deve lidar se tiver refreshToken válido
      if (shouldRefreshToken(payload)) {
        console.log(
          "[AUTH_GUARD] ⏰ Ciclo de auto-refresh: Token precisa ser renovado",
        );
        await refreshAuthToken();
      }
    },
    5 * 60 * 1000,
  );
}

// ===================================================================================
// INICIALIZAÇÃO AUTOMÁTICA E VERIFICAÇÃO DE SESSÃO
// ===================================================================================

/**
 * Initializes global authentication monitoring and storage listeners.
 * @returns {void}
 */
function initializeAuthGuard() {
  console.log("[AUTH_GUARD] 🚀 Inicializando sistema de autenticação...");

  if (isMockModeEnabled()) {
    window.addEventListener("storage", (e) => {
      if (e.key === "authToken" && !e.newValue) {
        console.log(
          "[AUTH_GUARD] 🔄 Token removido em outra aba (mock), redirecionando...",
        );
        clearAuthAndRedirectToLogin();
      }
    });

    console.log("[AUTH_GUARD] ✅ Sistema de autenticação mock inicializado");
    return;
  }

  // Verifica token a cada 5 minutos
  const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos

  setInterval(async () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    const tokenPayload = decodeJwtPayload(token);
    if (!tokenPayload) return;

    // Se o token está próximo do vencimento, renova automaticamente
    if (shouldRefreshToken(tokenPayload)) {
      console.log("[AUTH_GUARD] 🔄 Renovação automática de token iniciada...");
      const success = await refreshAuthToken();
      if (!success) {
        console.warn(
          "[AUTH_GUARD] ⚠️ Falha na renovação automática, usuário será deslogado",
        );
        clearAuthAndRedirectToLogin();
      }
    }
  }, TOKEN_CHECK_INTERVAL);

  // Checagem imediata ao carregar a página (importante para TV após semanas sem sessão)
  (async () => {
    const token = localStorage.getItem("authToken");
    const refreshToken = localStorage.getItem("refreshToken");
    if (!token && !refreshToken) return;

    const tokenPayload = token ? decodeJwtPayload(token) : null;
    const now = Math.floor(Date.now() / 1000);

    // Se não conseguimos decodificar ou já expirou / está perto de expirar, tenta renovar
    if (
      !tokenPayload ||
      !tokenPayload.exp ||
      tokenPayload.exp <= now ||
      shouldRefreshToken(tokenPayload)
    ) {
      const success = await refreshAuthToken();
      if (!success) {
        clearAuthAndRedirectToLogin();
      }
    }
  })();

  // Escuta eventos de mudança no localStorage (múltiplas abas)
  window.addEventListener("storage", (e) => {
    if (e.key === "authToken" && !e.newValue) {
      console.log(
        "[AUTH_GUARD] 🔄 Token removido em outra aba, redirecionando...",
      );
      clearAuthAndRedirectToLogin();
    }
  });

  console.log("[AUTH_GUARD] ✅ Sistema de autenticação inicializado");
}

/**
 * Initializes a page with optional auth protection followed by layout setup.
 * @param {Object} pageConfig - Page and auth configuration.
 * @param {Object} [pageConfig.auth] - Authentication guard configuration.
 * @returns {Promise<boolean>}
 */
async function initPageWithAuth(pageConfig) {
  const { auth, ...layoutConfig } = pageConfig;

  // Aplica proteção se configurada
  if (auth) {
    try {
      await protectPage(auth);
    } catch (error) {
      console.error("[AUTH_GUARD] Falha na autenticação da página:", error);
      return false;
    }
  }

  // Inicializa o layout após autenticação bem-sucedida
  if (layoutConfig && Object.keys(layoutConfig).length > 0) {
    await initLayout(layoutConfig);
  }

  return true;
}

// Inicializa o sistema de autenticação quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
  initializeAuthGuard();
});

/**
 * Logs out the current user, clears local auth state, and redirects to login.
 * @returns {Promise<void>}
 */
async function logout() {
  // --- LOG DE DEPURAÇÃO ---
  console.log("[DEBUG-FRONTEND] A função logout() foi chamada.");

  if (isMockModeEnabled()) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userData");
    window.location.href = "/app/login.html";
    return;
  }

  const authToken = localStorage.getItem("authToken");

  if (authToken) {
    // --- LOG DE DEPURAÇÃO ---
    console.log(
      "[DEBUG-FRONTEND] Token encontrado. Enviando requisição para /api/auth/logout...",
    );
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (!response.ok) {
        console.warn(
          "A invalidação do token no servidor falhou, mas o logout no cliente prosseguirá.",
        );
      } else {
        console.log("[AUTH] Token invalidado no servidor com sucesso.");
      }
    } catch (error) {
      console.error("Erro ao contatar o servidor para logout:", error);
    }
  }

  // Limpa os dados locais independentemente da resposta do servidor
  localStorage.removeItem("authToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userData");

  // Redireciona para a página de login
  window.location.href = "/app/login.html";
}

/**
 * Wraps standalone content sections with the expected layout containers when missing.
 * @returns {void}
 */
function autoFixFormSectionLayout() {
  // Procura por containers que precisam de wrappers
  const mainContent = document.querySelector(".main-content");
  if (!mainContent) return;

  // Verifica se já existe .page-content-wrapper
  if (mainContent.querySelector(".page-content-wrapper")) return;

  // Lista de seletores que precisam ser envolvidos pelos wrappers
  const containerSelectors = [
    ".form-section",
    ".pautas-section",
    ".dashboard-section",
    ".content-section",
    ".ordem-dia-section",
    ".oradores-section",
    ".vereadores-section",
    ".relatorio-section",
    ".votacao-layout", // Adicionado para painel de votação
    ".painel-section", // Adicionado para painel de controle
  ];

  // Procura por qualquer um dos containers diretamente filhos de .main-content
  const containersToWrap = [];
  containerSelectors.forEach((selector) => {
    const elements = mainContent.querySelectorAll(`:scope > ${selector}`);
    elements.forEach((el) => containersToWrap.push(el));
  });

  if (containersToWrap.length === 0) return;

  console.log(
    "🔧 Auto-corrigindo layout: envolvendo containers com wrappers necessários",
    containersToWrap.map((el) => el.className),
  );

  // Cria os wrappers
  const pageContentWrapper = document.createElement("div");
  pageContentWrapper.className = "page-content-wrapper";

  const contentArea = document.createElement("div");
  contentArea.className = "content-area";

  // Move todos os containers encontrados para dentro dos wrappers
  // Inserir o wrapper ANTES do primeiro elemento encontrado para manter a ordem (logo antes do footer)
  const firstContainer = containersToWrap[0];
  if (firstContainer && firstContainer.parentNode) {
    firstContainer.parentNode.insertBefore(pageContentWrapper, firstContainer);
  } else {
    mainContent.appendChild(pageContentWrapper);
  }

  containersToWrap.forEach((container) => {
    contentArea.appendChild(container);
  });

  pageContentWrapper.appendChild(contentArea);
}

// ===================================================================================
// FUNÇÕES DE BADGE INTELIGENTE PARA SIDEBAR
// ===================================================================================

/**
 * Updates the control-panel badge with the number of attention-worthy items.
 * @returns {Promise<void>}
 */
async function updatePainelControleBadge() {
  const badge = document.getElementById("painel-badge");
  if (!badge) return;

  try {
    const authToken = localStorage.getItem("authToken");
    if (!authToken) return;

    // Buscar dados que precisam de atenção no painel de controle
    const [sessoesPendentes, pautasPendentes, vereadores] = await Promise.all([
      // Sessões que precisam de atenção (futuras sem pautas)
      fetch("/api/app/sessoes?status=pendente", {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => (r.ok ? r.json() : { data: [] })),

      // Pautas pendentes de aprovação
      fetch("/api/app/pautas?status=pendente", {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => (r.ok ? r.json() : { data: [] })),

      // Vereadores inativos (problema que precisa atenção)
      fetch("/api/app/vereadores", {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => (r.ok ? r.json() : [])),
    ]);

    // Calcular total de itens que precisam atenção
    let totalAtencao = 0;

    // Sessões sem pautas ou problemas
    if (sessoesPendentes.data) {
      totalAtencao += sessoesPendentes.data.length;
    }

    // Pautas pendentes
    if (pautasPendentes.data) {
      totalAtencao += pautasPendentes.data.length;
    }

    // Vereadores inativos
    const vereadoresInativos = vereadores.filter((v) => !v.is_active);
    if (vereadoresInativos.length > 0) {
      totalAtencao += 1; // Conta como 1 problema mesmo que sejam vários vereadores
    }

    // Atualizar badge
    console.log("Atualizando badge do painel de controle:", totalAtencao);
    if (totalAtencao > 0) {
      badge.textContent = totalAtencao > 9 ? "9+" : totalAtencao.toString();
      badge.style.display = "flex";

      // Adicionar cor baseada na urgência
      if (totalAtencao >= 5) {
        badge.style.backgroundColor = "var(--accent-red)";
      } else if (totalAtencao >= 3) {
        badge.style.backgroundColor = "var(--accent-orange)";
      } else {
        badge.style.backgroundColor = "var(--accent-blue)";
      }
    } else {
      badge.style.display = "none";
    }
  } catch (error) {
    console.error("Erro ao atualizar badge do painel de controle:", error);
    // Em caso de erro, esconder o badge
    badge.style.display = "none";
  }
}

/**
 * Adds "coming soon" badges to navigation items that are locked in mock mode.
 * @returns {void}
 */
function setupComingSoonBadges() {
  if (!isMockModeEnabled()) return;

  document.querySelectorAll("a[data-page]").forEach((link) => {
    const pageName = link.getAttribute("data-page");
    if (!SPRINT1_LOCKED_PAGES_IN_MOCK.has(pageName)) return;

    link.classList.add("is-coming-soon");
    link.setAttribute("aria-disabled", "true");

    if (link.querySelector(".coming-soon-badge")) return;

    const badge = document.createElement("span");
    badge.className = "coming-soon-badge";
    badge.textContent = "Parte 2";
    badge.style.marginLeft = "8px";
    badge.style.fontSize = "10px";
    badge.style.padding = "2px 6px";
    badge.style.borderRadius = "999px";
    badge.style.backgroundColor = "rgba(255, 193, 7, 0.2)";
    badge.style.color = "#FFC107";
    badge.style.fontWeight = "700";

    link.appendChild(badge);
  });
}

// Chamar a função de atualização do badge quando a página carregar
document.addEventListener("DOMContentLoaded", () => {
  // Aguardar um pouco para garantir que o sidebar foi carregado
  setTimeout(() => {
    setupComingSoonBadges();
    updatePainelControleBadge();
  }, 1000);

  // Atualizar badge periodicamente (a cada 5 minutos)
  setInterval(updatePainelControleBadge, 5 * 60 * 1000);
});
