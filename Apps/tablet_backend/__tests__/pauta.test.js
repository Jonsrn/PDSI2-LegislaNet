const request = require('supertest');
const app = require('../server');
const { getAuthToken, TEST_PAUTA_ID } = require('./helpers/authHelper');

describe('Pautas Routes (Integração - RBAC)', () => {
    
    // Todas as rotas de pautas são restritas ao tablet autenticado
    describe('Segurança: Proteção de Rotas (Sem Token)', () => {
        it('GET /api/pautas deve retornar 401 Unauthorized', async () => {
            const response = await request(app).get('/api/pautas');
            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error');
        });

        it('GET /api/pautas/:id deve retornar 401 Unauthorized', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174000';
            const response = await request(app).get(`/api/pautas/${fakeId}`);
            expect(response.status).toBe(401);
        });

        it('GET /api/pautas/:id/estatisticas deve retornar 401 Unauthorized', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174000';
            const response = await request(app).get(`/api/pautas/${fakeId}/estatisticas`);
            expect(response.status).toBe(401);
        });
    });

    describe('Segurança: Proteção de Rotas (Token Inválido)', () => {
        it('GET /api/pautas deve retornar 401 ao enviar JWT falso', async () => {
            const response = await request(app)
                .get('/api/pautas')
                .set('Authorization', 'Bearer token_malicioso_jwt');
            
            expect(response.status).toBe(401);
        });
    });

    describe('Caminho Feliz (Acessos Autorizados)', () => {
        let token;

        beforeAll(async () => {
            token = await getAuthToken();
        });

        it('GET /api/pautas deve retornar a lista de pautas agrupadas por status (Status 200)', async () => {
            const response = await request(app)
                .get('/api/pautas')
                .set('Authorization', `Bearer ${token}`);
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('emVotacao');
            expect(response.body.data).toHaveProperty('finalizadas');
            expect(response.body.data).toHaveProperty('pendentes');
        });

        it('GET /api/pautas/:id deve retornar os detalhes exatos da Pauta de Testes (Status 200)', async () => {
            const response = await request(app)
                .get(`/api/pautas/${TEST_PAUTA_ID}`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', TEST_PAUTA_ID);
            expect(response.body).toHaveProperty('nome');
        });

        it('GET /api/pautas/:id/estatisticas deve retornar os contadores de voto da Pauta de Testes (Status 200)', async () => {
            const response = await request(app)
                .get(`/api/pautas/${TEST_PAUTA_ID}/estatisticas`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('estatisticas');
            expect(response.body.estatisticas).toHaveProperty('sim');
            expect(response.body.estatisticas).toHaveProperty('nao');
            expect(response.body.estatisticas).toHaveProperty('abstencao');
        });
    });
});
