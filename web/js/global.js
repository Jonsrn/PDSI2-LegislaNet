/**
 * @file Global frontend utilities for layout loading, navigation, shared UI
 * interactions, authentication route guards, animations, and sidebar badges.
 */

/**
 * Initializes the page layout by loading contextual components and global UI listeners.
 *
 * @param {Object} pageConfig - Page layout configuration.
 * @param {string} pageConfig.title - Header title text.
 * @param {string} pageConfig.icon - Font Awesome icon class for the header.
 * @param {string} pageConfig.navActive - Navigation item ID to mark as active.
 * @returns {Promise<void>} Resolves after layout components and listeners are initialized.
 */
async function initLayout(pageConfig) {
  const path = window.location.pathname;

  /**
   * Ensures a footer placeholder exists in the expected layout location.
   *
   * @returns {HTMLElement} The existing or newly created footer placeholder.
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
 * Configures mobile sidebar controls, outside-click closing, and sidebar logout handling.
 *
 * @returns {void}
 */
function setupSidebarMobileToggle() {
  /**
   * Reads the current sidebar element from the DOM.
   *
   * @returns {Element|null} Current sidebar element, or null when unavailable.
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
   * Updates the sidebar toggle expanded state for assistive technology.
   *
   * @param {boolean} expanded - Whether the sidebar is currently expanded.
   * @returns {void}
   */
  const setExpanded = (expanded) => {
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  /**
   * Closes the mobile sidebar and resets the page open state.
   *
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
   * Toggles the mobile sidebar between open and closed states.
   *
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
    logoutLink.addEventListener(
      "click",
      /**
       * Handles sidebar logout clicks and falls back to local cleanup on failure.
       *
       * @param {MouseEvent} e - Sidebar logout click event.
       * @returns {Promise<void>} Resolves after logout handling completes.
       */
      async (e) => {
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
      },
    );
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

  // Se sair do mobile, garante que o comportamento desktop (hover) não fique preso em "aberto"
  /**
   * Resets mobile sidebar state when leaving the mobile viewport.
   *
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
      /**
       * Closes the sidebar when the user taps outside it on mobile.
       *
       * @param {PointerEvent} e - Pointer event from the document.
       * @returns {void}
       */
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
 * Loads an HTML component file and injects it into a target placeholder.
 *
 * @param {string} componentPath - Relative path to the component HTML file.
 * @param {string} targetElementId - ID of the placeholder element to receive the component.
 * @returns {Promise<void>} Resolves after the component is loaded or an error state is rendered.
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
 * Applies dynamic header and navigation state from the page configuration.
 *
 * @param {Object} pageConfig - Page layout configuration.
 * @param {string} [pageConfig.title] - Header title text.
 * @param {string} [pageConfig.icon] - Font Awesome icon class for the header.
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
 * Registers global UI event listeners after layout components are loaded.
 *
 * @returns {void}
 */
function setupEventListeners() {
  // Listener para o dropdown do perfil de usuário
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");
  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener(
      "click",
      /**
       * Toggles the profile dropdown without propagating the click.
       *
       * @param {MouseEvent} event - Profile button click event.
       * @returns {void}
       */
      (event) => {
        event.stopPropagation();
        profileDropdown.classList.toggle("active");
        profileBtn.classList.toggle("active");
      },
    );
  }

  // Listener para fechar o dropdown ao clicar fora
  window.addEventListener(
    "click",
    /**
     * Closes the profile dropdown when the user clicks outside it.
     *
     * @returns {void}
     */
    () => {
      if (profileDropdown && profileDropdown.classList.contains("active")) {
        profileDropdown.classList.remove("active");
        profileBtn.classList.remove("active");
      }
    },
  );

  // Listeners para os links de navegação da sidebar
  const navLinks = document.querySelectorAll("a[data-page]");
  navLinks.forEach(
    /**
     * Replaces navigation links with clones to remove duplicate listeners.
     *
     * @param {Element} link - Navigation link to replace.
     * @returns {void}
     */
    (link) => {
    // Remove listeners antigos para evitar duplicação, se houver
      link.replaceWith(link.cloneNode(true));
    },
  );
  // Adiciona os novos listeners
  document.querySelectorAll("a[data-page]").forEach(
    /**
     * Binds navigation behavior to a page link.
     *
     * @param {Element} link - Navigation link to bind.
     * @returns {void}
     */
    (link) => {
      link.addEventListener(
        "click",
        /**
         * Navigates to the page named in the link data attribute.
         *
         * @param {MouseEvent} e - Navigation click event.
         * @returns {void}
         */
        function (e) {
          e.preventDefault();
          const pageName = this.getAttribute("data-page");
          navigateToPage(pageName);
        },
      );
    },
  );

  // Animações de fade-in
  initializeFadeInObserver();
}

// ===================================================================================
// LÓGICA DE NAVEGAÇÃO (ADAPTADA DO SEU ARQUIVO ORIGINAL)
// ===================================================================================

/**
 * Checks whether the current page belongs to the admin module.
 *
 * @returns {boolean} True when the URL path is inside the admin module.
 */
function isAdminContext() {
  return window.location.pathname.includes("/admin/");
}

/**
 * Navigates to a named application page with a short transition when possible.
 *
 * @param {string} pageName - Logical page name to resolve.
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
    setTimeout(
      /**
       * Performs the delayed navigation after the transition class is applied.
       *
       * @returns {void}
       */
      () => {
        window.location.href = targetUrl;
      },
      200,
    );
  } else {
    window.location.href = targetUrl;
  }
}

