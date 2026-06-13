const request = require('supertest');
const app = require('../../server');

// Configurações Globais das Credenciais Reais da Plataforma
// AVISO: CUIDADO EXTREMO COM superAdmin (Possui a Câmara 'Del')
const CREDS = {
    superAdmin: { email: 'jffilho618@gmail.com', password: '2512' },
    app: { email: 'srn@exemplo.com', password: '123456' },
    tv: { email: 'tv@srn.com', password: 'Tvsrn123@' }
};

let tokensCache = { superAdmin: null, app: null, tv: null };
let profilesCache = { app: null, superAdmin: null };

async function login(credentials) {
    const res = await request(app).post('/api/auth/login').send(credentials);
    if (res.status !== 200) {
        throw new Error(`Falha no login com ${credentials.email}: Status ${res.status}`);
    }
    return res.body;
}

async function getSuperAdminToken() {
    if (!tokensCache.superAdmin) {
        const body = await login(CREDS.superAdmin);
        tokensCache.superAdmin = body.token;
        profilesCache.superAdmin = body.user;
    }
    return tokensCache.superAdmin;
}

async function getAppAuth() {
    if (!tokensCache.app) {
        const body = await login(CREDS.app);
        tokensCache.app = body.token;
        profilesCache.app = body.user; // Contém o camara_id
    }
    return { token: tokensCache.app, profile: profilesCache.app };
}

async function getTvToken() {
    if (!tokensCache.tv) {
        const body = await login(CREDS.tv);
        tokensCache.tv = body.token;
    }
    return tokensCache.tv;
}

module.exports = {
    getSuperAdminToken,
    getAppAuth,
    getTvToken,
    CREDS
};
