module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/helpers/'
  ]
};
