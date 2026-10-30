import { useState, useEffect, useRef, useMemo } from 'react';
import {
    ArrowLeft, Send, Paperclip, Plus, Search, FileText, AlertCircle,
    LayoutTemplate, Loader2, X, MessageSquare, Check, CheckCheck, Mic, Trash2
} from 'lucide-react';
import type { Socket } from 'socket.io-client';
import type { Contact } from '../components/Sidebar';
import ChatTemplateSelector from '../components/ChatTemplateSelector';
import { useTheme } from '../context/ThemeContext';
import { API_URL } from '../config/api';

// Chat mínimo con proveedores para la app Recambios: lista de proveedores,
// conversación (texto, fotos, PDF, plantillas) y estado de entrega. Es una versión
// recortada del chat de Chatgorim: sin IA, asignaciones, etiquetas, citas ni
// vehículos. Usa los mismos eventos de socket y la misma API (/upload, /contacts,
// /media), así que el servidor no cambia.

interface ChatMessage {
    text: string;
    sender: string;
    recipient?: string;
    timestamp: string;
    type?: string;
    mediaId?: string;
    delivery_status?: 'sent' | 'failed';
    delivery_code?: number;
    delivery_error?: string;
}

interface Props {
    socket: Socket;
    user: { username: string };
    active: boolean; // la pestaña del chat está a la vista (para el botón atrás de Android)
}

const previewOf = (last: any): string => {
    if (!last) return '';
    if (typeof last === 'string') return last;
    const t = last.type;
    if (t === 'image') return '📷 Foto';
    if (t === 'video') return '🎬 Vídeo';
    if (t === 'audio') return '🎤 Audio';
    if (t === 'document') return '📄 Documento';
    return String(last.text || '');
};

const hhmm = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const today = new Date();
    return d.toDateString() === today.toDateString()
        ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
};

const failedHint = (m: ChatMessage) => {
    if (m.delivery_code === 131047) return 'No entregado: han pasado más de 24 h desde su último mensaje. Envía una plantilla.';
    if (m.delivery_code === 131026) return 'No entregado: ese número no tiene WhatsApp.';
    return m.delivery_error ? `No entregado: ${m.delivery_error}` : 'No entregado.';
};

