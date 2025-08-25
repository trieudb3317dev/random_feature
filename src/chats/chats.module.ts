import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { Chat } from './entities/chat.entity';
import { BlockChat } from './entities/block-chat.entity';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { SolanaListToken } from '../solana/entities/solana-list-token.entity';
import { ChatHistory, ChatHistorySchema } from './entities/chat-history.entity';
import { ChatRead, ChatReadSchema } from './entities/chat-read.entity';
import { ChatsGateway } from './websockets/chats.gateway';
import { TelegramWalletsModule } from '../telegram-wallets/telegram-wallets.module';
import { SolanaModule } from '../solana/solana.module';
import { MasterGroup } from '../master-trading/entities/master-group.entity';
import { MasterGroupAuth } from '../master-trading/entities/master-group-auth.entity';
import { MasterConnect } from '../master-trading/entities/master-connect.entity';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Chat,
            BlockChat,
            ListWallet,
            SolanaListToken,
            MasterGroup,
            MasterGroupAuth,
            MasterConnect
        ]),
        MongooseModule.forFeature([
            { name: ChatHistory.name, schema: ChatHistorySchema },
            { name: ChatRead.name, schema: ChatReadSchema }
        ]),
        forwardRef(() => TelegramWalletsModule),
        forwardRef(() => SolanaModule),
        forwardRef(() => AuthModule),
        CloudinaryModule
    ],
    controllers: [ChatsController],
    providers: [ChatsService, ChatsGateway],
    exports: [ChatsService]
})
export class ChatsModule {} 