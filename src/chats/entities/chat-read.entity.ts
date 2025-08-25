import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
    collection: 'chat_reads',
    timestamps: true,
    versionKey: false
})
export class ChatRead extends Document {
    @Prop({ required: true })
    cr_id: string;

    @Prop({ required: true })
    cr_wallet_id: number;

    @Prop({ required: true })
    cr_room_id: number;

    @Prop({ default: Date.now })
    cr_last_read_at: Date;
}

export const ChatReadSchema = SchemaFactory.createForClass(ChatRead); 