export default function SuppliersChat({ socket, user, active }: Props) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Contact | null>(null);
    const [search, setSearch] = useState('');
    const [showNew, setShowNew] = useState(false);
    // Línea de WhatsApp de la empresa. El servidor siempre lista una cuenta 'default' (sin
    // token) aunque no haya número: esa no cuenta. Cuando se conecta un número, sale aquí.
    const [lineId, setLineId] = useState<string | undefined>(undefined);
    useEffect(() => {
        fetch(`${API_URL}/accounts`)
            .then(r => r.json())
            .then((list: any) => {
                const real = Array.isArray(list) ? list.find(a => a?.id && a.id !== 'default') : null;
                setLineId(real?.id);
            })
            .catch(() => { /* sin línea: los envíos fallarán con su aviso */ });
    }, []);

    // Lista de proveedores: se pide al entrar, al reconectar y cuando llega un mensaje.
    useEffect(() => {
        const request = () => socket.emit('request_contacts');
        const onList = (d: any) => { if (Array.isArray(d)) { setContacts(d); setLoading(false); } };
        let timer: ReturnType<typeof setTimeout> | null = null;
        const onMessage = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(request, 600);
        };
        socket.on('contacts_update', onList);
        socket.on('contact_updated_notification', request);
        socket.on('message', onMessage);
        socket.on('connect', request);
        if (socket.connected) request();
        const interval = setInterval(request, 60000);
        return () => {
            socket.off('contacts_update', onList);
            socket.off('contact_updated_notification', request);
            socket.off('message', onMessage);
            socket.off('connect', request);
            clearInterval(interval);
            if (timer) clearTimeout(timer);
        };
    }, [socket]);

    // Botón atrás de Android (lo lanza RecambiosApp): cierra la conversación en vez de salir de la app.
    useEffect(() => {
        if (!active || !selected) return;
        const onBack = (e: Event) => { e.preventDefault(); setSelected(null); };
        window.addEventListener('recambios:back', onBack);
        return () => window.removeEventListener('recambios:back', onBack);
    }, [active, selected]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return contacts
            .filter(c => !q || (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
            .sort((a, b) => (b.last_message_time || '').localeCompare(a.last_message_time || ''));
    }, [contacts, search]);

    const open = (c: Contact) => {
        setSelected(c);
        if (c.unread_count && c.unread_count > 0) {
            socket.emit('mark_read', { phone: c.phone });
            setContacts(prev => prev.map(x => x.id === c.id ? { ...x, unread_count: 0 } : x));
        }
    };

    const border = isDark ? 'border-white/5' : 'border-slate-200';
    const panel = isDark ? 'bg-slate-900' : 'bg-white';

    return (
        <div className={`h-full flex ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            {/* Lista de proveedores */}
            <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-shrink-0 flex-col border-r ${border} ${panel}`}>
                <div className={`p-3 flex items-center gap-2 border-b ${border}`}>
                    <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar proveedor"
                            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                        />
                    </div>
                    <button
                        onClick={() => setShowNew(true)}
                        className="p-2.5 rounded-xl bg-indigo-600 text-white active:scale-95"
                        title="Nuevo proveedor"
                        aria-label="Nuevo proveedor"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-400">
                            {contacts.length === 0
                                ? 'Aún no tienes proveedores. Pulsa + para añadir el primero.'
                                : 'Ningún proveedor coincide con la búsqueda.'}
                        </div>
                    ) : visible.map(c => (
                        <button
                            key={c.id}
                            onClick={() => open(c)}
                            className={`w-full flex items-center gap-3 px-3 py-3 text-left border-b ${border} ${selected?.id === c.id ? (isDark ? 'bg-white/10' : 'bg-indigo-50') : (isDark ? 'active:bg-white/5' : 'active:bg-slate-100')}`}
                        >
                            <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold flex-shrink-0">
                                {(c.name || c.phone || '?').trim().charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="font-semibold text-sm truncate">{c.name || c.phone}</span>
                                    <span className="text-[11px] text-slate-400 flex-shrink-0">{hhmm(c.last_message_time)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-slate-400 truncate">{previewOf(c.last_message)}</span>
                                    {!!c.unread_count && c.unread_count > 0 && (
                                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{c.unread_count}</span>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Conversación */}
            <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col`}>
                {selected ? (
                    <Conversation
                        key={selected.id}
                        socket={socket}
                        user={user}
                        contact={selected}
                        lineId={lineId}
                        onBack={() => setSelected(null)}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                        <MessageSquare className="w-10 h-10 opacity-40" />
                        <p className="text-sm">Elige un proveedor para ver la conversación</p>
                    </div>
                )}
            </div>

            {showNew && (
                <NewSupplierModal
                    lineId={lineId}
                    onClose={() => setShowNew(false)}
                    onCreated={() => { setShowNew(false); socket.emit('request_contacts'); }}
                />
            )}
        </div>
    );
}

function Conversation({ socket, user, contact, lineId, onBack }: {
    socket: Socket; user: { username: string }; contact: Contact; lineId?: string; onBack: () => void;
}) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    // Misma regla que Chatgorim: la línea del contacto y, si no tiene, la de la empresa.
    const originId = contact.origin_phone_id || lineId || undefined;

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [uploading, setUploading] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const onHistory = (h: ChatMessage[]) => { if (Array.isArray(h)) setMessages(h); };
        const onMessage = (m: ChatMessage) => {
            if (m.sender === contact.phone || m.recipient === contact.phone) setMessages(prev => [...prev, m]);
        };
        const onStatus = (d: { recipient: string; sender: string; timestamp: string; status: 'sent' | 'failed'; code?: number; metaError?: string }) => {
            if (d.recipient !== contact.phone) return;
            setMessages(prev => prev.map(m =>
                m.sender === d.sender && m.timestamp === d.timestamp
                    ? { ...m, delivery_status: d.status, delivery_code: d.code, delivery_error: d.metaError }
                    : m
            ));
        };
        socket.on('conversation_history', onHistory);
        socket.on('message', onMessage);
        socket.on('message_status', onStatus);
        socket.emit('request_conversation', contact.phone);
        // Mientras el chat está abierto el servidor no cuenta sus mensajes como "no leídos".
        socket.emit('viewing_chat', { phone: contact.phone });
        return () => {
            socket.off('conversation_history', onHistory);
            socket.off('message', onMessage);
            socket.off('message_status', onStatus);
            try { socket.emit('stop_viewing_chat', { phone: contact.phone }); } catch (_) { /* socket cerrado */ }
        };
    }, [socket, contact.phone]);

    useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

    const sendText = () => {
        const text = input.trim();
        if (!text) return;
        if (Array.from(text).length > 4096) {
            alert('El mensaje supera el límite de 4096 caracteres de WhatsApp.');
            return;
        }
        socket.emit('chatMessage', {
            text,
            sender: user.username,
            targetPhone: contact.phone,
            timestamp: new Date().toISOString(),
            type: 'text',
            originPhoneId: originId,
        });
        setInput('');
    };

    // Acepta File o Blob (nota de voz). Con un Blob el nombre va como 3.er argumento:
    // `new File()` rompe en la build minificada de Vite.
    const sendFile = async (file: File | Blob, filename?: string) => {
        setUploading(true);
        const fd = new FormData();
        if (filename) fd.append('file', file, filename); else fd.append('file', file);
        fd.append('targetPhone', contact.phone);
        fd.append('senderName', user.username);
        fd.append('originPhoneId', originId || '');
        try {
            const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: fd });
            if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`);
        } catch (e: any) {
            alert(`No se pudo enviar el archivo. ${e.message}`);
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    // Fotos, PDF y vídeos desde el clip. WhatsApp acepta como vídeo solo mp4/3gp de hasta 16 MB.
    const pickFile = (f: File) => {
        const MB = 1024 * 1024;
        if (f.type.startsWith('video/')) {
            if (f.size > 16 * MB) {
                alert('El vídeo pesa más de 16 MB, el máximo que admite WhatsApp. Grábalo más corto o en menor calidad.');
                if (fileRef.current) fileRef.current.value = '';
                return;
            }
            if (!/^video\/(mp4|3gpp)$/i.test(f.type) &&
                !window.confirm('Este vídeo no es MP4: llegará como archivo adjunto y no se verá como vídeo. ¿Enviarlo igualmente?')) {
                if (fileRef.current) fileRef.current.value = '';
                return;
            }
        }
        sendFile(f);
    };

    // Notas de voz: se graba en OGG/Opus si el navegador puede (así WhatsApp la enseña como nota
    // de voz) y el servidor la convierte si hace falta.
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const recRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const cancelRef = useRef(false);

    useEffect(() => {
        if (!recording) return;
        setSeconds(0);
        const t = setInterval(() => setSeconds(s => s + 1), 1000);
        return () => clearInterval(t);
    }, [recording]);

    // Si se cierra la conversación grabando, se descarta la grabación y se suelta el micro.
    useEffect(() => () => {
        cancelRef.current = true;
        try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); } catch (_) { /* ya parado */ }
    }, []);

    const startRecording = async () => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            alert('Este dispositivo no permite grabar audio.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimes = ['audio/ogg; codecs=opus', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/webm; codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
            const mime = mimes.find(m => MediaRecorder.isTypeSupported(m));
            const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
            recRef.current = rec;
            chunksRef.current = [];
            cancelRef.current = false;
            rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            rec.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                if (cancelRef.current) return;
                // WhatsApp rechaza webm; webm y ogg llevan el mismo códec (Opus), así que se etiqueta como ogg.
                const base = (rec.mimeType || mime || 'audio/ogg').split(';')[0].trim();
                const type = base === 'audio/webm' ? 'audio/ogg' : base;
                const ext = type === 'audio/ogg' ? 'ogg' : type === 'audio/mp4' ? 'm4a' : 'ogg';
                const blob = new Blob(chunksRef.current, { type });
                if (blob.size < 200) return; // pulsación sin voz
                await sendFile(blob, `voice.${ext}`);
            };
            rec.start();
            setRecording(true);
        } catch (e: any) {
            alert(`No se pudo usar el micrófono: ${e?.message || 'permiso denegado'}`);
        }
    };

    const stopRecording = (cancel: boolean) => {
        cancelRef.current = cancel;
        setRecording(false);
        try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); } catch (_) { /* ya parado */ }
    };

    const border = isDark ? 'border-white/5' : 'border-slate-200';

    return (
        <>
            <div className={`safe-pt-2 px-2 py-2 flex items-center gap-2 border-b flex-shrink-0 ${border} ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
                <button onClick={onBack} className="md:hidden p-2 rounded-full active:bg-white/10" aria-label="Volver a proveedores">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold flex-shrink-0">
                    {(contact.name || contact.phone || '?').trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{contact.name || contact.phone}</div>
                    <div className="text-[11px] text-slate-400 truncate">{contact.phone}</div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.map((m, i) => {
                    const mine = m.sender !== contact.phone;
                    const isNote = m.type === 'note';
                    const failed = m.delivery_status === 'failed';
                    const media = m.mediaId ? `${API_URL}/media/${m.mediaId}` : '';
                    return (
                        <div key={`${m.timestamp}-${i}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] md:max-w-[65%] rounded-2xl px-3 py-2 text-sm break-words ${isNote
                                ? (isDark ? 'bg-amber-500/15 text-amber-200' : 'bg-amber-100 text-amber-900')
                                : mine
                                    ? `${failed ? 'bg-red-600' : 'bg-indigo-600'} text-white rounded-br-md`
                                    : (isDark ? 'bg-slate-800 text-slate-100 rounded-bl-md' : 'bg-white border border-slate-200 rounded-bl-md')}`}>
                                {m.type === 'image' && media ? (
                                    <a href={media} target="_blank" rel="noreferrer"><img src={media} alt="Foto" className="rounded-lg max-h-64 mb-1" /></a>
                                ) : m.type === 'video' && media ? (
                                    <video src={media} controls className="rounded-lg max-h-64 mb-1" />
                                ) : m.type === 'audio' && media ? (
                                    <audio src={media} controls className="max-w-full mb-1" />
                                ) : m.type === 'document' && media ? (
                                    <a href={media} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
                                        <FileText className="w-4 h-4 flex-shrink-0" /> {m.text || 'Documento'}
                                    </a>
                                ) : null}
                                {m.text && m.type !== 'document' && (
                                    <div className="whitespace-pre-wrap">{m.text}</div>
                                )}
                                <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                                    {hhmm(m.timestamp)}
                                    {mine && !isNote && !failed && (m.delivery_status === 'sent' ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                                    {failed && <AlertCircle className="w-3.5 h-3.5 text-red-300" />}
                                </div>
                                {failed && <div className="mt-1 text-[11px] text-red-200">{failedHint(m)}</div>}
                            </div>
                        </div>
                    );
                })}
                <div ref={endRef} />
            </div>

            <form
                onSubmit={e => { e.preventDefault(); sendText(); }}
                className={`flex items-end gap-1.5 p-2 border-t flex-shrink-0 ${border} ${isDark ? 'bg-slate-900' : 'bg-white'}`}
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/*,application/pdf"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
                />
                {recording ? (
                    <>
                        <button type="button" onClick={() => stopRecording(true)}
                            className="p-2.5 rounded-full text-red-400 active:bg-white/10" aria-label="Descartar grabación" title="Descartar">
                            <Trash2 className="w-5 h-5" />
                        </button>
                        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 text-sm">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="font-mono tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
                            <span className="text-slate-400">Grabando…</span>
                        </div>
                        <button type="button" onClick={() => stopRecording(false)}
                            className="p-2.5 rounded-full bg-indigo-600 text-white active:scale-95" aria-label="Enviar nota de voz" title="Enviar nota de voz">
                            <Send className="w-5 h-5" />
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                            className="p-2.5 rounded-full text-slate-400 active:bg-white/10 disabled:opacity-50" aria-label="Adjuntar foto, vídeo o PDF" title="Adjuntar foto, vídeo o PDF">
                            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                        </button>
                        <button type="button" onClick={() => setShowTemplates(true)}
                            className="p-2.5 rounded-full text-slate-400 active:bg-white/10" aria-label="Enviar plantilla" title="Enviar plantilla">
                            <LayoutTemplate className="w-5 h-5" />
                        </button>
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                            rows={1}
                            placeholder="Escribe un mensaje"
                            className={`flex-1 min-w-0 resize-none max-h-32 px-3 py-2.5 rounded-2xl text-sm outline-none ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}
                        />
                        {input.trim() ? (
                            <button type="submit"
                                className="p-2.5 rounded-full bg-indigo-600 text-white active:scale-95" aria-label="Enviar">
                                <Send className="w-5 h-5" />
                            </button>
                        ) : (
                            <button type="button" onClick={startRecording} disabled={uploading}
                                className="p-2.5 rounded-full bg-indigo-600 text-white active:scale-95 disabled:opacity-50" aria-label="Grabar nota de voz" title="Grabar nota de voz">
                                <Mic className="w-5 h-5" />
                            </button>
                        )}
                    </>
                )}
            </form>

            <ChatTemplateSelector
                isOpen={showTemplates}
                onClose={() => setShowTemplates(false)}
                targetPhone={contact.phone}
                senderName={user.username}
                originPhoneId={originId}
            />
        </>
    );
}

