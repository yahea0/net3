export interface RouterCredentials {
  gatewayIp: string;
  username: string;
  password: string;
  checkIntervalSec: number;
  maxFailures: number;
  autoHealEnabled: boolean;
}

export interface NetworkPulseState {
  isOnline: boolean;
  pingMs: number;
  failureCount: number;
  lastCheckTime: Date;
  lastActionTime: Date | null;
  lastActionType: 'RECONNECT' | 'REBOOT' | 'IDLE';
  totalHeals: number;
}

export interface LogMessage {
  id: string;
  time: string;
  type: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  text: string;
}
