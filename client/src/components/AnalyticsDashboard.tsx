import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Users,
  MessageSquare,
  TrendingUp,
  UserCheck,
  Calendar,
  AlertCircle,
  Loader2,
  ServerCrash
} from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

const AnalyticsDashboard = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingData, setMissingData] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/analytics`)
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Error al cargar datos");
        return json;
      })
      .then(d => {
        // Verificamos si el servidor envió los KPIs o está vacío
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

  // --- Renderizado de Estados ---

  if (loading) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={32} />
        <p className="text-sm font-medium">Calculando métricas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`w-full p-8 flex flex-col items-center justify-center text-center rounded-2xl border ${isDark ? 'glass-panel border-red-500/20' : 'bg-red-50 border-red-100'}`}>
        <AlertCircle className="text-red-400 mb-3" size={48} />
        <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>Error de conexión</h3>
        <p className={`text-sm mt-1 max-w-md ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>{error}</p>
        <button onClick={() => window.location.reload()} className={`mt-4 px-4 py-2 rounded-lg text-sm font-bold transition ${isDark ? 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Reintentar</button>
      </div>
    );
  }

  // AVISO ESPECÍFICO: El servidor responde pero sin datos (Ruta vacía)
  if (missingData) {
    return (
      <div className={`w-full p-8 flex flex-col items-center justify-center text-center rounded-2xl border ${isDark ? 'glass-panel border-yellow-500/20' : 'bg-yellow-50 border-yellow-100'}`}>
        <ServerCrash className="text-yellow-500 mb-3" size={48} />
        <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>Falta Lógica en el Servidor</h3>
        <p className={`text-sm mt-2 max-w-md ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          La ruta <code>/api/analytics</code> existe pero devuelve datos vacíos.
          <br />Probablemente copiaste una versión resumida del archivo <code>index.ts</code>.
        </p>
        <p className="text-xs text-slate-400 mt-4">Copia y pega el bloque de código de Analíticas en tu servidor.</p>
      </div>
    );

  }

  // --- Preparación de Datos Seguros ---
  const safeData = data || {};
  const kpis = safeData.kpis || { totalMessages: 0, totalContacts: 0, newLeads: 0 };
  const activity = safeData.activity || [];
  const agents = safeData.agents || [];
  const statuses = safeData.statuses || [];

  // Escalar gráfica
  const maxActivity = Math.max(...(activity.map((d: any) => d.count) || [0]), 1);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">

      {/* Header */}
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h1 className={`text-2xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
          <BarChart3 className="text-indigo-600" /> Dashboard de Rendimiento
        </h1>
        <p className={`mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Resumen de actividad de los últimos 7 días.</p>
      </div>

      {/* KPIs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><MessageSquare size={24} /></div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Total Mensajes</p>
            <h3 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{kpis.totalMessages}</h3>
          </div>
        </div>

        <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-50 text-purple-600'}`}><Users size={24} /></div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Contactos Totales</p>
            <h3 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{kpis.totalContacts}</h3>
          </div>
        </div>

        <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-50 text-green-600'}`}><TrendingUp size={24} /></div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Nuevos Leads</p>
            <h3 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{kpis.newLeads}</h3>
          </div>
        </div>
      </div>

      {/* Gráfico de Barras CSS (Actividad Semanal) */}
      <div className={`p-6 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
        <h3 className={`font-bold mb-6 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-700'}`}>
          <Calendar size={18} className="text-slate-400" /> Mensajes (Últimos 7 días)
        </h3>

        <div className="h-48 flex items-end justify-between gap-2">
          {activity.length > 0 ? activity.map((day: any, i: number) => {
            const heightPercent = (day.count / maxActivity) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
                <div className={`w-full rounded-t-lg relative overflow-hidden transition-all flex-1 flex items-end ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-100 hover:bg-indigo-50'}`}>
                  <div
                    className="w-full bg-indigo-500 rounded-t-lg transition-all duration-500 group-hover:bg-indigo-600 relative"
                    style={{ height: `${heightPercent || 1}%` }}
                  ></div>
                </div>
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10 font-bold">
                  {day.count} msgs
                </div>
                <span className={`text-[10px] font-bold uppercase truncate w-full text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{day.label}</span>
              </div>
            );
          }) : <div className="w-full h-full flex items-center justify-center text-slate-400 italic">No hay actividad reciente</div>}
        </div>
      </div>

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
                    style={{ width: `${(st.count / (kpis.totalContacts || 1)) * 100}%` }}
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