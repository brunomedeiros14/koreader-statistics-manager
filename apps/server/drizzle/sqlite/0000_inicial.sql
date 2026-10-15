-- Baseline do schema SQLite (gerado por drizzle-kit e tornado idempotente).
-- `IF NOT EXISTS` permite adotar bancos criados pelo runner manual antigo sem
-- falhar no CREATE TABLE/INDEX já existentes.
CREATE TABLE IF NOT EXISTS `leitura` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text,
	`opcao_id` integer,
	`op_id` text,
	`origem` text DEFAULT 'web' NOT NULL,
	`data_hora_1` text NOT NULL,
	`data_hora_2` text NOT NULL,
	`numero_1` integer NOT NULL,
	`numero_2` integer NOT NULL,
	`numero_3` integer NOT NULL,
	`md5` text,
	`leitura_sincronizada` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`opcao_id`) REFERENCES `opcao`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_leitura_op_id` ON `leitura` (`op_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_leitura_opcao_id` ON `leitura` (`opcao_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_leitura_data_hora_1` ON `leitura` (`data_hora_1`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_leitura_md5` ON `leitura` (`md5`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_leitura_sincronizada` ON `leitura` (`leitura_sincronizada`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `opcao` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`texto` text NOT NULL,
	`autor` text DEFAULT '' NOT NULL,
	`imagem` text DEFAULT '' NOT NULL,
	`md5` text,
	`posicao` integer DEFAULT 0 NOT NULL,
	`oculto` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_opcao_md5` ON `opcao` (`md5`);--> statement-breakpoint
-- Remove o controle de migrations do runner manual antigo (substituído pelo
-- __drizzle_migrations). No-op em bancos novos.
DROP TABLE IF EXISTS `_migrations`;
