import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBlockChatsTable1713441600001 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "block_status" AS ENUM ('on', 'off');

            CREATE TABLE "block_chats" (
                "bc_id" SERIAL PRIMARY KEY,
                "bc_chat_id" integer NOT NULL,
                "bc_wallet_id" integer NOT NULL,
                "bc_status" "block_status" NOT NULL DEFAULT 'off',
                CONSTRAINT "FK_block_chats_chat" FOREIGN KEY ("bc_chat_id") REFERENCES "chats"("chat_id"),
                CONSTRAINT "FK_block_chats_wallet" FOREIGN KEY ("bc_wallet_id") REFERENCES "list_wallets"("wallet_id")
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE "block_chats";
            DROP TYPE "block_status";
        `);
    }
} 