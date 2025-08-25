import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminService } from './admin.service';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);
  private isEmailSending = false; // Lock để tránh gửi trùng
  private emailLockTimeout: NodeJS.Timeout | null = null; // Timeout cho lock

  constructor(private readonly adminService: AdminService) {}

  /**
   * Tự động gửi email leaderboard vào lúc 15:00 UTC mỗi ngày
   * Cron expression: 0 15 * * * (phút giờ ngày tháng thứ)
   */
  @Cron('0 15 * * *', {
    name: 'send-leaderboard-email',
    timeZone: 'UTC'
  })
  async handleSendLeaderboardEmail() {
    // Kiểm tra lock để tránh gửi trùng
    if (this.isEmailSending) {
      this.logger.warn('⚠️ [SCHEDULED] Email sending already in progress, skipping...');
      return;
    }

    this.logger.log('🕐 [SCHEDULED] Starting daily leaderboard email sending at 15:00 UTC...');
    
    try {
      this.isEmailSending = true; // Set lock
      
      // Set timeout để tự động release lock sau 10 phút
      this.emailLockTimeout = setTimeout(() => {
        this.isEmailSending = false;
        this.logger.warn('⚠️ [SCHEDULED] Email lock timeout, releasing lock automatically');
      }, 10 * 60 * 1000); // 10 phút
      
      await this.adminService.sendScheduledLeaderboardEmail();
      this.logger.log('✅ [SCHEDULED] Daily leaderboard email task completed successfully');
    } catch (error) {
      this.logger.error(`❌ [SCHEDULED] Error in daily leaderboard email task: ${error.message}`);
    } finally {
      this.isEmailSending = false; // Release lock
      
      // Clear timeout nếu có
      if (this.emailLockTimeout) {
        clearTimeout(this.emailLockTimeout);
        this.emailLockTimeout = null;
      }
    }
  }

  /**
   * Test method để kiểm tra scheduler có hoạt động không
   * Chạy mỗi phút để test
   */
  @Cron('* * * * *', {
    name: 'test-scheduler',
    timeZone: 'UTC'
  })
  async handleTestScheduler() {
    // Chỉ log mỗi 10 phút để tránh spam logs
    const now = new Date();
    if (now.getMinutes() % 10 === 0) {
      this.logger.log(`🕐 [SCHEDULER TEST] Scheduler is running at ${now.toISOString()}`);
    }
  }

  /**
   * Kiểm tra trạng thái lock của email sending
   */
  getEmailLockStatus(): { isLocked: boolean; lockTime?: string } {
    return {
      isLocked: this.isEmailSending,
      lockTime: this.isEmailSending ? new Date().toISOString() : undefined
    };
  }
}
