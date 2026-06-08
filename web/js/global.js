/**
 * Shared layout, navigation, animation, authentication guard, and sidebar helpers.
 *
 * @module web/js/global
 */

// ===================================================================================
// Layout Initialization
// ===================================================================================

/**
 * Loads the layout components for the current module and wires global UI behavior.
 * @param {object} pageConfig - Page layout configuration.
 * @param {string} [pageConfig.title] - Header title.
 * @param {string} [pageConfig.icon] - Font Awesome icon class used in the header.
 * @param {string} [pageConfig.navActive] - Navigation item ID to mark as active.
 * @returns {Promise<void>}
 */
async function initLayout(pageConfig) {
  const path = window.location.pathname;

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

  setupDynamicContent(pageConfig);
  setupSidebarMobileToggle();
  autoFixFormSectionLayout();
  setupEventListeners();
}

/**
 * Creates and binds mobile sidebar controls after the sidebar component is loaded.
 * Keeps ARIA state, body classes, and outside-click behavior synchronized.
 * @returns {void}
 */
function setupSidebarMobileToggle() {
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

  const setExpanded = (expanded) => {
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  const closeSidebar = () => {
    const currentSidebar = getSidebar();
    if (currentSidebar) {
      currentSidebar.classList.remove("is-open");
    }
    document.body.classList.remove("sidebar-open");
    setExpanded(false);
  };

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

  const logoutLink = sidebar.querySelector('[data-action="logout"]');
  if (logoutLink && !logoutLink.dataset.bound) {
    logoutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await logout();
      } catch (err) {
        console.error("Erro ao executar logout:", err);
        localStorage.removeItem("authToken");
        localStorage.removeItem("userData");
        window.location.href = "/app/login.html";
      }
    });
    logoutLink.dataset.bound = "true";
  }

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

  // Reset mobile-only open state when returning to desktop layout.
  const handleViewportChange = () => {
    if (!isMobile.matches) {
      closeSidebar();
    }
  };

  if (!sidebar.dataset.mobileToggleBound) {
    isMobile.addEventListener("change", handleViewportChange);
    sidebar.dataset.mobileToggleBound = "true";
  }

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
// Component Loading and Setup Helpers
// ===================================================================================

/**
 * Fetches an HTML component and injects it into a target placeholder.
 * @param {string} componentPath - Relative path to the component HTML file.
 * @param {string} targetElementId - Placeholder element ID.
 * @returns {Promise<void>}
 */
async function loadComponent(componentPath, targetElementId) {
  const targetElement = document.getElementById(targetElementId);
  if (!targetElement) return;

  try {
    // Cache-bust component requests during development.
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
 * Applies page-specific title, header icon, and active navigation state.
 * @param {object} pageConfig - Page layout configuration.
 * @param {string} [pageConfig.title] - Header title.
 * @param {string} [pageConfig.icon] - Font Awesome icon class used in the header.
 * @param {string} [pageConfig.navActive] - Navigation item ID to mark as active.
 * @returns {void}
 */
function setupDynamicContent(pageConfig) {
  if (!pageConfig) return;

  const headerTitle = document.getElementById("header-title");
  const headerIcon = document.getElementById("header-icon");
  if (headerTitle && pageConfig.title) {
    headerTitle.textContent = pageConfig.title;
  }
  if (headerIcon && pageConfig.icon) {
    headerIcon.className = `fa-solid ${pageConfig.icon}`;
  }

  if (pageConfig.navActive) {
    const activeNavItem = document.getElementById(pageConfig.navActive);
    if (activeNavItem) {
      activeNavItem.classList.add("active");
    }
  }
}

/**
 * Binds global event handlers after dynamic components are available in the DOM.
 * @returns {void}
 */
function setupEventListeners() {
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");
  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      profileDropdown.classList.toggle("active");
      profileBtn.classList.toggle("active");
    });
  }

  window.addEventListener("click", () => {
    if (profileDropdown && profileDropdown.classList.contains("active")) {
      profileDropdown.classList.remove("active");
      profileBtn.classList.remove("active");
    }
  });

  const navLinks = document.querySelectorAll("a[data-page]");
  navLinks.forEach((link) => {
    link.replaceWith(link.cloneNode(true));
  });

  document.querySelectorAll("a[data-page]").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const pageName = this.getAttribute("data-page");
      navigateToPage(pageName);
    });
  });

  initializeFadeInObserver();
}