/**
 * Resolves a logical page name to an absolute application URL.
 *
 * @param {string} pageName - Logical page name to resolve.
 * @returns {string|undefined} Absolute URL for the page, or undefined when unknown.
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
 * Observes fade-in elements and marks them visible when they enter the viewport.
 *
 * @returns {void}
 */
function initializeFadeInObserver() {
  const elementsToFadeIn = document.querySelectorAll(".fade-in");
  if (elementsToFadeIn.length === 0) return;

  const observer = new IntersectionObserver(
    /**
     * Handles visibility changes for fade-in elements.
     *
     * @param {IntersectionObserverEntry[]} entries - Observed element entries.
     * @returns {void}
     */
    (entries) => {
      entries.forEach(
        /**
         * Reveals a single element once it intersects the viewport.
         *
         * @param {IntersectionObserverEntry} entry - Observed element entry.
         * @returns {void}
         */
        (entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        },
      );
    },
    { threshold: 0.1 },
  );

  elementsToFadeIn.forEach(
    /**
     * Starts observing a fade-in element.
     *
     * @param {Element} el - Element to observe.
     * @returns {void}
     */
    (el) => observer.observe(el),
  );
}

/**
 * Initializes unified fade-in animations for load-time and scroll-time elements.
 *
 * @returns {void}
 */
