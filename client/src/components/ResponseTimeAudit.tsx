import { useState, useEffect, useRef } from 'react';
import {
    Lock, Clock, AlertTriangle, TrendingUp, MessageCircle,
    Loader2, CheckCircle2, XCircle, Award, Calendar, Activity, ChevronRight,
    BarChart3, Sparkles, Download, FileDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

const SUPPORT_PHONE = '34711246279';

interface AuditData {
    success: boolean;
    range: { days: number; since: string };
    kpis: {
        avgFirstResponseMinutes: number;
        medianFirstResponseMinutes: number;
        pendingOver1h: number;
        pendingOver24h: number;
        abandonedConversations: number;
        abandonedRatio: number;
        totalIncoming: number;
        totalOutgoing: number;
        totalConversations: number;
        totalResponses: number;
        healthScore: number;
    };
    agentRanking: { name: string; responses: number; avgMinutes: number }[];
    heatmap: (number | null)[][];
    trend: { date: string; avgMinutes: number; count: number }[];
    topPending: { phone: string; hoursWaiting: number; since: string }[];
    recommendations: { level: 'info' | 'warning' | 'critical'; text: string }[];
}

const formatMinutes = (m: number): string => {
    if (m < 1) return '<1 min';
    if (m < 60) return `${Math.round(m)} min`;
    if (m < 1440) return `${(m / 60).toFixed(1)} h`;
    return `${(m / 1440).toFixed(1)} días`;
};

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface Props { isFeatureEnabled: boolean | null; }

export default function ResponseTimeAudit({ isFeatureEnabled }: Props) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [data, setData] = useState<AuditData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [days, setDays] = useState(30);

    useEffect(() => {
        if (isFeatureEnabled !== true) return;
        loadAudit();
    }, [isFeatureEnabled, days]);

    const loadAudit = async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${API_URL}/audit/response-times?days=${days}`);
            const json = await res.json();
            if (!res.ok) {
                if (json.error === 'feature_locked') {
                    // Feature locked: trataremos como bloqueado
                    setData(null);
                } else {
                    setError(json.error || 'Error cargando auditoría');
                }
            } else {
                setData(json);
            }
        } catch (e: any) {
            setError('Error de conexión: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    // ====================================================
    //   VISTA BLOQUEADA (módulo NO contratado)
    // ====================================================
    if (isFeatureEnabled === false || (isFeatureEnabled === null)) {
        return <LockedView isDark={isDark} unknown={isFeatureEnabled === null} />;
    }

    // ====================================================
    //   VISTA DESBLOQUEADA
    // ====================================================
    if (loading) {
        return (
            <div className="w-full h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="animate-spin" size={32} />
                <p className="text-sm font-medium">Analizando conversaciones de los últimos {days} días...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`p-6 rounded-2xl border text-center ${isDark ? 'bg-red-900/20 border-red-800/50' : 'bg-red-50 border-red-200'}`}>
                <XCircle className="text-red-500 mx-auto mb-2" size={40} />
                <p className={`font-semibold ${isDark ? 'text-red-300' : 'text-red-700'}`}>{error}</p>
                <button onClick={loadAudit} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold">Reintentar</button>
            </div>
        );
    }

    if (!data) return null;

    return <UnlockedView data={data} isDark={isDark} days={days} setDays={setDays} />;
}

// ============================================================
//   VISTA BLOQUEADA — promo + preview difuminada
// ============================================================
function LockedView({ isDark, unknown }: { isDark: boolean; unknown: boolean }) {
    const waMessage = encodeURIComponent('Hola Alex, quiero activar el módulo de Auditoría de Respuesta (199€) en mi cuenta de Chatgorim. ¿Cómo procedemos?');
    const waLink = `https://wa.me/${SUPPORT_PHONE}?text=${waMessage}`;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Banner principal */}
            <div className={`rounded-3xl overflow-hidden border-2 ${isDark ? 'border-amber-600/40 bg-gradient-to-br from-amber-900/30 via-orange-900/20 to-yellow-900/20' : 'border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50'}`}>
                <div className="p-8 md:p-12 text-center">
                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-4 ${isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-200 text-amber-800'}`}>
                        <Sparkles size={14} /> MÓDULO PREMIUM
                    </div>
                    <div className={`p-4 rounded-2xl w-fit mx-auto mb-4 ${isDark ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
                        <Lock className={isDark ? 'text-amber-400' : 'text-amber-600'} size={48} />
                    </div>
                    <h1 className={`text-3xl md:text-4xl font-black mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        Auditoría de Respuesta
                    </h1>
                    <p className={`text-base md:text-lg max-w-2xl mx-auto mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        Descubre <strong>cuánto tarda tu equipo en responder</strong>, identifica cuellos de botella y recibe recomendaciones automáticas para mejorar tus ventas.
                    </p>
                    {unknown && (
                        <p className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>(Comprobando estado de tu cuenta...)</p>
                    )}
                </div>
            </div>

            {/* Beneficios */}
            <div className="grid md:grid-cols-2 gap-4">
                {[
                    { icon: <Clock size={20} />, title: 'Tiempo medio de 1ª respuesta', desc: 'Conoce exactamente cuánto tarda tu equipo en contestar al cliente.' },
                    { icon: <Award size={20} />, title: 'Ranking de productividad', desc: 'Compara a cada miembro del equipo y detecta los más rápidos.' },
                    { icon: <Activity size={20} />, title: 'Mapa de calor por horario', desc: 'Visualiza qué franjas son las más lentas para reforzar turnos.' },
                    { icon: <AlertTriangle size={20} />, title: 'Mensajes sin contestar', desc: 'Lista en tiempo real de clientes que llevan más de 1h y 24h esperando.' },
                    { icon: <TrendingUp size={20} />, title: 'Tendencias mensuales', desc: 'Mejora o empeora cada mes - todo en un gráfico claro.' },
                    { icon: <Sparkles size={20} />, title: 'Recomendaciones IA', desc: 'Consejos específicos para mejorar la atención de tu negocio.' }
                ].map((f, i) => (
                    <div key={i} className={`p-5 rounded-2xl border flex gap-3 items-start ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
                        <div className={`p-2 rounded-lg shrink-0 ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                            {f.icon}
                        </div>
                        <div>
                            <div className={`font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{f.title}</div>
                            <div className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{f.desc}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Preview difuminada con datos de ejemplo */}
            <div className="relative">
                <div className="filter blur-[3px] pointer-events-none select-none opacity-70">
                    <FakePreview isDark={isDark} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`px-6 py-3 rounded-full text-sm font-black uppercase tracking-wider shadow-2xl ${isDark ? 'bg-amber-500 text-amber-950' : 'bg-amber-500 text-white'}`}>
                        🔒 Vista bloqueada
                    </div>
                </div>
            </div>

            {/* CTA precio */}
            <div className={`p-8 rounded-3xl border-2 text-center ${isDark ? 'bg-gradient-to-br from-emerald-900/30 to-teal-900/30 border-emerald-700/50' : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300'}`}>
                <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    Pago único · Sin cuotas mensuales
                </div>
                <div className="flex items-center justify-center gap-2 mb-1">
                    <span className={`text-6xl md:text-7xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>199</span>
                    <span className={`text-3xl font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>€</span>
                </div>
                <div className={`text-sm mb-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Activación inmediata · Acceso de por vida al módulo
                </div>
                <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold text-lg rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
                >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                    Activar este módulo
                    <ChevronRight size={20} />
                </a>
                <div className={`text-xs mt-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Te llevará a WhatsApp · Mensaje pre-rellenado · Activación en menos de 1h
                </div>
            </div>

            {/* Testimonios falsos / casos de éxito (opcional) */}
            <div className={`p-6 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    💡 ¿Por qué activar este módulo?
                </div>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                    <div className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                        <strong className={isDark ? 'text-white' : 'text-slate-900'}>📈 Aumenta conversión:</strong> los clientes que reciben respuesta en menos de 5 minutos compran 9× más.
                    </div>
                    <div className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                        <strong className={isDark ? 'text-white' : 'text-slate-900'}>👥 Mejora al equipo:</strong> identifica empleados que necesitan formación o más recursos.
                    </div>
                    <div className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                        <strong className={isDark ? 'text-white' : 'text-slate-900'}>⏰ Optimiza turnos:</strong> sabe exactamente qué franja necesita refuerzo.
                    </div>
                </div>
            </div>
        </div>
    );
}

// Preview de ejemplo (datos falsos para mostrar difuminado)
function FakePreview({ isDark }: { isDark: boolean }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: '1ª respuesta', value: '14m', color: 'emerald' },
                    { label: 'Mediana', value: '8m', color: 'blue' },
                    { label: 'Sin contestar +1h', value: '23', color: 'amber' },
                    { label: 'Abandonadas', value: '4%', color: 'red' }
                ].map((k, i) => (
                    <div key={i} className={`p-5 rounded-2xl border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                        <div className="text-xs text-slate-400 font-semibold uppercase mb-2">{k.label}</div>
                        <div className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{k.value}</div>
                    </div>
                ))}
            </div>
            <div className={`p-6 rounded-2xl border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="text-xs font-bold uppercase mb-4 text-slate-400">Ranking del equipo</div>
                {['Pepe', 'María', 'Juan', 'Antonio'].map((n, i) => (
                    <div key={i} className="flex justify-between py-2 border-b border-slate-200/30">
                        <span>{n}</span>
                        <span>{['8m', '12m', '24m', '38m'][i]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================
//   VISTA DESBLOQUEADA — dashboard real
// ============================================================
function UnlockedView({ data, isDark, days, setDays }: { data: AuditData; isDark: boolean; days: number; setDays: (n: number) => void }) {
    const k = data.kpis;
    const reportRef = useRef<HTMLDivElement>(null);
    const [generatingPdf, setGeneratingPdf] = useState(false);

    // Genera PDF capturando el dashboard como imagen y partiéndolo en páginas A4
    const exportToPdf = async () => {
        if (!reportRef.current) return;
        setGeneratingPdf(true);
        try {
            // Pequeña espera para que React/animaciones terminen de pintar
            await new Promise(r => setTimeout(r, 200));

            const node = reportRef.current;
            const canvas = await html2canvas(node, {
                scale: 2, // alta resolución
                useCORS: true,
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                logging: false,
                windowWidth: node.scrollWidth,
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
            const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm
            const marginTop = 18;
            const marginBottom = 12;
            const marginX = 10;
            const usableW = pdfWidth - marginX * 2;
            const imgWmm = usableW;
            const imgHmm = (canvas.height * imgWmm) / canvas.width;

            // Cabecera
            const drawHeader = (pageNum: number, pageTotal: number) => {
                pdf.setFillColor(245, 158, 11); // amber-500
                pdf.rect(0, 0, pdfWidth, 12, 'F');
                pdf.setTextColor(255, 255, 255);
                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'bold');
                pdf.text('Auditoría de Respuesta · Chatgorim', marginX, 8);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
                pdf.text(`${dateStr} · Últimos ${days} días`, pdfWidth - marginX, 8, { align: 'right' });
                // Pie
                pdf.setTextColor(150, 150, 150);
                pdf.setFontSize(7);
                pdf.text(`Página ${pageNum}/${pageTotal} · Generado por Chatgorim`, pdfWidth / 2, pdfHeight - 5, { align: 'center' });
            };

            // Si la imagen entera cabe en una página, una y listo
            if (imgHmm <= pdfHeight - marginTop - marginBottom) {
                const totalPages = 1;
                drawHeader(1, totalPages);
                pdf.addImage(imgData, 'PNG', marginX, marginTop, imgWmm, imgHmm);
            } else {
                // Partir en varias páginas usando una técnica de canvas trozos
                const pageContentH = pdfHeight - marginTop - marginBottom; // mm útiles por página
                const pxPerMm = canvas.width / imgWmm;
                const pageContentPx = Math.floor(pageContentH * pxPerMm);
                const totalPages = Math.ceil(canvas.height / pageContentPx);

                for (let i = 0; i < totalPages; i++) {
                    if (i > 0) pdf.addPage();
                    drawHeader(i + 1, totalPages);
                    // Canvas temporal con la "ventana" de esta página
                    const sliceH = Math.min(pageContentPx, canvas.height - i * pageContentPx);
                    const tmp = document.createElement('canvas');
                    tmp.width = canvas.width;
                    tmp.height = sliceH;
                    const ctx = tmp.getContext('2d');
                    if (!ctx) continue;
                    ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
                    ctx.fillRect(0, 0, tmp.width, tmp.height);
                    ctx.drawImage(canvas, 0, i * pageContentPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
                    const sliceData = tmp.toDataURL('image/png');
                    const sliceHmm = (sliceH / pxPerMm);
                    pdf.addImage(sliceData, 'PNG', marginX, marginTop, imgWmm, sliceHmm);
                }
            }

            const dateFile = new Date().toISOString().split('T')[0];
            pdf.save(`auditoria-respuesta-${dateFile}.pdf`);
        } catch (e: any) {
            console.error('[PDF] Error generando:', e);
            alert('Error generando PDF: ' + e.message);
        } finally {
            setGeneratingPdf(false);
        }
    };

    const card = `p-5 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`;

    const healthColor = k.healthScore >= 80 ? 'emerald' : k.healthScore >= 60 ? 'blue' : k.healthScore >= 40 ? 'amber' : 'red';
    const healthBg = {
        emerald: isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700',
        blue: isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700',
        amber: isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700',
        red: isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700',
    }[healthColor];

    const trendMax = Math.max(1, ...data.trend.map(t => t.avgMinutes));

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header (fuera del PDF) */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <BarChart3 className="text-emerald-500" size={28} />
                        <h1 className={`text-2xl md:text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Auditoría de Respuesta</h1>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>ACTIVO</span>
                    </div>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Análisis de los últimos {days} días · {k.totalConversations} conversaciones · {k.totalResponses} respuestas medidas
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={days}
                        onChange={e => setDays(Number(e.target.value))}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300'}`}
                    >
                        <option value={7}>Últimos 7 días</option>
                        <option value={30}>Últimos 30 días</option>
                        <option value={60}>Últimos 60 días</option>
                        <option value={90}>Últimos 90 días</option>
                    </select>
                    <button
                        onClick={exportToPdf}
                        disabled={generatingPdf}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Genera un PDF profesional con todo el informe"
                    >
                        {generatingPdf ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
                        {generatingPdf ? 'Generando...' : 'Descargar PDF'}
                    </button>
                </div>
            </div>

            {/* Contenido capturable para PDF */}
            <div ref={reportRef} className="space-y-6">

            {/* Health Score grande */}
            <div className={`p-6 rounded-3xl border ${card}`}>
                <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className={`relative w-32 h-32 rounded-full flex items-center justify-center ${healthBg}`}>
                        <div className="text-center">
                            <div className="text-4xl font-black">{k.healthScore}</div>
                            <div className="text-[10px] font-bold uppercase opacity-70">Score</div>
                        </div>
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <div className={`text-xs font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Salud de atención al cliente</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                            {k.healthScore >= 80 ? '✅ Excelente' :
                                k.healthScore >= 60 ? '👍 Buena' :
                                    k.healthScore >= 40 ? '⚠️ Mejorable' :
                                        '🚨 Crítica'}
                        </div>
                        <div className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Basado en tiempo de respuesta, mensajes pendientes y conversaciones abandonadas.
                        </div>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard isDark={isDark} icon={<Clock size={22} />} title="1ª respuesta" value={formatMinutes(k.avgFirstResponseMinutes)} color="emerald" sub={`Mediana: ${formatMinutes(k.medianFirstResponseMinutes)}`} />
                <KpiCard isDark={isDark} icon={<AlertTriangle size={22} />} title="Pendientes +1h" value={String(k.pendingOver1h)} color={k.pendingOver1h > 5 ? 'red' : 'amber'} sub={`+24h: ${k.pendingOver24h}`} />
                <KpiCard isDark={isDark} icon={<XCircle size={22} />} title="Abandonadas" value={`${k.abandonedRatio}%`} color={k.abandonedRatio > 15 ? 'red' : 'blue'} sub={`${k.abandonedConversations} conv.`} />
                <KpiCard isDark={isDark} icon={<MessageCircle size={22} />} title="Total mensajes" value={String(k.totalIncoming + k.totalOutgoing)} color="purple" sub={`📥${k.totalIncoming} · 📤${k.totalOutgoing}`} />
            </div>

            {/* Recomendaciones automáticas */}
            <div className={`p-6 rounded-2xl border ${card}`}>
                <h3 className={`font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                    <Sparkles className="text-purple-500" size={20} /> Recomendaciones inteligentes
                </h3>
                <div className="space-y-2">
                    {data.recommendations.map((r, i) => {
                        const colors = {
                            critical: isDark ? 'bg-red-900/30 border-red-700/50 text-red-200' : 'bg-red-50 border-red-200 text-red-800',
                            warning: isDark ? 'bg-amber-900/30 border-amber-700/50 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800',
                            info: isDark ? 'bg-blue-900/30 border-blue-700/50 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-800',
                        };
                        const icons = {
                            critical: '🚨',
                            warning: '⚠️',
                            info: '💡',
                        };
                        return (
                            <div key={i} className={`p-4 rounded-xl border text-sm flex gap-2 items-start ${colors[r.level]}`}>
                                <span className="text-lg shrink-0">{icons[r.level]}</span>
                                <span>{r.text}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Tendencia */}
            <div className={`p-6 rounded-2xl border ${card}`}>
                <h3 className={`font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                    <TrendingUp className="text-blue-500" size={20} /> Tendencia ({days} días)
                </h3>
                <div className="h-40 flex items-end gap-1">
                    {data.trend.map((t, i) => {
                        const heightPct = (t.avgMinutes / trendMax) * 100;
                        return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                <div className={`w-full rounded-t transition-all flex-1 flex items-end ${isDark ? 'bg-slate-700/40' : 'bg-slate-100'}`}>
                                    <div
                                        className="w-full rounded-t bg-gradient-to-t from-blue-500 to-blue-400 transition-all"
                                        style={{ height: `${Math.max(heightPct, t.count > 0 ? 2 : 0)}%` }}
                                    />
                                </div>
                                <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10">
                                    {t.date}: {formatMinutes(t.avgMinutes)} ({t.count})
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-2">
                    <span>{data.trend[0]?.date}</span>
                    <span>{data.trend[data.trend.length - 1]?.date}</span>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                {/* Ranking de agentes */}
                <div className={`p-6 rounded-2xl border ${card}`}>
                    <h3 className={`font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                        <Award className="text-yellow-500" size={20} /> Ranking del equipo
                    </h3>
                    {data.agentRanking.length === 0 ? (
                        <p className="text-sm text-slate-400 italic text-center py-6">Sin datos suficientes</p>
                    ) : (
                        <div className="space-y-2">
                            {data.agentRanking.map((a, i) => {
                                const isBest = i === 0;
                                const isWorst = i === data.agentRanking.length - 1 && data.agentRanking.length > 1;
                                return (
                                    <div key={i} className={`flex justify-between items-center p-3 rounded-xl border ${isBest ? (isDark ? 'bg-emerald-900/20 border-emerald-700/50' : 'bg-emerald-50 border-emerald-200') : isWorst ? (isDark ? 'bg-red-900/20 border-red-700/50' : 'bg-red-50 border-red-200') : (isDark ? 'bg-slate-800/30 border-slate-700' : 'bg-slate-50 border-slate-200')}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isBest ? 'bg-emerald-500 text-white' : isWorst ? 'bg-red-500 text-white' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                                                {i + 1}
                                            </div>
                                            <span className={`font-bold text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{a.name}</span>
                                            {isBest && <span className="text-[10px] font-bold text-emerald-600">🏆 MÁS RÁPIDO</span>}
                                        </div>
                                        <div className="text-right">
                                            <div className={`font-mono font-bold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{formatMinutes(a.avgMinutes)}</div>
                                            <div className="text-[10px] text-slate-400">{a.responses} respuestas</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Top pendientes */}
                <div className={`p-6 rounded-2xl border ${card}`}>
                    <h3 className={`font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                        <AlertTriangle className="text-red-500" size={20} /> Esperando respuesta ahora
                    </h3>
                    {data.topPending.length === 0 ? (
                        <div className="text-center py-6">
                            <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={32} />
                            <p className="text-sm text-emerald-600 font-bold">¡Sin pendientes! Cero clientes esperando.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {data.topPending.map((p, i) => {
                                const urgent = p.hoursWaiting > 24;
                                return (
                                    <div key={i} className={`flex justify-between items-center p-3 rounded-xl border ${urgent ? (isDark ? 'bg-red-900/20 border-red-700/50' : 'bg-red-50 border-red-200') : (isDark ? 'bg-amber-900/20 border-amber-700/50' : 'bg-amber-50 border-amber-200')}`}>
                                        <div className="font-mono text-sm">{p.phone}</div>
                                        <div className={`text-sm font-bold ${urgent ? 'text-red-600' : 'text-amber-600'}`}>
                                            {p.hoursWaiting < 1 ? `${Math.round(p.hoursWaiting * 60)} min` : p.hoursWaiting > 48 ? `${Math.round(p.hoursWaiting / 24)}d` : `${p.hoursWaiting}h`}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Heatmap día×hora */}
            <div className={`p-6 rounded-2xl border ${card}`}>
                <h3 className={`font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                    <Calendar className="text-purple-500" size={20} /> Mapa de calor: tiempo medio por hora
                </h3>
                <div className="overflow-x-auto">
                    <table className="text-[10px] w-full">
                        <thead>
                            <tr>
                                <th></th>
                                {Array.from({ length: 24 }).map((_, h) => (
                                    <th key={h} className={`px-1 py-1 font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.heatmap.map((row, d) => (
                                <tr key={d}>
                                    <td className={`px-2 py-1 font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{WEEKDAYS[d]}</td>
                                    {row.map((val, h) => {
                                        if (val === null) {
                                            return <td key={h} className={`p-1 ${isDark ? 'bg-slate-800/30' : 'bg-slate-100'}`}><div className="w-5 h-5 rounded" /></td>;
                                        }
                                        // Color escalado: verde (rápido) → rojo (lento)
                                        const intensity = Math.min(1, val / 60); // 0-1
                                        const r = Math.round(34 + intensity * 200);
                                        const g = Math.round(197 - intensity * 150);
                                        const b = Math.round(94 - intensity * 50);
                                        return (
                                            <td key={h} className="p-1" title={`${WEEKDAYS[d]} ${h}h: ${formatMinutes(val)}`}>
                                                <div className="w-5 h-5 rounded" style={{ backgroundColor: `rgb(${r},${g},${b})` }} />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-400">
                    <span>Más rápido</span>
                    <div className="flex gap-0.5">
                        {[0, 0.25, 0.5, 0.75, 1].map((i, idx) => {
                            const r = Math.round(34 + i * 200);
                            const g = Math.round(197 - i * 150);
                            const b = Math.round(94 - i * 50);
                            return <div key={idx} className="w-4 h-4 rounded" style={{ backgroundColor: `rgb(${r},${g},${b})` }} />;
                        })}
                    </div>
                    <span>Más lento</span>
                </div>
            </div>
            </div> {/* fin reportRef */}
        </div>
    );
}

function KpiCard({ isDark, icon, title, value, color, sub }: { isDark: boolean; icon: React.ReactNode; title: string; value: string; color: string; sub?: string }) {
    const colorMap: Record<string, string> = {
        emerald: isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700',
        blue: isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700',
        amber: isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700',
        red: isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700',
        purple: isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700',
    };
    return (
        <div className={`p-5 rounded-2xl border ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'} shadow-sm`}>
            <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${colorMap[color]}`}>{icon}</div>
            </div>
            <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{title}</div>
            <div className={`text-2xl font-bold mt-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>{value}</div>
            {sub && <div className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</div>}
        </div>
    );
}
