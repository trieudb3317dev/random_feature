import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateChatsTable1713441600000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "chat_option" AS ENUM ('all', 'token', 'group');
            CREATE TYPE "chat_type" AS ENUM ('private', 'public');

            CREATE TABLE "chats" (
                "chat_id" SERIAL PRIMARY KEY,
                "chat_token_address" varchar,
                "chat_group_id" integer,
                "chat_auth" integer,
                "chat_option" "chat_option" NOT NULL DEFAULT 'all',
                "chat_type" "chat_type" NOT NULL DEFAULT 'public',
                CONSTRAINT "FK_chats_wallet" FOREIGN KEY ("chat_auth") REFERENCES "list_wallets"("wallet_id"),
                CONSTRAINT "FK_chats_token" FOREIGN KEY ("chat_token_address") REFERENCES "solana_list_token"("slt_address")
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE "chats";
            DROP TYPE "chat_option";
            DROP TYPE "chat_type";
        `);
    }
} 