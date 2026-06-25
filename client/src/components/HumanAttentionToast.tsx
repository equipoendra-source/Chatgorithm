import { useEffect, useRef } from 'react';
import { AlertTriangle, X, Smartphone } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export interface HumanAttentionNotification {
    id: string;                  // único (phone + timestamp) para evitar duplicados
    phone: string;               // teléfono normalizado del cliente
    clientName: string;
    reason: 'human_request' | 'customer_upset' | 'assigned_to_dept';
    reasonLabel: string;         // texto legible: "pide hablar con una persona" / "parece molesto/a" / "derivado al equipo"
    snippet?: string;            // fragmento del mensaje del cliente que disparó / contexto del aviso
    source: 'keyword' | 'bot' | 'department';   // de dónde vino la detección (interno)
    accountId?: string;
    accountName?: string;
    createdAt: string;           // ISO de cuándo se generó
}

interface Props {
    notifications: HumanAttentionNotification[];
    onOpen: (n: HumanAttentionNotification) => void;
    onDismiss: (id: string) => void;
}

// Toast URGENTE de atención humana — distinto a las notificaciones de cita:
// - Color rojo intenso, icono de alarma 🚨 con animación.
// - Sonido distinto (más urgente) al recibirse cada nuevo aviso.
// - No desaparece solo (igual que las citas), pero la franja roja y la
//   animación hacen que sea imposible no verlo.
// Click → abre el chat de ese cliente.
export function HumanAttentionToast({ notifications, onOpen, onDismiss }: Props) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const knownIdsRef = useRef<Set<string>>(new Set());
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Sonido distinto al de las citas: dos pitidos secuenciales generados con
    // Web Audio API (no requiere asset externo).
    useEffect(() => {
        const newIds = notifications.filter(n => !knownIdsRef.current.has(n.id));
        if (newIds.length > 0) {
            playUrgentBeep();
        }
        knownIdsRef.current = new Set(notifications.map(n => n.id));
    }, [notifications]);

    if (notifications.length === 0) return null;

    return (
        <div className="fixed safe-toast-top right-4 z-[10000] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-96 pointer-events-none">
            {notifications.map(n => (
                <div
                    key={n.id}
                    onClick={() => onOpen(n)}
                    className={`pointer-events-auto cursor-pointer rounded-2xl border-2 shadow-2xl backdrop-blur-md p-4 transition-all hover:scale-[1.02] animate-pulse-slow ${isDark
                        ? 'bg-red-950/95 border-red-500 shadow-red-500/40 text-white'
                        : 'bg-red-50 border-red-500 shadow-red-500/30 text-red-950'
                        }`}
                    style={{ animation: 'attentionPulse 1.6s ease-in-out infinite' }}
                >
                    <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl flex-shrink-0 ${isDark ? 'bg-red-500/30 text-red-300' : 'bg-red-500 text-white'}`}>
                            <AlertTriangle size={22} className="animate-bounce" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                🚨 URGENTE — Atención humana
                            </div>
                            <div className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-red-950'}`}>
                                {n.clientName}
                            </div>
                            <div className={`text-xs mt-0.5 ${isDark ? 'text-red-200' : 'text-red-800'}`}>
                                {n.reasonLabel}
                            </div>
                            {n.snippet && (
                                <div className={`text-xs mt-2 italic line-clamp-2 px-2 py-1 rounded-md ${isDark ? 'bg-red-900/40 text-red-100' : 'bg-red-100 text-red-900'}`}>
                                    "{n.snippet}"
                                </div>
                            )}
                            {n.accountName && (
                                <div className="flex items-center gap-1 mt-2 text-[10px] opacity-70">
                                    <Smartphone size={10} /> {n.accountName}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                            className={`p-1 rounded-lg flex-shrink-0 transition ${isDark ? 'hover:bg-red-500/30 text-red-300' : 'hover:bg-red-200 text-red-700'}`}
                            title="Descartar"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            ))}
            <style>{`
                @keyframes attentionPulse {
                    0%, 100% { box-shadow: 0 10px 25px -5px rgba(239, 68, 68, 0.4); }
                    50% { box-shadow: 0 15px 35px -5px rgba(239, 68, 68, 0.7); }
                }
            `}</style>
        </div>
    );
}

// Dos pitidos secuenciales con Web Audio API. Frecuencia más alta que un
// "ding" normal — quieres que el equipo levante la cabeza del móvil.
function playUrgentBeep() {
    try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const t0 = ctx.currentTime;
        const beep = (freq: number, start: number, dur: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t0 + start);
            gain.gain.setValueAtTime(0, t0 + start);
            gain.gain.linearRampToValueAtTime(0.25, t0 + start + 0.02);
            gain.gain.linearRampToValueAtTime(0, t0 + start + dur);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t0 + start);
            osc.stop(t0 + start + dur);
        };
        beep(880, 0, 0.18);     // primer pitido
        beep(1100, 0.22, 0.22); // segundo más agudo → sensación urgente
        setTimeout(() => { try { ctx.close(); } catch (_) { /* no-op */ } }, 800);
    } catch (_) {
        /* no bloqueamos si el navegador no permite audio (autoplay policy) */
    }
}
