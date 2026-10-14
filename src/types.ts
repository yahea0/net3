export type AppPage = 'radar' | 'mtu' | 'dns' | 'logs' | 'settings';

export interface RouterCredentials {
  gatewayIp: string;
  username: string;
  password: string;
  checkIntervalSec: number;
  maxFailures: number;
  autoHealEnabled: boolean;
  backgroundKeepAlive: boolean;
}

export interface NetworkPulseState {
  isOnline: boolean;
  pingMs: number;
  failureCount: number;
  lastCheckTime: Date;
  lastActionTime: Date | null;
  lastActionType: 'RECONNECT' | 'REBOOT' | 'MTU_INJECT' | 'DNS_INJECT' | 'IDLE';
  totalHeals: number;
}

export interface LogMessage {
  id: string;
  time: string;
  type: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  text: string;
}

export interface DnsBenchmarkResult {
  name: string;
  primary: string;
  secondary: string;
  latencyMs: number;
  status: 'pending' | 'testing' | 'success' | 'failed';
}

export interface MtuProbeResult {
  size: number;
  isStable: boolean;
  lossPercent: number;
}
