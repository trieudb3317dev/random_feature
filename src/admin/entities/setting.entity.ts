import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Unique, BeforeInsert, BeforeUpdate } from 'typeorm';
import { IsNotEmpty } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';

@Entity({ name: 'setting' })
@Unique(['appName']) // Tạo index duy nhất cho appName
export class Setting {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ nullable: false })
  @IsNotEmpty()
  appName: string;

  @Column({ nullable: false })
  @IsNotEmpty()
  logo: string;

  @Column({ nullable: true })
  @IsNotEmpty()
  telegramBot: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
