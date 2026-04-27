import React, { useState, useEffect, useMemo } from 'react';
import {
    Megaphone, Send, Users, Calendar as CalendarIcon, TrendingUp, Plus, Edit3,
    Trash2, Eye, X, ChevronLeft, ChevronRight, Check, Clock, Target, AlertCircle,
    Loader2, Search, Filter, Mail, DollarSign, BarChart3, CheckCircle2, XCircle,
    PauseCircle, FileText, Sparkles, ArrowLeft, Repeat, Play, Pause, History
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { API_URL as API_URL_BASE } from '../config/api';

// ===========================
//  TIPOS
// ===========================
interface CampaignSummary {
    id: string;
    name: string;
    templateName: string;
    status: 'draft' | 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled' | 'recurring';
    scheduledFor: string | null;
    createdAt: string;
    createdBy: string;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    estimatedCost: number;
    startedAt: string | null;
    completedAt: string | null;
    parentCampaignId?: string | null;
    isRecurring?: boolean;
    recurringPaused?: boolean;
    recurringNextRun?: string | null;
    recurringLastRun?: string | null;
    recurringFrequency?: string | null;
}

interface CampaignDetail extends CampaignSummary {
    templateLanguage: string;
    variables: string[];
    recipients: string[];
    originPhoneId: string | null;
    respectOptIn: boolean;
    notes: string;
    recurringConfig?: any;
}

interface CampaignExecution {
    id: string;
    name: string;
    status: string;
    createdAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    estimatedCost: number;
}

interface CampaignSend {
    phone: string;
    status: string;
    sentAt: string;
    error: string | null;
}

interface ContactForCampaign {
    id: string;
    phone: string;
    name: string;
    tags: string[];
    department: string;
    status: string;
    assigned_to: string;
    optInMarketing: boolean;
    optedOut: boolean;
    lastMessageTime: string | null;
}

interface MetaTemplate {
    id?: string;
    name: string;
    language?: string;
    category?: string;
    status?: string;
    components?: any[];
}

interface GlobalStats {
    totalCampaigns: number;
    completed: number;
    scheduled: number;
    drafts: number;
    running: number;
    totalSent: number;
    totalFailed: number;
    totalSkipped: number;
    totalCost: number;
}

interface CampaignsDashboardProps {
    readOnly?: boolean;
    currentUser?: { username: string; role: string };
    onBack?: () => void;
}

// ===========================
//  COMPONENTE PRINCIPAL
// ===========================
const CampaignsDashboard: React.FC<CampaignsDashboardProps> = ({ readOnly = false, currentUser, onBack }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const API_URL = API_URL_BASE;

    const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
    const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [, setTick] = useState(0); // fuerza re-render para actualizar "hace Xs"
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const [showWizard, setShowWizard] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<CampaignDetail | null>(null);
    const [viewingCampaignId, setViewingCampaignId] = useState<string | null>(null);

    // ----- Cargar datos -----
    // silent=true → no muestra spinner, solo actualiza en segundo plano
    const loadCampaigns = async (silent = false) => {
        if (silent) setRefreshing(true);
        else setLoading(true);
        try {
            const [r1, r2] = await Promise.all([
                fetch(`${API_URL}/campaigns`),
                fetch(`${API_URL}/campaigns-stats`)
            ]);
            if (r1.ok) setCampaigns(await r1.json());
            if (r2.ok) setGlobalStats(await r2.json());
            setLastUpdate(new Date());
        } catch (e) {
            console.error('Error cargando campañas:', e);
        } finally {
            if (silent) setRefreshing(false);
            else setLoading(false);
        }
    };

    useEffect(() => {
        loadCampaigns();
        // Refresco silencioso cada 15s
        const interval = setInterval(() => {
            // Si el wizard está abierto, no refresques (evita perder datos del usuario al re-render)
            if (!showWizard && !viewingCampaignId) {
                loadCampaigns(true);
            }
        }, 15000);
        return () => clearInterval(interval);
    }, [showWizard, viewingCampaignId]);

    // Tick cada segundo para que "hace Xs" se actualice
    useEffect(() => {
        const t = setInterval(() => setTick(x => x + 1), 1000);
        return () => clearInterval(t);
    }, []);

    // Texto del indicador "actualizado hace..."
    const refreshLabel = (() => {
        if (!lastUpdate) return '';
        const diffMs = Date.now() - lastUpdate.getTime();
        const seconds = Math.floor(diffMs / 1000);
        if (seconds < 5) return 'justo ahora';
        if (seconds < 60) return `hace ${seconds}s`;
        const min = Math.floor(seconds / 60);
        if (min < 60) return `hace ${min} min`;
        return lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    })();

    // ----- Acciones -----
    const handleSendNow = async (id: string) => {
        if (!confirm('¿Enviar esta campaña AHORA? Una vez iniciada, no se puede detener.')) return;
        try {
            const r = await fetch(`${API_URL}/campaigns/${id}/send`, { method: 'POST' });
            const data = await r.json();
            if (data.success) {
                alert('✅ Campaña iniciada. Los envíos se hacen en segundo plano.');
                loadCampaigns();
            } else {
                alert('❌ ' + (data.error || 'Error desconocido'));
            }
        } catch (e: any) {
            alert('Error: ' + e.message);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`¿Eliminar la campaña "${name}"? Esta acción no se puede deshacer.`)) return;
        try {
            const r = await fetch(`${API_URL}/campaigns/${id}`, { method: 'DELETE' });
            const data = await r.json();
            if (data.success) loadCampaigns();
            else alert('❌ ' + (data.error || 'Error'));
        } catch (e: any) { alert('Error: ' + e.message); }
    };

    const handleCancel = async (id: string) => {
        if (!confirm('¿Cancelar esta campaña programada?')) return;
        try {
            const r = await fetch(`${API_URL}/campaigns/${id}/cancel`, { method: 'POST' });
            const data = await r.json();
            if (data.success) loadCampaigns();
            else alert('❌ ' + (data.error || 'Error'));
        } catch (e: any) { alert('Error: ' + e.message); }
    };

    const handlePause = async (id: string) => {
        try {
            const r = await fetch(`${API_URL}/campaigns/${id}/pause`, { method: 'POST' });
            const data = await r.json();
            if (data.success) loadCampaigns();
            else alert('❌ ' + (data.error || 'Error'));
        } catch (e: any) { alert('Error: ' + e.message); }
    };

    const handleResume = async (id: string) => {
        try {
            const r = await fetch(`${API_URL}/campaigns/${id}/resume`, { method: 'POST' });
            const data = await r.json();
            if (data.success) loadCampaigns();
            else alert('❌ ' + (data.error || 'Error'));
        } catch (e: any) { alert('Error: ' + e.message); }
    };

    const handleEdit = async (id: string) => {
        try {
            const r = await fetch(`${API_URL}/campaigns/${id}`);
            if (!r.ok) { alert('No se pudo cargar la campaña'); return; }
            const data = await r.json();
            setEditingCampaign(data);
            setShowWizard(true);
        } catch (e: any) { alert('Error: ' + e.message); }
    };

    const handleNew = () => {
        setEditingCampaign(null);
        setShowWizard(true);
    };

    // ----- Filtros -----
    const filteredCampaigns = useMemo(() => {
        return campaigns.filter(c => {
            if (filterStatus !== 'all' && c.status !== filterStatus) return false;
            if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });
    }, [campaigns, filterStatus, searchQuery]);

    // ----- Render -----
    if (viewingCampaignId) {
        return (
            <CampaignDetailView
                campaignId={viewingCampaignId}
                onBack={() => { setViewingCampaignId(null); loadCampaigns(); }}
                isDark={isDark}
                API_URL={API_URL}
            />
        );
    }

    return (
        <div className={`h-full w-full flex flex-col ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between flex-shrink-0 ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
                            title="Volver">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 shadow-lg shadow-orange-500/20">
                        <Megaphone className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Campañas</h1>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            Envíos masivos por WhatsApp con plantillas aprobadas
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Indicador de auto-refresco */}
                    {lastUpdate && (
                        <div
                            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${isDark ? 'bg-slate-800/50 text-slate-400' : 'bg-slate-100 text-slate-500'}`}
                            title={`Última actualización: ${lastUpdate.toLocaleTimeString('es-ES')}`}>
                            <span className={`w-2 h-2 rounded-full ${refreshing ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`}></span>
                            {refreshing ? 'Actualizando...' : `Actualizado ${refreshLabel}`}
                        </div>
                    )}
                    {!readOnly && (
                    <button
                        onClick={handleNew}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-pink-600 hover:shadow-lg hover:shadow-orange-500/30 text-white font-semibold transition active:scale-[0.98]">
                        <Plus className="w-4 h-4" />
                        Nueva campaña
                    </button>
                )}
                </div>
            </div>

            {/* Stats globales */}
            {globalStats && (
                <div className={`px-6 py-4 border-b grid grid-cols-2 md:grid-cols-5 gap-3 flex-shrink-0 ${isDark ? 'border-white/5 bg-slate-900/20' : 'border-slate-200 bg-white/60'}`}>
                    <StatCard isDark={isDark} icon={<Megaphone className="w-4 h-4" />} label="Total campañas" value={globalStats.totalCampaigns} color="orange" />
                    <StatCard isDark={isDark} icon={<Send className="w-4 h-4" />} label="Mensajes enviados" value={globalStats.totalSent.toLocaleString()} color="green" />
                    <StatCard isDark={isDark} icon={<XCircle className="w-4 h-4" />} label="Fallidos" value={globalStats.totalFailed.toLocaleString()} color="red" />
                    <StatCard isDark={isDark} icon={<PauseCircle className="w-4 h-4" />} label="Saltados (sin opt-in)" value={globalStats.totalSkipped.toLocaleString()} color="yellow" />
                    <StatCard isDark={isDark} icon={<DollarSign className="w-4 h-4" />} label="Coste total" value={`${globalStats.totalCost.toFixed(2)} €`} color="blue" />
                </div>
            )}

            {/* Filtros */}
            <div className={`px-6 py-3 border-b flex flex-wrap items-center gap-3 flex-shrink-0 ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                        type="text"
                        placeholder="Buscar campañas..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={`w-full pl-10 pr-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200 focus:ring-orange-500/30' : 'bg-white border-slate-200 text-slate-800 focus:ring-orange-500/30'}`}
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {[
                        { key: 'all', label: 'Todas' },
                        { key: 'draft', label: 'Borradores' },
                        { key: 'scheduled', label: 'Programadas' },
                        { key: 'recurring', label: '🔁 Recurrentes' },
                        { key: 'running', label: 'En curso' },
                        { key: 'completed', label: 'Completadas' },
                        { key: 'failed', label: 'Fallidas' },
                        { key: 'cancelled', label: 'Canceladas' },
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilterStatus(f.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filterStatus === f.key
                                ? 'bg-gradient-to-r from-orange-500 to-pink-600 text-white shadow-md'
                                : isDark
                                    ? 'bg-white/5 text-slate-400 hover:bg-white/10'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Lista de campañas */}
            <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                    </div>
                ) : filteredCampaigns.length === 0 ? (
                    <EmptyState isDark={isDark} onCreate={handleNew} hasAny={campaigns.length > 0} />
                ) : (
                    <div className="grid gap-3">
                        {filteredCampaigns.map(c => (
                            <CampaignCard
                                key={c.id}
                                campaign={c}
                                isDark={isDark}
                                readOnly={readOnly}
                                onView={() => setViewingCampaignId(c.id)}
                                onSend={() => handleSendNow(c.id)}
                                onEdit={() => handleEdit(c.id)}
                                onDelete={() => handleDelete(c.id, c.name)}
                                onCancel={() => handleCancel(c.id)}
                                onPause={() => handlePause(c.id)}
                                onResume={() => handleResume(c.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Wizard modal */}
            {showWizard && (
                <CampaignWizard
                    isDark={isDark}
                    API_URL={API_URL}
                    initialData={editingCampaign}
                    currentUser={currentUser}
                    onClose={() => { setShowWizard(false); setEditingCampaign(null); }}
                    onSaved={() => { setShowWizard(false); setEditingCampaign(null); loadCampaigns(); }}
                />
            )}
        </div>
    );
};

// ===========================
//  STAT CARD
// ===========================
const StatCard: React.FC<{ isDark: boolean; icon: React.ReactNode; label: string; value: string | number; color: string }> = ({ isDark, icon, label, value, color }) => {
    const colorMap: Record<string, string> = {
        orange: 'text-orange-500',
        green: 'text-green-500',
        red: 'text-red-500',
        yellow: 'text-yellow-500',
        blue: 'text-blue-500'
    };
    return (
        <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800/40 border-white/5' : 'bg-white border-slate-200'}`}>
            <div className={`flex items-center gap-2 ${colorMap[color]}`}>
                {icon}
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
            </div>
            <div className={`mt-1 text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</div>
        </div>
    );
};

// ===========================
//  EMPTY STATE
// ===========================
const EmptyState: React.FC<{ isDark: boolean; onCreate: () => void; hasAny: boolean }> = ({ isDark, onCreate, hasAny }) => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className={`p-5 rounded-2xl mb-5 ${isDark ? 'bg-orange-500/10' : 'bg-orange-50'}`}>
            <Megaphone className="w-12 h-12 text-orange-500" />
        </div>
        <h3 className={`text-xl font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {hasAny ? 'Sin resultados' : 'Crea tu primera campaña'}
        </h3>
        <p className={`text-sm mb-6 max-w-md ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            {hasAny
                ? 'Prueba a cambiar los filtros o la búsqueda.'
                : 'Envía mensajes masivos por WhatsApp a tus clientes con plantillas aprobadas. Felicitaciones, promociones, recordatorios… todo automatizado y conforme a la normativa.'}
        </p>
        {!hasAny && (
            <button
                onClick={onCreate}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-pink-600 text-white font-semibold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 transition active:scale-[0.98]">
                <Plus className="w-5 h-5" />
                Crear primera campaña
            </button>
        )}
    </div>
);

// ===========================
//  CAMPAIGN CARD (item de lista)
// ===========================
const CampaignCard: React.FC<{
    campaign: CampaignSummary;
    isDark: boolean;
    readOnly: boolean;
    onView: () => void;
    onSend: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCancel: () => void;
    onPause: () => void;
    onResume: () => void;
}> = ({ campaign, isDark, readOnly, onView, onSend, onEdit, onDelete, onCancel, onPause, onResume }) => {
    const statusBadge = getStatusBadge(campaign.status, isDark);
    const progress = campaign.totalRecipients > 0
        ? Math.round(((campaign.sentCount + campaign.failedCount + campaign.skippedCount) / campaign.totalRecipients) * 100)
        : 0;
    const isRecurring = !!campaign.isRecurring;
    const isPaused = !!campaign.recurringPaused;

    return (
        <div className={`p-4 rounded-2xl border transition-all ${isRecurring
            ? (isDark ? 'bg-purple-500/5 border-purple-500/30 hover:border-purple-500/50' : 'bg-purple-50/50 border-purple-200 hover:border-purple-400 hover:shadow-md')
            : (isDark ? 'bg-slate-800/40 border-white/5 hover:border-orange-500/30' : 'bg-white border-slate-200 hover:border-orange-300 hover:shadow-md')}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className={`text-base font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{campaign.name}</h3>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${statusBadge.cls}`}>
                            {statusBadge.label}
                        </span>
                        {isRecurring && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase flex items-center gap-1 ${isPaused ? 'bg-amber-500/20 text-amber-600' : 'bg-purple-500/20 text-purple-600'}`}>
                                <Repeat className="w-3 h-3" />
                                {isPaused ? 'PAUSADA' : 'RECURRENTE'}
                            </span>
                        )}
                    </div>
                    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{campaign.templateName}</span>
                        {!isRecurring && (
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{campaign.totalRecipients} destinatarios</span>
                        )}
                        {campaign.scheduledFor && (
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Programada: {formatDateTime(campaign.scheduledFor)}</span>
                        )}
                        {isRecurring && campaign.recurringNextRun && !isPaused && (
                            <span className="flex items-center gap-1 text-purple-500 font-semibold"><Repeat className="w-3 h-3" />Próxima: {formatDateTime(campaign.recurringNextRun)}</span>
                        )}
                        {isRecurring && campaign.recurringLastRun && (
                            <span className="flex items-center gap-1"><History className="w-3 h-3" />Última: {formatDateTime(campaign.recurringLastRun)}</span>
                        )}
                        {campaign.completedAt && !isRecurring && (
                            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Terminada: {formatDateTime(campaign.completedAt)}</span>
                        )}
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />~{campaign.estimatedCost.toFixed(2)}€{isRecurring ? ' / ejecución' : ''}</span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <button onClick={onView} title="Ver detalle" className={`p-2 rounded-lg transition ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                        <Eye className="w-4 h-4" />
                    </button>
                    {!readOnly && isRecurring && !isPaused && (
                        <button onClick={onPause} title="Pausar campaña recurrente" className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white hover:shadow-md transition">
                            <Pause className="w-4 h-4" />
                        </button>
                    )}
                    {!readOnly && isRecurring && isPaused && (
                        <button onClick={onResume} title="Reanudar campaña recurrente" className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white hover:shadow-md transition">
                            <Play className="w-4 h-4" />
                        </button>
                    )}
                    {!readOnly && (campaign.status === 'draft' || campaign.status === 'scheduled') && (
                        <>
                            <button onClick={onSend} title="Enviar ahora" className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white hover:shadow-md transition">
                                <Send className="w-4 h-4" />
                            </button>
                            <button onClick={onEdit} title="Editar" className={`p-2 rounded-lg transition ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                                <Edit3 className="w-4 h-4" />
                            </button>
                        </>
                    )}
                    {!readOnly && campaign.status === 'scheduled' && (
                        <button onClick={onCancel} title="Cancelar programación" className={`p-2 rounded-lg transition ${isDark ? 'hover:bg-yellow-500/10 text-yellow-500' : 'hover:bg-yellow-50 text-yellow-600'}`}>
                            <PauseCircle className="w-4 h-4" />
                        </button>
                    )}
                    {!readOnly && campaign.status !== 'running' && (
                        <button onClick={onDelete} title="Eliminar" className={`p-2 rounded-lg transition ${isDark ? 'hover:bg-red-500/10 text-red-500' : 'hover:bg-red-50 text-red-500'}`}>
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            {(campaign.status === 'running' || campaign.status === 'completed' || campaign.status === 'failed') && (
                <div className="mt-3">
                    <div className={`flex items-center justify-between text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span>Progreso: {campaign.sentCount + campaign.failedCount + campaign.skippedCount}/{campaign.totalRecipients}</span>
                        <span>{progress}%</span>
                    </div>
                    <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                        <div
                            className="h-full bg-gradient-to-r from-orange-500 to-pink-600 transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                        <span className="text-green-500 font-semibold">✓ {campaign.sentCount} enviados</span>
                        {campaign.failedCount > 0 && <span className="text-red-500 font-semibold">✗ {campaign.failedCount} fallidos</span>}
                        {campaign.skippedCount > 0 && <span className="text-yellow-500 font-semibold">⏭ {campaign.skippedCount} saltados</span>}
                    </div>
                </div>
            )}
        </div>
    );
};

// ===========================
//  WIZARD DE CREACIÓN/EDICIÓN
// ===========================
const CampaignWizard: React.FC<{
    isDark: boolean;
    API_URL: string;
    initialData: CampaignDetail | null;
    currentUser?: { username: string; role: string };
    onClose: () => void;
    onSaved: () => void;
}> = ({ isDark, API_URL, initialData, currentUser, onClose, onSaved }) => {
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);

    // Estado del formulario
    const [name, setName] = useState(initialData?.name || '');
    const [templateName, setTemplateName] = useState(initialData?.templateName || '');
    const [variables, setVariables] = useState<string[]>(initialData?.variables || []);
    const [recipients, setRecipients] = useState<string[]>(initialData?.recipients || []);
    const [respectOptIn, setRespectOptIn] = useState<boolean>(initialData?.respectOptIn ?? true);
    const [scheduledFor, setScheduledFor] = useState<string>(initialData?.scheduledFor ? toLocalDateTimeInput(initialData.scheduledFor) : '');
    const [sendMode, setSendMode] = useState<'now' | 'schedule' | 'draft' | 'recurring'>(
        (initialData as any)?.isRecurring ? 'recurring' : (initialData?.scheduledFor ? 'schedule' : 'now')
    );

    // Estado recurrente
    const initRecurring = (initialData as any)?.recurringConfig || {};
    const [recFrequency, setRecFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>(initRecurring.frequency || 'weekly');
    const [recDayOfWeek, setRecDayOfWeek] = useState<number>(initRecurring.dayOfWeek ?? 1); // 1 = lunes
    const [recDayOfMonth, setRecDayOfMonth] = useState<number>(initRecurring.dayOfMonth ?? 1);
    const [recIntervalDays, setRecIntervalDays] = useState<number>(initRecurring.intervalDays ?? 7);
    const [recHour, setRecHour] = useState<number>(initRecurring.hour ?? 10);

    // Plantillas y contactos
    const [templates, setTemplates] = useState<MetaTemplate[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(true);
    const [contacts, setContacts] = useState<ContactForCampaign[]>([]);
    const [loadingContacts, setLoadingContacts] = useState(false);

    // Filtros para selector de contactos
    const [contactSearch, setContactSearch] = useState('');
    const [contactFilterTag, setContactFilterTag] = useState<string>('');
    const [contactFilterDept, setContactFilterDept] = useState<string>('');
    const [contactFilterOptIn, setContactFilterOptIn] = useState<boolean>(true);

    // Cargar plantillas al iniciar
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${API_URL}/templates`);
                if (r.ok) {
                    const data = await r.json();
                    // Filtrar solo plantillas APPROVED
                    const list = Array.isArray(data) ? data : (data.data || []);
                    setTemplates(list.filter((t: any) => !t.status || t.status === 'APPROVED'));
                }
            } catch (e) {
                console.error('Error cargando plantillas:', e);
            } finally {
                setLoadingTemplates(false);
            }
        })();
    }, []);

    // Cargar contactos al ir al paso 3
    useEffect(() => {
        if (step === 3 && contacts.length === 0) {
            setLoadingContacts(true);
            fetch(`${API_URL}/campaigns-contacts`)
                .then(r => r.json())
                .then(setContacts)
                .catch(console.error)
                .finally(() => setLoadingContacts(false));
        }
    }, [step]);

    // Tags y departamentos únicos
    const allTags = useMemo(() => Array.from(new Set(contacts.flatMap(c => c.tags || []))).filter(Boolean), [contacts]);
    const allDepartments = useMemo(() => Array.from(new Set(contacts.map(c => c.department))).filter(Boolean), [contacts]);

    // Contactos filtrados
    const filteredContacts = useMemo(() => {
        return contacts.filter(c => {
            if (contactFilterOptIn && (!c.optInMarketing || c.optedOut)) return false;
            if (contactSearch && !(c.name?.toLowerCase().includes(contactSearch.toLowerCase()) || c.phone.includes(contactSearch))) return false;
            if (contactFilterTag && !(c.tags || []).includes(contactFilterTag)) return false;
            if (contactFilterDept && c.department !== contactFilterDept) return false;
            return true;
        });
    }, [contacts, contactSearch, contactFilterTag, contactFilterDept, contactFilterOptIn]);

    // Variables detectadas en la plantilla seleccionada
    const selectedTemplate = useMemo(() => templates.find(t => t.name === templateName), [templates, templateName]);
    const templateBodyText = useMemo(() => {
        if (!selectedTemplate?.components) return '';
        const body = selectedTemplate.components.find((c: any) => c.type === 'BODY' || c.type === 'body');
        return body?.text || '';
    }, [selectedTemplate]);
    const templateVarCount = useMemo(() => {
        const matches = templateBodyText.match(/\{\{\d+\}\}/g);
        return matches ? matches.length : 0;
    }, [templateBodyText]);

    // Ajustar tamaño del array de variables al cambiar de plantilla
    useEffect(() => {
        if (templateVarCount > 0 && variables.length !== templateVarCount) {
            const newVars = [...variables];
            while (newVars.length < templateVarCount) newVars.push('');
            newVars.length = templateVarCount;
            setVariables(newVars);
        } else if (templateVarCount === 0 && variables.length > 0) {
            setVariables([]);
        }
    }, [templateVarCount]);

    // ----- Validaciones -----
    const canGoToStep2 = name.trim().length > 1 && templateName.length > 0;
    const canGoToStep3 = variables.every(v => v.trim().length > 0) || templateVarCount === 0;
    // En modo recurrente no se exigen recipients seleccionados (se calculan al ejecutar con los filtros)
    const canGoToStep4 = recipients.length > 0 || sendMode === 'recurring';
    const canSubmit =
        (sendMode === 'schedule' ? (scheduledFor && new Date(scheduledFor) > new Date()) :
            (sendMode === 'recurring' ? (
                (recFrequency !== 'custom' || recIntervalDays >= 1) &&
                (recFrequency !== 'weekly' || (recDayOfWeek >= 0 && recDayOfWeek <= 6)) &&
                (recFrequency !== 'monthly' || (recDayOfMonth >= 1 && recDayOfMonth <= 28))
            ) : true));

    // ----- Guardar -----
    const handleSave = async () => {
        setSaving(true);
        const payload: any = {
            name: name.trim(),
            templateName,
            variables,
            recipients,
            respectOptIn,
            createdBy: currentUser?.username || 'unknown',
            status: sendMode === 'schedule' ? 'scheduled' : (sendMode === 'draft' ? 'draft' : 'draft')
        };
        if (sendMode === 'schedule' && scheduledFor) payload.scheduledFor = new Date(scheduledFor).toISOString();

        // Modo recurrente: enviar configuración + filtros guardados (en lugar de la lista fija)
        if (sendMode === 'recurring') {
            payload.recurringConfig = {
                frequency: recFrequency,
                hour: recHour,
                ...(recFrequency === 'weekly' && { dayOfWeek: recDayOfWeek }),
                ...(recFrequency === 'monthly' && { dayOfMonth: recDayOfMonth }),
                ...(recFrequency === 'custom' && { intervalDays: recIntervalDays }),
                filters: {
                    department: contactFilterDept || '',
                    tags: contactFilterTag ? [contactFilterTag] : [],
                    onlyOptedIn: contactFilterOptIn
                }
            };
        }

        try {
            let id = initialData?.id;
            let r: Response;
            if (id) {
                r = await fetch(`${API_URL}/campaigns/${id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
            } else {
                r = await fetch(`${API_URL}/campaigns`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const data = await r.json();
                id = data.id;
            }
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                alert('Error guardando: ' + (err.error || r.statusText));
                setSaving(false); return;
            }

            // Si pidió "enviar ahora", lanzar el envío
            if (sendMode === 'now' && id) {
                const sendR = await fetch(`${API_URL}/campaigns/${id}/send`, { method: 'POST' });
                const sendData = await sendR.json();
                if (sendData.success) alert('🚀 Campaña iniciada. Los envíos se hacen en segundo plano.');
                else alert('Campaña guardada pero error al lanzar envío: ' + (sendData.error || ''));
            } else if (sendMode === 'schedule') {
                alert('📅 Campaña programada. Se enviará automáticamente a la hora indicada.');
            } else if (sendMode === 'recurring') {
                alert('🔁 Campaña recurrente activada. Se enviará automáticamente según la cadencia configurada. Puedes pausarla cuando quieras.');
            } else {
                alert('💾 Campaña guardada como borrador.');
            }
            onSaved();
        } catch (e: any) {
            alert('Error: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const estimatedCost = recipients.length * 0.06;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${isDark ? 'bg-slate-900 border border-white/10' : 'bg-white border border-slate-200'}`}>

                {/* Header */}
                <div className={`px-6 py-4 border-b flex items-center justify-between flex-shrink-0 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-pink-600">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                {initialData ? 'Editar campaña' : 'Nueva campaña'}
                            </h2>
                            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Paso {step} de 4</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Progress steps */}
                <div className={`px-6 py-3 border-b flex items-center gap-2 flex-shrink-0 ${isDark ? 'border-white/5 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
                    {['Plantilla', 'Variables', 'Destinatarios', 'Programación'].map((label, idx) => {
                        const num = idx + 1;
                        const active = step === num;
                        const done = step > num;
                        return (
                            <React.Fragment key={num}>
                                <div className={`flex items-center gap-2 ${active || done ? '' : 'opacity-50'}`}>
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${done
                                        ? 'bg-green-500 text-white'
                                        : active
                                            ? 'bg-gradient-to-br from-orange-500 to-pink-600 text-white'
                                            : isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-200 text-slate-500'
                                        }`}>
                                        {done ? <Check className="w-4 h-4" /> : num}
                                    </div>
                                    <span className={`text-xs font-semibold hidden sm:inline ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{label}</span>
                                </div>
                                {num < 4 && <div className={`flex-1 h-px ${done ? 'bg-green-500' : isDark ? 'bg-white/10' : 'bg-slate-200'}`} />}
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {step === 1 && (
                        <Step1Template
                            isDark={isDark}
                            name={name} setName={setName}
                            templateName={templateName} setTemplateName={setTemplateName}
                            templates={templates} loading={loadingTemplates}
                            templateBodyText={templateBodyText}
                        />
                    )}
                    {step === 2 && (
                        <Step2Variables
                            isDark={isDark}
                            variables={variables} setVariables={setVariables}
                            templateBodyText={templateBodyText}
                            templateVarCount={templateVarCount}
                        />
                    )}
                    {step === 3 && (
                        <Step3Recipients
                            isDark={isDark}
                            contacts={filteredContacts} loading={loadingContacts}
                            recipients={recipients} setRecipients={setRecipients}
                            search={contactSearch} setSearch={setContactSearch}
                            filterTag={contactFilterTag} setFilterTag={setContactFilterTag}
                            filterDept={contactFilterDept} setFilterDept={setContactFilterDept}
                            filterOptIn={contactFilterOptIn} setFilterOptIn={setContactFilterOptIn}
                            allTags={allTags} allDepartments={allDepartments}
                            totalAvailable={contacts.length}
                        />
                    )}
                    {step === 4 && (
                        <Step4Schedule
                            isDark={isDark}
                            sendMode={sendMode} setSendMode={setSendMode}
                            scheduledFor={scheduledFor} setScheduledFor={setScheduledFor}
                            respectOptIn={respectOptIn} setRespectOptIn={setRespectOptIn}
                            recipients={recipients}
                            estimatedCost={estimatedCost}
                            campaignName={name}
                            templateName={templateName}
                            recFrequency={recFrequency} setRecFrequency={setRecFrequency}
                            recDayOfWeek={recDayOfWeek} setRecDayOfWeek={setRecDayOfWeek}
                            recDayOfMonth={recDayOfMonth} setRecDayOfMonth={setRecDayOfMonth}
                            recIntervalDays={recIntervalDays} setRecIntervalDays={setRecIntervalDays}
                            recHour={recHour} setRecHour={setRecHour}
                            filterTag={contactFilterTag} filterDept={contactFilterDept} filterOptIn={contactFilterOptIn}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className={`px-6 py-4 border-t flex items-center justify-between flex-shrink-0 ${isDark ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
                    <button
                        onClick={() => step > 1 ? setStep(step - 1) : onClose()}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
                        {step === 1 ? 'Cancelar' : <><ChevronLeft className="w-4 h-4 inline" /> Atrás</>}
                    </button>
                    {step < 4 ? (
                        <button
                            onClick={() => setStep(step + 1)}
                            disabled={(step === 1 && !canGoToStep2) || (step === 2 && !canGoToStep3) || (step === 3 && !canGoToStep4)}
                            className="px-5 py-2 rounded-lg font-semibold text-sm bg-gradient-to-r from-orange-500 to-pink-600 text-white shadow-md hover:shadow-lg transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
                            Siguiente <ChevronRight className="w-4 h-4 inline" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSave}
                            disabled={saving || !canSubmit}
                            className="px-5 py-2 rounded-lg font-semibold text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md hover:shadow-lg transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {sendMode === 'now' ? 'Guardar y enviar ahora' :
                                sendMode === 'schedule' ? 'Programar campaña' :
                                    sendMode === 'recurring' ? 'Activar campaña recurrente' :
                                        'Guardar borrador'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ===========================
//  PASOS DEL WIZARD
// ===========================
const Step1Template: React.FC<any> = ({ isDark, name, setName, templateName, setTemplateName, templates, loading, templateBodyText }) => (
    <div className="space-y-5">
        <div>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Nombre interno de la campaña</label>
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Felicitación Navidad 2026"
                className={`w-full px-4 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200 focus:ring-orange-500/30' : 'bg-white border-slate-200 text-slate-800 focus:ring-orange-500/30'}`}
            />
            <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Solo lo verás tú. No se envía al cliente.</p>
        </div>

        <div>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Plantilla aprobada por Meta</label>
            {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando plantillas...</div>
            ) : templates.length === 0 ? (
                <div className={`p-4 rounded-lg text-sm border ${isDark ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
                    <AlertCircle className="w-4 h-4 inline mr-2" />
                    No hay plantillas aprobadas disponibles. Crea y aprueba plantillas en Meta Business Manager primero.
                </div>
            ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {templates.map((t: MetaTemplate) => (
                        <button
                            key={t.id || t.name}
                            type="button"
                            onClick={() => setTemplateName(t.name)}
                            className={`w-full text-left p-3 rounded-lg border transition ${templateName === t.name
                                ? 'border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/30'
                                : isDark
                                    ? 'border-white/5 bg-slate-800/30 hover:border-white/20'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}>
                            <div className="flex items-center justify-between mb-1">
                                <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{t.name}</span>
                                {t.category && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${t.category === 'MARKETING' ? 'bg-orange-500/20 text-orange-400' : t.category === 'UTILITY' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                        {t.category}
                                    </span>
                                )}
                            </div>
                            {t.components?.find((c: any) => c.type === 'BODY' || c.type === 'body') && (
                                <p className={`text-xs line-clamp-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    {t.components.find((c: any) => c.type === 'BODY' || c.type === 'body').text}
                                </p>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>

        {templateBodyText && (
            <div className={`p-4 rounded-lg border ${isDark ? 'bg-slate-800/30 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                <p className={`text-xs font-bold uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Vista previa</p>
                <p className={`text-sm whitespace-pre-wrap ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{templateBodyText}</p>
            </div>
        )}
    </div>
);

const Step2Variables: React.FC<any> = ({ isDark, variables, setVariables, templateBodyText, templateVarCount }) => (
    <div className="space-y-4">
        {templateVarCount === 0 ? (
            <div className={`p-5 rounded-lg text-sm text-center ${isDark ? 'bg-green-500/10 text-green-300' : 'bg-green-50 text-green-700'}`}>
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2" />
                Esta plantilla no tiene variables. Pasa al siguiente paso.
            </div>
        ) : (
            <>
                <div className={`p-3 rounded-lg text-xs ${isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                    💡 Tip: puedes usar <code className="font-mono bg-black/10 px-1 rounded">{'{nombre}'}</code> en cualquier variable y se sustituirá automáticamente por el nombre de cada contacto.
                </div>
                {Array.from({ length: templateVarCount }).map((_, i) => (
                    <div key={i}>
                        <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            Variable {`{{${i + 1}}}`}
                        </label>
                        <input
                            type="text"
                            value={variables[i] || ''}
                            onChange={(e) => {
                                const newVars = [...variables];
                                newVars[i] = e.target.value;
                                setVariables(newVars);
                            }}
                            placeholder={i === 0 ? 'Ej: {nombre} (se sustituye automáticamente)' : 'Valor para esta variable'}
                            className={`w-full px-4 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200 focus:ring-orange-500/30' : 'bg-white border-slate-200 text-slate-800 focus:ring-orange-500/30'}`}
                        />
                    </div>
                ))}
                {templateBodyText && (
                    <div className={`p-4 rounded-lg border ${isDark ? 'bg-slate-800/30 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                        <p className={`text-xs font-bold uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Vista previa con valores</p>
                        <p className={`text-sm whitespace-pre-wrap ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            {previewWithVariables(templateBodyText, variables)}
                        </p>
                    </div>
                )}
            </>
        )}
    </div>
);

const Step3Recipients: React.FC<any> = ({
    isDark, contacts, loading, recipients, setRecipients,
    search, setSearch, filterTag, setFilterTag, filterDept, setFilterDept,
    filterOptIn, setFilterOptIn, allTags, allDepartments, totalAvailable
}) => {
    const allSelected = contacts.length > 0 && contacts.every((c: any) => recipients.includes(c.phone));
    const toggleAll = () => {
        if (allSelected) {
            setRecipients(recipients.filter((p: string) => !contacts.find((c: any) => c.phone === p)));
        } else {
            const phones = contacts.map((c: any) => c.phone);
            setRecipients(Array.from(new Set([...recipients, ...phones])));
        }
    };
    const toggleOne = (phone: string) => {
        if (recipients.includes(phone)) setRecipients(recipients.filter((p: string) => p !== phone));
        else setRecipients([...recipients, phone]);
    };

    return (
        <div className="space-y-4">
            <div className={`p-3 rounded-lg text-xs ${isDark ? 'bg-yellow-500/10 text-yellow-300' : 'bg-yellow-50 text-yellow-800'}`}>
                ⚠️ <strong>Importante:</strong> por defecto solo verás contactos con opt-in marketing (consentimiento dado). Esto cumple con RGPD y la normativa de Meta.
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[180px]">
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o teléfono..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={`w-full pl-10 pr-3 py-2 rounded-lg text-sm border focus:outline-none ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                    />
                </div>
                {allTags.length > 0 && (
                    <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}
                        className={`px-3 py-2 rounded-lg text-sm border ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}>
                        <option value="">Todas las etiquetas</option>
                        {allTags.map((t: string) => <option key={t} value={t}>{t}</option>)}
                    </select>
                )}
                {allDepartments.length > 0 && (
                    <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
                        className={`px-3 py-2 rounded-lg text-sm border ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}>
                        <option value="">Todos los departamentos</option>
                        {allDepartments.map((d: string) => <option key={d} value={d}>{d}</option>)}
                    </select>
                )}
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border cursor-pointer ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}>
                    <input type="checkbox" checked={filterOptIn} onChange={(e) => setFilterOptIn(e.target.checked)} />
                    Solo opt-in
                </label>
            </div>

            {/* Resumen + Toggle todos */}
            <div className={`flex items-center justify-between p-3 rounded-lg ${isDark ? 'bg-slate-800/30' : 'bg-slate-100'}`}>
                <div className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <strong className="text-orange-500">{recipients.length}</strong> seleccionados
                    <span className="text-slate-500"> · {contacts.length} mostrados de {totalAvailable} totales</span>
                </div>
                <button onClick={toggleAll} className={`text-xs font-semibold px-3 py-1.5 rounded-md ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-white hover:bg-slate-200 text-slate-700'}`}>
                    {allSelected ? 'Deseleccionar mostrados' : 'Seleccionar todos los mostrados'}
                </button>
            </div>

            {/* Lista */}
            {loading ? (
                <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
            ) : (
                <div className={`max-h-72 overflow-y-auto rounded-lg border ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                    {contacts.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-500">
                            No hay contactos que cumplan los filtros.
                            {filterOptIn && <p className="mt-2 text-xs">Prueba a desmarcar "Solo opt-in" si aún no has recogido consentimientos.</p>}
                        </div>
                    ) : contacts.map((c: ContactForCampaign) => {
                        const sel = recipients.includes(c.phone);
                        return (
                            <button key={c.id} type="button" onClick={() => toggleOne(c.phone)}
                                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b transition ${sel
                                    ? isDark ? 'bg-orange-500/10 border-white/5' : 'bg-orange-50 border-slate-100'
                                    : isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'
                                    }`}>
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${sel ? 'bg-orange-500 border-orange-500' : isDark ? 'border-slate-600' : 'border-slate-300'}`}>
                                    {sel && <Check className="w-3.5 h-3.5 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={`font-semibold text-sm truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                        {c.name || 'Sin nombre'}
                                    </div>
                                    <div className={`text-xs truncate ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                        +{c.phone}
                                        {c.department && ` · ${c.department}`}
                                        {c.tags?.length > 0 && ` · ${c.tags.join(', ')}`}
                                    </div>
                                </div>
                                {c.optInMarketing && !c.optedOut && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-500">OPT-IN</span>}
                                {c.optedOut && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-500">BAJA</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const Step4Schedule: React.FC<any> = ({
    isDark, sendMode, setSendMode, scheduledFor, setScheduledFor,
    respectOptIn, setRespectOptIn, recipients, estimatedCost,
    campaignName, templateName,
    recFrequency, setRecFrequency,
    recDayOfWeek, setRecDayOfWeek,
    recDayOfMonth, setRecDayOfMonth,
    recIntervalDays, setRecIntervalDays,
    recHour, setRecHour,
    filterTag, filterDept, filterOptIn
}) => {
    // Vista previa de la próxima ejecución (cálculo cliente, mismo algoritmo que el backend)
    const computeNextRunPreview = () => {
        const now = new Date();
        const hour = Math.max(0, Math.min(23, recHour));
        if (recFrequency === 'daily') {
            const next = new Date(now);
            next.setHours(hour, 0, 0, 0);
            if (next <= now) next.setDate(next.getDate() + 1);
            return next;
        }
        if (recFrequency === 'weekly') {
            const next = new Date(now);
            next.setHours(hour, 0, 0, 0);
            let i = 0;
            while ((next.getDay() !== recDayOfWeek || next <= now) && i < 14) {
                next.setDate(next.getDate() + 1);
                i++;
            }
            return next;
        }
        if (recFrequency === 'monthly') {
            const next = new Date(now);
            next.setDate(recDayOfMonth);
            next.setHours(hour, 0, 0, 0);
            if (next <= now) {
                next.setMonth(next.getMonth() + 1);
                next.setDate(recDayOfMonth);
                next.setHours(hour, 0, 0, 0);
            }
            return next;
        }
        if (recFrequency === 'custom') {
            const next = new Date(now);
            next.setHours(hour, 0, 0, 0);
            next.setDate(next.getDate() + recIntervalDays);
            return next;
        }
        return null;
    };
    const nextRunPreview = computeNextRunPreview();
    const formatNext = (d: Date | null) => d ? d.toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const frequencyLabel: Record<string, string> = {
        daily: 'cada día',
        weekly: `cada ${weekdays[recDayOfWeek].toLowerCase()}`,
        monthly: `el día ${recDayOfMonth} de cada mes`,
        custom: `cada ${recIntervalDays} día${recIntervalDays === 1 ? '' : 's'}`
    };

    return (
    <Step4Inner
        isDark={isDark} sendMode={sendMode} setSendMode={setSendMode}
        scheduledFor={scheduledFor} setScheduledFor={setScheduledFor}
        respectOptIn={respectOptIn} setRespectOptIn={setRespectOptIn}
        recipients={recipients} estimatedCost={estimatedCost}
        campaignName={campaignName} templateName={templateName}
        recFrequency={recFrequency} recDayOfWeek={recDayOfWeek} recDayOfMonth={recDayOfMonth}
        recIntervalDays={recIntervalDays} recHour={recHour}
        setRecFrequency={setRecFrequency} setRecDayOfWeek={setRecDayOfWeek} setRecDayOfMonth={setRecDayOfMonth}
        setRecIntervalDays={setRecIntervalDays} setRecHour={setRecHour}
        filterTag={filterTag} filterDept={filterDept} filterOptIn={filterOptIn}
        nextRunPreview={nextRunPreview} formatNext={formatNext} weekdays={weekdays} frequencyLabel={frequencyLabel}
    />
    );
};

const Step4Inner: React.FC<any> = ({
    isDark, sendMode, setSendMode, scheduledFor, setScheduledFor,
    respectOptIn, setRespectOptIn, recipients, estimatedCost,
    campaignName, templateName,
    recFrequency, setRecFrequency,
    recDayOfWeek, setRecDayOfWeek,
    recDayOfMonth, setRecDayOfMonth,
    recIntervalDays, setRecIntervalDays,
    recHour, setRecHour,
    filterTag, filterDept, filterOptIn,
    nextRunPreview, formatNext, weekdays, frequencyLabel
}) => (
    <div className="space-y-5">
        {/* Resumen */}
        <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800/30 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
            <h3 className={`text-sm font-bold mb-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Resumen</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
                <SummaryRow isDark={isDark} label="Nombre" value={campaignName} />
                <SummaryRow isDark={isDark} label="Plantilla" value={templateName} />
                {sendMode === 'recurring' ? (
                    <SummaryRow isDark={isDark} label="Destinatarios" value={`Filtros aplicados (recalculados cada vez)`} />
                ) : (
                    <SummaryRow isDark={isDark} label="Destinatarios" value={`${recipients.length} contactos`} />
                )}
                <SummaryRow isDark={isDark} label={sendMode === 'recurring' ? 'Coste por ejecución' : 'Coste estimado'} value={`~${estimatedCost.toFixed(2)} €`} highlight />
            </div>
        </div>

        {/* Modo de envío */}
        <div>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>¿Cuándo enviar?</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <ModeButton isDark={isDark} active={sendMode === 'now'} onClick={() => setSendMode('now')} icon={<Send className="w-4 h-4" />} label="Ahora" desc="Inmediato" />
                <ModeButton isDark={isDark} active={sendMode === 'schedule'} onClick={() => setSendMode('schedule')} icon={<Clock className="w-4 h-4" />} label="Programar" desc="Fecha/hora futura" />
                <ModeButton isDark={isDark} active={sendMode === 'recurring'} onClick={() => setSendMode('recurring')} icon={<Repeat className="w-4 h-4" />} label="Recurrente" desc="Periódica automática" />
                <ModeButton isDark={isDark} active={sendMode === 'draft'} onClick={() => setSendMode('draft')} icon={<FileText className="w-4 h-4" />} label="Borrador" desc="Manual" />
            </div>
        </div>

        {sendMode === 'schedule' && (
            <div>
                <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Fecha y hora de envío</label>
                <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    min={toLocalDateTimeInput(new Date(Date.now() + 5 * 60000).toISOString())}
                    className={`w-full px-4 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200 focus:ring-orange-500/30' : 'bg-white border-slate-200 text-slate-800 focus:ring-orange-500/30'}`}
                />
                <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    Se enviará automáticamente a la hora indicada (zona horaria local).
                </p>
            </div>
        )}

        {sendMode === 'recurring' && (
            <div className={`p-4 rounded-xl border-2 space-y-4 ${isDark ? 'bg-purple-500/5 border-purple-500/30' : 'bg-purple-50 border-purple-300'}`}>
                <div className="flex items-center gap-2">
                    <Repeat className="w-5 h-5 text-purple-500" />
                    <span className={`text-sm font-bold ${isDark ? 'text-purple-300' : 'text-purple-800'}`}>Configura la cadencia</span>
                </div>

                {/* Frecuencia */}
                <div>
                    <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Frecuencia</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                            { v: 'daily', label: 'Diaria' },
                            { v: 'weekly', label: 'Semanal' },
                            { v: 'monthly', label: 'Mensual' },
                            { v: 'custom', label: 'Cada X días' }
                        ].map(opt => (
                            <button key={opt.v}
                                type="button"
                                onClick={() => setRecFrequency(opt.v)}
                                className={`px-3 py-2 rounded-lg text-sm font-semibold transition border ${recFrequency === opt.v
                                    ? 'bg-purple-500 text-white border-purple-500'
                                    : isDark ? 'bg-slate-800 border-white/10 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Día específico según frecuencia */}
                {recFrequency === 'weekly' && (
                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Día de la semana</label>
                        <select value={recDayOfWeek} onChange={(e) => setRecDayOfWeek(Number(e.target.value))}
                            className={`w-full px-4 py-2.5 rounded-lg text-sm border ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}>
                            {weekdays.map((d: string, i: number) => <option key={i} value={i}>{d}</option>)}
                        </select>
                    </div>
                )}

                {recFrequency === 'monthly' && (
                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Día del mes (1-28)</label>
                        <input type="number" min={1} max={28} value={recDayOfMonth}
                            onChange={(e) => setRecDayOfMonth(Math.max(1, Math.min(28, Number(e.target.value) || 1)))}
                            className={`w-full px-4 py-2.5 rounded-lg text-sm border ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`} />
                        <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Limitado a 28 para evitar problemas con febrero.</p>
                    </div>
                )}

                {recFrequency === 'custom' && (
                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Cada cuántos días</label>
                        <input type="number" min={1} max={365} value={recIntervalDays}
                            onChange={(e) => setRecIntervalDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                            className={`w-full px-4 py-2.5 rounded-lg text-sm border ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`} />
                        <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Por ejemplo, 15 = una vez cada 15 días.</p>
                    </div>
                )}

                {/* Hora */}
                <div>
                    <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Hora del envío</label>
                    <select value={recHour} onChange={(e) => setRecHour(Number(e.target.value))}
                        className={`w-full px-4 py-2.5 rounded-lg text-sm border ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}>
                        {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                        ))}
                    </select>
                </div>

                {/* Filtros activos como info */}
                <div className={`p-3 rounded-lg text-xs ${isDark ? 'bg-slate-900/50 text-slate-400' : 'bg-white text-slate-600'}`}>
                    <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>📋 Destinatarios cada ejecución:</strong>
                    <ul className="mt-1 ml-4 list-disc space-y-0.5">
                        {filterDept && <li>Departamento: <code>{filterDept}</code></li>}
                        {filterTag && <li>Etiqueta: <code>{filterTag}</code></li>}
                        <li>{filterOptIn ? '✅ Solo contactos con opt-in marketing' : '⚠️ Sin filtrar opt-in (RIESGO)'}</li>
                        {!filterDept && !filterTag && !filterOptIn && <li className="text-amber-500">⚠️ Sin filtros: se enviará a TODOS los contactos. Recomendado volver al paso 3 y filtrar.</li>}
                    </ul>
                    <p className="mt-2 text-[11px] italic">Los destinatarios se recalculan cada vez que se ejecute, así que si añades nuevos clientes con opt-in los incluirá automáticamente.</p>
                </div>

                {/* Vista previa */}
                <div className={`p-3 rounded-lg ${isDark ? 'bg-purple-500/10' : 'bg-white'} border-2 border-dashed ${isDark ? 'border-purple-500/40' : 'border-purple-300'}`}>
                    <div className={`text-xs font-bold uppercase mb-1 ${isDark ? 'text-purple-300' : 'text-purple-800'}`}>📅 Esta campaña se enviará</div>
                    <div className={`text-sm font-semibold ${isDark ? 'text-purple-200' : 'text-purple-900'}`}>
                        {frequencyLabel[recFrequency]} a las {String(recHour).padStart(2, '0')}:00
                    </div>
                    {nextRunPreview && (
                        <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            <strong>Próxima ejecución:</strong> {formatNext(nextRunPreview)}
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Opciones avanzadas */}
        <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800/30 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
            <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={respectOptIn} onChange={(e) => setRespectOptIn(e.target.checked)} className="mt-1" />
                <div>
                    <div className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        Respetar opt-in marketing (recomendado)
                    </div>
                    <div className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Solo se enviará a contactos que han dado consentimiento explícito. Saltarse esto puede provocar baneo de Meta y multas RGPD.
                    </div>
                </div>
            </label>
        </div>

        <div className={`p-4 rounded-xl border-l-4 ${isDark ? 'bg-blue-500/10 border-blue-500 text-blue-300' : 'bg-blue-50 border-blue-500 text-blue-800'}`}>
            <p className="text-xs">
                <strong>Antes de enviar:</strong> revisa que la plantilla está aprobada por Meta para Marketing,
                que los destinatarios han dado opt-in y que el mensaje aporta valor real (descuento, recordatorio útil, felicitación).
                Mensajes irrelevantes generan reportes de spam y bajan tu calidad en Meta.
            </p>
        </div>
    </div>
);

const SummaryRow: React.FC<any> = ({ isDark, label, value, highlight }) => (
    <div>
        <div className={`text-[10px] font-bold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{label}</div>
        <div className={`text-sm font-semibold ${highlight ? 'text-orange-500' : isDark ? 'text-slate-200' : 'text-slate-800'}`}>{value || '-'}</div>
    </div>
);

const ModeButton: React.FC<any> = ({ isDark, active, onClick, icon, label, desc }) => (
    <button type="button" onClick={onClick}
        className={`p-3 rounded-lg border-2 text-left transition ${active
            ? 'border-orange-500 bg-orange-500/10'
            : isDark ? 'border-white/10 bg-slate-800/30 hover:border-white/20' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}>
        <div className={`flex items-center gap-2 mb-1 ${active ? 'text-orange-500' : isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            {icon}
            <span className="text-sm font-bold">{label}</span>
        </div>
        <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{desc}</div>
    </button>
);

// ===========================
//  VISTA DETALLE DE CAMPAÑA
// ===========================
const CampaignDetailView: React.FC<{ campaignId: string; onBack: () => void; isDark: boolean; API_URL: string }> = ({ campaignId, onBack, isDark, API_URL }) => {
    const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
    const [sends, setSends] = useState<CampaignSend[]>([]);
    const [executions, setExecutions] = useState<CampaignExecution[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const [r1, r2, r3] = await Promise.all([
                    fetch(`${API_URL}/campaigns/${campaignId}`),
                    fetch(`${API_URL}/campaigns/${campaignId}/sends`),
                    fetch(`${API_URL}/campaigns/${campaignId}/executions`)
                ]);
                if (r1.ok) setCampaign(await r1.json());
                if (r2.ok) setSends(await r2.json());
                if (r3.ok) setExecutions(await r3.json());
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        load();
        const interval = setInterval(load, 10000);
        return () => clearInterval(interval);
    }, [campaignId]);

    if (loading || !campaign) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
    }

    const progress = campaign.totalRecipients > 0
        ? Math.round(((campaign.sentCount + campaign.failedCount + campaign.skippedCount) / campaign.totalRecipients) * 100) : 0;
    const successRate = campaign.sentCount + campaign.failedCount > 0
        ? Math.round((campaign.sentCount / (campaign.sentCount + campaign.failedCount)) * 100) : 0;
    const statusBadge = getStatusBadge(campaign.status, isDark);

    return (
        <div className={`h-full w-full flex flex-col ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{campaign.name}</h1>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${statusBadge.cls}`}>{statusBadge.label}</span>
                        </div>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            Plantilla: {campaign.templateName} · Creada {formatDateTime(campaign.createdAt)} por {campaign.createdBy}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Stats grandes */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <BigStat isDark={isDark} icon={<Users className="w-5 h-5" />} label="Total" value={campaign.totalRecipients} color="blue" />
                    <BigStat isDark={isDark} icon={<Send className="w-5 h-5" />} label="Enviados" value={campaign.sentCount} color="green" />
                    <BigStat isDark={isDark} icon={<XCircle className="w-5 h-5" />} label="Fallidos" value={campaign.failedCount} color="red" />
                    <BigStat isDark={isDark} icon={<DollarSign className="w-5 h-5" />} label="Coste" value={`${campaign.estimatedCost.toFixed(2)}€`} color="orange" />
                </div>

                {/* Barra de progreso */}
                <div className={`p-5 rounded-xl border ${isDark ? 'bg-slate-800/30 border-white/5' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Progreso de envío</h3>
                        <span className="text-sm font-bold text-orange-500">{progress}%</span>
                    </div>
                    <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                        <div className="h-full bg-gradient-to-r from-orange-500 to-pink-600 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className={`mt-3 grid grid-cols-3 gap-3 text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        <div>✅ <strong className="text-green-500">{campaign.sentCount}</strong> enviados</div>
                        <div>❌ <strong className="text-red-500">{campaign.failedCount}</strong> fallidos</div>
                        <div>⏭️ <strong className="text-yellow-500">{campaign.skippedCount}</strong> saltados</div>
                    </div>
                    {campaign.sentCount + campaign.failedCount > 0 && (
                        <div className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Tasa de éxito: <strong>{successRate}%</strong>
                        </div>
                    )}
                </div>

                {/* Si es recurrente: configuración + historial de ejecuciones */}
                {(campaign as any).isRecurring && (
                    <div className={`p-5 rounded-xl border-2 ${isDark ? 'bg-purple-500/5 border-purple-500/30' : 'bg-purple-50/50 border-purple-200'}`}>
                        <div className="flex items-center gap-2 mb-3">
                            <Repeat className="w-5 h-5 text-purple-500" />
                            <h3 className={`text-sm font-bold ${isDark ? 'text-purple-300' : 'text-purple-800'}`}>Campaña recurrente</h3>
                            {(campaign as any).recurringConfig?.paused && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-500/20 text-amber-600">PAUSADA</span>
                            )}
                        </div>
                        {(campaign as any).recurringConfig && (() => {
                            const cfg = (campaign as any).recurringConfig;
                            const wd = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
                            let label = '';
                            if (cfg.frequency === 'daily') label = `cada día a las ${String(cfg.hour ?? 10).padStart(2, '0')}:00`;
                            if (cfg.frequency === 'weekly') label = `cada ${wd[cfg.dayOfWeek ?? 1]} a las ${String(cfg.hour ?? 10).padStart(2, '0')}:00`;
                            if (cfg.frequency === 'monthly') label = `el día ${cfg.dayOfMonth ?? 1} de cada mes a las ${String(cfg.hour ?? 10).padStart(2, '0')}:00`;
                            if (cfg.frequency === 'custom') label = `cada ${cfg.intervalDays ?? 7} días a las ${String(cfg.hour ?? 10).padStart(2, '0')}:00`;
                            return (
                                <div className={`text-sm mb-3 ${isDark ? 'text-purple-200' : 'text-purple-900'}`}>
                                    <strong>Cadencia:</strong> {label}
                                </div>
                            );
                        })()}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                            <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-900/40' : 'bg-white'}`}>
                                <div className={`font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Próxima ejecución</div>
                                <div className={`text-sm font-semibold mt-0.5 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                                    {(campaign as any).recurringNextRun ? formatDateTime((campaign as any).recurringNextRun) : '—'}
                                </div>
                            </div>
                            <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-900/40' : 'bg-white'}`}>
                                <div className={`font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Última ejecución</div>
                                <div className={`text-sm font-semibold mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    {(campaign as any).recurringLastRun ? formatDateTime((campaign as any).recurringLastRun) : 'Aún no ejecutada'}
                                </div>
                            </div>
                            <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-900/40' : 'bg-white'}`}>
                                <div className={`font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Ejecuciones totales</div>
                                <div className={`text-sm font-semibold mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    {executions.length}
                                </div>
                            </div>
                        </div>

                        {/* Historial de ejecuciones */}
                        <div className="mt-4">
                            <h4 className={`text-xs font-bold uppercase mb-2 flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                <History className="w-3 h-3" /> Historial de ejecuciones
                            </h4>
                            {executions.length === 0 ? (
                                <div className={`p-4 rounded-lg text-center text-xs ${isDark ? 'bg-slate-900/40 text-slate-500' : 'bg-white text-slate-400'}`}>
                                    Aún no se ha ejecutado ninguna vez. La primera ejecución será en {(campaign as any).recurringNextRun ? formatDateTime((campaign as any).recurringNextRun) : '—'}.
                                </div>
                            ) : (
                                <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                                    <table className="w-full text-xs">
                                        <thead className={`text-[10px] uppercase ${isDark ? 'bg-slate-900/60 text-slate-400' : 'bg-slate-50 text-slate-600'}`}>
                                            <tr>
                                                <th className="px-3 py-2 text-left">Cuándo</th>
                                                <th className="px-3 py-2 text-left">Estado</th>
                                                <th className="px-3 py-2 text-right">Enviados</th>
                                                <th className="px-3 py-2 text-right">Fallidos</th>
                                                <th className="px-3 py-2 text-right">Saltados</th>
                                                <th className="px-3 py-2 text-right">Coste</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {executions.map((ex, i) => {
                                                const exBadge = getStatusBadge(ex.status, isDark);
                                                return (
                                                    <tr key={i} className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                                        <td className={`px-3 py-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{formatDateTime(ex.startedAt || ex.createdAt || '')}</td>
                                                        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${exBadge.cls}`}>{exBadge.label}</span></td>
                                                        <td className="px-3 py-2 text-right text-green-500 font-semibold">{ex.sentCount}</td>
                                                        <td className="px-3 py-2 text-right text-red-500 font-semibold">{ex.failedCount}</td>
                                                        <td className="px-3 py-2 text-right text-yellow-500 font-semibold">{ex.skippedCount}</td>
                                                        <td className={`px-3 py-2 text-right ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{ex.estimatedCost.toFixed(2)}€</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Notas/errores */}
                {campaign.notes && (
                    <div className={`p-4 rounded-xl border-l-4 border-red-500 text-xs ${isDark ? 'bg-red-500/5 text-red-300' : 'bg-red-50 text-red-700'}`}>
                        <p className="font-bold mb-1">Errores recientes:</p>
                        <p className="whitespace-pre-wrap font-mono">{campaign.notes}</p>
                    </div>
                )}

                {/* Tabla de envíos */}
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                    <div className={`px-4 py-3 flex items-center justify-between ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                        <h3 className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Detalle de envíos ({sends.length})</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {sends.length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-500">Sin envíos registrados todavía.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className={`text-xs uppercase ${isDark ? 'bg-slate-800/60 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                                    <tr>
                                        <th className="px-4 py-2 text-left">Teléfono</th>
                                        <th className="px-4 py-2 text-left">Estado</th>
                                        <th className="px-4 py-2 text-left">Cuándo</th>
                                        <th className="px-4 py-2 text-left">Motivo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sends.map((s, i) => (
                                        <tr key={i} className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                            <td className={`px-4 py-2 font-mono text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>+{s.phone}</td>
                                            <td className="px-4 py-2"><SendStatusBadge status={s.status} /></td>
                                            <td className={`px-4 py-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.sentAt ? formatDateTime(s.sentAt) : '-'}</td>
                                            <td className={`px-4 py-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.error || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const BigStat: React.FC<any> = ({ isDark, icon, label, value, color }) => {
    const colorMap: Record<string, string> = {
        green: 'from-green-500 to-emerald-600 text-green-500',
        red: 'from-red-500 to-rose-600 text-red-500',
        blue: 'from-blue-500 to-indigo-600 text-blue-500',
        orange: 'from-orange-500 to-pink-600 text-orange-500',
    };
    return (
        <div className={`p-5 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-white/5' : 'bg-white border-slate-200'}`}>
            <div className={`p-2 rounded-lg w-fit mb-3 bg-gradient-to-br ${colorMap[color] || colorMap.blue}`}>
                <div className="text-white">{icon}</div>
            </div>
            <div className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</div>
            <div className={`text-xs uppercase font-bold tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</div>
        </div>
    );
};

const SendStatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const map: Record<string, { cls: string; label: string }> = {
        sent: { cls: 'bg-green-500/20 text-green-500', label: '✓ Enviado' },
        delivered: { cls: 'bg-green-600/20 text-green-600', label: '✓✓ Entregado' },
        read: { cls: 'bg-blue-500/20 text-blue-500', label: '👁 Leído' },
        failed: { cls: 'bg-red-500/20 text-red-500', label: '✗ Falló' },
        skipped: { cls: 'bg-yellow-500/20 text-yellow-500', label: '⏭ Saltado' },
        pending: { cls: 'bg-slate-500/20 text-slate-500', label: '⏳ Pendiente' },
    };
    const item = map[status] || { cls: 'bg-slate-500/20 text-slate-500', label: status };
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.cls}`}>{item.label}</span>;
};

// ===========================
//  HELPERS
// ===========================
function getStatusBadge(status: string, _isDark: boolean) {
    const map: Record<string, { cls: string; label: string }> = {
        draft: { cls: 'bg-slate-500/20 text-slate-500', label: 'Borrador' },
        scheduled: { cls: 'bg-blue-500/20 text-blue-500', label: 'Programada' },
        running: { cls: 'bg-yellow-500/20 text-yellow-600 animate-pulse', label: 'Enviando' },
        completed: { cls: 'bg-green-500/20 text-green-600', label: 'Completada' },
        failed: { cls: 'bg-red-500/20 text-red-500', label: 'Fallida' },
        cancelled: { cls: 'bg-slate-500/20 text-slate-500', label: 'Cancelada' },
        recurring: { cls: 'bg-purple-500/20 text-purple-600', label: 'Activa' },
    };
    return map[status] || { cls: 'bg-slate-500/20 text-slate-500', label: status };
}

function formatDateTime(iso: string): string {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
}

function toLocalDateTimeInput(iso: string): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        const off = d.getTimezoneOffset();
        const local = new Date(d.getTime() - off * 60000);
        return local.toISOString().slice(0, 16);
    } catch { return ''; }
}

function previewWithVariables(body: string, variables: string[]): string {
    return body.replace(/\{\{(\d+)\}\}/g, (_m, idx) => {
        const i = Number(idx) - 1;
        const v = variables[i] || `{{${idx}}}`;
        // Mostrar el placeholder de personalización tal cual
        return v;
    });
}

export default CampaignsDashboard;
