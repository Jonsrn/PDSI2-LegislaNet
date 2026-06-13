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
            expect(res.body).toHaveProperty('data');
            expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    describe('Rotas com Parametro :id da Camara', () => {
        it('GET /api/camaras/:id/info deve retornar os detalhes públicos da câmara (Status 200)', async () => {
            const res = await request(app).get(`/api/camaras/${camaraId}/info`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id', camaraId);
            expect(res.body).toHaveProperty('nome');
        });

        it('GET /api/camaras/:id/sessoes-futuras deve listar a agenda da câmara (Status 200)', async () => {
            const res = await request(app).get(`/api/camaras/${camaraId}/sessoes-futuras`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('GET /api/camaras/:id/vereadores deve listar os parlamentares (Status 200)', async () => {
            const res = await request(app).get(`/api/camaras/${camaraId}/vereadores`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('GET /api/camaras/:id/votacoes-recentes deve retornar o placar público (Status 200)', async () => {
            const res = await request(app).get(`/api/camaras/${camaraId}/votacoes-recentes`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('GET /api/camaras/:id/todas-pautas deve listar o histórico paginado de pautas (Status 200)', async () => {
            const res = await request(app).get(`/api/camaras/${camaraId}/todas-pautas?page=1&limit=10`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(res.body).toHaveProperty('pagination');
            expect(Array.isArray(res.body.data)).toBe(true);
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
