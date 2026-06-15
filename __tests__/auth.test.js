const request = require('supertest');
const app = require('../server');
const { CREDS, getSuperAdminToken, getAppAuth, getTvAuth } = require('./helpers/authHelper');

describe('API Web Backend - Auth Routes', () => {

    describe('POST /api/auth/login', () => {
        it('Deve retornar 400 se o email não for enviado', async () => {
            const res = await request(app).post('/api/auth/login').send({
                password: 'senha_incorreta'
            });
            expect(res.status).toBe(400);
            expect(res.body.errors[0].msg).toMatch(/O email é inválido/i);
        });

        it('Deve retornar 400 se o email for inválido', async () => {
            const res = await request(app).post('/api/auth/login').send({
                email: 'nao-e-email',
                password: 'senha_incorreta'
            });
            expect(res.status).toBe(400);
            expect(res.body.errors[0].msg).toMatch(/O email é inválido/i);
        });

        it('Deve retornar 400 se a senha estiver em branco', async () => {
            const res = await request(app).post('/api/auth/login').send({
                email: 'fake@hacker.com',
                password: ''
            });
            expect(res.status).toBe(400);
            expect(res.body.errors[0].msg).toMatch(/A senha não pode estar em branco/i);
        });

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

    describe('POST /api/auth/refresh', () => {
        it('Deve retornar 401 se refresh_token não for enviado', async () => {
            const res = await request(app).post('/api/auth/refresh').send({});
            expect(res.status).toBe(401);
        });

        it('Deve retornar 401 se refresh_token for inválido', async () => {
            const res = await request(app).post('/api/auth/refresh').send({ refresh_token: 'fake-token-jwt' });
            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/auth/logout', () => {
        let appToken;
        let tvToken;

        beforeAll(async () => {
            const auth = await getAppAuth();
            appToken = auth.token;
            const tvAuth = await getTvAuth();
            tvToken = tvAuth.token;
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

    describe('GET /api/auth/profile', () => {
        let appToken;

        beforeAll(async () => {
            // Faremos um login real em vez de usar o getAppAuth do helper 
            // para evitar pegar o token do cache que foi invalidado pelo teste de logout
            const loginRes = await request(app).post('/api/auth/login').send(CREDS.app);
            appToken = loginRes.body.token;
        });

        it('Deve retornar 401 se não houver token', async () => {
            const res = await request(app).get('/api/auth/profile');
            expect(res.status).toBe(401);
        });

        it('Deve retornar 403 se o token não for de vereador', async () => {
            const res = await request(app)
                .get('/api/auth/profile')
                .set('Authorization', `Bearer ${appToken}`);
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/permissão/i);
        });
    });
});
