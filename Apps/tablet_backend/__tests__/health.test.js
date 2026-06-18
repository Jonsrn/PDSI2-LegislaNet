const request = require("supertest");
const app = require("../server");

describe("GET /health", () => {
  it("Deve retornar status 200 e mensagem indicando que o servidor está saudável", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "healthy");
    expect(response.body).toHaveProperty("service", "tablet-backend");
  });
});
