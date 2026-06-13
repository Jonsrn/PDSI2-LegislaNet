const request = require('supertest');
const app = require('../server');
const { getAppAuth } = require('./helpers/authHelper');

describe('API Web Backend - Public Routes', () => {
    let camaraId;
    let appToken;

    beforeAll(async () => {
        // Aproveitamos a sessão App para descobrir dinamicamente o camara_id da base de testes
        const authData = await getAppAuth();
        appToken = authData.token;
        camaraId = authData.profile.camara_id;
    });

    describe('Rotas sem Parametros (Portal Inicial)', () => {
        it('GET /api/camaras/publicas deve listar todas as câmaras (Status 200)', async () => {
            const res = await request(app).get('/api/camaras/publicas');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('camaras');
            expect(Array.isArray(res.body.camaras)).toBe(true);
        });
    });

    describe('Rotas com Parametro :id da Camara', () => {
        it('GET /api/camaras/:id/info deve retornar os detalhes públicos da câmara (Status 200)', async () => {
            const res = await request(app).get(`/api/camaras/${camaraId}/info`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('info');
            expect(res.body.info).toHaveProperty('id', camaraId);
            expect(res.body.info).toHaveProperty('nome_camara');
        });

        it('GET /api/camaras/:id/sessoes-futuras deve listar a agenda da câmara (Status 200)', async () => {
            const res = await request(app).get(`/api/camaras/${camaraId}/sessoes-futuras`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('sessoes');
            expect(Array.isArray(res.body.sessoes)).toBe(true);
        });

        it('GET /api/camaras/:id/vereadores deve listar os parlamentares (Status 200)', async () => {
            const res = await request(app).get(`/api/camaras/${camaraId}/vereadores`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('vereadores');
            expect(Array.isArray(res.body.vereadores)).toBe(true);
        });

        it('GET /api/camaras/:id/votacoes-recentes deve retornar o placar público (Status 200)', async () => {
            const res = await request(app).get(`/api/camaras/${camaraId}/votacoes-recentes`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('pautas');
            expect(Array.isArray(res.body.pautas)).toBe(true);
        });

        it('GET /api/camaras/:id/todas-pautas deve listar o histórico paginado de pautas (Status 200)', async () => {
            const res = await request(app).get(`/api/camaras/${camaraId}/todas-pautas?page=1&limit=10`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('pautas');
            expect(res.body).toHaveProperty('paginacao');
            expect(Array.isArray(res.body.pautas)).toBe(true);
        });
    });

    describe('GET /api/me (Perfil e Token Context)', () => {
        it('Deve bloquear acesso deslogado ao /me (401)', async () => {
            const res = await request(app).get('/api/me');
            expect(res.status).toBe(401);
        });

        it('Deve retornar dados agregados ao enviar um token válido (Status 200)', async () => {
            const res = await request(app)
                .get('/api/me')
                .set('Authorization', `Bearer ${appToken}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('profile');
            expect(res.body.profile).toHaveProperty('role', 'admin_camara');
            expect(res.body.profile).toHaveProperty('camara_id', camaraId);
        });
    });
});
