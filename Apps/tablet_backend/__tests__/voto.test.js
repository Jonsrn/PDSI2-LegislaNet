const request = require('supertest');
const app = require('../server');
const { getAuthToken, TEST_PAUTA_ID } = require('./helpers/authHelper');
const { supabaseAdmin } = require('../src/config/supabase');

describe('Voto Routes (Integração - RBAC)', () => {
    
    // As rotas de voto são o núcleo da aplicação.
    // Nenhuma operação de leitura ou escrita deve passar sem Token JWT válido.
    
    describe('Segurança: Proteção de Rota (Sem Token)', () => {
        it('POST /api/votos deve retornar 401 Unauthorized', async () => {
            const response = await request(app)
                .post('/api/votos')
                .send({
                    pautaId: 'fake-pauta-uuid',
                    voto: 'favoravel'
                });
            expect(response.status).toBe(401);
        });

        it('GET /api/votos/meus-votos deve retornar 401 Unauthorized', async () => {
            const response = await request(app).get('/api/votos/meus-votos');
            expect(response.status).toBe(401);
        });

        it('GET /api/votos/pauta/:pauta_id deve retornar 401 Unauthorized', async () => {
            const fakeId = 'fake-pauta-uuid';
            const response = await request(app).get(`/api/votos/pauta/${fakeId}`);
            expect(response.status).toBe(401);
        });

        it('GET /api/votos/pauta/:pauta_id/estatisticas deve retornar 401 Unauthorized', async () => {
            const fakeId = 'fake-pauta-uuid';
            const response = await request(app).get(`/api/votos/pauta/${fakeId}/estatisticas`);
            expect(response.status).toBe(401);
        });
    });

    describe('Segurança: Payload Mal Formatado com Token Faker', () => {
        it('POST /api/votos deve rechaçar acessos mascarados com 401 antes de validar payload', async () => {
            const response = await request(app)
                .post('/api/votos')
                .set('Authorization', 'Bearer fake_jwt_tentando_hack')
                .send({
                    // Faltando pauta_id
                    voto: 'inválido'
                });
            
            expect(response.status).toBe(401);
        });
    });

    describe('Caminho Feliz (Acessos Autorizados e Teardown Seguros)', () => {
        let token;
        let votoOriginalValor = null;
        let novoVotoId = null;
        let statusOriginalPauta = null;

        beforeAll(async () => {
            token = await getAuthToken();
            
            // Setup 1: Força a pauta de testes a estar "Em Votação" para aceitar votos
            const pautaRes = await supabaseAdmin.from('pautas').select('status').eq('id', TEST_PAUTA_ID).single();
            if(pautaRes.data) {
                statusOriginalPauta = pautaRes.data.status;
                await supabaseAdmin.from('pautas').update({ status: 'Em Votação' }).eq('id', TEST_PAUTA_ID);
            }

            // Setup 2: Guarda o voto atual na pauta para restaurá-lo no final
            const res = await request(app)
                .get(`/api/votos/pauta/${TEST_PAUTA_ID}`)
                .set('Authorization', `Bearer ${token}`);
            
            if (res.status === 200 && res.body.voto) {
                votoOriginalValor = res.body.voto.voto;
            }
        });

        afterAll(async () => {
            // Teardown: Limpeza cirúrgica da sujeira do teste
            if (token) {
                if (votoOriginalValor) {
                    // Se o vereador já tinha votado, o teste fez um UPDATE. Nós damos UPDATE de volta.
                    await request(app)
                        .post('/api/votos')
                        .set('Authorization', `Bearer ${token}`)
                        .send({ pauta_id: TEST_PAUTA_ID, voto: votoOriginalValor });
                } else if (novoVotoId) {
                    // Se o vereador não tinha votado, o teste fez um INSERT. Nós damos um DELETE seguro via Supabase RPC admin.
                    await supabaseAdmin.from('votos').delete().eq('id', novoVotoId);
                }
            }

            // Teardown: Restaura o status da Pauta de Testes
            if (statusOriginalPauta) {
                await supabaseAdmin.from('pautas').update({ status: statusOriginalPauta }).eq('id', TEST_PAUTA_ID);
            }
        });

        it('GET /api/votos/meus-votos deve retornar o histórico de votos formatado (Status 200)', async () => {
            const response = await request(app)
                .get('/api/votos/meus-votos')
                .set('Authorization', `Bearer ${token}`);
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('votos');
            expect(Array.isArray(response.body.votos)).toBe(true);
        });

        it('POST /api/votos deve processar o voto "Sim" com sucesso e retornar 201/200 OK', async () => {
            const response = await request(app)
                .post('/api/votos')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    pauta_id: TEST_PAUTA_ID,
                    voto: 'Sim'
                });
            
            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
            expect(response.body).toHaveProperty('voto');
            expect(response.body.voto).toHaveProperty('id');
            
            novoVotoId = response.body.voto.id; // Salva o ID para o Teardown deletar o lixo depois
        });

        it('GET /api/votos/pauta/:id deve retornar o novo voto registrado (Status 200)', async () => {
            const response = await request(app)
                .get(`/api/votos/pauta/${TEST_PAUTA_ID}`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('voto');
            expect(response.body.voto).toHaveProperty('voto', 'SIM'); // O enum do banco é maiúsculo
        });
    });
});
