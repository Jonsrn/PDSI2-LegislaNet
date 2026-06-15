const request = require('supertest');
const app = require('../server');
const { getAppAuth } = require('./helpers/authHelper');

describe('API Web Backend - Core: Painel de Controle e Votos E2E', () => {
    let appToken;
    let camaraId;
    
    // Entidades Temporárias
    let sessaoId = null;
    let pautaId = null;
    let vereadorId = null;
    let partidoId = null;

    beforeAll(async () => {
        const authData = await getAppAuth();
        appToken = authData.token;
        camaraId = authData.profile.camara_id;

        // 1. Obter um Vereador Existente na Câmara para representar o Voto
        const resVereadores = await request(app)
            .get('/api/app/vereadores')
            .set('Authorization', `Bearer ${appToken}`);
            
        const listaVereadores = resVereadores.body.data ? resVereadores.body.data : resVereadores.body;
        if (resVereadores.status === 200 && Array.isArray(listaVereadores) && listaVereadores.length > 0) {
            vereadorId = listaVereadores[0].id;
            partidoId = listaVereadores[0].partido_id || null;
        } else {
            // Fallback
            vereadorId = '00000000-0000-0000-0000-000000000001';
            partidoId = null;
        }

        // 2. Criar Sessão Temporária
        const numSessao = Math.floor(Math.random() * 900) + 1;
        const resSessao = await request(app)
            .post('/api/sessoes')
            .set('Authorization', `Bearer ${appToken}`)
            .send({
                numero: numSessao,
                tipo: 'Ordinária',
                data_sessao: new Date('2038-06-25T14:00:00Z').toISOString(),
                status: 'Agendada'
            });
            
        if (resSessao.status === 201) sessaoId = resSessao.body.data.id;

        // 3. Criar Pauta Temporária
        if (sessaoId) {
            const resPauta = await request(app)
                .post('/api/pautas')
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome', 'Projeto de Votação E2E')
                .field('descricao', 'Pauta para teste de voto')
                .field('sessao_id', sessaoId)
                .field('autor', 'Mesa Diretora')
                .field('status', 'Pendente')
                .field('votacao_simbolica', 'false');
            
            if (resPauta.status === 201) pautaId = resPauta.body.data[0].id;
        }
    });

    afterAll(async () => {
        // Teardown Garantido
        if (pautaId) {
            await request(app)
                .delete(`/api/pautas/${pautaId}`)
                .set('Authorization', `Bearer ${appToken}`);
        }
        if (sessaoId) {
            await request(app)
                .delete(`/api/sessoes/${sessaoId}`)
                .set('Authorization', `Bearer ${appToken}`);
        }
    });

    describe('Segurança', () => {
        it('Deve garantir que todos os artefatos temporários foram criados no Setup', () => {
            expect(vereadorId).not.toBeNull();
            expect(sessaoId).not.toBeNull();
            expect(pautaId).not.toBeNull();
        });

        it('Deve bloquear acesso sem token ao painel de controle (401)', async () => {
            const res = await request(app).get('/api/painel-controle/pautas-em-votacao');
            expect(res.status).toBe(401);
        });

        it('Deve rejeitar token JWT malformado no painel (401)', async () => {
            const res = await request(app)
                .get('/api/painel-controle/pautas-em-votacao')
                .set('Authorization', 'Bearer xyz.abc.fake');
            expect(res.status).toBe(401);
        });

        it('Deve bloquear acesso sem token aos votos (401)', async () => {
            const res = await request(app).get(`/api/votos/pauta/${pautaId}`);
            expect(res.status).toBe(401);
        });

        it('Deve listar oradores da sessão ativa (Status 200)', async () => {
            const res = await request(app)
                .get('/api/painel-controle/oradores')
                .set('Authorization', `Bearer ${appToken}`);
            expect(res.status).toBe(200);
        });

        it('Deve consultar o status da fala ativa (Status 200)', async () => {
            const res = await request(app)
                .get('/api/painel-controle/fala-ativa')
                .set('Authorization', `Bearer ${appToken}`);
            expect(res.status).toBe(200);
        });
    });

    describe('Painel de Controle: Restrições de Votação (Janela e Tenants)', () => {
        it('Não deve permitir registrar voto se a pauta estiver Pendente ou a Role for inválida (Status 403/400)', async () => {
            const res = await request(app)
                .post('/api/votos')
                .set('Authorization', `Bearer ${appToken}`)
                .send({
                    pauta_id: pautaId,
                    voto: 'Sim'
                });
            expect([400, 403]).toContain(res.status);
            // expect(res.body.error).toMatch(/não está em votação|Apenas vereadores podem/i);
        });

        it('Deve bloquear Iniciar Votação de pauta inexistente ou de outra câmara (Status 404/403)', async () => {
            const fakePautaId = '11111111-1111-1111-1111-111111111111';
            const res = await request(app)
                .post(`/api/painel-controle/iniciar-votacao/${fakePautaId}`)
                .set('Authorization', `Bearer ${appToken}`);
            expect(res.status).toBe(404);
            expect(res.body.error).toMatch(/não encontrada/i);
        });
    });

    describe('Painel de Controle: Iniciar Votação', () => {
        it('Deve iniciar a votação de uma pauta pelo Admin da Câmara (Status 200)', async () => {
            const res = await request(app)
                .post(`/api/painel-controle/iniciar-votacao/${pautaId}`)
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Votação iniciada com sucesso');
        });

        it('Deve retornar a pauta na lista de pautas em votação (Status 200)', async () => {
            const res = await request(app)
                .get('/api/painel-controle/pautas-em-votacao')
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
            
            const encontrou = res.body.data.find(p => p.id === pautaId);
            expect(encontrou).toBeDefined();
            expect(encontrou.status).toBe('Em Votação');
        });
    });

    describe('Emissão e Computação de Votos', () => {
        let supabaseAdmin;
        
        beforeAll(() => {
            supabaseAdmin = require('../src/config/supabaseAdminClient');
        });

        it('Deve registrar um voto manual no banco de dados e computar (Setup de Injeção)', async () => {
            const { data: novoVoto, error } = await supabaseAdmin
                .from('votos')
                .insert({
                    pauta_id: pautaId,
                    vereador_id: vereadorId,
                    voto: 'SIM',
                    era_presidente_no_voto: false,
                    era_vice_presidente_no_voto: false,
                    partido_id_no_voto: partidoId
                })
                .select()
                .single();
            
            expect(error).toBeNull();
            expect(novoVoto).toBeDefined();
            expect(novoVoto.voto).toBe('SIM');
        });

        it('Deve obter a lista e totais de votos da Pauta (Status 200)', async () => {
            const res = await request(app)
                .get(`/api/votos/pauta/${pautaId}`)
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            expect(res.body.votos.length).toBe(1); // Somente o nosso vereador votou
            expect(res.body.votos[0].voto).toBe('SIM');
            expect(res.body.estatisticas.sim).toBe(1);
            expect(res.body.estatisticas.nao).toBe(0);
        });

        it('Deve obter os totais em tempo real (Status 200)', async () => {
            const res = await request(app)
                .get(`/api/votos/pauta/${pautaId}/totals`)
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            expect(res.body.sim).toBe(1);
        });
    });
});
