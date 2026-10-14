import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { RouterCredentials } from '../types';

export class DLinkAnwebDriver {
  private credentials: RouterCredentials;
  private accessToken: string | null = null;

  constructor(creds: RouterCredentials) {
    this.credentials = creds;
  }

  public updateCredentials(creds: RouterCredentials) {
    this.credentials = creds;
    this.accessToken = null;
  }

  private async callRpc(method: string, params: any = {}): Promise<any> {
    const cpeUrl = `http://${this.credentials.gatewayIp}/cpe`;
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now()
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Referer': `http://${this.credentials.gatewayIp}/admin/index.html`
    };

    if (this.accessToken) {
      headers['DMSD-Access-Token'] = this.accessToken;
    }

    try {
      const resp: HttpResponse = await CapacitorHttp.post({
        url: cpeUrl,
        headers,
        data: payload,
        connectTimeout: 8000,
        readTimeout: 8000
      });

      if (resp.status === 401 || (resp.data && resp.data.error && resp.data.error.code === -32000)) {
        this.accessToken = null;
        const reAuthed = await this.authenticate();
        if (reAuthed) {
          headers['DMSD-Access-Token'] = this.accessToken!;
          const retryResp = await CapacitorHttp.post({
            url: cpeUrl,
            headers,
            data: payload,
            connectTimeout: 8000,
            readTimeout: 8000
          });
          return retryResp.data;
        }
      }
      return resp.data;
    } catch (e) {
      console.error(`RPC ${method} Failed:`, e);
      return null;
    }
  }

  public async authenticate(): Promise<boolean> {
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
        connectTimeout: 6000,
        readTimeout: 6000
      });

      if (resp.data && resp.data.result && resp.data.result.AccessToken) {
        this.accessToken = resp.data.result.AccessToken;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async executeWanReconnect(): Promise<boolean> {
    if (!this.accessToken) await this.authenticate();

    const res = await this.callRpc('Execute', {
      command: 'reconnect',
      path: 'Device.IP.Interface.2.'
    });

    if (!res || res.error) {
      await this.callRpc('ApplyDifference', {
        'Device.Cellular.Interface.1.Reset': true
      });
    }
    return true;
  }

  public async executeFullReboot(): Promise<boolean> {
    if (!this.accessToken) await this.authenticate();
    await this.callRpc('Reboot', {});
    return true;
  }

  // حقن الـ MTU في كيرنل راوتر DWR-921 وإجباره على التطبيق
  public async forceInjectMtu(mtuValue: number): Promise<boolean> {
    if (!this.accessToken) await this.authenticate();

    // الطريقة الأولى: كتابة كائنات TR-181 الخاصة بالواجهات الخلوية و WAN
    await this.callRpc('SetParameterValues', {
      ParameterList: [
        { ParameterName: 'Device.IP.Interface.2.MaxMTUSize', ParameterValue: String(mtuValue) },
        { ParameterName: 'Device.IP.Interface.1.MaxMTUSize', ParameterValue: String(mtuValue) },
        { ParameterName: 'Device.Cellular.AccessPoint.1.MaxMTUSize', ParameterValue: String(mtuValue) }
      ]
    });

    // الطريقة الثانية: فرض الفروقات عبر ApplyDifference لضمان كتابتها في /tmp/dmsd
    await this.callRpc('ApplyDifference', {
      'Device.IP.Interface.2.MaxMTUSize': mtuValue,
      'Device.Cellular.AccessPoint.1.MaxMTUSize': mtuValue
    });

    // حفظ الإعدادات في الذاكرة الدائمة (NVRAM) وتطبيق التغييرات
    await this.callRpc('SaveConfig', {});
    await this.callRpc('ApplyChanges', {});

    // إعادة اتصال الـ WAN لتفعيل الـ MTU الجديد فوراً
    await this.executeWanReconnect();
    return true;
  }

  // حقن الـ DNS في راوتر DWR-921
  public async forceInjectDns(primary: string, secondary: string): Promise<boolean> {
    if (!this.accessToken) await this.authenticate();

    const dnsCombined = `${primary},${secondary}`;

    // إجبار خادم DHCP المدمج في الراوتر على توزيع هذا الـ DNS لكل الأجهزة
    await this.callRpc('SetParameterValues', {
      ParameterList: [
        { ParameterName: 'Device.DHCPv4.Server.Pool.1.DNSServers', ParameterValue: dnsCombined },
        { ParameterName: 'Device.IP.Interface.2.DNSServers', ParameterValue: dnsCombined },
        { ParameterName: 'Device.DNS.Client.Server.1.DNSServer', ParameterValue: primary },
        { ParameterName: 'Device.DNS.Client.Server.2.DNSServer', ParameterValue: secondary }
      ]
    });

    await this.callRpc('ApplyDifference', {
      'Device.DHCPv4.Server.Pool.1.DNSServers': dnsCombined,
      'Device.IP.Interface.2.DNSServers': dnsCombined
    });

    await this.callRpc('SaveConfig', {});
    await this.callRpc('ApplyChanges', {});
    return true;
  }
}
