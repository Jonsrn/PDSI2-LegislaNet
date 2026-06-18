const request = require('supertest');
const app = require('../server');
const { getAuthToken } = require('./helpers/authHelper');

describe('Vereador Routes (Integração - RBAC)', () => {
    
    // Todas as rotas de vereador são protegidas pelo authenticateVereador
    // O objetivo deste suite é garantir que endpoints sigilosos nunca vazem sem token

    describe('Segurança: Proteção de Rotas (Sem Token)', () => {
        it('GET /api/vereador/profile deve retornar 401 Unauthorized', async () => {
            const response = await request(app).get('/api/vereador/profile');
            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error');
        });

        it('GET /api/vereador/camara deve retornar 401 Unauthorized', async () => {
            const response = await request(app).get('/api/vereador/camara');
            expect(response.status).toBe(401);
        });

        it('PUT /api/vereador/foto deve retornar 401 Unauthorized', async () => {
            const response = await request(app)
                .put('/api/vereador/foto')
                .send({ fotoUrl: "http://hacker.com/foto.jpg" });
            
            expect(response.status).toBe(401);
        });
    });

    describe('Segurança: Proteção de Rotas (Token Mal Formatado)', () => {
        it('GET /api/vereador/profile deve retornar 401 com token fake', async () => {
            const response = await request(app)
                .get('/api/vereador/profile')
                .set('Authorization', 'Bearer fake_token_jwt_123');
            
            expect(response.status).toBe(401);
        });
    });

    describe('Caminho Feliz (Acessos Autorizados)', () => {
        let token;
        let fotoOriginal;

        beforeAll(async () => {
            token = await getAuthToken();
            
            // Setup: Guarda a foto atual para o Teardown no final
            const res = await request(app)
                .get('/api/vereador/profile')
                .set('Authorization', `Bearer ${token}`);
            fotoOriginal = res.body.foto_url || '';
        });

        afterAll(async () => {
            // Teardown: Restabelece a foto que estava antes do teste
            if (token && fotoOriginal !== undefined) {
                await request(app)
                    .put('/api/vereador/foto')
                    .set('Authorization', `Bearer ${token}`)
                    .send({ foto_url: fotoOriginal });
            }
        });

        it('GET /api/vereador/profile deve retornar os dados do vereador (Status 200)', async () => {
            const response = await request(app)
                .get('/api/vereador/profile')
                .set('Authorization', `Bearer ${token}`);
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id');
            expect(response.body).toHaveProperty('nome_parlamentar');
        });

        it('GET /api/vereador/camara deve retornar a lista de vereadores aliados (Status 200)', async () => {
            const response = await request(app)
                .get('/api/vereador/camara')
                .set('Authorization', `Bearer ${token}`);
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);
        });

        it('PUT /api/vereador/foto deve atualizar a foto com sucesso (Status 200)', async () => {
            const novaFoto = 'https://www.camara.leg.br/tema/assets/images/foto-teste.jpg';
            
            const response = await request(app)
                .put('/api/vereador/foto')
                .set('Authorization', `Bearer ${token}`)
                .send({ foto_url: novaFoto });
            
            expect(response.status).toBe(200);
            expect(response.body.message).toMatch(/sucesso/i);
        });
    });
});
