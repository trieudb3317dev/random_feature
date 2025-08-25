import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat } from './entities/chat.entity';
import { BlockChat } from './entities/block-chat.entity';
import { ChatOption, ChatType } from './entities/chat.entity';
import { ChatHistory, ChatHistoryStatus } from './entities/chat-history.entity';
import { ChatRead } from './entities/chat-read.entity';
import { ChatsGateway } from './websockets/chats.gateway';
import { TelegramWalletsService } from '../telegram-wallets/telegram-wallets.service';
import { ListWallet } from '../telegram-wallets/entities/list-wallet.entity';
import { MasterGroup } from '../master-trading/entities/master-group.entity';
import { MasterGroupAuth } from '../master-trading/entities/master-group-auth.entity';
import { MasterConnect } from '../master-trading/entities/master-connect.entity';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { In } from 'typeorm';

@Injectable()
export class ChatsService implements OnModuleInit {
    private readonly logger = new Logger(ChatsService.name);

    constructor(
        @InjectRepository(Chat)
        private chatRepository: Repository<Chat>,
        @InjectRepository(BlockChat)
        private blockChatRepository: Repository<BlockChat>,
        @InjectRepository(ListWallet)
        private listWalletRepository: Repository<ListWallet>,
        @InjectRepository(MasterGroup)
        private masterGroupRepository: Repository<MasterGroup>,
        @InjectRepository(MasterGroupAuth)
        private masterGroupAuthRepository: Repository<MasterGroupAuth>,
        @InjectRepository(MasterConnect)
        private masterConnectRepository: Repository<MasterConnect>,
        @InjectModel(ChatHistory.name)
        private chatHistoryModel: Model<ChatHistory>,
        @InjectModel(ChatRead.name)
        private chatReadModel: Model<ChatRead>,
        @Inject(forwardRef(() => ChatsGateway))
        private readonly chatsGateway: ChatsGateway,
        private telegramWalletsService: TelegramWalletsService,
        private cloudinaryService: CloudinaryService
    ) { }

    async onModuleInit() {
        try {
            await this.createChatAll();
            this.logger.log('Chat ALL initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Chat ALL:', error);
        }
    }

    async createChatAll(): Promise<Chat> {
        try {
            const existingChat = await this.chatRepository.findOne({
                where: {
                    chat_token_address: undefined,
                    chat_group_id: undefined,
                    chat_auth: undefined,
                    chat_option: ChatOption.ALL
                }
            });

            if (existingChat) {
                return existingChat;
            }

            const chatData: Partial<Chat> = {
                chat_token_address: undefined,
                chat_group_id: undefined,
                chat_auth: undefined,
                chat_option: ChatOption.ALL,
                chat_type: ChatType.PUBLIC
            };

            const newChat = this.chatRepository.create(chatData);
            return await this.chatRepository.save(newChat);
        } catch (error) {
            this.logger.error('Error creating Chat ALL:', error);
            throw error;
        }
    }

    async createChatToken(tokenAddress: string): Promise<Chat> {
        try {
            const existingChat = await this.chatRepository.findOne({
                where: {
                    chat_token_address: tokenAddress,
                    chat_option: ChatOption.TOKEN
                }
            });

            if (existingChat) {
                return existingChat;
            }

            const chatData: Partial<Chat> = {
                chat_token_address: tokenAddress,
                chat_option: ChatOption.TOKEN,
                chat_type: ChatType.PUBLIC,
                chat_group_id: undefined,
                chat_auth: undefined
            };

            const newChat = this.chatRepository.create(chatData);
            return await this.chatRepository.save(newChat);
        } catch (error) {
            this.logger.error(`Error creating Chat Token for ${tokenAddress}:`, error);
            throw error;
        }
    }

