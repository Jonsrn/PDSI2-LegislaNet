/**
 * Frontend authentication manager for token storage, session checks, and
 * authenticated requests.
 *
 * @module web/js/auth
 */

/**
 * Manages browser-side authentication state and session expiry handling.
 */
class AuthManager {
    constructor() {
        this.tokenKey = 'authToken';
        this.userKey = 'userData';
        this.sessionTimeout = 24 * 60 * 60 * 1000;
        this.refreshThreshold = 15 * 60 * 1000;
        this.initialized = false;
        
        this.init = this.init.bind(this);
        this.checkAuth = this.checkAuth.bind(this);
        this.logout = this.logout.bind(this);
    }

    /**
     * Initializes authentication checks and cross-tab logout handling.
     *
     * @returns {void}
     */
    init() {
        if (this.initialized) return;
        
        this.checkAuth();
        
        window.addEventListener('storage', (e) => {
            if (e.key === this.tokenKey && !e.newValue) {
                this.logout();
            }
        });
        
        setInterval(() => {
            this.checkTokenValidity();
        }, 5 * 60 * 1000);
        
        this.initialized = true;
    }

    /**
     * Checks whether the current browser session has valid authentication data.
     *
     * @returns {boolean} True when token and user data are available.
     */
    checkAuth() {
        const token = this.getToken();
        const user = this.getUser();
        
        if (!token || !user) {
            this.redirectToLogin();
            return false;
        }
        
        if (this.isTokenNearExpiration(token)) {
            this.showTokenWarning();
        }
        
        return true;
    }

    /**
     * Reads and validates the stored access token.
     *
     * @returns {string|null} Stored JWT, or null when missing or invalid.
     */
    getToken() {
        try {
            const token = localStorage.getItem(this.tokenKey);
            
            if (!token) return null;
            
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
     * Reads the stored user data.
     *
     * @returns {object|null} Parsed user data, or null when unavailable.
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
     * @param {string} token - JWT access token.
     * @param {object} userData - Authenticated user data.
     * @returns {void}
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
     * Clears stored authentication data.
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
     * Logs out the current user and redirects to the login page.
     *
     * @param {boolean} [showMessage=true] - Whether to show a logout message.
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
     * Redirects the browser to the login page when needed.
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
     * Checks whether a JWT has a decodable payload.
     *
     * @param {string} token - JWT access token.
     * @returns {boolean} True when the token has a valid JWT-like structure.
     */
    isValidTokenFormat(token) {
        if (!token || typeof token !== 'string') return false;
        
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        
        try {
            const payload = JSON.parse(atob(parts[1]));
            return payload && typeof payload === 'object';
        } catch {
            return false;
        }
    }

    /**
     * Extracts basic claims from a JWT payload.
     *
     * @param {string} token - JWT access token.
     * @returns {object|null} Token claims, or null when parsing fails.
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
     * Checks whether a token is near expiration.
     *
     * @param {string} token - JWT access token.
     * @returns {boolean} True when the token expires within the warning threshold.
     */
    isTokenNearExpiration(token) {
        const tokenInfo = this.getTokenInfo(token);
        if (!tokenInfo || !tokenInfo.exp) return false;
        
        const now = Math.floor(Date.now() / 1000);
        const threshold = 15 * 60;
        
        return (tokenInfo.exp - now) <= threshold;
    }

    /**
     * Checks token expiry and logs out expired sessions.
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
        
        if (now >= tokenInfo.exp) {
            this.showMessage('Sessão expirada. Faça login novamente.', 'warning');
            this.logout(false);
            return;
        }
        
        if (this.isTokenNearExpiration(token)) {
            this.showTokenWarning();
        }
    }

    /**
     * Shows a warning when the current token is near expiration.
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
     * Performs a fetch request with the stored bearer token.
     *
     * @param {string} url - Request URL.
     * @param {object} [options={}] - Fetch options.
     * @returns {Promise<Response>} Fetch response.
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

            if (response.status === 401) {
                const errorData = await response.json().catch(() => ({}));
                
                if (errorData.code === 'BLACKLISTED_TOKEN' || 
                    errorData.code === 'MALFORMED_TOKEN') {
                    this.showMessage('Token inválido. Faça login novamente.', 'error');
                    this.logout(false);
                    throw new Error('Token inválido');
                }
                
                this.logout();
                throw new Error('Sessão expirada');
            }

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
     * Checks whether the stored user is a super admin.
     *
     * @returns {boolean} True when the stored user has the super_admin role.
     */
    isSuperAdmin() {
        const user = this.getUser();
        return user && user.role === 'super_admin';
    }

    /**
     * Checks whether the stored user is a camara admin.
     *
     * @returns {boolean} True when the stored user has the admin_camara role.
     */
    isAdminCamara() {
        const user = this.getUser();
        return user && user.role === 'admin_camara';
    }

    /**
     * Shows a temporary authentication message.
     *
     * @param {string} message - Message text.
     * @param {string} [type='info'] - Message style type.
     * @param {number} [duration=5000] - Display duration in milliseconds.
     * @returns {void}
     */
    showMessage(message, type = 'info', duration = 5000) {
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

        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.remove();
            }
        }, duration);
    }
}

const authManager = new AuthManager();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', authManager.init);
} else {
    authManager.init();
}

window.authManager = authManager;
