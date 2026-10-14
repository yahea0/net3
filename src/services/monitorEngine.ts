import { CapacitorHttp } from '@capacitor/core';
import { DLinkAnwebDriver } from './dlinkApi';
import { RouterCredentials, NetworkPulseState, LogMessage } from '../types';

export class NetworkMonitorEngine {
  private driver: DLinkAnwebDriver;
  private creds: RouterCredentials;
  private intervalId: any = null;
  private onStateChange: (state: NetworkPulseState) => void;
  private onLog: (log: LogMessage) => void;

  private state: NetworkPulseState = {
    isOnline: true,
    pingMs: 0,
    failureCount: 0,
    lastCheckTime: new Date(),
    lastActionTime: null,
    lastActionType: 'IDLE',
    totalHeals: 0
  };

  constructor(
    creds: RouterCredentials,
    onStateChange: (state: NetworkPulseState) => void,
    onLog: (log: LogMessage) => void
  ) {
    this.creds = creds;
    this.driver = new DLinkAnwebDriver(creds);
    this.onStateChange = onStateChange;
    this.onLog = onLog;
  }

  public updateConfig(newCreds: RouterCredentials) {
    this.creds = newCreds;
    this.driver.updateCredentials(newCreds);
    this.emitLog('INFO', 'تم تحديث بيانات الراوتر وسياسة المراقبة');
  }

  private emitLog(type: LogMessage['type'], text: string) {
    const log: LogMessage = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      type,
      text
    };
    this.onLog(log);
  }

  private async pingProbe(): Promise<{ ok: boolean; ms: number }> {
    const startTime = Date.now();
    try {
      // فحص أسرع نقطة استجابة عالمية عبر HTTP HEAD
      await CapacitorHttp.get({
        url: 'http://1.1.1.1/generate_204',
        connectTimeout: 3500,
        readTimeout: 3500
      });
      return { ok: true, ms: Date.now() - startTime };
    } catch {
      return { ok: false, ms: 0 };
    }
  }

  public async triggerManualReconnect(): Promise<void> {
    this.emitLog('WARN', 'إجراء يدوي: جاري إرسال إشارة RECONNECT للراوتر...');
    const ok = await this.driver.executeWanReconnect();
    if (ok) {
      this.emitLog('SUCCESS', 'تم تنفيذ إعادة اتصال شبكة 3G (mobile) بنجاح');
      this.state.lastActionTime = new Date();
      this.state.lastActionType = 'RECONNECT';
      this.state.totalHeals++;
      this.onStateChange({ ...this.state });
    } else {
      this.emitLog('ERROR', 'فشل في إرسال أمر RECONNECT للراوتر');
    }
  }

  public async triggerManualReboot(): Promise<void> {
    this.emitLog('WARN', 'إجراء يدوي: جاري تنفيذ إعادة التشغيل الكاملة للراوتر...');
    const ok = await this.driver.executeFullReboot();
    if (ok) {
      this.emitLog('SUCCESS', 'تم إرسال أمر إعادة تشغيل الراوتر بنجاح');
      this.state.lastActionTime = new Date();
      this.state.lastActionType = 'REBOOT';
      this.state.totalHeals++;
      this.onStateChange({ ...this.state });
    } else {
      this.emitLog('ERROR', 'تعذر تنفيذ إعادة التشغيل الكاملة');
    }
  }

  public start() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.emitLog('INFO', `بدأ رادار المراقبة (فحص كل ${this.creds.checkIntervalSec} ثوانٍ)`);

    this.intervalId = setInterval(async () => {
      const probe = await this.pingProbe();
      this.state.lastCheckTime = new Date();
      this.state.pingMs = probe.ms;

      if (probe.ok) {
        if (!this.state.isOnline) {
          this.emitLog('SUCCESS', `عادت خدمة الإنترنت للعمل! سرعة الاستجابة: ${probe.ms}ms`);
        }
        this.state.isOnline = true;
        this.state.failureCount = 0;
      } else {
        this.state.isOnline = false;
        this.state.failureCount++;
        this.emitLog('ERROR', `انقطاع اتصال 3G! محاولات الفشل: ${this.state.failureCount}/${this.creds.maxFailures}`);

        if (this.creds.autoHealEnabled && this.state.failureCount >= this.creds.maxFailures) {
          this.emitLog('WARN', 'بدء بروتوكول الإنعاش التلقائي لشبكة رامي ليفي (3G)...');
          
          // المحاولة الأولى: RECONNECT سريع لشبكة mobile
          const reconnected = await this.driver.executeWanReconnect();
          if (reconnected) {
            this.emitLog('SUCCESS', 'تم تنفيذ بروتوكول RECONNECT التلقائي بنجاح');
            this.state.lastActionTime = new Date();
            this.state.lastActionType = 'RECONNECT';
            this.state.totalHeals++;
            this.state.failureCount = 0;
          } else {
            // المحاولة الثانية: في حال عدم استجابة الـ WAN، يتم طلب إعادة تشغيل كاملة
            this.emitLog('WARN', 'لم ينجح الـ Reconnect، جاري تفعيل إعادة التشغيل الكاملة (Reboot)...');
            await this.driver.executeFullReboot();
            this.state.lastActionTime = new Date();
            this.state.lastActionType = 'REBOOT';
            this.state.totalHeals++;
            this.state.failureCount = 0;
          }
        }
      }
      this.onStateChange({ ...this.state });
    }, this.creds.checkIntervalSec * 1000);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.emitLog('WARN', 'تم إيقاف المراقبة التلقائية');
    }
  }
}