// ===================================================================================
// Navigation
// ===================================================================================

/**
 * Checks whether the current page belongs to the admin module.
 * @returns {boolean} True when the current path is under `/admin/`.
 */
function isAdminContext() {
  return window.location.pathname.includes("/admin/");
}

/**
 * Navigates to a mapped page, applying the main-content transition when available.
 * @param {string} pageName - Logical page key from the navigation map.
 * @returns {void}
 */
function navigateToPage(pageName) {
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
 * Resolves a logical page name to its absolute route.
 * @param {string} pageName - Logical page key.
 * @returns {string|undefined} Absolute route for the page, or undefined when unmapped.
 */
function getPageUrl(pageName) {
  const pageMap = {
    dashboard_admin: "/admin/dashboard_admin.html",
    "nova-camara": "/admin/nova_camara.html",
    "novo-partido": "/admin/novo_partido.html",
    partidos: "/admin/partidos.html",
    configuracoes: "/admin/configuracoes.html",
    relatorios: "/admin/relatorios.html",
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

  const key =
    isAdminContext() && pageName === "dashboard" ? "dashboard_admin" : pageName;

  return pageMap[key];
}

// ===================================================================================
// Animations
// ===================================================================================

/**
 * Reveals `.fade-in` elements when they enter the viewport.
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
 * Initializes the unified animation system for load-time and scroll-triggered elements.
 * Supports `.fade-in`, `.animate-on-load`, `.fade-in-section`, and `[data-animate]`.
 * @returns {void}
 */
function initUnifiedAnimations() {
  const immediateElements = document.querySelectorAll(
    ".animate-on-load, [data-animate].animate-on-load",
  );
  immediateElements.forEach((el, index) => {
    setTimeout(
      () => {
        el.classList.add("animated");
        el.classList.add("visible");
      },
      (index + 1) * 200,
    );
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("animated");
          entry.target.classList.add("visible");

          const delay = entry.target.getAttribute("data-delay");
          if (delay) {
            entry.target.style.transitionDelay = `${delay}ms`;
          }

          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px",
    },
  );

  const scrollElements = document.querySelectorAll(
    ".fade-in, .fade-in-section, [data-animate]",
  );
  scrollElements.forEach((el) => observer.observe(el));
}

/**
 * Backward-compatible alias for the unified animation initializer.
 * @returns {void}
 */
function initFadeInAnimations() {
  initUnifiedAnimations();
}

document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("showLoginSuccessToast") === "true") {
    showToast("Login bem-sucedido!", "success");
    localStorage.removeItem("showLoginSuccessToast");
  }
});

// ===================================================================================
// UI Component Initializers
// ===================================================================================

/**
 * Initializes interactive status dropdowns and updates their visible badge state.
 * @returns {void}
 */
