-- Baseline do schema Postgres (gerado por drizzle-kit e tornado idempotente).
-- `IF NOT EXISTS` e a guarda de FK permitem adotar bancos criados pelo runner
-- manual antigo sem falhar em objetos já existentes.
CREATE TABLE IF NOT EXISTS "leitura" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text,
	"opcao_id" integer,
	"op_id" text,
	"origem" text DEFAULT 'web' NOT NULL,
	"data_hora_1" text NOT NULL,
	"data_hora_2" text NOT NULL,
	"numero_1" integer NOT NULL,
	"numero_2" integer NOT NULL,
	"numero_3" integer NOT NULL,
	"md5" text,
	"leitura_sincronizada" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opcao" (
	"id" serial PRIMARY KEY NOT NULL,
	"texto" text NOT NULL,
	"autor" text DEFAULT '' NOT NULL,
	"imagem" text DEFAULT '' NOT NULL,
	"md5" text,
	"posicao" integer DEFAULT 0 NOT NULL,
	"oculto" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint c
		JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
		WHERE c.conrelid = 'leitura'::regclass AND c.contype = 'f' AND a.attname = 'opcao_id'
	) THEN
		ALTER TABLE "leitura" ADD CONSTRAINT "leitura_opcao_id_opcao_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."opcao"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_leitura_op_id" ON "leitura" USING btree ("op_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leitura_opcao_id" ON "leitura" USING btree ("opcao_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leitura_data_hora_1" ON "leitura" USING btree ("data_hora_1");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leitura_md5" ON "leitura" USING btree ("md5");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leitura_sincronizada" ON "leitura" USING btree ("leitura_sincronizada");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_opcao_md5" ON "opcao" USING btree ("md5");--> statement-breakpoint
-- Remove o controle de migrations do runner manual antigo (substituído pelo
-- drizzle.__drizzle_migrations). No-op em bancos novos.
DROP TABLE IF EXISTS "_migrations";
