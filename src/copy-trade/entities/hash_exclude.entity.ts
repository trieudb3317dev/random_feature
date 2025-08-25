import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('hash_exclude')
export class HashExclude {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    hash: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;
}
