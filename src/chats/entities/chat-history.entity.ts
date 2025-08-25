import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ChatHistoryStatus {
    SEND = 'send',
    RECALL = 'recall',
    DELETE = 'delete'
}

@Schema({
    collection: 'chat_histories',
    timestamps: true,
    versionKey: false
})
export class ChatHistory extends Document {
    @Prop({ required: true })
    ch_id: string;

    @Prop({ required: true })
    ch_chat_id: string;

    @Prop({ required: true })
    ch_wallet_id: number;

    @Prop()
    ch_content: string;

    @Prop()
    ch_image_list: string;

    @Prop()
    ch_voice: string;

    @Prop()
    ch_video: string;

    @Prop({
        type: String,
        enum: ChatHistoryStatus,
        default: ChatHistoryStatus.SEND
    })
    ch_status: ChatHistoryStatus;

    @Prop({ default: false })
    ch_is_master: boolean;

    @Prop({ default: null })
    ch_lang: string;

    @Prop()
    createdAt: Date;

    @Prop()
    updatedAt: Date;
}

export const ChatHistorySchema = SchemaFactory.createForClass(ChatHistory); 