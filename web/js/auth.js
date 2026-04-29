/**
 * @file Frontend authentication manager for storing JWT credentials, validating
 * sessions, protecting authenticated requests, and coordinating logout behavior.
 */

/**
 * Manages authentication state, token validation, session warnings, and
 * authenticated API requests for the frontend.
 */
class AuthManager {
    /**
     * Creates an authentication manager with localStorage keys and session limits.
     */
    constructor() {
        this.tokenKey = 'authToken';
        this.userKey = 'userData';
        this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 horas
        this.refreshThreshold = 15 * 60 * 1000; // 15 minutos
        this.initialized = false;
        
        // Bind methods
        this.init = this.init.bind(this);
        this.checkAuth = this.checkAuth.bind(this);
        this.logout = this.logout.bind(this);
    }

    /**
     * Initializes authentication checks, cross-tab logout handling, and token polling.
     *
     * @returns {void}
     */
    init() {
        if (this.initialized) return;
        
        // Verifica autenticação na inicialização
        this.checkAuth();
        
        // Monitora mudanças no localStorage (múltiplas abas)
        window.addEventListener('storage',
            /**
             * Logs out this tab when the authentication token is removed elsewhere.
             *
             * @param {StorageEvent} e - localStorage change event.
             * @returns {void}
             */
            (e) => {
                if (e.key === this.tokenKey && !e.newValue) {
                    this.logout();
                }
            }
        );
        
        // Verifica token periodicamente
        setInterval(
            /**
             * Periodically validates the current authentication token.
             *
             * @returns {void}
             */
            () => {
                this.checkTokenValidity();
            },
            5 * 60 * 1000
        ); // A cada 5 minutos
        
        this.initialized = true;
    }

    /**
     * Checks whether the current browser session has valid authentication data.
     *
     * @returns {boolean} True when a token and user record are available.
     */
    checkAuth() {
        const token = this.getToken();
        const user = this.getUser();
        
        if (!token || !user) {
            this.redirectToLogin();
            return false;
        }
        
        // Verifica se o token está próximo do vencimento
        if (this.isTokenNearExpiration(token)) {
            this.showTokenWarning();
        }
        
        return true;
    }

    /**
     * Reads and validates the stored JWT token.
     *
     * @returns {string|null} The stored token, or null when missing or invalid.
     */
    getToken() {
        try {
            const token = localStorage.getItem(this.tokenKey);
            
            if (!token) return null;
            
            // Verifica formato básico
            if (!this.isValidTokenFormat(token)) {
                this.clearAuth();
                return null;
            }
            
            return token;
        } catch (error) {
            console.error('Error getting token:', error);
            this.clearAuth();
            return null;
        }
    }

    /**
     * Reads the stored authenticated user data.
     *
     * @returns {Object|null} Parsed user data, or null when unavailable.
     */
    getUser() {
        try {
            const userData = localStorage.getItem(this.userKey);
            return userData ? JSON.parse(userData) : null;
        } catch (error) {
            console.error('Error getting user data:', error);
            return null;
        }
    }

    /**
     * Stores authentication token and user data in localStorage.
     *
     * @param {string} token - JWT token returned by the backend.
     * @param {Object} userData - Authenticated user profile data.
     * @returns {void}
     * @throws {Error} When authentication data cannot be persisted.
     */
    setAuthData(token, userData) {
        try {
            localStorage.setItem(this.tokenKey, token);
            localStorage.setItem(this.userKey, JSON.stringify({
                ...userData,
                loginTime: Date.now()
            }));
        } catch (error) {
            console.error('Error saving auth data:', error);
            throw new Error('Não foi possível salvar dados de autenticação');
        }
    }

    /**
     * Removes authentication token and user data from localStorage.
     *
     * @returns {void}
     */
    clearAuth() {
        try {
            localStorage.removeItem(this.tokenKey);
            localStorage.removeItem(this.userKey);
        } catch (error) {
            console.error('Error clearing auth data:', error);
        }
    }

    /**
     * Logs out the current user, optionally showing a confirmation message.
     *
     * @param {boolean} [showMessage=true] - Whether to display a logout message.
     * @returns {void}
     */
    logout(showMessage = true) {
        this.clearAuth();
        
        if (showMessage) {
            this.showMessage('Sessão encerrada com sucesso', 'info');
        }
        
        this.redirectToLogin();
    }

    /**
     * Redirects the browser to the login page when not already there.
     *
     * @returns {void}
     */
    redirectToLogin() {
        const currentPath = window.location.pathname;
        const loginPath = '/app/login.html';
        
        if (currentPath !== loginPath) {
            window.location.href = loginPath;
        }
    }

    /**
     * Validates the basic structure and payload of a JWT token.
     *
     * @param {string} token - JWT token to validate.
     * @returns {boolean} True when the token has a decodable three-part JWT format.
     */
    isValidTokenFormat(token) {
        if (!token || typeof token !== 'string') return false;
        
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        
        try {
            // Tenta decodificar o payload
            const payload = JSON.parse(atob(parts[1]));
            return payload && typeof payload === 'object';
        } catch {
            return false;
        }
    }