function initStatusDropdowns() {
  const statusDropdowns = document.querySelectorAll(".status-dropdown");
  if (statusDropdowns.length === 0) return;

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
          mainBadge.className = "status-badge";
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
// Authentication and Route Protection
// ===================================================================================

/**
 * Maps each user role to the module and path prefixes it may access.
 * @type {Object.<string, {module: string, defaultPage: string, allowedPaths: string[]}>}
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
    defaultPage: "/tablet/",
    allowedPaths: ["/tablet/"],
  },
};

/**
 * Decodes a JWT payload without verifying the token signature.
 * @param {string} token - JWT string.
 * @returns {object|null} Decoded payload, or null when decoding fails.
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
 * Determines whether a token should be refreshed before it expires.
 * @param {{exp?: number}|null} tokenPayload - Decoded JWT payload.
 * @returns {boolean} True when the token is missing, invalid, or within the refresh window.
 */
function shouldRefreshToken(tokenPayload) {
  if (!tokenPayload || !tokenPayload.exp) return true;

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = tokenPayload.exp - now;
  const thirtyMinutes = 30 * 60;

  // Tokens are refreshed when 30 minutes or less remain.
  return timeUntilExpiry <= thirtyMinutes;
}

/**
 * Validates or refreshes authentication tokens through the backend refresh endpoint.
 * Updates localStorage and `window.currentUser` when fresh data is returned.
 * @returns {Promise<boolean>} True when the refresh endpoint succeeds.
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
 * Checks whether a user role can access a given path.
 * @param {string} userRole - User role.
 * @param {string} currentPath - Current page path.
 * @returns {boolean} True when the role has access to the path.
 */
function hasRoutePermission(userRole, currentPath) {
  const roleConfig = ROLE_ROUTES[userRole];
  if (!roleConfig) return false;

  return roleConfig.allowedPaths.some((allowedPath) =>
    currentPath.startsWith(allowedPath),
  );
}

/**
 * Redirects the user to the default module page for their role when needed.
 * @param {string} userRole - User role.
 * @param {string} [currentPath=window.location.pathname] - Path used for permission checks.
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

  if (hasRoutePermission(userRole, currentPath)) {
    console.log(
      `[AUTH_GUARD] ✅ Usuário já está no módulo correto: ${roleConfig.module}`,
    );
    return;
  }

  console.log(
    `[AUTH_GUARD] 🔀 Redirecionando ${userRole} para: ${roleConfig.defaultPage}`,
  );
  window.location.href = roleConfig.defaultPage;
}

/**
 * Clears client-side authentication state and redirects to the login page.
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
 * Protects the current page with token validation, optional role checks, and module redirects.
 * @param {object} [options={}] - Authentication guard options.
 * @param {string[]|null} [options.allowedRoles=null] - Roles allowed to access the page.
 * @param {boolean} [options.requireAuth=true] - Whether authentication is required.
 * @param {boolean} [options.autoRedirect=true] - Whether to redirect users to their module.
 * @returns {Promise<boolean>} True when access is allowed; false when redirected or denied.
 * @throws {Error} When authentication data is missing, invalid, expired, or access is denied.
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

  const token = localStorage.getItem("authToken");
  const userData = localStorage.getItem("userData");

  if (!token) {
    console.warn("[AUTH_GUARD] ❌ Token não encontrado");
    clearAuthAndRedirectToLogin();
    throw new Error("Não autenticado");
  }

  const tokenPayload = decodeJwtPayload(token);
  if (!tokenPayload) {
    console.warn("[AUTH_GUARD] ❌ Token inválido");
    clearAuthAndRedirectToLogin();
    throw new Error("Token inválido");
  }

  const now = Math.floor(Date.now() / 1000);
  if (tokenPayload.exp && tokenPayload.exp <= now) {
    console.warn("[AUTH_GUARD] ⏰ Token expirado");

    const refreshSuccess = await refreshAuthToken();
    if (!refreshSuccess) {
      clearAuthAndRedirectToLogin();
      throw new Error("Token expirado e não foi possível renovar");
    }
  }
  else if (shouldRefreshToken(tokenPayload)) {
    console.log("[AUTH_GUARD] 🔄 Token próximo do vencimento, renovando...");
    try {
      await refreshAuthToken();
      console.log("[AUTH_GUARD] ✅ Token renovado preventivamente");
    } catch (error) {
      console.warn("[AUTH_GUARD] ⚠️ Renovação automática falhou:", error);
    }
  }

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

  if (autoRedirect) {
    const currentPath = window.location.pathname;
    if (!hasRoutePermission(currentUser.role, currentPath)) {
      redirectToCorrectModule(currentUser.role, currentPath);
      return false;
    }
  }

  console.log("[AUTH_GUARD] ✅ Autenticação e autorização bem-sucedidas");

  startAutoTokenRefresh();

  return true;
}

let _tokenRefreshInterval = null;

/**
 * Starts a single interval that refreshes tokens during long-lived sessions.
 * @returns {void}
 */
function startAutoTokenRefresh() {
  if (_tokenRefreshInterval) return;

  console.log(
    "[AUTH_GUARD] 🔄 Monitoramento automático de token iniciado (verificação a cada 5min)",
  );

  _tokenRefreshInterval = setInterval(
    async () => {
      const token = localStorage.getItem("authToken");
      if (!token) {
        clearInterval(_tokenRefreshInterval);
        _tokenRefreshInterval = null;
        return;
      }

      const payload = decodeJwtPayload(token);
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
// Automatic Session Checks
// ===================================================================================

/**
 * Initializes global authentication monitoring for token refresh and multi-tab logout.
 * @returns {void}
 */
function initializeAuthGuard() {
  console.log("[AUTH_GUARD] 🚀 Inicializando sistema de autenticação...");

  const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000;

  setInterval(async () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    const tokenPayload = decodeJwtPayload(token);
    if (!tokenPayload) return;

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

  // Refresh immediately when a stored TV/session token may have gone stale.
  (async () => {
    const token = localStorage.getItem("authToken");
    const refreshToken = localStorage.getItem("refreshToken");
    if (!token && !refreshToken) return;

    const tokenPayload = token ? decodeJwtPayload(token) : null;
    const now = Math.floor(Date.now() / 1000);

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
 * Applies page authentication and initializes layout when access is granted.
 * @param {object} pageConfig - Combined authentication and layout configuration.
 * @param {object} [pageConfig.auth] - Options passed to `protectPage`.
 * @returns {Promise<boolean>} True when initialization completes.
 */
async function initPageWithAuth(pageConfig) {
  const { auth, ...layoutConfig } = pageConfig;

  if (auth) {
    try {
      await protectPage(auth);
    } catch (error) {
      console.error("[AUTH_GUARD] Falha na autenticação da página:", error);
      return false;
    }
  }

  if (layoutConfig && Object.keys(layoutConfig).length > 0) {
    await initLayout(layoutConfig);
  }

  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  initializeAuthGuard();
});

/**
 * Logs out the current user by notifying the backend and clearing local auth state.
 * @returns {Promise<void>}
 */
async function logout() {
  console.log("[DEBUG-FRONTEND] A função logout() foi chamada.");

  const authToken = localStorage.getItem("authToken");

  if (authToken) {
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

  localStorage.removeItem("authToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userData");

  window.location.href = "/app/login.html";
}

/**
 * Wraps legacy page content in the layout containers expected by shared styles.
 * @returns {void}
 */
function autoFixFormSectionLayout() {
  const mainContent = document.querySelector(".main-content");
  if (!mainContent) return;

  if (mainContent.querySelector(".page-content-wrapper")) return;

  const containerSelectors = [
    ".form-section",
    ".pautas-section",
    ".dashboard-section",
    ".content-section",
    ".ordem-dia-section",
    ".oradores-section",
    ".vereadores-section",
    ".relatorio-section",
    ".votacao-layout",
    ".painel-section",
  ];

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

  const pageContentWrapper = document.createElement("div");
  pageContentWrapper.className = "page-content-wrapper";

  const contentArea = document.createElement("div");
  contentArea.className = "content-area";

  // Insert before the first matched container so the original content order is preserved.
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
// Sidebar Badge Helpers
// ===================================================================================

/**
 * Updates the control-panel badge with the number of items needing attention.
 * @returns {Promise<void>}
 */
async function updatePainelControleBadge() {
  const badge = document.getElementById("painel-badge");
  if (!badge) return;

  try {
    const authToken = localStorage.getItem("authToken");
    if (!authToken) return;

    const [sessoesPendentes, pautasPendentes, vereadores] = await Promise.all([
      fetch("/api/app/sessoes?status=pendente", {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => (r.ok ? r.json() : { data: [] })),

      fetch("/api/app/pautas?status=pendente", {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => (r.ok ? r.json() : { data: [] })),

      fetch("/api/app/vereadores", {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => (r.ok ? r.json() : [])),
    ]);

    let totalAtencao = 0;

    if (sessoesPendentes.data) {
      totalAtencao += sessoesPendentes.data.length;
    }

    if (pautasPendentes.data) {
      totalAtencao += pautasPendentes.data.length;
    }

    const vereadoresInativos = vereadores.filter((v) => !v.is_active);
    if (vereadoresInativos.length > 0) {
      totalAtencao += 1;
    }

    console.log("Atualizando badge do painel de controle:", totalAtencao);
    if (totalAtencao > 0) {
      badge.textContent = totalAtencao > 9 ? "9+" : totalAtencao.toString();
      badge.style.display = "flex";

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
    badge.style.display = "none";
  }
}

/**
 * Placeholder hook for sidebar "coming soon" badge setup.
 * @returns {void}
 */
function setupComingSoonBadges() {
  console.log('✨ Badges "Em breve" configurados no sidebar');
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    setupComingSoonBadges();
    updatePainelControleBadge();
  }, 1000);

  setInterval(updatePainelControleBadge, 5 * 60 * 1000);
});
