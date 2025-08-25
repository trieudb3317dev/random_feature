import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';

@Injectable()
export class DbSyncService implements OnModuleInit {
    private readonly logger = new Logger(DbSyncService.name);

    constructor(
        @InjectConnection()
        private connection: Connection,
    ) { }

    async onModuleInit() {
        try {
            // Set timezone to UTC for the current session
            await this.connection.query('SET timezone = \'UTC\';');
            this.logger.log('Database timezone set to UTC');
        } catch (error) {
            this.logger.error('Error setting database timezone:', error);
        }
        this.logger.log('Initializing database sync service...');
        await this.syncAllSequences();
    }

    async syncAllSequences() {
        try {
            this.logger.log('Checking all database sequences...');

            // Danh sách các bảng cần kiểm tra sequence
            const tablesToSync = [
                { table: 'wallet_auth', column: 'wa_id', sequence: 'wallet_auth_wa_id_seq' },
                // Thêm các bảng khác nếu cần
            ];

            for (const item of tablesToSync) {
                await this.syncSequence(item.table, item.column, item.sequence);
            }
        } catch (error) {
            this.logger.error(`Error syncing sequences: ${error.message}`, error.stack);
        }
    }

    async syncSequence(table: string, column: string, sequence: string, buffer: number = 10) {
        try {
            this.logger.log(`Syncing sequence for ${table}.${column} using ${sequence}`);

            // Lấy max ID hiện tại
            const maxIdResult = await this.connection.query(`SELECT MAX(${column}) as max_id FROM ${table}`);
            const maxId = maxIdResult[0]?.max_id || 0;
            this.logger.log(`Current MAX(${column}) in ${table}: ${maxId}`);

            // Thêm buffer để tránh xung đột
            const nextId = maxId + buffer;

            // Kiểm tra giá trị hiện tại của sequence
            const seqValueResult = await this.connection.query(
                `SELECT last_value, is_called FROM ${sequence}`
            );
            const lastValue = seqValueResult[0]?.last_value || 0;
            const isCalled = seqValueResult[0]?.is_called;

            this.logger.log(`Current sequence ${sequence} value: ${lastValue} (is_called: ${isCalled})`);

            // Nếu giá trị sequence nhỏ hơn max ID + buffer, reset sequence
            if (lastValue < nextId) {
                this.logger.warn(
                    `Sequence ${sequence} value (${lastValue}) is less than next safe ID (${nextId}). Resetting...`
                );
                await this.connection.query(`ALTER SEQUENCE ${sequence} RESTART WITH ${nextId}`);

                // Verify the change
                const verifyResult = await this.connection.query(`SELECT last_value FROM ${sequence}`);
                const newValue = verifyResult[0]?.last_value;
                this.logger.log(`Sequence ${sequence} reset to ${newValue}`);
            } else {
                this.logger.log(`Sequence ${sequence} is up to date (${lastValue} >= ${nextId})`);
            }

            return true;
        } catch (error) {
            this.logger.error(`Error syncing sequence ${sequence}: ${error.message}`, error.stack);
            return false;
        }
    }

    // Hàm này có thể gọi từ bên ngoài khi cần reset sequence khẩn cấp
    async forceResetSequence(table: string, column: string, sequence: string, startValue?: number) {
        try {
            if (!startValue) {
                // Lấy max ID hiện tại
                const maxIdResult = await this.connection.query(`SELECT MAX(${column}) as max_id FROM ${table}`);
                const maxId = maxIdResult[0]?.max_id || 0;
                startValue = maxId + 10; // Buffer 10 để an toàn
            }

            this.logger.warn(`Forcing reset of sequence ${sequence} to ${startValue}`);
            await this.connection.query(`ALTER SEQUENCE ${sequence} RESTART WITH ${startValue}`);

            // Verify the change
            const verifyResult = await this.connection.query(`SELECT last_value FROM ${sequence}`);
            const newValue = verifyResult[0]?.last_value;
            this.logger.log(`Sequence ${sequence} force reset to ${newValue}`);

            return true;
        } catch (error) {
            this.logger.error(`Error forcing reset of sequence ${sequence}: ${error.message}`, error.stack);
            return false;
        }
    }
} 