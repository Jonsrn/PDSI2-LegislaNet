const request = require('supertest');
const app = require('../../server');

// Credenciais da Cobaia
const TEST_USER = {
    email: 'nunes@srn.com',
    password: 'Nunes123@'
};

const TEST_PAUTA_ID = '3e37d20a-7460-4a3d-b709-aefed676a208';

/**
 * Utilitário para injetar o vereador no sistema e capturar o JWT real.
 * @returns {Promise<string>} O token JWT
 */
const getAuthToken = async () => {
    const response = await request(app)
        .post('/api/auth/login')
        .send(TEST_USER);
    
    if (!response.body.token) {
        throw new Error('Falha ao obter token no setup de testes. Verifique as credenciais Cobaia.');
    }
    
    return response.body.token;
};

module.exports = {
    TEST_USER,
    TEST_PAUTA_ID,
    getAuthToken
};