function initUnifiedAnimations() {
  // 1. Animações imediatas (hero sections e elementos marcados)
  const immediateElements = document.querySelectorAll(
    ".animate-on-load, [data-animate].animate-on-load",
  );
  immediateElements.forEach(
    /**
     * Schedules an immediate load animation for an element.
     *
     * @param {Element} el - Element to animate.
     * @param {number} index - Element index used to stagger animation timing.
     * @returns {void}
     */
    (el, index) => {
    setTimeout(
      /**
       * Applies animation classes after the staggered delay.
       *
       * @returns {void}
       */
      () => {
          el.classList.add("animated");
          el.classList.add("visible"); // Manter compatibilidade
        },
      (index + 1) * 200,
    );
    },
  );

  // 2. Animações durante scroll (Intersection Observer)
  const observer = new IntersectionObserver(
    /**
     * Handles scroll-triggered animation entries.
     *
     * @param {IntersectionObserverEntry[]} entries - Observed animation entries.
     * @returns {void}
     */
    (entries) => {
      entries.forEach(
        /**
         * Animates one element when it intersects the viewport.
         *
         * @param {IntersectionObserverEntry} entry - Observed element entry.
         * @returns {void}
         */
        (entry) => {
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
        },
      );
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
  scrollElements.forEach(
    /**
     * Starts observing a scroll-animated element.
     *
     * @param {Element} el - Element to observe.
     * @returns {void}
     */
    (el) => observer.observe(el),
  );
}

// Manter compatibilidade com código existente
/**
 * Backward-compatible alias for unified fade-in animation initialization.
 *
 * @returns {void}
 */
function initFadeInAnimations() {
  initUnifiedAnimations();
}

// Adiciona um listener global que espera o DOM carregar, mas não inicia o layout.
// O layout será iniciado por uma chamada explícita em cada página HTML.
document.addEventListener(
  "DOMContentLoaded",
  /**
   * Shows the post-login success toast when requested by localStorage.
   *
   * @returns {void}
   */
  () => {
  // Funções que não dependem de componentes podem ser chamadas aqui,
  // mas a maioria agora está em setupEventListeners().
    if (localStorage.getItem("showLoginSuccessToast") === "true") {
      // Se a flag existir, mostra o toast
      showToast("Login bem-sucedido!", "success");
      // E remove a flag para não mostrar novamente ao recarregar a página
      localStorage.removeItem("showLoginSuccessToast");
    }
  },
);

// ===================================================================================
// INICIALIZADOR DE COMPONENTES DE UI (ex: Dropdowns de Tabela)
// ===================================================================================

/**
 * Initializes status dropdown interactions found on the current page.
 *
 * @returns {void}
 */
function initStatusDropdowns() {
  const statusDropdowns = document.querySelectorAll(".status-dropdown");
  if (statusDropdowns.length === 0) return;

  /**
   * Closes all status dropdowns except the optional active dropdown.
   *
   * @param {Element|null} [exceptThisOne=null] - Dropdown that should remain open.
   * @returns {void}
   */
  const closeAllDropdowns = (exceptThisOne = null) => {
    document.querySelectorAll(".status-dropdown.open").forEach(
      /**
       * Closes a single open dropdown when it is not excluded.
       *
       * @param {Element} dropdown - Open status dropdown.
       * @returns {void}
       */
      (dropdown) => {
        if (dropdown !== exceptThisOne) {
          dropdown.classList.remove("open");
        }
      },
    );
  };

  statusDropdowns.forEach(
    /**
     * Wires one status dropdown and its menu items.
     *
     * @param {Element} dropdown - Status dropdown root element.
     * @returns {void}
     */
    (dropdown) => {
    const badgeWrapper = dropdown.querySelector(".status-badge-wrapper");
    const dropdownMenu = dropdown.querySelector(".dropdown-menu");

    if (!badgeWrapper || !dropdownMenu) return;

    badgeWrapper.addEventListener(
      "click",
      /**
       * Toggles the status dropdown menu.
       *
       * @param {MouseEvent} event - Badge click event.
       * @returns {void}
       */
      (event) => {
        event.stopPropagation();
        const wasOpen = dropdown.classList.contains("open");
        closeAllDropdowns();
        if (!wasOpen) {
          dropdown.classList.add("open");
        }
      },
    );

    dropdownMenu.querySelectorAll(".dropdown-item").forEach(
      /**
       * Wires a single status menu item.
       *
       * @param {Element} item - Status dropdown item.
       * @returns {void}
       */
      (item) => {
        item.addEventListener(
          "click",
          /**
           * Applies the selected status to the visible badge.
           *
           * @returns {void}
           */
          () => {
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
          },
        );
      },
    );
    },
  );

  window.addEventListener(
    "click",
    /**
     * Closes open status dropdowns when the page is clicked.
     *
     * @returns {void}
     */
    () => {
      closeAllDropdowns();
    },
  );
}

// ===================================================================================
// SISTEMA DE AUTENTICAÇÃO E PROTEÇÃO DE ROTAS MELHORADO
// ===================================================================================

/**
 * Route access configuration by authenticated user role.
 *
 * @type {Object<string, {module: string, defaultPage: string, allowedPaths: string[]}>}
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
 * Checks whether the frontend is running with mocked business data.
 *
 * @returns {boolean} True when mock mode is enabled.
 */
function isMockModeEnabled() {
  return window.__LEGISLA_MOCK_MODE__ === true;
}

/**
 * Safely reads the locally stored authenticated user data.
 *
 * @returns {Object|null} Parsed user data, or null when missing or invalid.
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
 * Decodes a JWT payload without validating the signature.
 *
 * @param {string} token - JWT token to decode.
 * @returns {Object|null} Decoded payload, or null when decoding fails.
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
 * Checks whether a decoded token should be refreshed soon.
 *
 * @param {Object|null} tokenPayload - Decoded JWT payload.
 * @returns {boolean} True when the token is missing, invalid, or near expiration.
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
 * Attempts to validate or refresh the authentication token with the backend.
 *
 * @returns {Promise<boolean>} True when token validation or refresh succeeds.
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
 * Checks whether a role is allowed to access a route path.
 *
 * @param {string} userRole - Authenticated user role.
 * @param {string} currentPath - Current page path.
 * @returns {boolean} True when the role can access the path.
 */
function hasRoutePermission(userRole, currentPath) {
  const roleConfig = ROLE_ROUTES[userRole];
  if (!roleConfig) return false;

  return roleConfig.allowedPaths.some(
    /**
     * Checks one allowed path prefix against the current path.
     *
     * @param {string} allowedPath - Allowed path prefix.
     * @returns {boolean} True when current path starts with the prefix.
     */
    (allowedPath) => currentPath.startsWith(allowedPath),
  );
}

/**
 * Redirects the user to the module that matches their role.
 *
 * @param {string} userRole - Authenticated user role.
 * @param {string} [currentPath=window.location.pathname] - Current page path.
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
 * Clears local authentication data and redirects to the login page.
 *
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
 * Protects the current page with authentication, authorization, and optional redirects.
 *
 * @param {Object} [options={}] - Authentication guard options.
 * @param {string[]|null} [options.allowedRoles=null] - Roles allowed for the page.
 * @param {boolean} [options.requireAuth=true] - Whether authentication is required.
 * @param {boolean} [options.autoRedirect=true] - Whether to redirect users to their module.
 * @returns {Promise<boolean>} True when access is allowed; false when redirected.
 * @throws {Error} When authentication or authorization fails without a handled redirect.
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
 * Starts the periodic token refresh loop for long-running sessions.
 *
 * @returns {void}
 */
function startAutoTokenRefresh() {
  if (_tokenRefreshInterval) return; // Já iniciado

  console.log(
    "[AUTH_GUARD] 🔄 Monitoramento automático de token iniciado (verificação a cada 5min)",
  );

  // Verificar a cada 5 minutos
  _tokenRefreshInterval = setInterval(
    /**
     * Checks the current token and refreshes it when needed.
     *
     * @returns {Promise<void>} Resolves after the refresh check completes.
     */
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
 * Initializes global authentication monitoring and cross-tab session handling.
 *
 * @returns {void}
 */
function initializeAuthGuard() {
  console.log("[AUTH_GUARD] 🚀 Inicializando sistema de autenticação...");

  if (isMockModeEnabled()) {
    window.addEventListener(
      "storage",
      /**
       * Handles token removal across tabs while mock mode is active.
       *
       * @param {StorageEvent} e - localStorage change event.
       * @returns {void}
       */
      (e) => {
        if (e.key === "authToken" && !e.newValue) {
          console.log(
            "[AUTH_GUARD] 🔄 Token removido em outra aba (mock), redirecionando...",
          );
          clearAuthAndRedirectToLogin();
        }
      },
    );

    console.log("[AUTH_GUARD] ✅ Sistema de autenticação mock inicializado");
    return;
  }

  // Verifica token a cada 5 minutos
  const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos

  setInterval(
    /**
     * Periodically refreshes the token when it is near expiration.
     *
     * @returns {Promise<void>} Resolves after the periodic token check completes.
     */
    async () => {
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
    },
    TOKEN_CHECK_INTERVAL,
  );

  // Checagem imediata ao carregar a página (importante para TV após semanas sem sessão)
  (/**
   * Immediately validates or refreshes persisted authentication state on load.
   *
   * @returns {Promise<void>} Resolves after the immediate auth check completes.
   */
  async () => {
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
  window.addEventListener(
    "storage",
    /**
     * Handles token removal across tabs in normal authentication mode.
     *
     * @param {StorageEvent} e - localStorage change event.
     * @returns {void}
     */
    (e) => {
      if (e.key === "authToken" && !e.newValue) {
        console.log(
          "[AUTH_GUARD] 🔄 Token removido em outra aba, redirecionando...",
        );
        clearAuthAndRedirectToLogin();
      }
    },
  );

  console.log("[AUTH_GUARD] ✅ Sistema de autenticação inicializado");
}

/**
 * Protects a page when configured and initializes its layout after authentication.
 *
 * @param {Object} pageConfig - Page layout and authentication configuration.
 * @param {Object} [pageConfig.auth] - Authentication guard options passed to protectPage.
 * @returns {Promise<boolean>} True when authentication and layout initialization succeed.
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
document.addEventListener(
  "DOMContentLoaded",
  /**
   * Initializes the authentication guard when the DOM is ready.
   *
   * @returns {void}
   */
  () => {
    initializeAuthGuard();
  },
);

/**
 * Logs out the current user, invalidates the backend token, and clears local state.
 *
 * @returns {Promise<void>} Resolves after local logout handling completes.
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
 * Wraps known content sections in the standard page layout wrappers when needed.
 *
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
  containerSelectors.forEach(
    /**
     * Collects direct child sections matching a container selector.
     *
     * @param {string} selector - Section selector to search for.
     * @returns {void}
     */
    (selector) => {
      const elements = mainContent.querySelectorAll(`:scope > ${selector}`);
      elements.forEach(
        /**
         * Adds one matching section to the wrapping list.
         *
         * @param {Element} el - Section element to wrap.
         * @returns {void}
         */
        (el) => containersToWrap.push(el),
      );
    },
  );

  if (containersToWrap.length === 0) return;

  console.log(
    "🔧 Auto-corrigindo layout: envolvendo containers com wrappers necessários",
    containersToWrap.map(
      /**
       * Reads the class name for diagnostic logging.
       *
       * @param {Element} el - Wrapped section element.
       * @returns {string} Element class name.
       */
      (el) => el.className,
    ),
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

  containersToWrap.forEach(
    /**
     * Moves a section into the generated content area.
     *
     * @param {Element} container - Section element to move.
     * @returns {void}
     */
    (container) => {
      contentArea.appendChild(container);
    },
  );

  pageContentWrapper.appendChild(contentArea);
}

// ===================================================================================
// FUNÇÕES DE BADGE INTELIGENTE PARA SIDEBAR
// ===================================================================================

/**
 * Updates the control panel sidebar badge with items that need attention.
 *
 * @returns {Promise<void>} Resolves after badge data is fetched and rendered.
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
      }).then(
        /**
         * Parses pending sessions or returns an empty fallback.
         *
         * @param {Response} r - Fetch response.
         * @returns {Promise<Object>|Object} Parsed JSON or fallback data object.
         */
        (r) => (r.ok ? r.json() : { data: [] }),
      ),

      // Pautas pendentes de aprovação
      fetch("/api/app/pautas?status=pendente", {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then(
        /**
         * Parses pending agendas or returns an empty fallback.
         *
         * @param {Response} r - Fetch response.
         * @returns {Promise<Object>|Object} Parsed JSON or fallback data object.
         */
        (r) => (r.ok ? r.json() : { data: [] }),
      ),

      // Vereadores inativos (problema que precisa atenção)
      fetch("/api/app/vereadores", {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then(
        /**
         * Parses councilors or returns an empty fallback list.
         *
         * @param {Response} r - Fetch response.
         * @returns {Promise<Object[]>|Object[]} Parsed JSON or fallback list.
         */
        (r) => (r.ok ? r.json() : []),
      ),
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
    const vereadoresInativos = vereadores.filter(
      /**
       * Checks whether a councilor is inactive.
       *
       * @param {Object} v - Councilor record.
       * @returns {boolean} True when the councilor is inactive.
       */
      (v) => !v.is_active,
    );
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
 * Sets up placeholder sidebar badges for features marked as coming soon.
 *
 * @returns {void}
 */
// Função para configurar badges "Em breve"
function setupComingSoonBadges() {
  console.log('✨ Badges "Em breve" configurados no sidebar');
}

// Chamar a função de atualização do badge quando a página carregar
document.addEventListener(
  "DOMContentLoaded",
  /**
   * Initializes sidebar badges once the page and sidebar have had time to load.
   *
   * @returns {void}
   */
  () => {
  // Aguardar um pouco para garantir que o sidebar foi carregado
    setTimeout(
      /**
       * Performs delayed sidebar badge initialization.
       *
       * @returns {void}
       */
      () => {
        setupComingSoonBadges();
        updatePainelControleBadge();
      },
      1000,
    );

  // Atualizar badge periodicamente (a cada 5 minutos)
    setInterval(updatePainelControleBadge, 5 * 60 * 1000);
  },
);
