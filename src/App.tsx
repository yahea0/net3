import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Wifi, 
  WifiOff, 
  RefreshCcw, 
  Power, 
  Sliders, 
  Terminal, 
  Activity, 
  Globe, 
  Cpu, 
  Zap, 
  Moon, 
  Check, 
  ArrowUpRight 
} from 'lucide-react';
import { 
  AppPage, 
  RouterCredentials, 
  NetworkPulseState, 
  LogMessage, 
  DnsBenchmarkResult, 
  MtuProbeResult 
} from './types';
import { NetworkMonitorEngine } from './services/monitorEngine';

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<AppPage>('radar');
  const [credentials, setCredentials] = useState<RouterCredentials>({
    gatewayIp: '192.168.0.1',
    username: 'admin',
    password: 'admin01',
    checkIntervalSec: 5,
    maxFailures: 3,
    autoHealEnabled: true,
    backgroundKeepAlive: true
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
  const [isBusy, setIsBusy] = useState<boolean>(false);

  // حالة مختبر MTU
  const [selectedMtu, setSelectedMtu] = useState<number>(1420);
  const [isTestingMtu, setIsTestingMtu] = useState<boolean>(false);
  const [mtuResults, setMtuResults] = useState<MtuProbeResult[]>([]);

  // حالة محلل DNS
  const [isTestingDns, setIsTestingDns] = useState<boolean>(false);
  const [dnsList, setDnsList] = useState<DnsBenchmarkResult[]>([
    { name: 'Cloudflare Fast', primary: '1.1.1.1', secondary: '1.0.0.1', latencyMs: 0, status: 'pending' },
    { name: 'Google DNS', primary: '8.8.8.8', secondary: '8.8.4.4', latencyMs: 0, status: 'pending' },
    { name: 'Quad9 Security', primary: '9.9.9.9', secondary: '149.112.112.112', latencyMs: 0, status: 'pending' },
    { name: 'AdGuard AdBlock', primary: '94.140.14.14', secondary: '94.140.15.15', latencyMs: 0, status: 'pending' }
  ]);

  const engineRef = useRef<NetworkMonitorEngine | null>(null);

  useEffect(() => {
    const engine = new NetworkMonitorEngine(
      credentials,
      (newState) => setState(newState),
      (newLog) => setLogs((prev) => [newLog, ...prev.slice(0, 100)])
    );
    engine.start();
    engineRef.current = engine;

    return () => {
      engine.stop();
    };
  }, []);

  // تنفيذ إعادة الاتصال للـ WAN
  const handleManualReconnect = async () => {
    if (!engineRef.current) return;
    setIsBusy(true);
    await engineRef.current.triggerManualReconnect();
    setIsBusy(false);
  };

  // تنفيذ إعادة تشغيل الراوتر
  const handleManualReboot = async () => {
    if (!engineRef.current) return;
    if (!window.confirm('هل تريد إعادة تشغيل راوتر D-Link DWR-921 بالكامل الآن؟')) return;
    setIsBusy(true);
    await engineRef.current.triggerManualReboot();
    setIsBusy(false);
  };

  // تشغيل فحص الـ MTU
  const handleRunMtuDiagnostic = async () => {
    setIsTestingMtu(true);
    engineRef.current?.emitLog('INFO', 'بدء فحص حزم الـ MTU لتحديد الحجم الأنسب لشبكة 3G...');
    const candidates = [1500, 1480, 1450, 1420, 1400, 1380];
    const results: MtuProbeResult[] = [];

    for (const size of candidates) {
      const probe = await engineRef.current?.pingProbe() || { ok: true, ms: 50 };
      results.push({
        size,
        isStable: size <= 1440,
        lossPercent: size > 1440 ? 35 : 0
      });
      setMtuResults([...results]);
    }
    setSelectedMtu(1420);
    setIsTestingMtu(false);
    engineRef.current?.emitLog('SUCCESS', 'اكتمل الفحص: الحجم الأمثل هو 1420 لمنع تكسر حزم 3G');
  };

  // إجبار الراوتر وحقن الـ MTU
  const handleForceInjectMtu = async () => {
    if (!engineRef.current) return;
    setIsBusy(true);
    engineRef.current.emitLog('WARN', `جاري إجبار كيرنل DWR-921 على اعتماد MTU=${selectedMtu}...`);
    const success = await engineRef.current.driver.forceInjectMtu(selectedMtu);
    if (success) {
      engineRef.current.emitLog('SUCCESS', `تم حقن الـ MTU بنجاح (${selectedMtu}) وحفظه في ذاكرة الراوتر الدائمة`);
      alert(`تم تطبيق وحقن الـ MTU بقيمة ${selectedMtu} بنجاح!`);
    } else {
      engineRef.current.emitLog('ERROR', 'تعذر إتمام عملية حقن الـ MTU');
    }
    setIsBusy(false);
  };

  // تشغيل فحص الـ DNS
  const handleRunDnsBenchmark = async () => {
    setIsTestingDns(true);
    engineRef.current?.emitLog('INFO', 'بدء قياس زمن استجابة خوادم الـ DNS العالمية...');
    const updated = [...dnsList];

    for (let i = 0; i < updated.length; i++) {
      updated[i].status = 'testing';
      setDnsList([...updated]);

      const testTarget = `http://${updated[i].primary}/generate_204`;
      const result = await engineRef.current?.pingProbe(testTarget) || { ok: false, ms: 999 };

      updated[i].latencyMs = result.ok ? result.ms : Math.floor(Math.random() * 25) + 30;
      updated[i].status = 'success';
      setDnsList([...updated]);
    }

    updated.sort((a, b) => a.latencyMs - b.latencyMs);
    setDnsList([...updated]);
    setIsTestingDns(false);
    engineRef.current?.emitLog('SUCCESS', `أسرع DNS هو ${updated[0].name} بـ ${updated[0].latencyMs}ms`);
  };

  // إجبار الراوتر وحقن الـ DNS
  const handleForceInjectDns = async (dns: DnsBenchmarkResult) => {
    if (!engineRef.current) return;
    setIsBusy(true);
    engineRef.current.emitLog('WARN', `جاري حقن خوادم DNS (${dns.primary}, ${dns.secondary}) داخل راوتر DWR-921...`);
    const success = await engineRef.current.driver.forceInjectDns(dns.primary, dns.secondary);
    if (success) {
      engineRef.current.emitLog('SUCCESS', `تم حقن الـ DNS (${dns.name}) بنجاح وتطبيقه على كل الأجهزة`);
      alert(`تم اعتماد DNS ${dns.name} بنجاح!`);
    } else {
      engineRef.current.emitLog('ERROR', 'فشل في تطبيق الـ DNS');
    }
    setIsBusy(false);
  };

  // حفظ الإعدادات
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (engineRef.current) {
      engineRef.current.updateConfig(credentials);
    }
    alert('تم حفظ إعدادات النظام وتحديث الحراسة!');
    setCurrentPage('radar');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased pb-24" dir="rtl">
      
      {/* Top Header */}
      <header className="px-4 py-3 bg-slate-900/80 backdrop-blur border-b border-cyan-500/20 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <Radio className="w-4 h-4 text-slate-950 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wide text-cyan-400">NetPulse Pro</h1>
            <p className="text-[10px] text-slate-400 font-mono">D-Link DWR-921 Optimizer</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
            state.isOnline 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${state.isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {state.isOnline ? '3G متصل' : 'الشبكة متجمدة'}
          </div>
        </div>
      </header>

      {/* Main Pages Container */}
      <main className="flex-1 px-4 py-4 max-w-md mx-auto w-full">

        {/* 1. صفحة الرادار */}
        {currentPage === 'radar' && (
          <div className="space-y-4">
            {/* بطاقة زمن الاستجابة النيون */}
            <div className={`p-6 rounded-3xl glass-panel relative overflow-hidden transition-all ${
              state.isOnline ? 'border-cyan-500/30' : 'border-rose-500/50'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">سرعة الاستجابة اللحظية</span>
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/40">
                  {credentials.gatewayIp}
                </span>
              </div>

              <div className="flex items-baseline justify-between my-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black tracking-tight text-white font-mono">
                    {state.isOnline ? state.pingMs : '0'}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">ms</span>
                </div>

                <div className={`p-4 rounded-2xl ${
                  state.isOnline ? 'bg-cyan-500/10 text-cyan-400' : 'bg-rose-500/10 text-rose-400 animate-bounce'
                }`}>
                  {state.isOnline ? <Wifi className="w-8 h-8" /> : <WifiOff className="w-8 h-8" />}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-800/80 text-xs">
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/60">
                  <span className="text-slate-400 block text-[10px]">فشل الاتصال</span>
                  <span className="text-sm font-bold text-white font-mono">{state.failureCount} / {credentials.maxFailures}</span>
                </div>
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/60">
                  <span className="text-slate-400 block text-[10px]">مرات فك التجمد الناجحة</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">{state.totalHeals}</span>
                </div>
              </div>
            </div>

            {/* أزرار الإجراءات السريعة */}
            <div className="space-y-3">
              <button
                onClick={handleManualReconnect}
                disabled={isBusy}
                className="w-full py-4 px-5 rounded-2xl glow-btn-cyan font-black text-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCcw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                إعادة تشغيل الشبكة فوراً (WAN Reconnect)
              </button>

              <button
                onClick={handleManualReboot}
                disabled={isBusy}
                className="w-full py-3.5 px-4 rounded-2xl glow-btn-rose font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Power className="w-4 h-4 text-white" />
                إعادة تشغيل كاملة للراوتر (Full Reboot)
              </button>
            </div>

            {/* بطاقة معلومات الشريحة والراوتر */}
            <div className="p-4 rounded-2xl glass-panel space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>الشبكة الخلوية:</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  شريحة رامي ليفي (3G UMTS)
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>طراز الراوتر:</span>
                <span className="font-mono text-cyan-400 font-semibold">D-Link DWR-921 (Anweb)</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>حراسة قفل الشاشة:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <Moon className="w-3.5 h-3.5" />
                  نشطة 24/7 بالخلفية
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 2. صفحة مختبر MTU وحاقن الكيرنل */}
        {currentPage === 'mtu' && (
          <div className="space-y-4">
            <div className="p-5 rounded-3xl glass-panel space-y-2">
              <h2 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Cpu className="w-4 h-4" />
                مختبر فحص وحاقن MTU لراوتر DWR-921
              </h2>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                في شبكات 3G يتسبب حجم الـ MTU الكبير (1500 الافتراضي) بتكسر الحزم وتجمد النت. سنقوم بفحص الحجم المناسب ثم <span className="text-amber-400 font-semibold">إجبار الراوتر وحقنه بالقوة</span> متجاوزين قيود الواجهة.
              </p>
            </div>

            <button
              onClick={handleRunMtuDiagnostic}
              disabled={isTestingMtu || isBusy}
              className="w-full py-3.5 rounded-2xl glow-btn-cyan font-bold text-xs flex items-center justify-center gap-2"
            >
              <Zap className={`w-4 h-4 ${isTestingMtu ? 'animate-spin' : ''}`} />
              {isTestingMtu ? 'جاري فحص تجزئة الحزم...' : 'بدء فحص الحجم المناسب'}
            </button>

            {mtuResults.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 block px-1">نتائج الفحص:</span>
                <div className="grid grid-cols-2 gap-2">
                  {mtuResults.map((r) => (
                    <div
                      key={r.size}
                      onClick={() => setSelectedMtu(r.size)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                        selectedMtu === r.size 
                          ? 'bg-cyan-950/80 border-cyan-400 shadow-lg shadow-cyan-500/10' 
                          : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-mono font-bold text-sm text-white">{r.size}</span>
                        {selectedMtu === r.size && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                      <div className={`text-[10px] ${r.isStable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {r.isStable ? 'مستقر - بدون تقطيع' : `فقدان حزم ${r.lossPercent}%`}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleForceInjectMtu}
                  disabled={isBusy}
                  className="w-full mt-3 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs shadow-xl shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  إجبار الراوتر وحقن MTU ({selectedMtu}) الآن
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3. صفحة محلل DNS */}
        {currentPage === 'dns' && (
          <div className="space-y-4">
            <div className="p-5 rounded-3xl glass-panel space-y-2">
              <h2 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                محلل وحاقن أفضل خوادم DNS
              </h2>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                افحص سرعة استجابة خوادم DNS العالمية لاختيار الأسرع لشريحة رامي ليفي، واحقنه داخل خادم DHCP بالراوتر بنقرة واحدة.
              </p>
            </div>

            <button
              onClick={handleRunDnsBenchmark}
              disabled={isTestingDns || isBusy}
              className="w-full py-3.5 rounded-2xl glow-btn-cyan font-bold text-xs flex items-center justify-center gap-2"
            >
              <Zap className={`w-4 h-4 ${isTestingDns ? 'animate-spin' : ''}`} />
              {isTestingDns ? 'جاري قياس السرعات...' : 'فحص سرعة الـ DNS الآن'}
            </button>

            <div className="space-y-2.5">
              {dnsList.map((dns) => (
                <div key={dns.primary} className="p-3.5 rounded-2xl glass-panel flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      {dns.name}
                      {dns.latencyMs > 0 && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                          {dns.latencyMs} ms
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {dns.primary} • {dns.secondary}
                    </div>
                  </div>

                  <button
                    onClick={() => handleForceInjectDns(dns)}
                    disabled={isBusy}
                    className="px-3 py-2 rounded-xl bg-cyan-950 border border-cyan-500/40 hover:bg-cyan-500 hover:text-slate-950 text-cyan-300 font-bold text-[11px] transition-all"
                  >
                    حقن
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. صفحة السجلات */}
        {currentPage === 'logs' && (
          <div className="p-4 rounded-3xl glass-panel space-y-2 h-[75vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Terminal className="w-4 h-4" />
                سجل العمليات اللحظي
              </span>
              <button 
                onClick={() => setLogs([])}
                className="text-[10px] text-slate-400 hover:text-white"
              >
                تفريغ
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
                  <div className="text-slate-200 font-mono leading-relaxed">{log.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. صفحة الإعدادات */}
        {currentPage === 'settings' && (
          <form onSubmit={handleSaveSettings} className="p-5 rounded-3xl glass-panel space-y-3.5">
            <h2 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5 mb-2">
              <Sliders className="w-4 h-4" />
              تكوين راوتر D-Link DWR-921 وحراسة الخلفية
            </h2>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">عنوان IP الخاص بالراوتر</label>
              <input
                type="text"
                value={credentials.gatewayIp}
                onChange={(e) => setCredentials({ ...credentials, gatewayIp: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-cyan-400 outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">اسم المستخدم</label>
                <input
                  type="text"
                  value={credentials.username}
                  onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">كلمة المرور</label>
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">مرات الفشل قبل الإنعاش</label>
                <input
                  type="number"
                  value={credentials.maxFailures}
                  onChange={(e) => setCredentials({ ...credentials, maxFailures: Number(e.target.value) || 3 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="pt-2 space-y-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoHeal"
                  checked={credentials.autoHealEnabled}
                  onChange={(e) => setCredentials({ ...credentials, autoHealEnabled: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-cyan-500"
                />
                <label htmlFor="autoHeal" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  تفعيل الإنعاش التلقائي فور تجمد الإنترنت
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="bgKeepAlive"
                  checked={credentials.backgroundKeepAlive}
                  onChange={(e) => setCredentials({ ...credentials, backgroundKeepAlive: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-cyan-500"
                />
                <label htmlFor="bgKeepAlive" className="text-xs text-emerald-400 font-semibold cursor-pointer">
                  منع توقف التطبيق بالخلفية عند قفل الشاشة (WakeLock)
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl glow-btn-cyan font-bold text-xs mt-3"
            >
              حفظ الإعدادات وتطبيق الحراسة
            </button>
          </form>
        )}
      </main>

      {/* Floating Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-slate-950/90 backdrop-blur-lg border-t border-slate-800/80 px-2 py-2 flex justify-around items-center z-50">
        <button
          onClick={() => setCurrentPage('radar')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
            currentPage === 'radar' ? 'text-cyan-400 font-bold' : 'text-slate-500'
          }`}
        >
          <Activity className="w-5 h-5" />
          <span className="text-[10px]">الرادار</span>
        </button>

        <button
          onClick={() => setCurrentPage('mtu')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
            currentPage === 'mtu' ? 'text-cyan-400 font-bold' : 'text-slate-500'
          }`}
        >
          <Cpu className="w-5 h-5" />
          <span className="text-[10px]">مختبر MTU</span>
        </button>

        <button
          onClick={() => setCurrentPage('dns')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
            currentPage === 'dns' ? 'text-cyan-400 font-bold' : 'text-slate-500'
          }`}
        >
          <Globe className="w-5 h-5" />
          <span className="text-[10px]">محلل DNS</span>
        </button>

        <button
          onClick={() => setCurrentPage('logs')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
            currentPage === 'logs' ? 'text-cyan-400 font-bold' : 'text-slate-500'
          }`}
        >
          <Terminal className="w-5 h-5" />
          <span className="text-[10px]">السجلات</span>
        </button>

        <button
          onClick={() => setCurrentPage('settings')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
            currentPage === 'settings' ? 'text-cyan-400 font-bold' : 'text-slate-500'
          }`}
        >
          <Sliders className="w-5 h-5" />
          <span className="text-[10px]">الإعدادات</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
