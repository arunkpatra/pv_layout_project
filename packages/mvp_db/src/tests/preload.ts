// Test preload: prevents PrismaClient from attempting a real DB connection.
process.env["MVP_DATABASE_URL"] =
  process.env["MVP_DATABASE_URL"] ??
  "postgresql://test:test@localhost/test_placeholder"
