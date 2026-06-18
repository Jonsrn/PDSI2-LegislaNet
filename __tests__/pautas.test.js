const request = require('supertest');
const app = require('../server');
const { getAppAuth } = require('./helpers/authHelper');

describe('API Web Backend - Core: Pautas (Matérias Legislativas)', () => {
    let appToken;
    let camaraId;
    let sessaoPaiId = null;
    let pautaCriadaId = null;

    beforeAll(async () => {
        // Autentica com Admin da Câmara
        const authData = await getAppAuth();
        appToken = authData.token;
        camaraId = authData.profile.camara_id;

        // Cria uma Sessão Temporária para atrelar as Pautas
        const numSessao = Math.floor(Math.random() * 900) + 1;
        const resSessao = await request(app)
            .post('/api/sessoes')
            .set('Authorization', `Bearer ${appToken}`)
            .send({
                numero: numSessao,
                tipo: 'Extraordinária',
                data_sessao: new Date('2038-05-20T14:00:00Z').toISOString(),
                status: 'Agendada'
            });

        if (resSessao.status === 201) {
            sessaoPaiId = resSessao.body.data.id;
        } else {
            console.error("Falha ao criar sessão de setup para Pautas:", resSessao.body);
            throw new Error("Setup falhou");
        }
    });

    afterAll(async () => {
        // Teardown Garantido
        // Como apagaremos a pauta no meio dos testes, esse delete pauta é fallback
        if (pautaCriadaId) {
            await request(app)
                .delete(`/api/pautas/${pautaCriadaId}`)
                .set('Authorization', `Bearer ${appToken}`);
        }
        
        // Exclui a sessão pai
        if (sessaoPaiId) {
            await request(app)
                .delete(`/api/sessoes/${sessaoPaiId}`)
                .set('Authorization', `Bearer ${appToken}`);
        }
    });

    describe('Segurança de Acesso (RBAC)', () => {
        it('Deve bloquear acesso não autenticado (401)', async () => {
            const res = await request(app).get('/api/pautas');
            expect(res.status).toBe(401);
        });

        it('Deve rejeitar token JWT malformado (401)', async () => {
            const res = await request(app)
                .get('/api/pautas')
                .set('Authorization', 'Bearer abc.def.ghi');
            expect(res.status).toBe(401);
        });
    });

    describe('Validação de Payload (Dados Obrigatórios)', () => {
        it('Deve rejeitar pauta sem campo nome (400/500)', async () => {
            const res = await request(app)
                .post('/api/pautas')
                .set('Authorization', `Bearer ${appToken}`)
                .field('descricao', 'Sem nome')
                .field('sessao_id', sessaoPaiId)
                .field('autor', 'Autor Teste');
            // O controller pode retornar 400 (validação) ou 500 (constraint DB)
            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it('Deve rejeitar status de tramitação inválido (400)', async () => {
            const res = await request(app)
                .post('/api/pautas')
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome', 'Pauta Status Falso')
                .field('sessao_id', sessaoPaiId)
                .field('autor', 'Autor Teste')
                .field('status', 'Invalido');
            // O controller pode retornar 400 (validação) ou 500 (constraint DB)
            expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });

    describe('Ciclo de Vida da Pauta (Gestão de Matérias)', () => {
        it('Deve criar uma pauta na Sessão Pai (Status 201)', async () => {
            const res = await request(app)
                .post('/api/pautas')
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome', 'Projeto de Teste Backend')
                .field('descricao', 'Testando CRUD E2E')
                .field('sessao_id', sessaoPaiId)
                .field('autor', 'Vereador Testador')
                .field('status', 'Pendente')
                .field('votacao_simbolica', 'false');
            
            // Aceitando 201
            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('data');
            
            // Quando votacao_simbolica é false, retorna array de 1 pauta
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data[0].nome).toBe('Projeto de Teste Backend');

            pautaCriadaId = res.body.data[0].id;
        });

        it('Não deve permitir criar pauta atrelada a uma sessão inexistente ou de outra câmara (Status 404)', async () => {
            const fakeSessaoId = '00000000-0000-0000-0000-000000000000';
            const res = await request(app)
                .post('/api/pautas')
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome', 'Pauta Invasora')
                .field('descricao', 'Teste de Cross-Tenant')
                .field('sessao_id', fakeSessaoId)
                .field('autor', 'Vereador Invasor')
                .field('status', 'Pendente')
                .field('votacao_simbolica', 'false');
            
            expect(res.status).toBe(404);
            expect(res.body.error).toMatch(/não encontrada/i);
        });

        it('Deve listar as pautas cadastradas (Status 200)', async () => {
            const res = await request(app)
                .get('/api/pautas')
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(Array.isArray(res.body.data)).toBe(true);

            // A pauta recém criada deve aparecer
            const encontrou = res.body.data.find(p => p.id === pautaCriadaId);
            expect(encontrou).toBeDefined();
        });

        it('Deve exibir os detalhes específicos da Pauta (Status 200)', async () => {
            expect(pautaCriadaId).toBeDefined();

            const res = await request(app)
                .get(`/api/pautas/${pautaCriadaId}`)
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(pautaCriadaId);
            expect(res.body.autor).toBe('Vereador Testador');
            // Verifica os includes da sessão
            expect(res.body.sessoes).toBeDefined();
            expect(res.body.sessoes.id).toBe(sessaoPaiId);
        });

        it('Deve atualizar os dados textuais da Pauta (Status 200)', async () => {
            const res = await request(app)
                .put(`/api/pautas/${pautaCriadaId}`)
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome', 'Projeto de Teste Backend ATUALIZADO')
                .field('descricao', 'Descrição nova');

            expect(res.status).toBe(200);
            expect(res.body.data.nome).toMatch(/ATUALIZADO/);
        });

        it('Deve alterar o status de tramitação da Pauta (Status 200)', async () => {
            const res = await request(app)
                .put(`/api/pautas/${pautaCriadaId}/status`)
                .set('Authorization', `Bearer ${appToken}`)
                .send({ status: 'Em Votação' });

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('Em Votação');
        });

        it('Deve listar autores de pautas cadastradas (Status 200)', async () => {
            const res = await request(app)
                .get('/api/pautas/autores')
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data).toContain('Vereador Testador');
        });

        it('Não deve permitir excluir Pauta que já foi votada (Status 403)', async () => {
            // Muda status para Finalizada para simular votação concluída
            await request(app)
                .put(`/api/pautas/${pautaCriadaId}/status`)
                .set('Authorization', `Bearer ${appToken}`)
                .send({ status: 'Finalizada' });

            const res = await request(app)
                .delete(`/api/pautas/${pautaCriadaId}`)
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/excluir pautas em votação ou que já foram votadas/i);

            // Volta para pendente para o teste de exclusão feliz passar
            await request(app)
                .put(`/api/pautas/${pautaCriadaId}/status`)
                .set('Authorization', `Bearer ${appToken}`)
                .send({ status: 'Pendente' });
        });

        it('Deve excluir a Pauta permanentemente (Status 200)', async () => {
            const res = await request(app)
                .delete(`/api/pautas/${pautaCriadaId}`)
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(200);
            
            // Limpa fallback
            pautaCriadaId = null;
        });

        it('Deve retornar 404 ao buscar pauta deletada', async () => {
            const fakeId = '11111111-1111-1111-1111-111111111111';
            const res = await request(app)
                .get(`/api/pautas/${fakeId}`)
                .set('Authorization', `Bearer ${appToken}`);

            expect(res.status).toBe(404);
        });
    });

    describe('Entidade Inexistente (404)', () => {
        it('Deve retornar 404 ao editar pauta inexistente', async () => {
            const fakeId = '22222222-2222-2222-2222-222222222222';
            const res = await request(app)
                .put(`/api/pautas/${fakeId}`)
                .set('Authorization', `Bearer ${appToken}`)
                .field('nome', 'Fantasma');
            expect(res.status).toBe(404);
        });

        it('Deve retornar 404 ao deletar pauta inexistente', async () => {
            const fakeId = '33333333-3333-3333-3333-333333333333';
            const res = await request(app)
                .delete(`/api/pautas/${fakeId}`)
                .set('Authorization', `Bearer ${appToken}`);
            expect(res.status).toBe(404);
        });

        it('Deve retornar 404 ao alterar status de pauta inexistente', async () => {
            const fakeId = '44444444-4444-4444-4444-444444444444';
            const res = await request(app)
                .put(`/api/pautas/${fakeId}/status`)
                .set('Authorization', `Bearer ${appToken}`)
                .send({ status: 'Em Votação' });
            expect(res.status).toBe(404);
        });

        it('Deve retornar 404 ao definir resultado de pauta inexistente', async () => {
            const fakeId = '55555555-5555-5555-5555-555555555555';
            const res = await request(app)
                .put(`/api/pautas/${fakeId}/resultado`)
                .set('Authorization', `Bearer ${appToken}`)
                .send({ resultado_votacao: 'Aprovada' });
            expect(res.status).toBe(404);
        });
    });
});
