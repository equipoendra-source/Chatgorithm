import { useEffect, useState } from 'react';
import { AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface TeamAlert {
    type: 'send_failed' | 'template_failed' | 'appointment_race' | 'ia_fallback' | 'gemini_quota' | 'webhook_bad_sig' | 'client_opt_out';
    severity: 'warning' | 'error' | 'critical';
    message: string;
    context?: any;
    timestamp: string;
    id?: string; // generado en cliente para tracking
}

interface AlertCenterProps {
    socket: any;
    isAdmin: boolean;
}

// Componente global que escucha eventos team_alert por socket y muestra toasts.
// Solo visible para administradores (los agentes no necesitan ver alertas técnicas).
//
// Las alertas se quedan visibles hasta que el admin las descarte manualmente
// (botón X). Nada de auto-dismiss para que ninguna alerta se pierda aunque el
// admin no esté mirando la pantalla en ese momento.
//
// Máximo 5 toasts visibles a la vez. Si llegan más, se descartan los más viejos
// (excepto los critical, que quedan hasta cerrar).
export function AlertCenter({ socket, isAdmin }: AlertCenterProps) {
    const [alerts, setAlerts] = useState<TeamAlert[]>([]);
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    useEffect(() => {
        if (!socket || !isAdmin) return;
        const onAlert = (alert: TeamAlert) => {
            const withId = { ...alert, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
            setAlerts(prev => {
                // Insertar la nueva al principio (la más reciente primero)
                const next = [withId, ...prev];
                if (next.length <= 5) return next;
                // Hay >5 alertas. Estrategia: conservar las 5 MÁS RECIENTES
                // dando prioridad a las críticas. Es decir:
                //   1) Quedarnos con todas las críticas más recientes (hasta 5).
                //   2) Si quedan huecos, rellenar con las no-críticas más recientes.
                // Así, si entran 6 críticas seguidas, las 5 últimas se ven
                // (no las 5 primeras como hacía la lógica anterior).
                const criticals = next.filter(a => a.severity === 'critical').slice(0, 5);
                const remaining = 5 - criticals.length;
                const nonCriticals = remaining > 0
                    ? next.filter(a => a.severity !== 'critical').slice(0, remaining)
                    : [];
                // Mantener el orden cronológico mezclando ambos por orden de
                // aparición original (recientes primero).
                const keep = new Set([...criticals, ...nonCriticals].map(a => a.id));
                return next.filter(a => keep.has(a.id!));
            });
            // Sin auto-dismiss: el admin debe cerrar cada alerta manualmente
            // pulsando la X. Antes warning duraba 10s y error 20s, pero el
            // admin se las perdía si estaba ocupado.
        };
        socket.on('team_alert', onAlert);
        return () => { socket.off('team_alert', onAlert); };
    }, [socket, isAdmin]);

    const dismissAlert = (id: string) => {
        setAlerts(prev => prev.filter(a => a.id !== id));
    };

    if (!isAdmin || alerts.length === 0) return null;

    // Estilos por severidad
    const severityStyle = (sev: TeamAlert['severity']) => {
        if (sev === 'critical') {
            return {
                bg: isDark ? 'bg-red-900/95 border-red-700' : 'bg-red-50 border-red-300',
                icon: 'text-red-500',
                title: isDark ? 'text-red-200' : 'text-red-800',
                body: isDark ? 'text-red-100' : 'text-red-700',
                Icon: AlertOctagon
            };
        }
        if (sev === 'error') {
            return {
                bg: isDark ? 'bg-orange-900/95 border-orange-700' : 'bg-orange-50 border-orange-300',
                icon: 'text-orange-500',
                title: isDark ? 'text-orange-200' : 'text-orange-800',
                body: isDark ? 'text-orange-100' : 'text-orange-700',
                Icon: AlertTriangle
            };
        }
        return {
            bg: isDark ? 'bg-amber-900/95 border-amber-700' : 'bg-amber-50 border-amber-300',
            icon: 'text-amber-500',
            title: isDark ? 'text-amber-200' : 'text-amber-800',
            body: isDark ? 'text-amber-100' : 'text-amber-700',
            Icon: Info
        };
    };

    // Etiqueta legible por tipo
    const typeLabel = (t: TeamAlert['type']) => {
        switch (t) {
            case 'send_failed': return 'Envío fallido';
            case 'template_failed': return 'Plantilla rechazada';
            case 'appointment_race': return 'Conflicto de cita';
            case 'ia_fallback': return 'Laura ha fallado';
            case 'gemini_quota': return 'Cuota IA agotada';
            case 'webhook_bad_sig': return '⚠️ Webhook sospechoso';
            case 'client_opt_out': return '🚫 Cliente se dio de baja';
            default: return t;
        }
    };

    return (
        <div
            className="fixed safe-toast-top right-4 z-[9999] flex flex-col gap-3 max-w-md w-full pointer-events-none"
            aria-live="polite"
        >
            {alerts.map(a => {
                const s = severityStyle(a.severity);
                const time = new Date(a.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                return (
                    <div
                        key={a.id}
                        className={`pointer-events-auto rounded-xl border-2 shadow-2xl ${s.bg} p-4 animate-slideInRight`}
                        style={{ animation: 'slideInRight 0.3s ease-out' }}
                    >
                        <div className="flex items-start gap-3">
                            <s.Icon className={`w-6 h-6 ${s.icon} flex-shrink-0 mt-0.5`} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className={`font-bold text-sm ${s.title}`}>
                                        {typeLabel(a.type)}
                                    </p>
                                    <span className={`text-xs ${s.body} opacity-70`}>{time}</span>
                                </div>
                                <p className={`text-sm ${s.body} leading-snug break-words`}>
                                    {a.message}
                                </p>
                                {a.severity === 'critical' && (
                                    <p className={`text-xs mt-2 ${s.body} opacity-80 italic`}>
                                        Esta alerta requiere tu atención. Cierra manualmente cuando la hayas revisado.
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => dismissAlert(a.id!)}
                                className={`p-1 rounded hover:bg-black/10 ${s.icon} flex-shrink-0`}
                                aria-label="Cerrar alerta"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                );
            })}
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
