// Carregado antes de qualquer arquivo de teste (ver bunfig.toml). Fixa o
// driver em SQLite para que a suíte seja hermética mesmo com um .env apontando
// o app para Postgres. O path real do SQLite é definido por cada teste.
process.env.DB_DRIVER = "sqlite";
