const request = require('supertest');
const app = require('../server');
const { CREDS, getSuperAdminToken, getAppAuth, getTvToken } = require('./helpers/authHelper');

describe('API Web Backend - Auth Routes', () => {

    describe('POST /api/auth/login', () => {
        it('Deve retornar 401 para credenciais inválidas', async () => {
            const res = await request(app).post('/api/auth/login').send({
                email: 'fake@hacker.com',
                password: 'senha_incorreta'
            });
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        it('Deve realizar login com sucesso na conta Super Admin e retornar Token', async () => {
            const res = await request(app).post('/api/auth/login').send(CREDS.superAdmin);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user).toHaveProperty('role', 'super_admin');
        });

        it('Deve realizar login com sucesso na conta App (Admin Câmara) e retornar Token', async () => {
            const res = await request(app).post('/api/auth/login').send(CREDS.app);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user).toHaveProperty('role', 'admin_camara');
            expect(res.body.user).toHaveProperty('camara_id');
        });

        it('Deve realizar login com sucesso na conta TV e retornar Token', async () => {
            const res = await request(app).post('/api/auth/login').send(CREDS.tv);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user).toHaveProperty('role', 'tv');
        });
    });

    describe('POST /api/auth/logout', () => {
        let appToken;
        let tvToken;

        beforeAll(async () => {
            const auth = await getAppAuth();
            appToken = auth.token;
            tvToken = await getTvToken();
        });

        it('Deve bloquear logout sem token (401)', async () => {
            const res = await request(app).post('/api/auth/logout');
            expect(res.status).toBe(401);
        });

        it('Deve recusar logout para a conta TV por falta de permissão (403)', async () => {
            const res = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${tvToken}`);
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/permissão/i);
        });

        it('Deve realizar logout para o Admin da Câmara (200)', async () => {
            // Faremos login de novo só para ter um token descartável pra deslogar
            const loginRes = await request(app).post('/api/auth/login').send(CREDS.app);
            const tokenDescartavel = loginRes.body.token;

            const res = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${tokenDescartavel}`);
            
            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/sucesso/i);
        });
    });
});