    async sendMessage(tokenAddress: string, content: string, walletId: number, lang: string = 'kr', imageUrls?: string[]): Promise<any> {
        try {
            const chat = await this.createChatToken(tokenAddress);
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet) {
                throw new Error('Wallet not found');
            }

            // Xác định loại tin nhắn
            const isImageMessage = imageUrls && imageUrls.length > 0;
            const messageType = isImageMessage ? 'image' : 'text';

            const chatHistory = await this.chatHistoryModel.create({
                ch_id: `${new Date().getTime()}-${Math.floor(Math.random() * 1000)}`,
                ch_chat_id: chat.chat_id,
                ch_content: content || '', // Text content (có thể là caption cho hình ảnh)
                ch_image_list: isImageMessage ? JSON.stringify(imageUrls) : undefined, // Lưu array URLs dưới dạng JSON string
                ch_status: 'send',
                ch_wallet_id: walletId,
                ch_lang: lang
            });

            const formattedHistory = {
                _id: chatHistory._id,
                ch_id: chatHistory.ch_id,
                chat_id: chatHistory.ch_chat_id,
                ch_wallet_address: wallet.wallet_solana_address,
                ch_content: chatHistory.ch_content,
                ch_image_list: isImageMessage ? imageUrls : undefined, // Trả về array URLs
                chat_type: chat.chat_type,
                ch_status: chatHistory.ch_status,
                ch_lang: chatHistory.ch_lang,
                country: wallet.wallet_country,
                nick_name: wallet.wallet_nick_name,
                message_type: messageType, // Thêm loại tin nhắn
                createdAt: (chatHistory as any).createdAt
            };

            this.chatsGateway.broadcastMessage('token', tokenAddress, formattedHistory);

            return formattedHistory;
        } catch (error) {
            this.logger.error(`Error sending message to token ${tokenAddress}:`, error);
            throw error;
        }
    }

    async sendMessageToAll(content: string, walletId: number, lang: string = 'kr', imageUrls?: string[]): Promise<any> {
        try {
            const chat = await this.createChatAll();
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet) {
                throw new Error('Wallet not found');
            }

            // Xác định loại tin nhắn
            const isImageMessage = imageUrls && imageUrls.length > 0;
            const messageType = isImageMessage ? 'image' : 'text';

            const chatHistory = await this.chatHistoryModel.create({
                ch_id: `${new Date().getTime()}-${Math.floor(Math.random() * 1000)}`,
                ch_chat_id: chat.chat_id,
                ch_content: content || '', // Text content (có thể là caption cho hình ảnh)
                ch_image_list: isImageMessage ? JSON.stringify(imageUrls) : undefined, // Lưu array URLs dưới dạng JSON string
                ch_status: 'send',
                ch_wallet_id: walletId,
                ch_lang: lang
            });

            const formattedHistory = {
                _id: chatHistory._id,
                ch_id: chatHistory.ch_id,
                chat_id: chatHistory.ch_chat_id,
                ch_wallet_address: wallet.wallet_solana_address,
                ch_content: chatHistory.ch_content,
                ch_image_list: isImageMessage ? imageUrls : undefined, // Trả về array URLs
                chat_type: chat.chat_type,
                ch_status: chatHistory.ch_status,
                ch_lang: chatHistory.ch_lang,
                country: wallet.wallet_country,
                nick_name: wallet.wallet_nick_name,
                message_type: messageType, // Thêm loại tin nhắn để frontend biết cách hiển thị
                createdAt: (chatHistory as any).createdAt
            };

            this.chatsGateway.broadcastMessage('all', '', formattedHistory);

            return formattedHistory;
        } catch (error) {
            this.logger.error('Error sending message to ALL chat:', error);
            throw error;
        }
    }

    async getAllChatHistories(limit: number = 50, skip: number = 0, walletId: number): Promise<{ histories: any[], last_read: Date | null }> {
        try {
            const chat = await this.createChatAll();
            const histories = await this.chatHistoryModel
                .find({ 
                    ch_chat_id: chat.chat_id.toString()
                })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec();

            if (!histories || histories.length === 0) {
                return { histories: [], last_read: null };
            }

            const walletIds = histories.map(h => h.ch_wallet_id);
            let wallets: ListWallet[] = [];
            if (walletIds.length > 0) {
                wallets = await this.listWalletRepository
                    .createQueryBuilder('wallet')
                    .where('wallet.wallet_id IN (:...ids)', { ids: walletIds })
                    .getMany();
            }

            const walletMap = new Map(
                wallets.map(w => [w.wallet_id, {
                    address: w.wallet_solana_address,
                    country: w.wallet_country,
                    nick_name: w.wallet_nick_name
                }])
            );

            // Lấy thông tin last_read
            const lastRead = await this.getLastRead(walletId, chat.chat_id);

            return {
                histories: histories.map(history => {
                    const historyObj = history.toObject();
                    const walletInfo = walletMap.get(historyObj.ch_wallet_id) || { address: '', country: null, nick_name: '' };
                    
                    // Xác định loại tin nhắn
                    const isImageMessage = historyObj.ch_image_list && historyObj.ch_image_list.trim() !== '';
                    const messageType = isImageMessage ? 'image' : 'text';
                    
                    // Parse image URLs từ JSON string
                    let imageList: string[] | null = null;
                    if (isImageMessage) {
                        try {
                            imageList = JSON.parse(historyObj.ch_image_list);
                        } catch (error) {
                            // Nếu parse lỗi, có thể là URL đơn lẻ (tương thích ngược)
                            imageList = [historyObj.ch_image_list];
                        }
                    }
                    
                    return {
                        _id: historyObj._id,
                        ch_id: historyObj.ch_id,
                        chat_id: historyObj.ch_chat_id,
                        chat_type: chat.chat_type,
                        ch_wallet_address: walletInfo.address,
                        ch_content: historyObj.ch_content,
                        ch_image_list: imageList, // Trả về array URLs
                        ch_status: historyObj.ch_status,
                        ch_is_master: historyObj.ch_is_master,
                        ch_lang: historyObj.ch_lang,
                        country: walletInfo.country,
                        nick_name: walletInfo.nick_name,
                        message_type: messageType, // Thêm loại tin nhắn
                        createdAt: historyObj.createdAt
                    };
                }),
                last_read: lastRead
            };
        } catch (error) {
            this.logger.error('Error getting ALL chat history:', error);
            throw error;
        }
    }

    async getTokenChatHistories(tokenAddress: string, limit: number = 50, skip: number = 0, walletId: number): Promise<{ histories: any[], last_read: Date | null }> {
        try {
            const chat = await this.createChatToken(tokenAddress);
            const histories = await this.chatHistoryModel
                .find({ 
                    ch_chat_id: chat.chat_id.toString()
                })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec();

            if (!histories || histories.length === 0) {
                return { histories: [], last_read: null };
            }

            const walletIds = histories.map(h => h.ch_wallet_id);
            let wallets: ListWallet[] = [];
            if (walletIds.length > 0) {
                wallets = await this.listWalletRepository
                    .createQueryBuilder('wallet')
                    .where('wallet.wallet_id IN (:...ids)', { ids: walletIds })
                    .getMany();
            }

            const walletMap = new Map(
                wallets.map(w => [w.wallet_id, {
                    address: w.wallet_solana_address,
                    country: w.wallet_country,
                    nick_name: w.wallet_nick_name
                }])
            );

            // Lấy thông tin last_read
            const lastRead = await this.getLastRead(walletId, chat.chat_id);

            return {
                histories: histories.map(history => {
                    const historyObj = history.toObject();
                    const walletInfo = walletMap.get(historyObj.ch_wallet_id) || { address: '', country: null, nick_name: '' };
                    
                    // Xác định loại tin nhắn
                    const isImageMessage = historyObj.ch_image_list && historyObj.ch_image_list.trim() !== '';
                    const messageType = isImageMessage ? 'image' : 'text';
                    
                    // Parse image URLs từ JSON string
                    let imageList: string[] | null = null;
                    if (isImageMessage) {
                        try {
                            imageList = JSON.parse(historyObj.ch_image_list);
                        } catch (error) {
                            // Nếu parse lỗi, có thể là URL đơn lẻ (tương thích ngược)
                            imageList = [historyObj.ch_image_list];
                        }
                    }
                    
                    return {
                        _id: historyObj._id,
                        ch_id: historyObj.ch_id,
                        chat_id: historyObj.ch_chat_id,
                        ch_wallet_address: walletInfo.address,
                        ch_content: historyObj.ch_content,
                        ch_image_list: imageList, // Trả về array URLs
                        chat_type: chat.chat_type,
                        ch_status: historyObj.ch_status,
                        ch_is_master: historyObj.ch_is_master,
                        ch_lang: historyObj.ch_lang,
                        country: walletInfo.country,
                        nick_name: walletInfo.nick_name,
                        message_type: messageType, // Thêm loại tin nhắn
                        createdAt: historyObj.createdAt
                    };
                }),
                last_read: lastRead
            };
        } catch (error) {
            this.logger.error(`Error getting token chat history for ${tokenAddress}:`, error);
            throw error;
        }
    }

    async updateChatHistoryStatus(chId: string, status: ChatHistoryStatus): Promise<ChatHistory> {
        try {
            const updated = await this.chatHistoryModel.findByIdAndUpdate(
                chId,
                { ch_status: status },
                { new: true }
            ).exec();

            if (!updated) {
                throw new Error('Chat history not found');
            }

            return updated;
        } catch (error) {
            this.logger.error(`Error updating chat history status for ${chId}:`, error);
            throw error;
        }
    }

    async deleteChatHistory(chId: string): Promise<void> {
        try {
            await this.chatHistoryModel.findByIdAndDelete(chId).exec();
        } catch (error) {
            this.logger.error(`Error deleting chat history ${chId}:`, error);
            throw error;
        }
    }

    async createChatGroup(groupId: number, masterWalletId: number): Promise<Chat> {
        try {
            const existingChat = await this.chatRepository.findOne({
                where: {
                    chat_group_id: groupId,
                    chat_option: ChatOption.GROUP
                }
            });

            if (existingChat) {
                return existingChat;
            }

            const chatData: Partial<Chat> = {
                chat_group_id: groupId,
                chat_auth: masterWalletId,
                chat_option: ChatOption.GROUP,
                chat_type: ChatType.PUBLIC
            };

            const newChat = this.chatRepository.create(chatData);
            return await this.chatRepository.save(newChat);
        } catch (error) {
            this.logger.error(`Error creating Chat Group for ${groupId}:`, error);
            throw error;
        }
    }

    async sendMessageToGroup(groupId: number, content: string, walletId: number, lang: string = 'kr', imageUrls?: string[]): Promise<any> {
        try {
            // Kiểm tra quyền truy cập
            const { isMaster, isMember } = await this.checkGroupAuth(groupId, walletId);
            if (!isMaster && !isMember) {
                throw new Error('You do not have permission to send messages in this group');
            }

            // Tạo hoặc lấy chat group
            const group = await this.masterGroupRepository.findOne({
                where: { mg_id: groupId }
            });
            const chat = await this.createChatGroup(groupId, group?.mg_master_wallet || 0);
            const wallet = await this.listWalletRepository.findOne({
                where: { wallet_id: walletId }
            });

            if (!wallet) {
                throw new Error('Wallet not found');
            }

            // Xác định loại tin nhắn
            const isImageMessage = imageUrls && imageUrls.length > 0;
            const messageType = isImageMessage ? 'image' : 'text';

            // Tạo chat history với ch_is_master dựa trên isMaster
            const chatHistory = await this.chatHistoryModel.create({
                ch_id: `${new Date().getTime()}-${Math.floor(Math.random() * 1000)}`,
                ch_chat_id: chat.chat_id,
                ch_content: content || '', // Text content (có thể là caption cho hình ảnh)
                ch_image_list: isImageMessage ? JSON.stringify(imageUrls) : undefined, // Lưu array URLs dưới dạng JSON string
                ch_status: 'send',
                ch_wallet_id: walletId,
                ch_is_master: isMaster,
                ch_lang: lang
            });

            // Định dạng dữ liệu trả về
            const formattedHistory = {
                _id: chatHistory._id,
                ch_id: chatHistory.ch_id,
                chat_id: chatHistory.ch_chat_id,
                ch_wallet_address: wallet.wallet_solana_address,
                ch_content: chatHistory.ch_content,
                ch_image_list: isImageMessage ? imageUrls : undefined, // Trả về array URLs
                chat_type: chat.chat_type,
                ch_status: chatHistory.ch_status,
                ch_is_master: chatHistory.ch_is_master,
                ch_lang: chatHistory.ch_lang,
                country: wallet.wallet_country,
                nick_name: wallet.wallet_nick_name,
                message_type: messageType, // Thêm loại tin nhắn
                createdAt: (chatHistory as any).createdAt
            };

            // Broadcast message
            this.chatsGateway.broadcastMessage('group', groupId.toString(), formattedHistory);

            return formattedHistory;
        } catch (error) {
            this.logger.error(`Error sending message to group ${groupId}:`, error);
            throw error;
        }
    }

    async getGroupChatHistories(groupId: number, walletId: number, limit: number = 50, skip: number = 0): Promise<{ histories: any[], last_read: Date | null }> {
        try {
            // Kiểm tra quyền truy cập
            const { isMaster, isMember } = await this.checkGroupAuth(groupId, walletId);
            if (!isMaster && !isMember) {
                throw new Error('You do not have permission to view messages in this group');
            }

            // Lấy chat group
            const group = await this.masterGroupRepository.findOne({
                where: { mg_id: groupId }
            });
            const chat = await this.createChatGroup(groupId, group?.mg_master_wallet || 0);
            const histories = await this.chatHistoryModel
                .find({ 
                    ch_chat_id: chat.chat_id.toString()
                })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec();

            if (!histories || histories.length === 0) {
                return { histories: [], last_read: null };
            }

            const walletIds = histories.map(h => h.ch_wallet_id);
            let wallets: ListWallet[] = [];
            if (walletIds.length > 0) {
                wallets = await this.listWalletRepository
                    .createQueryBuilder('wallet')
                    .where('wallet.wallet_id IN (:...ids)', { ids: walletIds })
                    .getMany();
            }

            const walletMap = new Map(
                wallets.map(w => [w.wallet_id, {
                    address: w.wallet_solana_address,
                    country: w.wallet_country,
                    nick_name: w.wallet_nick_name
                }])
            );

            // Lấy thông tin last_read
            const lastRead = await this.getLastRead(walletId, chat.chat_id);

            return {
                histories: histories.map(history => {
                    const historyObj = history.toObject();
                    const walletInfo = walletMap.get(historyObj.ch_wallet_id) || { address: '', country: null, nick_name: '' };
                    
                    // Xác định loại tin nhắn
                    const isImageMessage = historyObj.ch_image_list && historyObj.ch_image_list.trim() !== '';
                    const messageType = isImageMessage ? 'image' : 'text';
                    
                    // Parse image URLs từ JSON string
                    let imageList: string[] | null = null;
                    if (isImageMessage) {
                        try {
                            imageList = JSON.parse(historyObj.ch_image_list);
                        } catch (error) {
                            // Nếu parse lỗi, có thể là URL đơn lẻ (tương thích ngược)
                            imageList = [historyObj.ch_image_list];
                        }
                    }
                    
                    return {
                        _id: historyObj._id,
                        ch_id: historyObj.ch_id,
                        chat_id: historyObj.ch_chat_id,
                        ch_wallet_address: walletInfo.address,
                        ch_content: historyObj.ch_content,
                        ch_image_list: imageList, // Trả về array URLs
                        chat_type: chat.chat_type,
                        ch_status: historyObj.ch_status,
                        ch_is_master: historyObj.ch_is_master,
                        ch_lang: historyObj.ch_lang,
                        country: walletInfo.country,
                        nick_name: walletInfo.nick_name,
                        message_type: messageType, // Thêm loại tin nhắn
                        createdAt: historyObj.createdAt
                    };
                }),
                last_read: lastRead
            };
        } catch (error) {
            this.logger.error(`Error getting group chat history for ${groupId}:`, error);
            throw error;
        }
    }

    async updateLastRead(walletId: number, roomId: number): Promise<ChatRead> {
        try {
            const existingRead = await this.chatReadModel.findOne({
                cr_wallet_id: walletId,
                cr_room_id: roomId
            });

            if (existingRead) {
                existingRead.cr_last_read_at = new Date();
                return await existingRead.save();
            }

            const newRead = await this.chatReadModel.create({
                cr_id: `${new Date().getTime()}-${Math.floor(Math.random() * 1000)}`,
                cr_wallet_id: walletId,
                cr_room_id: roomId,
                cr_last_read_at: new Date()
            });

            return newRead;
        } catch (error) {
            this.logger.error(`Error updating last read for wallet ${walletId} in room ${roomId}:`, error);
            throw error;
        }
    }

    async getLastRead(walletId: number, roomId: number): Promise<Date | null> {
        try {
            const read = await this.chatReadModel.findOne({
                cr_wallet_id: walletId,
                cr_room_id: roomId
            });

            return read ? read.cr_last_read_at : null;
        } catch (error) {
            this.logger.error(`Error getting last read for wallet ${walletId} in room ${roomId}:`, error);
            throw error;
        }
    }

    async getUnreadCount(walletId: number, roomId: number): Promise<number> {
        try {
            const lastRead = await this.getLastRead(walletId, roomId);
            if (!lastRead) {
                return await this.chatHistoryModel.countDocuments({
                    ch_chat_id: roomId.toString()
                });
            }

            return await this.chatHistoryModel.countDocuments({
                ch_chat_id: roomId.toString(),
                createdAt: { $gt: lastRead }
            });
        } catch (error) {
            this.logger.error(`Error getting unread count for wallet ${walletId} in room ${roomId}:`, error);
            throw error;
        }
    }

    async markAllAsRead(walletId: number): Promise<ChatRead> {
        try {
            // Tìm chat ALL
            const allChat = await this.chatRepository.findOne({
                where: {
                    chat_option: ChatOption.ALL
                }
            });

            if (!allChat) {
                throw new Error('ALL chat not found');
            }

            // Cập nhật hoặc tạo mới chat_read
            return await this.updateLastRead(walletId, allChat.chat_id);
        } catch (error) {
            this.logger.error(`Error marking all messages as read for wallet ${walletId}:`, error);
            throw error;
        }
    }

    async markTokenAsRead(walletId: number, tokenAddress: string): Promise<ChatRead> {
        try {
            // Tìm chat token
            const tokenChat = await this.chatRepository.findOne({
                where: {
                    chat_option: ChatOption.TOKEN,
                    chat_token_address: tokenAddress
                }
            });

            if (!tokenChat) {
                throw new Error('Token chat not found');
            }

            // Cập nhật hoặc tạo mới chat_read
            return await this.updateLastRead(walletId, tokenChat.chat_id);
        } catch (error) {
            this.logger.error(`Error marking token messages as read for wallet ${walletId} and token ${tokenAddress}:`, error);
            throw error;
        }
    }

    async checkGroupAuth(groupId: number, walletId: number): Promise<{ isMaster: boolean, isMember: boolean }> {
        try {
            // Kiểm tra group tồn tại và lấy thông tin master
            const group = await this.masterGroupRepository.findOne({
                where: { 
                    mg_id: groupId,
                    mg_status: 'on'
                }
            });

            if (!group) {
                throw new Error('Group not found or not active');
            }

            // Kiểm tra quyền truy cập
            const isMaster = group.mg_master_wallet === walletId;
            
            // Nếu là master thì mặc định có quyền
            if (isMaster) {
                return { isMaster: true, isMember: false };
            }

            // Nếu không phải master, kiểm tra các điều kiện cho member
            const isMember = await this.masterGroupAuthRepository.findOne({
                where: {
                    mga_group_id: groupId,
                    mga_wallet_member: walletId,
                    mga_status: 'running'
                }
            });

            // Nếu là member, kiểm tra thêm kết nối với master
            if (isMember) {
                const masterConnect = await this.masterConnectRepository.findOne({
                    where: {
                        mc_master_wallet: group.mg_master_wallet,
                        mc_member_wallet: walletId,
                        mc_status: In(['connect', 'pause'])
                    }
                });

                if (!masterConnect) {
                    return { isMaster: false, isMember: false };
                }
            }

            return { isMaster, isMember: !!isMember };
        } catch (error) {
            this.logger.error(`Error checking group auth for group ${groupId} and wallet ${walletId}:`, error);
            throw error;
        }
    }

    async markGroupAsRead(walletId: number, groupId: number): Promise<ChatRead> {
        try {
            // Kiểm tra quyền truy cập
            const { isMaster, isMember } = await this.checkGroupAuth(groupId, walletId);
            if (!isMaster && !isMember) {
                throw new Error('You do not have permission to access this group');
            }

            // Tìm chat group
            const groupChat = await this.chatRepository.findOne({
                where: {
                    chat_option: ChatOption.GROUP,
                    chat_group_id: groupId
                }
            });

            if (!groupChat) {
                throw new Error('Group chat not found');
            }

            // Cập nhật hoặc tạo mới chat_read
            return await this.updateLastRead(walletId, groupChat.chat_id);
        } catch (error) {
            this.logger.error(`Error marking group messages as read for wallet ${walletId} and group ${groupId}:`, error);
            throw error;
        }
    }

    async uploadImageToCloudinary(file: Express.Multer.File): Promise<any> {
        try {
            return await this.cloudinaryService.uploadImage(file);
        } catch (error) {
            this.logger.error('Error uploading image to Cloudinary:', error);
            throw error;
        }
    }
}