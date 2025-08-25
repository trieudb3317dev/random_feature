// import { Controller, Get, Param, Put, Body, HttpException, HttpStatus } from '@nestjs/common';
// import { ReferentSettingService } from '../services/referent-setting.service';
// import { ReferentSetting } from '../entities/referent-setting.entity';

// @Controller('referent-settings')
// export class ReferentSettingController {
//     constructor(
//         private readonly referentSettingService: ReferentSettingService,
//     ) {}

//     @Get()
//     async findAll() {
//         return await this.referentSettingService.findAll();
//     }

//     @Get(':id')
//     async findOne(@Param('id') id: string) {
//         const setting = await this.referentSettingService.findOne(parseInt(id));
//         if (!setting) {
//             throw new HttpException('Setting not found or table does not exist', HttpStatus.NOT_FOUND);
//         }
//         return setting;
//     }

//     @Put(':id')
//     async update(@Param('id') id: string, @Body() data: Partial<ReferentSetting>) {
//         const updated = await this.referentSettingService.update(parseInt(id), data);
//         if (!updated) {
//             throw new HttpException('Setting not found or table does not exist', HttpStatus.NOT_FOUND);
//         }
//         return updated;
//     }
// } 