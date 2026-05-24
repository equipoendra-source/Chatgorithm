import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, User as UserIcon, MessageSquare, Loader2, Hash } from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

interface ContactHit {
    id: string;
    phone: string;
    name: string;
    notes: string;
    status: string;
    assigned_to: string;
    originPhoneId: string;
    lastMessageTime: string;
}

interface MessageHit {
    id: string;
    text: string;
    sender: string;
    recipient: string;
    timestamp: string;
    phone: string;
}

interface MessageGroup {
    phone: string;
    hitCount: number;
    preview: MessageHit;
    allHits: MessageHit[];
}

interface Props {
    onSelectContact: (phone: string) => void;
    onClose: () => void;
}

// Resalta los matches de q en el texto sin XSS (split + spans).
function Highlight({ text, q }: { text: string, q: string }) {
    if (!q) return <>{text}</>;
    const escaped = q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'ig');
    const parts = text.split(re);
    return (
        <>
            {parts.map((p, i) =>
                re.test(p) ? <mark key={i} className="bg-yellow-200 text-slate-900 rounded px-0.5">{p}</mark> : <span key={i}>{p}</span>
            )}
        </>
    );
}

export default function GlobalSearch({ onSelectContact, onClose }: Props) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(false);
    const [contacts, setContacts] = useState<ContactHit[]>([]);
    const [messages, setMessages] = useState<MessageGroup[]>([]);
    const [warning, setWarning] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Cerrar con Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const doSearch = useCallback(async (query: string) => {
        if (!query || query.length < 2) {
            setContacts([]); setMessages([]); setWarning(null);
            return;
        }
        setLoading(true);
        try {
            const r = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}&limit=50`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Error');
            setContacts(d.contacts || []);
            setMessages(d.messages || []);
            setWarning(d.warning || null);
        } catch (e: any) {
            setWarning('Error al buscar: ' + e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounce 300ms
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(q), 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [q, doSearch]);

    const totalResults = contacts.length + messages.length;

    return (
        <div className="fixed inset-0 z-[9000] flex items-start justify-center p-4 pt-[10vh]" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Modal */}
            <div
                onClick={(e) => e.stopPropagation()}
                className={`relative w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}
            >
                {/* Input */}
                <div className={`flex items-center gap-3 p-4 border-b ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                    <Search className={`w-5 h-5 flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Buscar cliente, teléfono, mensaje, notas..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        className={`flex-1 bg-transparent outline-none text-base ${isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-800 placeholder:text-slate-400'}`}
                    />
                    {loading && <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />}
                    <button
                        onClick={onClose}
                        className={`p-1 rounded-lg ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                        title="Cerrar (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Hint */}
                <div className={`px-4 py-2 text-[11px] flex items-center gap-3 border-b ${isDark ? 'border-white/5 text-slate-500' : 'border-slate-100 text-slate-500'}`}>
                    <span>↵ Abrir chat</span>
                    <span>·</span>
                    <span>Esc Cerrar</span>
                    {q.length >= 2 && !loading && (
                        <span className="ml-auto font-bold">
                            {totalResults} resultado{totalResults !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {q.length < 2 && (
                        <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            <Search className="w-10 h-10 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Escribe al menos 2 caracteres para buscar.</p>
                        </div>
                    )}

                    {warning && (
                        <div className={`p-4 text-sm ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>{warning}</div>
                    )}

                    {q.length >= 2 && totalResults === 0 && !loading && (
                        <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            <p className="text-sm">No hay resultados para "{q}"</p>
                        </div>
                    )}

                    {/* Contactos */}
                    {contacts.length > 0 && (
                        <div className="px-2 py-1">
                            <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                Clientes ({contacts.length})
                            </div>
                            {contacts.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => { onSelectContact(c.phone); onClose(); }}
                                    className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                                >
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${isDark ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>
                                        {(c.name || c.phone).charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                            <Highlight text={c.name || c.phone} q={q} />
                                        </div>
                                        <div className={`text-xs flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            <span className="font-mono">{c.phone}</span>
                                            {c.status && <span className="px-1.5 py-0.5 rounded bg-slate-500/20 text-[10px] font-bold">{c.status}</span>}
                                            {c.assigned_to && <span className={`text-[10px] ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>👤 {c.assigned_to}</span>}
                                        </div>
                                        {c.notes && c.notes.toLowerCase().includes(q.toLowerCase()) && (
                                            <div className={`text-[11px] mt-1 italic ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                <Highlight text={c.notes.substring(0, 120)} q={q} />
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Mensajes */}
                    {messages.length > 0 && (
                        <div className="px-2 py-1">
                            <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                Mensajes ({messages.length})
                            </div>
                            {messages.map((m, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => { onSelectContact(m.phone); onClose(); }}
                                    className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                                >
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                                        <MessageSquare className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-xs font-bold flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                            <Hash className="w-3 h-3" />
                                            <span className="font-mono">{m.phone}</span>
                                            {m.hitCount > 1 && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isDark ? 'bg-emerald-900/30 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>
                                                    {m.hitCount} matches
                                                </span>
                                            )}
                                        </div>
                                        <div className={`text-sm mt-1 line-clamp-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                            <Highlight text={m.preview.text} q={q} />
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
