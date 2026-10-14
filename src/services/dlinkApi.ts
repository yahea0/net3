import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { RouterCredentials } from '../types';

export class DLinkAnwebDriver {
  private credentials: RouterCredentials;
  private accessToken: string | null = null;
  private sessionCookie: string | null = null;

  constructor(creds: RouterCredentials) {
    this.credentials = creds;
  }

  public updateCredentials(creds: RouterCredentials) {
    this.credentials = creds;
    this.accessToken = null;
    this.sessionCookie = null;
  }

  // الخطوة 1: تهيئة الكوكيز الأولية
  private async bootstrapCookies(): Promise<void> {
    try {
      const resp: HttpResponse = await CapacitorHttp.get({
        url: `http://${this.credentials.gatewayIp}/cookies`,
        headers: { 'Accept': '*/*' },
        connectTimeout: 5000,
        readTimeout: 5000
      });
      if (resp.headers && resp.headers['set-cookie']) {
        this.sessionCookie = resp.headers['set-cookie'];
      }
    } catch {
      // الاستمرار في المحاولة حتى لو فشل جلب الكوكيز الأولية
    }
  }

  // الخطوة 2: تسجيل الدخول وجلب التوكن (Login Handshake)
  public async authenticate(): Promise<boolean> {
    await this.bootstrapCookies();

    const loginUrl = `http://${this.credentials.gatewayIp}/login?`;
    const payload = {
      login: this.credentials.username,
      password: this.credentials.password,
      staysigned: true
    };

    try {
      const resp: HttpResponse = await CapacitorHttp.post({
        url: loginUrl,
        headers: {
          'Content-Type': 'application/json',
          'Referer': `http://${this.credentials.gatewayIp}/admin/index.html`
        },
        data: payload,
        connectTimeout: 7000,
        readTimeout: 7000
      });

      const data = resp.data;
      if (data && data.result && data.result.AccessToken) {
        this.accessToken = data.result.AccessToken;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Authentication Error:', error);
      return false;
    }
  }

  // الخطوة 3: تنفيذ أمر RECONNECT لشبكة الـ 3G المحددة (mobile)
  public async executeWanReconnect(): Promise<boolean> {
    if (!this.accessToken) {
      const authed = await this.authenticate();
      if (!authed) return false;
    }

    const cpeUrl = `http://${this.credentials.gatewayIp}/cpe`;

    // إرسال أمر تنشيط اتصال WAN المختار كما في واجهة الراوتر
    const reconnectPayload = {
      jsonrpc: "2.0",
      method: "Execute",
      params: {
        command: "reconnect",
        path: "Device.IP.Interface.2."
      },
      id: Date.now()
    };

    try {
      const resp: HttpResponse = await CapacitorHttp.post({
        url: cpeUrl,
        headers: {
          'Content-Type': 'application/json',
          'DMSD-Access-Token': this.accessToken || '',
          'Referer': `http://${this.credentials.gatewayIp}/admin/index.html`
        },
        data: reconnectPayload,
        connectTimeout: 10000,
        readTimeout: 10000
      });

      // إذا انتهت الجلسة يتم إعادة تسجيل الدخول فوراً
      if (resp.status === 401 || (resp.data && resp.data.error)) {
        this.accessToken = null;
        await this.authenticate();
        return await this.executeWanReconnect();
      }

      return resp.status === 200;
    } catch (err) {
      console.error('WAN Reconnect failed:', err);
      return false;
    }
  }

  // الخطوة 4: تنفيذ إعادة التشغيل الكاملة للراوتر (Reboot) في حال تجمد المودم
  public async executeFullReboot(): Promise<boolean> {
    if (!this.accessToken) {
      const authed = await this.authenticate();
      if (!authed) return false;
    }

    const cpeUrl = `http://${this.credentials.gatewayIp}/cpe`;
    const rebootPayload = {
      jsonrpc: "2.0",
      method: "Reboot",
      params: {},
      id: Date.now()
    };

    try {
      const resp: HttpResponse = await CapacitorHttp.post({
        url: cpeUrl,
        headers: {
          'Content-Type': 'application/json',
          'DMSD-Access-Token': this.accessToken || '',
          'Referer': `http://${this.credentials.gatewayIp}/admin/index.html`
        },
        data: rebootPayload,
        connectTimeout: 8000,
        readTimeout: 8000
      });

      return resp.status === 200;
    } catch {
      // غالباً ما يقطع الراوتر الاتصال فوراً عند إعادة التشغيل
      return true;
    }
  }
}
