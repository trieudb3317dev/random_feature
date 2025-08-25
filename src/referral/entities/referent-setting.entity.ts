import { Entity, Column, PrimaryColumn, BeforeInsert } from 'typeorm';

@Entity('referent_settings')
export class ReferentSetting {
    @PrimaryColumn()
    rs_id: number;

    @Column({
        type: 'smallint',
        default: 1
    })
    rs_ref_level: number;

    @BeforeInsert()
    async setInitialId() {
        if (!this.rs_id) {
            const timestamp = new Date().getTime();
            const random = Math.floor(Math.random() * 1000);
            this.rs_id = timestamp % 10000 + random;
        }
    }
} 