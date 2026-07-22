import React, { useState, useEffect, useRef } from 'react';
import {
    Send, Users, MessageSquare, Smile, AlertTriangle, Settings2, Clock
} from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { useTheme } from '../context/ThemeContext';
import { API_URL } from '../config/api';

// Un "grupo" no es un grupo nativo de WhatsApp (la API oficial no los soporta):
// el equipo ve un hilo único y el servidor reparte cada mensaje al chat 1-a-1 de
// cada cliente. Ver GroupCreateModal.tsx para la creación.
export interface ChatGroup {
    id: string;
    name: string;
    clientPhones: string[];
    agentNames: string[];
    lineId: string;
    lineName: string;
    clientsSeeEachOther: boolean;
    createdBy?: string;
    createdAt?: string;
    active: boolean;
}

interface GroupMessage {
    id: string;
    text: string;
    sender: string;
    fromClient: boolean;
    timestamp: string;
}

interface DeliveryResult {
    phone: string;
    name?: string;
    ok: boolean;
    code?: number;
    error?: string;
}

interface ClientStatus {
    phone: string;
    name: string;
    inWindow: boolean;
    lastInbound: string | null;
}

const WHATSAPP_TEXT_LIMIT = 4096;

interface GroupChatWindowProps {
    socket: any;
    user: { username: string };
    group: ChatGroup;
    onEdit: (group: ChatGroup) => void;
}

