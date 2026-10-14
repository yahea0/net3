import { CapacitorHttp } from '@capacitor/core';
import { DLinkAnwebDriver } from './dlinkApi';
import { BackgroundKeepAliveService } from './backgroundService';
import { RouterCredentials, NetworkPulseState, LogMessage } from '../types';

export class NetworkMonitorEngine {
  public driver: DLinkAnwebDriver;
  private creds: RouterCredentials;
  private intervalId: any = null;
  private bgService: BackgroundKeepAliveService;
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
    this.bgService = new BackgroundKeepAliveService();
    this.onStateChange = onStateChange;
    this.onLog = onLog;
  }

  public updateConfig(newCreds: RouterCredentials) {
    this.creds = newCreds;
    this.driver.updateCredentials(newCreds);
    if (newCreds.backgroundKeepAlive) {
      this.bgService.activate();
    } else {
      this.bgService.deactivate();
    }
    this.emitLog('INFO', 'تم تحديث إعدادات الراوتر وخيارات التشغيل');
  }

  public emitLog(type: LogMessage['type'], text: string) {
    const log: LogMessage = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      type,
      text
    };
    this.onLog(log);
  }

  public async pingProbe(targetUrl: string = 'http://1.1.1.1/generate_204'): Promise<{ ok: boolean; ms: number }> {
    const startTime = Date.now();
    try {
      await CapacitorHttp.get({
        url: targetUrl,
        connectTimeout: 3500,
        readTimeout: 3500
      });
      return { ok: true, ms: Date.now() - startTime };
    } catch {
      return { ok: false, ms: 0 };
    }
  }

  public async triggerManualReconnect(): Promise<void> {
    this.emitLog('WARN', 'إجراء يدوي: جاري إرسال إشارة RECONNECT لشريحة 3G...');
    const ok = await this.driver.executeWanReconnect();
    if (ok) {
      this.emitLog('SUCCESS', 'تم إرسال أمر تنشيط شبكة mobile بنجاح');
      this.state.lastActionTime = new Date();
      this.state.lastActionType = 'RECONNECT';
      this.state.totalHeals++;
      this.onStateChange({ ...this.state });
    } else {
      this.emitLog('ERROR', 'فشل في إرسال أمر RECONNECT');
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
      this.emitLog('ERROR', 'تعذر تنفيذ إعادة التشغيل');
    }
  }

  public start() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.creds.backgroundKeepAlive) {
      this.bgService.activate();
    }
    this.emitLog('INFO', `تم بدء الرادار النشط (فحص كل ${this.creds.checkIntervalSec} ثوانٍ)`);

    this.intervalId = setInterval(async () => {
      const probe = await this.pingProbe();
      this.state.lastCheckTime = new Date();
      this.state.pingMs = probe.ms;

      if (probe.ok) {
        if (!this.state.isOnline) {
          this.emitLog('SUCCESS', `عادت شبكة 3G للعمل! زمن الاستجابة: ${probe.ms}ms`);
        }
        this.state.isOnline = true;
        this.state.failureCount = 0;
      } else {
        this.state.isOnline = false;
        this.state.failureCount++;
        this.emitLog('ERROR', `تجمد الإنترنت! محاولة الفشل ${this.state.failureCount} من ${this.creds.maxFailures}`);

        if (this.creds.autoHealEnabled && this.state.failureCount >= this.creds.maxFailures) {
          this.emitLog('WARN', 'بدء التدخل التلقائي لفك تجمد شريحة رامي ليفي...');
          const reconnected = await this.driver.executeWanReconnect();
          if (reconnected) {
            this.emitLog('SUCCESS', 'تم تنفيذ بروتوكول RECONNECT بنجاح');
            this.state.lastActionTime = new Date();
            this.state.lastActionType = 'RECONNECT';
            this.state.totalHeals++;
            this.state.failureCount = 0;
          } else {
            this.emitLog('WARN', 'الـ Reconnect لم يستجب، جاري إعادة تشغيل الراوتر بالكامل...');
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
    }
    this.bgService.deactivate();
  }
}
