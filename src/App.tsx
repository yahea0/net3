import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCcw, 
  RotateCw, 
  Power, 
  Sliders, 
  Terminal, 
  Activity, 
  CheckCircle2, 
  ShieldAlert, 
  Radio 
} from 'lucide-react';
import { RouterCredentials, NetworkPulseState, LogMessage } from './types';
import { NetworkMonitorEngine } from './services/monitorEngine';

export const App: React.FC = () => {
  const [credentials, setCredentials] = useState<RouterCredentials>({
    gatewayIp: '192.168.0.1',
    username: 'admin',
    password: 'admin01',
    checkIntervalSec: 5,
    maxFailures: 3,
    autoHealEnabled: true
  });

  const [state, setState] = useState<NetworkPulseState>({
    isOnline: true,
    pingMs: 45,
    failureCount: 0,
    lastCheckTime: new Date(),
    lastActionTime: null,
    lastActionType: 'IDLE',
    totalHeals: 0
  });

  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'monitor' | 'settings' | 'logs'>('monitor');
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const engineRef = useRef<NetworkMonitorEngine | null>(null);

  useEffect(() => {
    const engine = new NetworkMonitorEngine(
      credentials,
      (newState) => setState(newState),
      (newLog) => setLogs((prev) => [newLog, ...prev.slice(0, 80)])
    );
    engine.start();
    engineRef.current = engine;

    return () => {
      engine.stop();
    };
  }, []);

  const handleManualReconnect = async () => {
    if (!engineRef.current) return;
    setIsBusy(true);
    await engineRef.current.triggerManualReconnect();
    setIsBusy(false);
  };

  const handleManualReboot = async () => {
    if (!engineRef.current) return;
    if (!window.confirm('هل تريد إعادة تشغيل راوتر D-Link بالكامل الآن؟')) return;
    setIsBusy(true);
    await engineRef.current.triggerManualReboot();
    setIsBusy(false);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (engineRef.current) {
      engineRef.current.updateConfig(credentials);
    }
    setActiveTab('monitor');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased" dir="rtl">
      {/* Header Bar */}
      <header className="px-4 py-3.5 bg-slate-900/70 backdrop-blur-md border-b border-cyan-500/20 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-teal-400 p-0.5 shadow-lg shadow-cyan-500/30 flex items-center justify-center">
            <Radio className="w-5 h-5 text-slate-950 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-300">
              NetPulse Guard
            </h1>
            <p className="text-[10px] text-slate-400">D-Link 3G Autonomous Healer</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border ${
            state.isOnline 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse'
          }`}>
            <span className={`w-2 h-2 rounded-full ${state.isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {state.isOnline ? 'الإنترنت متصل' : 'الشبكة متجمدة'}
          </div>
        </div>
      </header>

      {/* Modern Navigation Chips */}
      <div className="flex gap-2 px-4 py-3 bg-slate-900/30 border-b border-slate-800/60">
        <button
          onClick={() => setActiveTab('monitor')}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'monitor'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-black'
              : 'bg-slate-900 text-slate-400 border border-slate-800'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          رادار المراقبة
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'logs'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-black'
              : 'bg-slate-900 text-slate-400 border border-slate-800'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          السجلات ({logs.length})
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'settings'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-black'
              : 'bg-slate-900 text-slate-400 border border-slate-800'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          إعدادات الراوتر
        </button>
      </div>

      {/* Main Container */}
      <main className="flex-1 px-4 py-4 max-w-md mx-auto w-full space-y-4">
        {activeTab === 'monitor' && (
          <>
            {/* Primary Status Card */}
            <div className={`p-6 rounded-3xl border relative overflow-hidden backdrop-blur-xl transition-all ${
              state.isOnline
                ? 'bg-gradient-to-b from-slate-900/90 to-slate-950 border-emerald-500/30 shadow-2xl shadow-emerald-500/5'
                : 'bg-gradient-to-b from-rose-950/40 to-slate-950 border-rose-500/40 shadow-2xl shadow-rose-500/10'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-slate-400 tracking-wider">زمن الاستجابة (PING)</span>
                <span className="text-[11px] font-mono text-cyan-400">192.168.0.1</span>
              </div>

              <div className="flex items-baseline justify-between">
                <div className="text-5xl font-black tracking-tight text-white flex items-baseline gap-1 font-mono">
                  {state.isOnline ? state.pingMs : '0'}
                  <span className="text-sm font-normal text-slate-400">ms</span>
                </div>
                <div className={`p-4 rounded-2xl ${
                  state.isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400 animate-bounce'
                }`}>
                  {state.isOnline ? <Wifi className="w-8 h-8" /> : <WifiOff className="w-8 h-8" />}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-6 pt-4 border-t border-slate-800/80 text-xs">
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/50">
                  <span className="text-slate-400 block text-[10px]">تكرار الفشل الحالي</span>
                  <span className="text-sm font-bold text-white font-mono">{state.failureCount} / {credentials.maxFailures}</span>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/50">
                  <span className="text-slate-400 block text-[10px]">مرات الإنعاش الناجحة</span>
                  <span className="text-sm font-bold text-cyan-400 font-mono">{state.totalHeals}</span>
                </div>
              </div>
            </div>

            {/* Quick Modern Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleManualReconnect}
                disabled={isBusy}
                className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-black text-sm shadow-xl shadow-cyan-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
              >
                <RefreshCcw className={`w-5 h-5 ${isBusy ? 'animate-spin' : ''}`} />
                إعادة تشغيل الشبكة فوراً (WAN Reconnect)
              </button>

              <button
                onClick={handleManualReboot}
                disabled={isBusy}
                className="w-full py-3.5 px-4 rounded-2xl bg-slate-900/90 border border-rose-500/30 hover:border-rose-500/60 text-rose-300 font-bold text-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Power className="w-4 h-4 text-rose-400" />
                إعادة تشغيل كاملة للراوتر (Full Reboot)
              </button>
            </div>

            {/* Live Router Context Card */}
            <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>الشبكة النشطة:</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  mobile (رامي ليفي - 3G)
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>نظام الإنعاش التلقائي:</span>
                <span className={credentials.autoHealEnabled ? 'text-cyan-400 font-bold' : 'text-slate-500'}>
                  {credentials.autoHealEnabled ? 'مفعّل بالكامل' : 'متوقف مؤقتاً'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>آخر إجراء تم تنفيذه:</span>
                <span className="font-mono text-slate-200">
                  {state.lastActionTime ? `${state.lastActionType} (${state.lastActionTime.toLocaleTimeString()})` : 'لا يوجد حتى الآن'}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'logs' && (
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-2 h-[72vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-cyan-400" />
                سجل المراقبة والتحكم
              </span>
              <button 
                onClick={() => setLogs([])}
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                مسح السجل
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {logs.map((log) => (
                <div key={log.id} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/50 text-[11px] space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span className="font-mono">{log.time}</span>
                    <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] ${
                      log.type === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' :
                      log.type === 'ERROR' ? 'bg-rose-500/20 text-rose-400 font-bold' :
                      log.type === 'WARN' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {log.type}
                    </span>
                  </div>
                  <div className="text-slate-300 font-mono leading-relaxed">{log.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800/80 space-y-4">
            <h2 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5 mb-2">
              <Sliders className="w-4 h-4" />
              تكوين بيانات الدخول لراوتر D-Link
            </h2>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">عنوان IP الخاص بالراوتر</label>
              <input
                type="text"
                value={credentials.gatewayIp}
                onChange={(e) => setCredentials({ ...credentials, gatewayIp: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-cyan-400 outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">اسم المستخدم</label>
                <input
                  type="text"
                  value={credentials.username}
                  onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">كلمة المرور</label>
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">فترة الفحص (ثوانٍ)</label>
                <input
                  type="number"
                  value={credentials.checkIntervalSec}
                  onChange={(e) => setCredentials({ ...credentials, checkIntervalSec: Number(e.target.value) || 5 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">مرات الفشل قبل الإنعاش</label>
                <input
                  type="number"
                  value={credentials.maxFailures}
                  onChange={(e) => setCredentials({ ...credentials, maxFailures: Number(e.target.value) || 3 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="autoHeal"
                checked={credentials.autoHealEnabled}
                onChange={(e) => setCredentials({ ...credentials, autoHealEnabled: e.target.checked })}
                className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0"
              />
              <label htmlFor="autoHeal" className="text-xs text-slate-300 font-semibold cursor-pointer">
                تفعيل الإنعاش التلقائي فور تجمد الإنترنت
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all mt-3"
            >
              حفظ التعديلات وتفعيل المراقبة
            </button>
          </form>
        )}
      </main>
    </div>
  );
};

export default App;
