import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';

enum CircuitState {
    CLOSED, // WebSocket hoạt động bình thường
    OPEN,   // WebSocket không hoạt động, sử dụng RPC
    HALF_OPEN // Đang thử lại WebSocket
}

@Injectable()
export class CircuitBreakerService {
    private readonly logger = new Logger(CircuitBreakerService.name);
    private state = CircuitState.CLOSED;
    private failureCount = 0;
    private lastFailureTime = 0;
    private readonly failureThreshold = 5;
    private readonly resetTimeout = 60000; // 1 minute
    private lastStateChangeTime = Date.now();
    private stateHistory: { state: CircuitState, timestamp: number }[] = [];

    constructor(
        private readonly eventEmitter: EventEmitter2
    ) {
        // Lắng nghe sự kiện lỗi WebSocket
        this.eventEmitter.on('websocket.error', () => {
            this.recordFailure();
        });

        // Lắng nghe sự kiện WebSocket kết nối thành công
        this.eventEmitter.on('websocket.connected', () => {
            this.reset();
        });
    }

    private recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
            this.trip();
        }
    }

    private trip() {
        this.state = CircuitState.OPEN;
        this.lastStateChangeTime = Date.now();
        this.stateHistory.push({ state: CircuitState.OPEN, timestamp: Date.now() });
        this.logger.warn('Circuit breaker tripped: Switching to RPC fallback');

        // Thông báo cho các service khác chuyển sang sử dụng RPC
        this.eventEmitter.emit('circuit.open');

        // Lên lịch thử lại sau một khoảng thời gian
        setTimeout(() => {
            this.attemptReset();
        }, this.resetTimeout);
    }

    private attemptReset() {
        if (this.state === CircuitState.OPEN) {
            this.state = CircuitState.HALF_OPEN;
            this.lastStateChangeTime = Date.now();
            this.stateHistory.push({ state: CircuitState.HALF_OPEN, timestamp: Date.now() });
            this.logger.log('Circuit breaker half-open: Attempting to use WebSocket again');

            // Thông báo cho các service thử lại WebSocket
            this.eventEmitter.emit('circuit.half-open');
        }
    }

    private reset() {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.lastStateChangeTime = Date.now();
        this.stateHistory.push({ state: CircuitState.CLOSED, timestamp: Date.now() });
        this.logger.log('Circuit breaker reset: WebSocket is operational');

        // Thông báo cho các service chuyển lại sử dụng WebSocket
        this.eventEmitter.emit('circuit.closed');
    }

    isWebSocketAvailable(): boolean {
        return this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN;
    }

    @Cron('0 */5 * * * *') // Run every 5 minutes
    logCircuitBreakerStatus() {
        const stateNames = ['CLOSED', 'OPEN', 'HALF_OPEN'];
        const stateDuration = Date.now() - this.lastStateChangeTime;

        this.logger.log(`Circuit Breaker Status: ${stateNames[this.state]}`);
        this.logger.log(`Current state duration: ${Math.floor(stateDuration / 1000 / 60)} minutes`);
        this.logger.log(`Failure count: ${this.failureCount}`);

        // Trim history to last 10 entries
        if (this.stateHistory.length > 10) {
            this.stateHistory = this.stateHistory.slice(-10);
        }

        // Log state history
        if (this.stateHistory.length > 0) {
            this.logger.log('Recent state changes:');
            for (const entry of this.stateHistory) {
                const time = new Date(entry.timestamp).toLocaleTimeString();
                this.logger.log(`- ${time}: ${stateNames[entry.state]}`);
            }
        }
    }
} 