export function GroupChatWindow({ socket, user, group, onEdit }: GroupChatWindowProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [messages, setMessages] = useState<GroupMessage[]>([]);
    const [input, setInput] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showMembers, setShowMembers] = useState(false);
    const [setupError, setSetupError] = useState<string | null>(null);
    // groupMsgId → resultado del reparto, para avisar de a quién NO le ha llegado
    const [reports, setReports] = useState<Record<string, DeliveryResult[]>>({});
    const [clientStatus, setClientStatus] = useState<ClientStatus[]>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // ── Historial y mensajes en vivo ───────────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        setMessages([]);
        setReports({});
        setSetupError(null);
        socket.emit('request_group_history', group.id);

        const handleHistory = (data: { groupId: string; history: GroupMessage[]; setupError?: string }) => {
            if (data.groupId !== group.id) return;
            setMessages(data.history || []);
            if (data.setupError) setSetupError(data.setupError);
        };
        const handleNewMsg = (msg: GroupMessage & { groupId: string }) => {
            if (msg.groupId !== group.id) return;
            // El servidor emite a todos, incluido quien lo escribió; el guard por
            // id evita duplicarlo si además llega por una recarga del historial.
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        };
        const handleReport = (data: { groupId: string; groupMsgId: string; results: DeliveryResult[] }) => {
            if (data.groupId !== group.id) return;
            setReports(prev => ({ ...prev, [data.groupMsgId]: data.results }));
        };

        socket.on('group_history', handleHistory);
        socket.on('group_message', handleNewMsg);
        socket.on('group_send_report', handleReport);
        return () => {
            socket.off('group_history', handleHistory);
            socket.off('group_message', handleNewMsg);
            socket.off('group_send_report', handleReport);
        };
    }, [socket, group.id]);

    // ── Estado de la ventana de 24h de cada cliente ────────────────────────
    // Se consulta al abrir el grupo: avisa ANTES de escribir a quién no le va a
    // llegar el mensaje (WhatsApp solo permite texto libre 24h después de que el
    // cliente escriba).
    // Depende del nº de mensajes DE CLIENTES, no de todos: solo un mensaje
    // entrante reabre la ventana, así que refrescar con cada mensaje del equipo
    // sería una consulta a Airtable por cliente para nada.
    const clientMsgCount = messages.filter(m => m.fromClient).length;
    useEffect(() => {
        let cancelled = false;
        fetch(`${API_URL}/groups/${group.id}/status`)
            .then(r => r.json())
            .then(d => { if (!cancelled && Array.isArray(d?.clients)) setClientStatus(d.clients); })
            .catch(() => { /* el aviso es informativo: si falla, no bloquea el chat */ });
        return () => { cancelled = true; };
    }, [group.id, clientMsgCount]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const outOfWindow = clientStatus.filter(c => !c.inWindow);

    // ── Envío ──────────────────────────────────────────────────────────────
    const sendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        const text = input.trim();
        if (!text) return;
        if (Array.from(text).length > WHATSAPP_TEXT_LIMIT) {
            alert(`El mensaje supera el límite de ${WHATSAPP_TEXT_LIMIT} caracteres de WhatsApp.`);
            return;
        }
        socket.emit('group_message', { groupId: group.id, text, sender: user.username });
        setInput('');
        setShowEmojiPicker(false);
    };

    const safeTime = (time: any) => {
        try {
            const date = new Date(time);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    };

    const onEmojiClick = (data: EmojiClickData) => setInput(prev => prev + data.emoji);

    // ── JSX ────────────────────────────────────────────────────────────────
    return (
        <div
            className={`flex flex-col h-full ${isDark ? 'bg-slate-900' : 'bg-slate-50/30'}`}
            onClick={() => { setShowEmojiPicker(false); setShowMembers(false); }}
        >
            {/* Cabecera */}
            <div className={`p-4 pl-16 md:pl-4 border-b shadow-sm z-10 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isDark ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                        <Users size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className={`font-bold text-xl truncate ${isDark ? 'text-white' : 'text-slate-800'}`}>{group.name}</h2>
                        <p className={`text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {group.clientPhones.length} cliente{group.clientPhones.length === 1 ? '' : 's'} ·{' '}
                            {group.agentNames.length} trabajador{group.agentNames.length === 1 ? '' : 'es'} · Línea: {group.lineName}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setShowMembers(v => !v); }}
                        title="Ver miembros"
                        className={`p-2 rounded-lg transition ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        <Users size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onEdit(group); }}
                        title="Editar grupo"
                        className={`p-2 rounded-lg transition ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        <Settings2 size={18} />
                    </button>
                </div>

                {/* Lista de miembros desplegable */}
                {showMembers && (
                    <div
                        className={`mt-3 p-3 rounded-xl border text-xs space-y-2 animate-in fade-in slide-in-from-top-1 ${isDark ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
                        onClick={e => e.stopPropagation()}
                    >
                        <div>
                            <p className={`font-bold uppercase mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Clientes</p>
                            <div className="flex flex-wrap gap-1.5">
                                {group.clientPhones.map(phone => {
                                    const st = clientStatus.find(c => c.phone === phone);
                                    return (
                                        <span key={phone}
                                            className={`px-2 py-1 rounded-full border flex items-center gap-1 ${st && !st.inWindow
                                                ? (isDark ? 'bg-amber-900/30 border-amber-700 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700')
                                                : (isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600')}`}>
                                            {st && !st.inWindow && <Clock size={11} />}
                                            {st?.name || phone}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <p className={`font-bold uppercase mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Trabajadores</p>
                            <div className="flex flex-wrap gap-1.5">
                                {group.agentNames.map(n => (
                                    <span key={n} className={`px-2 py-1 rounded-full border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}>{n}</span>
                                ))}
                            </div>
                        </div>
                        <p className={`pt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {group.clientsSeeEachOther
                                ? '👁️ Los clientes SÍ ven los mensajes de los demás clientes.'
                                : '🔒 Los clientes NO se ven entre sí: cada uno solo recibe los mensajes del equipo.'}
                        </p>
                    </div>
                )}
            </div>

            {/* Avisos */}
            {setupError && (
                <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0" /> {setupError}
                </div>
            )}
            {outOfWindow.length > 0 && (
                <div className={`px-4 py-2 border-b text-xs flex items-start gap-2 ${isDark ? 'bg-amber-900/20 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    <Clock size={14} className="flex-shrink-0 mt-0.5" />
                    <span>
                        <strong>{outOfWindow.map(c => c.name).join(', ')}</strong> lleva{outOfWindow.length === 1 ? '' : 'n'} más de 24h sin escribir:
                        WhatsApp no permite enviarle{outOfWindow.length === 1 ? '' : 's'} texto libre. Habría que llamarle{outOfWindow.length === 1 ? '' : 's'} o usar una plantilla aprobada.
                    </span>
                </div>
            )}

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 text-center px-6">
                        <MessageSquare size={48} className="opacity-40" />
                        <p className="font-medium">Aún no hay mensajes en este grupo.</p>
                        <p className="text-xs max-w-sm">
                            Lo que escribas aquí le llegará a cada cliente en su chat de WhatsApp habitual,
                            precedido de <span className="font-mono">[{group.name}]</span>.
                        </p>
                    </div>
                )}
                {messages.map((m, idx) => {
                    const isMe = !m.fromClient && m.sender === user.username;
                    const showHeader = idx === 0 || messages[idx - 1].sender !== m.sender;
                    const failed = (reports[m.id] || []).filter(r => !r.ok);
                    return (
                        <div key={m.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
                            {showHeader && (
                                <span className={`text-[10px] font-bold mb-1 px-1 uppercase tracking-wide ${m.fromClient
                                    ? 'text-emerald-500'
                                    : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>
                                    {m.sender}{m.fromClient ? ' · cliente' : ''} • {safeTime(m.timestamp)}
                                </span>
                            )}
                            <div className={`px-5 py-3 rounded-2xl text-sm shadow-sm max-w-[85%] md:max-w-[70%] leading-relaxed
                                ${isMe
                                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                                    : m.fromClient
                                        ? (isDark ? 'bg-emerald-900/40 border border-emerald-800 text-emerald-100 rounded-tl-sm' : 'bg-emerald-50 border border-emerald-200 text-slate-700 rounded-tl-sm')
                                        : (isDark ? 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm')}`}>
                                <p className="whitespace-pre-wrap">{m.text}</p>
                            </div>
                            {failed.length > 0 && (
                                <span className="text-[10px] text-red-500 mt-1 px-1 flex items-center gap-1">
                                    <AlertTriangle size={11} />
                                    No entregado a {failed.map(f => f.name || f.phone).join(', ')}
                                    {failed.some(f => f.code === 131047) && ' (ventana de 24h cerrada)'}
                                </span>
                            )}
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Barra de escritura */}
            <form
                onSubmit={sendMessage}
                onClick={e => e.stopPropagation()}
                className={`px-4 pt-4 safe-bottom-2 border-t relative ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
            >
                {showEmojiPicker && (
                    <div className="absolute bottom-full left-4 mb-2 z-50 shadow-2xl rounded-xl" onClick={e => e.stopPropagation()}>
                        <EmojiPicker onEmojiClick={onEmojiClick} width={300} height={380} previewConfig={{ showPreview: false }} />
                    </div>
                )}

                <div className="flex gap-2 max-w-4xl mx-auto w-full items-center">
                    <button type="button"
                        onClick={e => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }}
                        title="Emojis"
                        className={`p-3 rounded-xl transition flex-shrink-0
                            ${showEmojiPicker ? 'text-indigo-500 bg-indigo-50' : (isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500')}`}>
                        <Smile size={20} />
                    </button>

                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        className={`flex-1 border-none rounded-xl px-5 py-3.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all
                            ${isDark ? 'bg-slate-700 text-white placeholder:text-slate-500' : 'bg-slate-100 placeholder:text-slate-400'}`}
                        placeholder={`Escribe a ${group.name}...`}
                        autoFocus
                    />

                    <button type="submit" disabled={!input.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white p-3.5 rounded-xl transition disabled:opacity-40 shadow-md active:scale-95 flex-shrink-0">
                        <Send size={20} />
                    </button>
                </div>
                <p className={`text-[10px] text-center mt-2 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                    Cada cliente lo recibe en su chat individual de WhatsApp. Laura no responde dentro de los grupos.
                </p>
            </form>
        </div>
    );
}
