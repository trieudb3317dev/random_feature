import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';

export interface BirdeyeWebSocketOptions {
    onOpen?: () => void;
    onMessage?: (data: any) => void;
    onError?: (error: Error) => void;
    onClose?: () => void;
}

export class BirdeyeWebSocket {
    private ws: WebSocket | null = null;
    private readonly logger: Logger;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;
    private readonly reconnectDelay = 5000; // 5 seconds
    private isConnecting = false;
    private readonly protocol = 'echo-protocol';

    constructor(
        private readonly configService: ConfigService,
        private readonly loggerName: string,
        private readonly options: BirdeyeWebSocketOptions = {}
    ) {
        this.logger = new Logger(loggerName);
    }

    connect() {
        if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
            this.logger.debug('WebSocket is already connecting or connected');
            return;
        }

        try {
            this.isConnecting = true;
            const apiKey = this.configService.get<string>('BIRDEYE_API_KEY');
            const wsUrl = this.configService.get<string>('BIRDEYE_WS_URL');
            
            if (!apiKey) {
                this.logger.error('❌ BIRDEYE_API_KEY is not configured');
                this.isConnecting = false;
                return;
            }
            if (!wsUrl) {
                this.logger.error('❌ BIRDEYE_WS_URL is not configured');
                this.isConnecting = false;
                return;
            }

            const fullWsUrl = `${wsUrl}?x-api-key=${apiKey}`;
            this.logger.log(`🔄 Connecting to Birdeye WebSocket at ${wsUrl}`);
            this.logger.debug('🔑 Using API Key:', apiKey.substring(0, 4) + '...');
            
            this.ws = new WebSocket(fullWsUrl, 'echo-protocol', {
                headers: {
                    'Origin': 'ws://public-api.birdeye.so',
                    'Sec-WebSocket-Origin': 'ws://public-api.birdeye.so'
                }
            });

            this.logger.debug('⚙️ WebSocket configuration:', {
                url: fullWsUrl,
                protocol: 'echo-protocol',
                headers: {
                    'Origin': 'ws://public-api.birdeye.so',
                    'Sec-WebSocket-Origin': 'ws://public-api.birdeye.so'
                }
            });

            this.ws.on('open', () => {
                this.logger.log('✅ Connected to Birdeye WebSocket');
                this.logger.debug('📊 WebSocket state:', {
                    readyState: this.ws?.readyState,
                    protocol: this.ws?.protocol,
                    url: this.ws?.url
                });
                this.reconnectAttempts = 0;
                this.isConnecting = false;
                if (this.options.onOpen) {
                    this.options.onOpen();
                }
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.logger.debug(`📥 Received message from Birdeye: ${JSON.stringify(message)}`);
                    if (this.options.onMessage) {
                        this.options.onMessage(message);
                    }
                } catch (error) {
                    this.logger.error(`❌ Error parsing Birdeye message: ${error.message}`);
                    this.logger.debug('🔍 Raw message:', data.toString());
                }
            });

            this.ws.on('error', (error) => {
                this.logger.error(`❌ Birdeye WebSocket error: ${error.message}`);
                this.logger.debug('🔍 Error details:', {
                    error,
                    readyState: this.ws?.readyState,
                    url: this.ws?.url
                });
                this.isConnecting = false;
                if (this.options.onError) {
                    this.options.onError(error);
                }
            });

            this.ws.on('close', (code, reason) => {
                this.logger.warn(`⚠️ Birdeye WebSocket closed with code ${code} and reason: ${reason}`);
                this.logger.debug('🔍 Close details:', {
                    code,
                    reason,
                    readyState: this.ws?.readyState,
                    url: this.ws?.url
                });
                this.ws = null;
                this.isConnecting = false;
                this.handleReconnect();
                if (this.options.onClose) {
                    this.options.onClose();
                }
            });

        } catch (error) {
            this.logger.error(`❌ Error connecting to Birdeye WebSocket: ${error.message}`);
            this.logger.debug('🔍 Connection error details:', {
                error,
                readyState: this.ws?.readyState,
                url: this.ws?.url
            });
            this.ws = null;
            this.isConnecting = false;
            this.handleReconnect();
        }
    }

    private handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error('❌ Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        this.logger.log(`🔄 Retrying connection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.logger.debug('📊 Reconnection stats:', {
            attempts: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts,
            delay,
            readyState: this.ws?.readyState
        });
        
        setTimeout(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.connect();
            }
        }, delay);
    }

    send(data: any) {
        if (!this.ws) {
            this.logger.warn('⚠️ WebSocket not initialized');
            return;
        }

        if (this.ws.readyState !== WebSocket.OPEN) {
            this.logger.warn(`⚠️ WebSocket is not connected. Current state: ${this.ws.readyState}`);
            this.logger.debug('🔍 Connection state:', {
                readyState: this.ws.readyState,
                url: this.ws.url
            });
            return;
        }

        try {
            const message = typeof data === 'string' ? data : JSON.stringify(data);
            this.logger.debug(`📤 Sending message: ${message}`);
            this.ws.send(message);
        } catch (error) {
            this.logger.error(`❌ Error sending message: ${error.message}`);
            this.logger.debug('🔍 Send error details:', {
                error,
                readyState: this.ws.readyState,
                url: this.ws.url
            });
            if (this.options.onError) {
                this.options.onError(error);
            }
        }
    }

    disconnect() {
        if (this.ws) {
            this.logger.log('Disconnecting from Birdeye WebSocket');
            this.ws.close();
            this.ws = null;
        }
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }
} 