    /**
     * Decodes selected metadata from a JWT token payload.
     *
     * @param {string} token - JWT token to inspect.
     * @returns {{exp: number, iat: number, sub: string, email: string, role: string}|null} Token metadata, or null when decoding fails.
     */
    getTokenInfo(token) {
        try {
            const parts = token.split('.');
            const payload = JSON.parse(atob(parts[1]));
            
            return {
                exp: payload.exp,
                iat: payload.iat,
                sub: payload.sub,
                email: payload.email,
                role: payload.role
            };
        } catch {
            return null;
        }
    }

    /**
     * Checks whether a token is within the configured expiration warning window.
     *
     * @param {string} token - JWT token to inspect.
     * @returns {boolean} True when the token expires within the warning threshold.
     */
    isTokenNearExpiration(token) {
        const tokenInfo = this.getTokenInfo(token);
        if (!tokenInfo || !tokenInfo.exp) return false;
        
        const now = Math.floor(Date.now() / 1000);
        const threshold = 15 * 60; // 15 minutos
        
        return (tokenInfo.exp - now) <= threshold;
    }

    /**
     * Checks token expiration and handles expired or nearly expired sessions.
     *
     * @returns {void}
     */
    checkTokenValidity() {
        const token = this.getToken();
        if (!token) return;
        
        const tokenInfo = this.getTokenInfo(token);
        if (!tokenInfo || !tokenInfo.exp) {
            this.logout();
            return;
        }
        
        const now = Math.floor(Date.now() / 1000);
        
        // Token expirado
        if (now >= tokenInfo.exp) {
            this.showMessage('Sessão expirada. Faça login novamente.', 'warning');
            this.logout(false);
            return;
        }
        
        // Token próximo do vencimento
        if (this.isTokenNearExpiration(token)) {
            this.showTokenWarning();
        }
    }

    /**
     * Displays a warning that the current session will expire soon.
     *
     * @returns {void}
     */
    showTokenWarning() {
        if (document.querySelector('.token-warning')) return;
        
        this.showMessage(
            'Sua sessão expirará em breve. Salve seu trabalho.',
            'warning',
            10000
        );
    }

    /**
     * Performs a fetch request with the current bearer token attached.
     *
     * @param {string} url - URL to request.
     * @param {RequestInit} [options={}] - Fetch options to merge with auth headers.
     * @returns {Promise<Response>} The fetch response when authentication succeeds.
     * @throws {Error} When no token is available, the session expires, or the request fails.
     */
    async authenticatedFetch(url, options = {}) {
        const token = this.getToken();
        
        if (!token) {
            this.redirectToLogin();
            throw new Error('Token não disponível');
        }

        const authHeaders = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers: authHeaders
            });

            // Token inválido ou expirado
            if (response.status === 401) {
                const errorData = await response.json().catch(
                    /**
                     * Provides an empty error payload when the response body is not JSON.
                     *
                     * @returns {Object} Empty fallback error payload.
                     */
                    () => ({})
                );
                
                if (errorData.code === 'BLACKLISTED_TOKEN' || 
                    errorData.code === 'MALFORMED_TOKEN') {
                    this.showMessage('Token inválido. Faça login novamente.', 'error');
                    this.logout(false);
                    throw new Error('Token inválido');
                }
                
                this.logout();
                throw new Error('Sessão expirada');
            }

            // Verifica aviso de token próximo ao vencimento
            const tokenWarning = response.headers.get('X-Token-Warning');
            if (tokenWarning) {
                this.showTokenWarning();
            }

            return response;
            
        } catch (error) {
            if (error.message.includes('Failed to fetch')) {
                this.showMessage('Erro de conexão. Verifique sua internet.', 'error');
            }
            throw error;
        }
    }

    /**
     * Checks whether the current user has the super administrator role.
     *
     * @returns {boolean|null} True when the current user is a super administrator; otherwise false or null.
     */
    isSuperAdmin() {
        const user = this.getUser();
        return user && user.role === 'super_admin';
    }

    /**
     * Checks whether the current user has the chamber administrator role.
     *
     * @returns {boolean|null} True when the current user is a chamber administrator; otherwise false or null.
     */
    isAdminCamara() {
        const user = this.getUser();
        return user && user.role === 'admin_camara';
    }

    /**
     * Displays a temporary authentication message on the page.
     *
     * @param {string} message - Message text to display.
     * @param {'info'|'success'|'warning'|'error'} [type='info'] - Visual message type.
     * @param {number} [duration=5000] - Duration in milliseconds before removal.
     * @returns {void}
     */
    showMessage(message, type = 'info', duration = 5000) {
        // Remove mensagem existente
        const existing = document.querySelector('.auth-message');
        if (existing) existing.remove();

        const messageEl = document.createElement('div');
        messageEl.className = `auth-message auth-message-${type}`;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            ${type === 'error' ? 'background-color: #da3633;' : ''}
            ${type === 'warning' ? 'background-color: #f08833;' : ''}
            ${type === 'info' ? 'background-color: #58a6ff;' : ''}
            ${type === 'success' ? 'background-color: #2ea043;' : ''}
        `;
        messageEl.textContent = message;

        document.body.appendChild(messageEl);

        // Remove após duração especificada
        setTimeout(
            /**
             * Removes the message element after the configured display duration.
             *
             * @returns {void}
             */
            () => {
                if (messageEl.parentNode) {
                    messageEl.remove();
                }
            },
            duration
        );
    }
}

// Instância global
const authManager = new AuthManager();

// Auto-inicializar quando DOM carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', authManager.init);
} else {
    authManager.init();
}

// Expor globalmente
window.authManager = authManager;
