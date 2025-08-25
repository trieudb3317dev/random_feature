// import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository, QueryFailedError } from 'typeorm';
// import { ReferentSetting } from '../entities/referent-setting.entity';

// @Injectable()
// export class ReferentSettingService implements OnModuleInit {
//     private readonly logger = new Logger(ReferentSettingService.name);

//     constructor(
//         @InjectRepository(ReferentSetting)
//         private referentSettingRepository: Repository<ReferentSetting>,
//     ) {}

//     async onModuleInit() {
//         // Đã xóa logic tạo bản ghi mặc định
//     }

//     async findAll() {
//         try {
//             return await this.referentSettingRepository.find();
//         } catch (error) {
//             if (error instanceof QueryFailedError && error.message.includes('relation') && error.message.includes('does not exist')) {
//                 this.logger.warn('Referent settings table does not exist yet.');
//                 return [];
//             }
//             throw error;
//         }
//     }

//     async findOne(id: number) {
//         try {
//             return await this.referentSettingRepository.findOne({ where: { rs_id: id } });
//         } catch (error) {
//             if (error instanceof QueryFailedError && error.message.includes('relation') && error.message.includes('does not exist')) {
//                 this.logger.warn('Referent settings table does not exist yet.');
//                 return null;
//             }
//             throw error;
//         }
//     }

//     async update(id: number, data: Partial<ReferentSetting>) {
//         try {
//             await this.referentSettingRepository.update(id, data);
//             return await this.findOne(id);
//         } catch (error) {
//             if (error instanceof QueryFailedError && error.message.includes('relation') && error.message.includes('does not exist')) {
//                 this.logger.warn('Referent settings table does not exist yet.');
//                 return null;
//             }
//             throw error;
//         }
//     }
// } 