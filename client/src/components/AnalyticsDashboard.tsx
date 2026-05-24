import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Users,
  MessageSquare,
  TrendingUp,
  UserCheck,
  Calendar,
  AlertCircle,
  Loader2,
  ServerCrash,
  Activity,
  Lock,
  Zap,
  Smartphone,
  Bot,
  Clock,
  CalendarCheck
} from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';
import ResponseTimeAudit from './ResponseTimeAudit';
import { colorForAccount, hexForAccount, AccountInfo } from '../utils/accountColors';

// Tipos del payload devuelto por GET /api/analytics
interface AccountStat {
  id: string;
  name: string;
  totalMessages: number;
  totalContacts: number;
  totalAppointments: number;
  percentBot: number;
  avgResponseTimeMin: number | null;
  incidents?: { count: number; total: number; percentage: number };
}
interface ActivityByAccountEntry {
  date: string;
  label: string;
  counts: Record<string, number>;
}
interface ActivityEntry { date: string; label: string; count: number; }

interface AnalyticsDashboardProps {
  // Filtro inicial heredado del Sidebar (App.tsx) para que abrir Analíticas
  // refleje la línea que el usuario tenía seleccionada en el listado. El
  // dashboard sigue siendo independiente — se puede cambiar dentro sin
  // afectar al Sidebar.
  initialAccountId?: string | null;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ initialAccountId }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [data, setData] = useState<any>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingData, setMissingData] = useState(false);

  // Pestañas: 'general' (analíticas existentes) | 'audit' (módulo premium)
  const [activeTab, setActiveTab] = useState<'general' | 'audit'>('general');

  // Filtro por línea de WhatsApp. null = todas; string = id de la cuenta.
  // Inicializa con el filtro del Sidebar si se pasó.
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(initialAccountId || null);

  // Estado de las features premium
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  const auditEnabled = features ? !!features.feature_response_audit : null;

  useEffect(() => {
    // Cargar features premium
    fetch(`${API_URL}/features`)
      .then(r => r.json())
      .then(f => setFeatures(f || {}))
      .catch(() => setFeatures({}));

    // Cargar lista de cuentas para el selector
    fetch(`${API_URL}/accounts`)
      .then(r => r.ok ? r.json() : [])
      .then((arr: AccountInfo[]) => Array.isArray(arr) ? setAccounts(arr) : setAccounts([]))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/analytics`)
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Error al cargar datos");
        return json;
      })
      .then(d => {
        if (!d || !d.kpis) {
          setMissingData(true);
        } else {
          setData(d);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching analytics:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // --- Derivar datos según filtro de cuenta ---
  const accountStats: AccountStat[] = useMemo(() => Array.isArray(data?.accounts) ? data.accounts : [], [data]);
  const activityByAccount: ActivityByAccountEntry[] = useMemo(() => Array.isArray(data?.activityByAccount) ? data.activityByAccount : [], [data]);
  const activityGlobal: ActivityEntry[] = useMemo(() => Array.isArray(data?.activity) ? data.activity : [], [data]);
  const multiAccount = accounts.length > 1;
  const selectedAccount = useMemo(() => accountStats.find(a => a.id === selectedAccountId), [accountStats, selectedAccountId]);

  // KPIs adaptados al filtro. Cuando filtras por cuenta, sustituimos los
  // valores globales por los de esa cuenta concreta (mensajes/contactos/citas).
  // newLeads se mantiene global porque el backend no lo desglosa por cuenta
  // (lead = status='Nuevo', y un mismo contacto solo tiene un origen).
  const totalAppointmentsAll = useMemo(() => accountStats.reduce((s, a) => s + (a.totalAppointments || 0), 0), [accountStats]);
  const displayKpis = useMemo(() => {
    if (!data) return { totalMessages: 0, totalContacts: 0, newLeads: 0, totalAppointments: 0 };
    if (selectedAccount) {
      return {
        totalMessages: selectedAccount.totalMessages,
        totalContacts: selectedAccount.totalContacts,
        newLeads: data.kpis.newLeads,
        totalAppointments: selectedAccount.totalAppointments
      };
    }
    return {
      totalMessages: data.kpis.totalMessages,
      totalContacts: data.kpis.totalContacts,
      newLeads: data.kpis.newLeads,
      totalAppointments: totalAppointmentsAll
    };
  }, [data, selectedAccount, totalAppointmentsAll]);

  // Datos de la gráfica de 7 días. Si hay cuenta seleccionada, una sola serie.
  // Si no, multi-serie (una línea/grupo de barras por cuenta) usando
  // activityByAccount cuando esté disponible.
  const chartActivity: ActivityEntry[] = useMemo(() => {
    if (selectedAccount) {
      // Si hay filtro de cuenta, devolvemos SIEMPRE valores específicos de esa
      // cuenta (incluso si están a cero). Si no hay activityByAccount aún,
      // generamos un array de 7 días vacíos basado en activityGlobal — NO
      // caemos al global, que mostraría los datos de TODAS las cuentas
      // etiquetados como si fueran de la elegida.
      if (activityByAccount.length > 0) {
        return activityByAccount.map(d => ({ date: d.date, label: d.label, count: d.counts[selectedAccount.id] || 0 }));
      }
      return activityGlobal.map(d => ({ ...d, count: 0 }));
    }
    return activityGlobal;
  }, [selectedAccount, activityByAccount, activityGlobal]);

  // --- Renderizado de Estados ---

  const TabsBar = () => (
    <div className={`flex gap-1 mb-6 p-1 rounded-xl max-w-2xl mx-auto ${isDark ? 'bg-slate-800/60 border border-slate-700' : 'bg-slate-100 border border-slate-200'}`}>
      <button
        onClick={() => setActiveTab('general')}
        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === 'general' ? (isDark ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-800 shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
      >
        <BarChart3 size={16} /> General
      </button>
      <button
        onClick={() => setActiveTab('audit')}
        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === 'audit' ? (isDark ? 'bg-amber-600 text-white shadow-lg' : 'bg-white text-slate-800 shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
      >
        {auditEnabled ? <Activity size={16} /> : <Lock size={14} />}
        Auditoría de respuesta
        {auditEnabled === false && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'audit' ? 'bg-amber-200 text-amber-800' : (isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700')}`}>PRO</span>}
      </button>
    </div>
  );

  if (activeTab === 'audit') {
    return (
      <div className="max-w-6xl mx-auto pb-10">
        <TabsBar />
        <ResponseTimeAudit isFeatureEnabled={auditEnabled} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto pb-10">
        <TabsBar />
        <div className="w-full h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="animate-spin" size={32} />
          <p className="text-sm font-medium">Calculando métricas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto pb-10">
        <TabsBar />
        <div className={`w-full p-8 flex flex-col items-center justify-center text-center rounded-2xl border ${isDark ? 'glass-panel border-red-500/20' : 'bg-red-50 border-red-100'}`}>
          <AlertCircle className="text-red-400 mb-3" size={48} />
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>Error de conexión</h3>
          <p className={`text-sm mt-1 max-w-md ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>{error}</p>
          <button onClick={() => window.location.reload()} className={`mt-4 px-4 py-2 rounded-lg text-sm font-bold transition ${isDark ? 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Reintentar</button>
        </div>
      </div>
    );
  }

  if (missingData) {
    return (
      <div className="max-w-6xl mx-auto pb-10">
        <TabsBar />
        <div className={`w-full p-8 flex flex-col items-center justify-center text-center rounded-2xl border ${isDark ? 'glass-panel border-yellow-500/20' : 'bg-yellow-50 border-yellow-100'}`}>
          <ServerCrash className="text-yellow-500 mb-3" size={48} />
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>Falta Lógica en el Servidor</h3>
          <p className={`text-sm mt-2 max-w-md ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            La ruta <code>/api/analytics</code> existe pero devuelve datos vacíos.
            <br />Probablemente copiaste una versión resumida del archivo <code>index.ts</code>.
          </p>
          <p className="text-xs text-slate-400 mt-4">Copia y pega el bloque de código de Analíticas en tu servidor.</p>
        </div>
      </div>
    );
  }

  const agents = data?.agents || [];
  const statuses = data?.statuses || [];
  const incidents = data?.incidents || { monthLabel: '', count: 0, total: 0, percentage: 0 };

  // Escalar gráfica
  const maxActivity = Math.max(...(chartActivity.map(d => d.count) || [0]), 1);
  // Para multi-serie (sin filtro): máximo entre todos los días sumando todas las cuentas
  const maxActivityStacked = Math.max(
    ...activityByAccount.map(d => Object.values(d.counts).reduce((s, n) => s + (n || 0), 0)),
    1
  );

  const formatMinutes = (m: number | null) => {
    if (m === null || m === undefined) return '—';
    if (m < 1) return '< 1 min';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h} h` : `${h}h ${rem}min`;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">

      <TabsBar />

      {/* Header + selector de línea (si hay más de una) */}
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3">
          <div>
            <h1 className={`text-2xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
              <BarChart3 className="text-indigo-600" /> Dashboard de Rendimiento
            </h1>
            <p className={`mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Resumen de actividad de los últimos 7 días{selectedAccount ? ` · línea ${selectedAccount.name}` : (multiAccount ? ' · todas las líneas' : '')}.
            </p>
          </div>
          {multiAccount && (
            <div className={`flex flex-wrap gap-1 p-1 rounded-xl ${isDark ? 'bg-slate-800/60 border border-slate-700' : 'bg-slate-100 border border-slate-200'}`}>
              <button
                onClick={() => setSelectedAccountId(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${selectedAccountId === null
                  ? (isDark ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-800 shadow-sm')
                  : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
              >
                Todas
              </button>
              {accounts.map(acc => {
                const col = colorForAccount(acc.id);
                const isActive = selectedAccountId === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => setSelectedAccountId(acc.id)}
                    style={isActive ? { backgroundColor: col.hex, color: 'white' } : { borderLeft: `3px solid ${col.hex}` }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${isActive ? 'shadow' : (isDark ? 'text-slate-300 hover:text-white bg-slate-700/40' : 'text-slate-700 hover:text-slate-900 bg-white')}`}
                    title={`Filtrar por ${acc.name}`}
                  >
                    <Smartphone size={11} /> {acc.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* KPIs Cards (4 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><MessageSquare size={24} /></div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{selectedAccount ? `Mensajes · ${selectedAccount.name}` : 'Total Mensajes'}</p>
            <h3 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{displayKpis.totalMessages}</h3>
          </div>
        </div>

        <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-50 text-purple-600'}`}><Users size={24} /></div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{selectedAccount ? `Contactos · ${selectedAccount.name}` : 'Contactos Totales'}</p>
            <h3 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{displayKpis.totalContacts}</h3>
          </div>
        </div>

        <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-50 text-green-600'}`}>
            {selectedAccount ? <CalendarCheck size={24} /> : <TrendingUp size={24} />}
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
              {selectedAccount ? 'Citas Reservadas' : 'Nuevos Leads'}
            </p>
            <h3 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
              {selectedAccount ? displayKpis.totalAppointments : displayKpis.newLeads}
            </h3>
          </div>
        </div>

        {/* 4ª card cambia según contexto: filtro=Todas → Incidentes (igual que antes);
            filtrado → % de Laura (más útil cuando estás viendo una línea concreta). */}
        {selectedAccount ? (
          <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
            <div className={`p-3 rounded-xl ${isDark ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}><Bot size={24} /></div>
            <div className="min-w-0">
              <p className={`text-xs font-bold uppercase tracking-wider truncate ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                Respuestas de Laura
              </p>
              <h3 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                {selectedAccount.percentBot}%
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                <Clock size={10} /> Resp. media: {formatMinutes(selectedAccount.avgResponseTimeMin)}
              </p>
            </div>
          </div>
        ) : (
          <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
            <div className={`p-3 rounded-xl ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-600'}`}><Zap size={24} /></div>
            <div className="min-w-0">
              <p className={`text-xs font-bold uppercase tracking-wider truncate ${isDark ? 'text-slate-400' : 'text-slate-400'}`} title={incidents.monthLabel}>
                Incidentes{incidents.monthLabel ? ` · ${incidents.monthLabel}` : ''}
              </p>
              <h3 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                {incidents.count}
                <span className="text-base font-bold text-amber-500 ml-2">{incidents.percentage}%</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">de {incidents.total} citas reservadas</p>
            </div>
          </div>
        )}
      </div>

      {/* Gráfico de Barras (7 días) — simple cuando hay cuenta filtrada, apilado por línea cuando "Todas" */}
      <div className={`p-6 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h3 className={`font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-700'}`}>
            <Calendar size={18} className="text-slate-400" /> Mensajes últimos 7 días
            {selectedAccount && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ backgroundColor: hexForAccount(selectedAccount.id) + '22', color: hexForAccount(selectedAccount.id) }}
              >
                {selectedAccount.name}
              </span>
            )}
          </h3>
          {!selectedAccount && multiAccount && (
            <div className="flex items-center gap-3 text-[11px]">
              {accounts.map(acc => (
                <span key={acc.id} className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: hexForAccount(acc.id) }} />
                  {acc.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="h-48 flex items-end justify-between gap-2">
          {/* MODO 1: filtro activo → barra simple por día */}
          {selectedAccount && chartActivity.length > 0 && chartActivity.map((day, i) => {
            const heightPercent = (day.count / maxActivity) * 100;
            const col = hexForAccount(selectedAccount.id);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
                <div className={`w-full rounded-t-lg relative overflow-hidden transition-all flex-1 flex items-end ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                  <div className="w-full rounded-t-lg transition-all duration-500" style={{ height: `${heightPercent || 1}%`, backgroundColor: col }} />
                </div>
                <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10 font-bold">
                  {day.count} msgs
                </div>
                <span className={`text-[10px] font-bold uppercase truncate w-full text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{day.label}</span>
              </div>
            );
          })}

          {/* MODO 2: sin filtro y multi-cuenta → barra apilada por línea */}
          {!selectedAccount && multiAccount && activityByAccount.length > 0 && activityByAccount.map((day, i) => {
            const total = Object.values(day.counts).reduce((s, n) => s + (n || 0), 0);
            const heightPercent = (total / maxActivityStacked) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
                <div className={`w-full rounded-t-lg relative overflow-hidden transition-all flex-1 flex items-end ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                  <div className="w-full flex flex-col-reverse" style={{ height: `${heightPercent || 1}%` }}>
                    {accounts.map(acc => {
                      const v = day.counts[acc.id] || 0;
                      if (v === 0) return null;
                      const segHeightPct = (v / total) * 100;
                      return (
                        <div key={acc.id} title={`${acc.name}: ${v}`} style={{ height: `${segHeightPct}%`, backgroundColor: hexForAccount(acc.id) }} />
                      );
                    })}
                  </div>
                </div>
                <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10 font-bold">
                  {total} msgs
                </div>
                <span className={`text-[10px] font-bold uppercase truncate w-full text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{day.label}</span>
              </div>
            );
          })}

          {/* MODO 3 (fallback): sin filtro y sin multi-cuenta o sin activityByAccount → barra simple global */}
          {!selectedAccount && (!multiAccount || activityByAccount.length === 0) && activityGlobal.length > 0 && activityGlobal.map((day, i) => {
            const heightPercent = (day.count / maxActivity) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
                <div className={`w-full rounded-t-lg relative overflow-hidden transition-all flex-1 flex items-end ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-100 hover:bg-indigo-50'}`}>
                  <div className="w-full bg-indigo-500 rounded-t-lg transition-all duration-500 group-hover:bg-indigo-600 relative" style={{ height: `${heightPercent || 1}%` }} />
                </div>
                <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10 font-bold">
                  {day.count} msgs
                </div>
                <span className={`text-[10px] font-bold uppercase truncate w-full text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{day.label}</span>
              </div>
            );
          })}

          {chartActivity.length === 0 && activityByAccount.length === 0 && (
            <div className="w-full h-full flex items-center justify-center text-slate-400 italic">No hay actividad reciente</div>
          )}
        </div>
      </div>

      {/* Resumen por línea — solo cuando multi-cuenta y sin filtro activo */}
      {multiAccount && !selectedAccount && accountStats.length > 0 && (
        <div className={`p-6 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
          <h3 className={`font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-700'}`}>
            <Smartphone size={18} className="text-slate-400" /> Resumen por línea
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {accountStats.map(acc => {
              const col = colorForAccount(acc.id);
              return (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  style={{ borderLeftColor: col.hex, borderLeftWidth: '5px', borderLeftStyle: 'solid' }}
                  className={`p-4 rounded-xl border text-left transition-all hover:shadow-md ${isDark ? 'bg-slate-800/60 border-slate-700 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-white'}`}
                  title="Pinchar para filtrar por esta línea"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`font-bold text-sm flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                      <Smartphone size={14} style={{ color: col.hex }} />
                      {acc.name}
                    </div>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>{acc.id.slice(-4)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div>
                      <div className={`text-[9px] font-bold uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Msgs</div>
                      <div className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{acc.totalMessages}</div>
                    </div>
                    <div>
                      <div className={`text-[9px] font-bold uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Contactos</div>
                      <div className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{acc.totalContacts}</div>
                    </div>
                    <div>
                      <div className={`text-[9px] font-bold uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Citas</div>
                      <div className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{acc.totalAppointments}</div>
                    </div>
                    <div>
                      <div className={`text-[9px] font-bold uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Laura</div>
                      <div className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{acc.percentBot}%</div>
                    </div>
                  </div>
                  <div className={`mt-3 pt-3 border-t flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> Resp. media: <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{formatMinutes(acc.avgResponseTimeMin)}</span>
                    </span>
                    {acc.incidents && acc.incidents.total > 0 && (
                      <span className="flex items-center gap-1" title={`${acc.incidents.count} incidencia(s) sobre ${acc.incidents.total} citas de ${incidents.monthLabel || 'este mes'}`}>
                        <Zap size={11} className={isDark ? 'text-amber-400' : 'text-amber-500'} /> Incid.{incidents.monthLabel ? ` ${incidents.monthLabel}` : ' (mes)'}: <span className={`font-bold ${acc.incidents.percentage > 20 ? 'text-amber-500' : (isDark ? 'text-slate-200' : 'text-slate-700')}`}>{acc.incidents.count}<span className="opacity-60"> ({acc.incidents.percentage}%)</span></span>
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tablas Inferiores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Top Agentes */}
        <div className={`p-6 rounded-2xl border shadow-sm h-fit ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
          <h3 className={`font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-700'}`}>
            <UserCheck size={18} className="text-slate-400" /> Productividad Agentes
          </h3>
          <div className="space-y-3">
            {agents.length > 0 ? agents.map((agent: any, i: number) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${isDark ? 'bg-slate-700/50 border-slate-700 hover:border-slate-500' : 'bg-slate-50 border-slate-100 hover:border-indigo-100'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isDark ? 'bg-indigo-900/50 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}`}>
                    {agent.name ? agent.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <span className={`font-bold text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{agent.name || "Desconocido"}</span>
                </div>
                <div className="flex gap-4 text-right">
                  <div title="Mensajes Enviados">
                    <div className="text-[9px] text-slate-400 uppercase font-bold text-right">Msgs</div>
                    <span className={`font-mono font-bold text-sm block text-right ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{agent.msgCount}</span>
                  </div>
                  <div title="Chats Únicos">
                    <div className="text-[9px] text-slate-400 uppercase font-bold text-right">Chats</div>
                    <span className={`font-mono font-bold text-sm block text-right ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>{agent.chatCount}</span>
                  </div>
                </div>
              </div>
            )) : <p className="text-sm text-slate-400 italic py-4 text-center">No hay datos de actividad reciente.</p>}
          </div>
        </div>

        {/* Distribución Estados */}
        <div className={`p-6 rounded-2xl border shadow-sm h-fit ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
          <h3 className={`font-bold mb-4 ${isDark ? 'text-white' : 'text-slate-700'}`}>Estado de los Chats</h3>
          <div className="space-y-4">
            {statuses.length > 0 ? statuses.map((st: any, i: number) => (
              <div key={i}>
                <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
                  <span className={isDark ? 'text-slate-400' : ''}>{st.name}</span>
                  <span className={`px-2 py-0.5 rounded font-mono ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{st.count}</span>
                </div>
                <div className={`w-full rounded-full h-2 overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${st.name === 'Nuevo' ? 'bg-green-500' : st.name === 'Abierto' ? 'bg-blue-500' : 'bg-slate-400'}`}
                    style={{ width: `${(st.count / (data.kpis.totalContacts || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            )) : <p className="text-sm text-slate-400 italic py-4 text-center">No hay estados registrados.</p>}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AnalyticsDashboard;