function NewSupplierModal({ lineId, onClose, onCreated }: { lineId?: string; onClose: () => void; onCreated: () => void }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [saving, setSaving] = useState(false);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        const digits = phone.replace(/\D/g, '');
        if (!name.trim()) { alert('Pon el nombre del proveedor.'); return; }
        // 9 dígitos = número español sin prefijo.
        if (digits.length < 9 || digits.length > 15) { alert('El teléfono debe tener entre 9 y 15 dígitos.'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: digits, name: name.trim(), originPhoneId: lineId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { alert(data.error || 'No se pudo crear el proveedor.'); return; }
            onCreated();
        } catch {
            alert('Error de conexión al crear el proveedor.');
        } finally {
            setSaving(false);
        }
    };

    const field = `w-full px-3 py-2.5 rounded-xl text-sm outline-none border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
            <form onSubmit={save} onClick={e => e.stopPropagation()}
                className={`w-full max-w-sm rounded-2xl p-5 space-y-3 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}`}>
                <div className="flex items-center justify-between">
                    <h2 className="font-bold">Nuevo proveedor</h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-full active:bg-white/10" aria-label="Cerrar"><X className="w-4 h-4" /></button>
                </div>
                <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Nombre (ej. Recambios Pérez)" className={field} />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono (ej. 600123456)" inputMode="tel" className={field} />
                <button type="submit" disabled={saving}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
                </button>
            </form>
        </div>
    );
}
