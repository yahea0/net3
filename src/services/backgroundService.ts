export class BackgroundKeepAliveService {
  private wakeLockSentinel: any = null;
  private audioContext: AudioContext | null = null;
  private isRunning: boolean = false;
  private heartbeatTimer: any = null;

  public async activate(): Promise<boolean> {
    if (this.isRunning) return true;
    this.isRunning = true;

    // 1. طلب Web Wake Lock لمنع تعليق النظام
    try {
      if ('wakeLock' in navigator) {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          if (this.isRunning) {
            this.reacquireWakeLock();
          }
        });
      }
    } catch (e) {
      console.warn('WakeLock not granted:', e);
    }

    // 2. تفعيل نبضة الصوت الصامت لإبقاء أندرويد يقظاً حتى لو أغلقت الشاشة
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        this.startSilentAudioPulse();
      }
    } catch (err) {
      console.warn('Background Audio Tick unavailable:', err);
    }

    return true;
  }

  private async reacquireWakeLock() {
    try {
      if ('wakeLock' in navigator && this.isRunning) {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      }
    } catch {}
  }

  private startSilentAudioPulse() {
    if (!this.audioContext) return;
    
    // تشغيل ذبذبة غير مسموعة بتردد 10Hz مع حجم صوت 0.001 كل 20 ثانية لإبقاء الـ CPU في وضع العمل
    this.heartbeatTimer = setInterval(() => {
      try {
        if (this.audioContext && this.audioContext.state !== 'closed') {
          if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
          }
          const osc = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(10, this.audioContext.currentTime);
          gain.gain.setValueAtTime(0.0001, this.audioContext.currentTime);
          osc.connect(gain);
          gain.connect(this.audioContext.destination);
          osc.start();
          osc.stop(this.audioContext.currentTime + 0.1);
        }
      } catch {}
    }, 20000);
  }

  public deactivate() {
    this.isRunning = false;
    if (this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel.release();
      } catch {}
      this.wakeLockSentinel = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }
}
