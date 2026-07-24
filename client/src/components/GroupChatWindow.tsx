import React, { useState, useEffect, useRef } from 'react';
import {
    Send, Users, MessageSquare, Smile, AlertTriangle, Settings2, Clock,
    Paperclip, X, Mic, Square, FileText, Download, Play, Pause, Volume2,
    Camera, Search, FileDown, Loader2, ChevronUp, ChevronDown, Zap, LayoutTemplate
} from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { useTheme } from '../context/ThemeContext';
import { API_URL } from '../config/api';
import { exportChatToPdf } from '../services/chatPdfExport';
import ChatTemplateSelector from './ChatTemplateSelector';

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
    // Media: mismo esquema que el chat 1-a-1. type ∈ image|video|audio|document|text.
    // La media se sirve por ${API_URL}/media/${mediaId} (API_URL ya incluye /api).
    type?: string;
    mediaId?: string;
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

interface QuickReply {
    id: string;
    title: string;
    content: string;
    shortcut: string;
}

const WHATSAPP_TEXT_LIMIT = 4096;
const mediaUrl = (mediaId: string) => `${API_URL}/media/${mediaId}`;

// Reproductor de audio propio (idéntico al del chat 1-a-1) para que las notas de
// voz se escuchen con controles de velocidad/volumen en vez de un <audio> pelado.
const CustomAudioPlayer = ({ src, isMe }: { src: string, isMe: boolean }) => {
    const [isPlaying, setIsPlaying] = useState(false); const [progress, setProgress] = useState(0); const [duration, setDuration] = useState(0); const [currentTime, setCurrentTime] = useState(0); const [playbackRate, setPlaybackRate] = useState(1); const [volume, setVolume] = useState(1); const [isMuted, setIsMuted] = useState(false); const [showVolumeSlider, setShowVolumeSlider] = useState(false); const [audioUrl, setAudioUrl] = useState<string | null>(null); const [isReady, setIsReady] = useState(false); const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => { let url: string | null = null; let alive = true; fetch(src).then(r => r.blob()).then(blob => { if (!alive) return; url = URL.createObjectURL(blob); setAudioUrl(url); setIsReady(true); }).catch(e => console.error(e)); return () => { alive = false; if (url) URL.revokeObjectURL(url); }; }, [src]);
    useEffect(() => { if (audioRef.current) { audioRef.current.playbackRate = playbackRate; audioRef.current.volume = isMuted ? 0 : volume; } }, [playbackRate, volume, isMuted]);
    const togglePlay = () => { const audio = audioRef.current; if (!audio) return; if (isPlaying) audio.pause(); else audio.play(); setIsPlaying(!isPlaying); };
    const toggleSpeed = () => { const speeds = [1, 1.25, 1.5, 2]; setPlaybackRate(speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length]); };
    const toggleMute = () => setIsMuted(!isMuted);
    const onTimeUpdate = () => { const audio = audioRef.current; if (!audio) return; setCurrentTime(audio.currentTime); setProgress((audio.currentTime / (audio.duration || 1)) * 100); };
    const onLoadedMetadata = (e: any) => setDuration(e.currentTarget.duration);
    const onEnded = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0); };
    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => { const audio = audioRef.current; if (!audio) return; const newTime = (Number(e.target.value) / 100) * duration; audio.currentTime = newTime; setProgress(Number(e.target.value)); };
    const formatTime = (time: number) => { if (isNaN(time)) return "0:00"; const min = Math.floor(time / 60); const sec = Math.floor(time % 60); return `${min}:${sec < 10 ? '0' : ''}${sec}`; };
    if (!isReady) return <div className="text-xs text-slate-400 p-2 italic">Cargando...</div>;
    return (<div className={`flex items-start gap-2 p-2 rounded-xl w-full max-w-[320px] select-none transition-colors ${isMe ? 'bg-white/10 backdrop-blur-sm border border-white/10 text-white' : 'bg-white border border-slate-100'}`}> <audio ref={audioRef} src={audioUrl!} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={onEnded} className="hidden" /> <button onClick={togglePlay} className={`w-10 h-10 flex items-center justify-center rounded-full transition shadow-sm flex-shrink-0 mt-0.5 ${isMe ? 'bg-white/20 hover:bg-white/30 text-white border border-white/10' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'}`}> {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />} </button> <div className="flex-1 flex flex-col gap-1 w-full min-w-0"> <div className="h-5 flex items-center"><input type="range" min="0" max="100" value={progress} onChange={handleSeek} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${isMe ? 'accent-white bg-white/20' : 'accent-indigo-500 bg-indigo-100'}`} /></div> <div className={`flex justify-between items-center text-[10px] font-medium h-5 w-full ${isMe ? 'text-white/80' : 'text-slate-500'}`}> <span className="font-mono tabular-nums min-w-[35px]">{currentTime === 0 && !isPlaying ? formatTime(duration) : formatTime(currentTime)}</span> <div className="flex items-center gap-2"> <button onClick={toggleSpeed} className={`px-1.5 py-0.5 rounded text-[9px] font-bold min-w-[22px] text-center ${isMe ? 'bg-black/20 text-white/90' : 'bg-slate-100 text-slate-600'}`}>{playbackRate}x</button> <div className="relative flex items-center group hidden sm:flex" onMouseEnter={() => setShowVolumeSlider(true)} onMouseLeave={() => setShowVolumeSlider(false)}> <button onClick={toggleMute} className={`p-1 ${isMe ? 'hover:bg-white/10' : 'hover:text-slate-800'}`}><Volume2 className="w-3.5 h-3.5" /></button> {showVolumeSlider && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white shadow-xl rounded-lg p-2 z-20"><div className="h-16 w-4 flex items-center justify-center"><input type="range" min="0" max="1" step="0.1" value={isMuted ? 0 : volume} onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(parseFloat(e.target.value) === 0); }} className="-rotate-90 w-14 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div></div>} </div> <a href={src} download="audio.ogg" target="_blank" rel="noreferrer" className={`p-1 rounded-full ${isMe ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}><Download className="w-3.5 h-3.5" /></a> </div> </div> </div> </div>);
};

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

    // Media / adjuntos
    const [isUploading, setIsUploading] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Respuestas rápidas
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
    const [showQuickReplies, setShowQuickReplies] = useState(false);

    // Buscar en el hilo
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchMatches, setSearchMatches] = useState<number[]>([]);
    const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

    // Exportar PDF
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    // Plantillas de WhatsApp aprobadas (para escribir fuera de la ventana de 24h)
    const [showTemplates, setShowTemplates] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // ── Historial y mensajes en vivo ───────────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        setMessages([]);
        setReports({});
        setSetupError(null);
        setPendingFile(null);
        setShowSearch(false);
        setSearchQuery('');
        // Limpiar el estado de ventana 24h del grupo anterior para que el aviso
        // no muestre por un instante nombres de clientes de otro grupo.
        setClientStatus([]);
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

    // ── Respuestas rápidas (se comparten con el chat normal) ───────────────
    useEffect(() => {
        if (!socket) return;
        const handler = (list: QuickReply[]) => setQuickReplies(Array.isArray(list) ? list : []);
        socket.on('quick_replies_list', handler);
        socket.emit('request_quick_replies');
        return () => { socket.off('quick_replies_list', handler); };
    }, [socket]);

    // ── Estado de la ventana de 24h de cada cliente ────────────────────────
    // Se consulta al abrir el grupo: avisa ANTES de escribir a quién no le va a
    // llegar el mensaje (WhatsApp solo permite texto libre 24h después de que el
    // cliente escriba).
    const clientMsgCount = messages.filter(m => m.fromClient).length;
    useEffect(() => {
        let cancelled = false;
        fetch(`${API_URL}/groups/${group.id}/status`)
            .then(r => r.json())
            .then(d => { if (!cancelled && Array.isArray(d?.clients)) setClientStatus(d.clients); })
            .catch(() => { /* el aviso es informativo: si falla, no bloquea el chat */ });
        return () => { cancelled = true; };
    }, [group.id, clientMsgCount]);

    // Autoscroll al final salvo cuando estamos navegando resultados de búsqueda.
    useEffect(() => {
        if (!searchQuery) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, searchQuery]);

    // Timer de duración de grabación
    useEffect(() => {
        let interval: any;
        if (isRecording) interval = setInterval(() => setRecordingDuration(d => d + 1), 1000);
        else setRecordingDuration(0);
        return () => clearInterval(interval);
    }, [isRecording]);

    // ── Búsqueda en el hilo ────────────────────────────────────────────────
    useEffect(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) { setSearchMatches([]); setCurrentMatchIdx(0); return; }
        const idxs: number[] = [];
        messages.forEach((m, i) => { if ((m.text || '').toLowerCase().includes(q)) idxs.push(i); });
        setSearchMatches(idxs);
        setCurrentMatchIdx(Math.max(0, idxs.length - 1));
    }, [searchQuery, messages]);

    useEffect(() => {
        if (searchMatches.length > 0 && searchMatches[currentMatchIdx] != null) {
            document.getElementById(`gmsg-${searchMatches[currentMatchIdx]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentMatchIdx, searchMatches]);

    const nextMatch = () => { if (searchMatches.length) setCurrentMatchIdx(p => (p + 1) % searchMatches.length); };
    const prevMatch = () => { if (searchMatches.length) setCurrentMatchIdx(p => (p - 1 + searchMatches.length) % searchMatches.length); };

    const outOfWindow = clientStatus.filter(c => !c.inWindow);

    // ── Subida de archivos al grupo ────────────────────────────────────────
    // Acepta File o Blob. El filename es necesario al pasar un Blob (audio grabado):
    // `new File()` rompe en builds minificadas de Vite, así que pasamos el Blob
    // directo con el nombre como 3er argumento de FormData.append (igual que el chat 1-a-1).
    const uploadFile = async (file: File | Blob, filename?: string) => {
        setIsUploading(true);
        const formData = new FormData();
        if (filename) formData.append('file', file, filename);
        else formData.append('file', file);
        formData.append('senderName', user.username);
        try {
            const res = await fetch(`${API_URL}/groups/${group.id}/upload`, { method: 'POST', body: formData });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Status ${res.status}: ${errText}`);
            }
        } catch (e: any) {
            alert(`Error al enviar el archivo al grupo: ${e.message}`);
            console.error('[Grupos] Upload Error:', e);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 25 * 1024 * 1024) { alert('Archivo demasiado grande (máximo 25MB).'); return; }
            setPendingFile(file);
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // OGG Opus PRIMERO: WhatsApp solo muestra como nota de voz OGG/Opus.
            let mimeType = 'audio/webm'; let ext = 'webm';
            const formats = [
                { mime: 'audio/ogg; codecs=opus', ext: 'ogg' },
                { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
                { mime: 'audio/ogg', ext: 'ogg' },
                { mime: 'audio/webm; codecs=opus', ext: 'webm' },
                { mime: 'audio/webm;codecs=opus', ext: 'webm' },
                { mime: 'audio/mp4', ext: 'm4a' },
                { mime: 'audio/webm', ext: 'webm' },
            ];
            for (const format of formats) {
                if (MediaRecorder.isTypeSupported(format.mime)) { mimeType = format.mime; ext = format.ext; break; }
            }
            const mediaRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mediaRecorder.onstop = async () => {
                let finalMimeType = mimeType.split(';')[0].trim();
                let finalExt = ext;
                if (finalMimeType === 'audio/webm') { finalMimeType = 'audio/ogg'; finalExt = 'ogg'; }
                const audioBlob = new Blob(audioChunksRef.current, { type: finalMimeType });
                await uploadFile(audioBlob, `voice.${finalExt}`);
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorder.start();
            setIsRecording(true);
        } catch (e: any) {
            alert(`Error con el micrófono: ${e.message}`);
        }
    };
    const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } };
    const formatRecordingTime = (secs: number) => { const m = Math.floor(secs / 60), s = secs % 60; return `${m}:${s < 10 ? '0' : ''}${s}`; };

    // ── Drag & drop ────────────────────────────────────────────────────────
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setIsDragging(false); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.size > 25 * 1024 * 1024) { alert('Archivo demasiado grande (máximo 25MB).'); return; }
            setPendingFile(file);
        }
    };

    // ── Envío (texto y/o archivo pendiente) ────────────────────────────────
    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pendingFile) {
            const f = pendingFile;
            setPendingFile(null);
            await uploadFile(f);
        }
        const text = input.trim();
        if (text) {
            if (Array.from(text).length > WHATSAPP_TEXT_LIMIT) {
                alert(`El mensaje supera el límite de ${WHATSAPP_TEXT_LIMIT} caracteres de WhatsApp.`);
                return;
            }
            socket.emit('group_message', { groupId: group.id, text, sender: user.username });
            setInput('');
        }
        setShowEmojiPicker(false);
        setShowQuickReplies(false);
    };

    const handleExportPdf = async () => {
        if (isExportingPdf) return;
        if (messages.length === 0) { alert('No hay mensajes para exportar.'); return; }
        setIsExportingPdf(true);
        try {
            let companyName: string | undefined;
            try { const raw = localStorage.getItem('company_config'); if (raw) companyName = JSON.parse(raw).companyName; } catch { /* ignore */ }
            await exportChatToPdf({ messages, contact: { name: group.name, phone: '' }, companyName });
        } catch (e) {
            console.error('[Grupos] ExportPDF Error:', e);
            alert('No se pudo generar el PDF.');
        } finally {
            setIsExportingPdf(false);
        }
    };

    const safeTime = (time: any) => {
        try {
            const date = new Date(time);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    };

    const onEmojiClick = (data: EmojiClickData) => setInput(prev => prev + data.emoji);
    const insertQuickReply = (content: string) => { setInput(prev => prev + (prev ? ' ' : '') + content); setShowQuickReplies(false); };

    // Renderiza el cuerpo del mensaje: media (imagen/vídeo/audio/documento) o texto.
    const renderBody = (m: GroupMessage, isMe: boolean) => {
        if (m.type === 'image' && m.mediaId) {
            return (
                <div className="mb-1 relative overflow-hidden rounded-lg">
                    <img src={mediaUrl(m.mediaId)} alt="Imagen"
                        className="max-w-full md:max-w-[280px] h-auto object-contain cursor-pointer transition-transform hover:scale-105"
                        onClick={(e) => { e.stopPropagation(); setSelectedImage(mediaUrl(m.mediaId!)); }} />
                </div>
            );
        }
        if (m.type === 'video' && m.mediaId) {
            return <div className="mb-1 relative overflow-hidden rounded-lg"><video src={mediaUrl(m.mediaId)} controls className="max-w-full md:max-w-[280px] h-auto rounded-lg" /></div>;
        }
        if (m.type === 'audio' && m.mediaId) {
            return <CustomAudioPlayer src={mediaUrl(m.mediaId)} isMe={isMe} />;
        }
        if (m.type === 'document' && m.mediaId) {
            return (
                <div className={`flex items-center gap-3 p-3 rounded-xl border min-w-[200px] transition-colors ${isDark ? 'bg-slate-900/50 border-white/10 hover:bg-slate-800/50' : 'bg-slate-50 border-slate-200'}`}>
                    <div className={`p-2.5 rounded-full ${isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-500'}`}><FileText className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                        <p className={`font-semibold truncate text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{m.text}</p>
                        <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Documento</p>
                    </div>
                    <a href={mediaUrl(m.mediaId)} target="_blank" rel="noopener noreferrer" className={`p-2 rounded-full transition ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-blue-500 hover:bg-slate-100'}`}><Download className="w-4 h-4" /></a>
                </div>
            );
        }
        return <p className="whitespace-pre-wrap">{m.text}</p>;
    };

    // ── JSX ────────────────────────────────────────────────────────────────
    return (
        <div
            className={`flex flex-col h-full relative ${isDark ? 'bg-slate-900' : 'bg-slate-50/30'}`}
            onClick={() => { setShowEmojiPicker(false); setShowMembers(false); setShowQuickReplies(false); }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Overlay de arrastrar-soltar */}
            {isDragging && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-indigo-600/20 backdrop-blur-sm border-4 border-dashed border-indigo-500 rounded-lg pointer-events-none">
                    <div className="text-center text-indigo-100 font-bold text-lg flex flex-col items-center gap-2">
                        <Paperclip className="w-10 h-10" /> Suelta el archivo para enviarlo al grupo
                    </div>
                </div>
            )}

            {/* Visor de imagen a pantalla completa */}
            {selectedImage && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}>
                    <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2" onClick={() => setSelectedImage(null)}><X className="w-6 h-6" /></button>
                    <img src={selectedImage} alt="Grande" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
                </div>
            )}

            {/* Selector de plantillas — en modo grupo reparte a todos los clientes */}
            <ChatTemplateSelector
                isOpen={showTemplates}
                onClose={() => setShowTemplates(false)}
                groupId={group.id}
                senderName={user.username}
            />

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
                        onClick={e => { e.stopPropagation(); setShowSearch(v => !v); }}
                        title="Buscar en el hilo"
                        className={`p-2 rounded-lg transition ${showSearch ? (isDark ? 'bg-slate-700 text-emerald-400' : 'bg-slate-100 text-emerald-600') : (isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100')}`}
                    >
                        <Search size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleExportPdf(); }}
                        disabled={isExportingPdf}
                        title="Exportar el hilo a PDF"
                        className={`p-2 rounded-lg transition disabled:opacity-50 ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        {isExportingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
                    </button>
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

                {/* Barra de búsqueda */}
                {showSearch && (
                    <div className="mt-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                            <Search size={16} className="text-slate-400 flex-shrink-0" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Buscar en la conversación..."
                                autoFocus
                                className={`flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-700 placeholder:text-slate-400'}`}
                            />
                            {searchQuery && (
                                <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                                    {searchMatches.length === 0 ? '0' : `${currentMatchIdx + 1}/${searchMatches.length}`}
                                </span>
                            )}
                        </div>
                        <button type="button" onClick={prevMatch} disabled={searchMatches.length === 0} className={`p-2 rounded-lg disabled:opacity-40 ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}><ChevronUp size={16} /></button>
                        <button type="button" onClick={nextMatch} disabled={searchMatches.length === 0} className={`p-2 rounded-lg disabled:opacity-40 ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}><ChevronDown size={16} /></button>
                        <button type="button" onClick={() => { setShowSearch(false); setSearchQuery(''); }} className={`p-2 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}><X size={16} /></button>
                    </div>
                )}

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
                    const isCurrentMatch = searchMatches.length > 0 && searchMatches[currentMatchIdx] === idx;
                    return (
                        <div id={`gmsg-${idx}`} key={m.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
                            {showHeader && (
                                <span className={`text-[10px] font-bold mb-1 px-1 uppercase tracking-wide ${m.fromClient
                                    ? 'text-emerald-500'
                                    : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>
                                    {m.sender}{m.fromClient ? ' · cliente' : ''} • {safeTime(m.timestamp)}
                                </span>
                            )}
                            <div className={`px-5 py-3 rounded-2xl text-sm shadow-sm max-w-[85%] md:max-w-[70%] leading-relaxed
                                ${isCurrentMatch ? 'ring-2 ring-yellow-400' : ''}
                                ${isMe
                                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                                    : m.fromClient
                                        ? (isDark ? 'bg-emerald-900/40 border border-emerald-800 text-emerald-100 rounded-tl-sm' : 'bg-emerald-50 border border-emerald-200 text-slate-700 rounded-tl-sm')
                                        : (isDark ? 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm')}`}>
                                {renderBody(m, isMe)}
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
                {/* Inputs de archivo ocultos */}
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} hidden />
                <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleFileSelect} hidden />

                {/* Selector de emojis */}
                {showEmojiPicker && (
                    <div className="absolute bottom-full left-4 mb-2 z-50 shadow-2xl rounded-xl" onClick={e => e.stopPropagation()}>
                        <EmojiPicker onEmojiClick={onEmojiClick} width={300} height={380} previewConfig={{ showPreview: false }} />
                    </div>
                )}

                {/* Lista de respuestas rápidas */}
                {showQuickReplies && (
                    <div className={`absolute bottom-full left-4 right-4 mb-2 z-50 max-h-64 overflow-y-auto rounded-xl border shadow-2xl ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`} onClick={e => e.stopPropagation()}>
                        {quickReplies.length === 0 ? (
                            <p className="p-4 text-xs text-slate-400 text-center">No hay respuestas rápidas configuradas.</p>
                        ) : quickReplies.map(qr => (
                            <button
                                key={qr.id}
                                type="button"
                                onClick={() => insertQuickReply(qr.content)}
                                className={`w-full text-left px-4 py-2.5 border-b last:border-b-0 transition ${isDark ? 'border-slate-700 hover:bg-slate-700/60' : 'border-slate-100 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>{qr.title}</span>
                                    {qr.shortcut && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{qr.shortcut}</span>}
                                </div>
                                <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{qr.content}</p>
                            </button>
                        ))}
                    </div>
                )}

                {/* Chip de archivo pendiente de enviar */}
                {pendingFile && (
                    <div className={`flex items-center gap-2 mb-2 px-3 py-2 rounded-xl border max-w-4xl mx-auto w-full ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
                        <Paperclip size={16} className="text-indigo-400 flex-shrink-0" />
                        <span className={`text-xs flex-1 truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{pendingFile.name}</span>
                        <button type="button" onClick={() => setPendingFile(null)} className="p-1 rounded-full text-slate-400 hover:text-red-500"><X size={14} /></button>
                    </div>
                )}

                {isRecording ? (
                    // Barra de grabación de audio
                    <div className="flex gap-2 max-w-4xl mx-auto w-full items-center">
                        <div className={`flex-1 flex items-center gap-3 px-5 py-3.5 rounded-xl ${isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-600'}`}>
                            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-sm font-semibold font-mono">{formatRecordingTime(recordingDuration)}</span>
                            <span className="text-xs">Grabando nota de voz...</span>
                        </div>
                        <button type="button" onClick={stopRecording} title="Detener y enviar"
                            className="bg-red-600 hover:bg-red-700 text-white p-3.5 rounded-xl transition shadow-md active:scale-95 flex-shrink-0">
                            <Square size={20} className="fill-current" />
                        </button>
                    </div>
                ) : (
                    <div className="flex gap-1.5 max-w-4xl mx-auto w-full items-center">
                        <button type="button"
                            onClick={e => { e.stopPropagation(); setShowEmojiPicker(v => !v); setShowQuickReplies(false); }}
                            title="Emojis"
                            className={`p-3 rounded-xl transition flex-shrink-0 ${showEmojiPicker ? 'text-indigo-500 bg-indigo-50' : (isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500')}`}>
                            <Smile size={20} />
                        </button>
                        <button type="button"
                            onClick={e => { e.stopPropagation(); setShowQuickReplies(v => !v); setShowEmojiPicker(false); }}
                            title="Respuestas rápidas"
                            className={`p-3 rounded-xl transition flex-shrink-0 ${showQuickReplies ? 'text-indigo-500 bg-indigo-50' : (isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500')}`}>
                            <Zap size={20} />
                        </button>
                        <button type="button"
                            onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                            title="Adjuntar archivo"
                            disabled={isUploading}
                            className={`p-3 rounded-xl transition flex-shrink-0 disabled:opacity-50 ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                            <Paperclip size={20} />
                        </button>
                        <button type="button"
                            onClick={e => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                            title="Cámara"
                            disabled={isUploading}
                            className={`p-3 rounded-xl transition flex-shrink-0 disabled:opacity-50 hidden sm:inline-flex ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                            <Camera size={20} />
                        </button>
                        <button type="button"
                            onClick={e => { e.stopPropagation(); setShowTemplates(true); }}
                            title="Enviar plantilla de WhatsApp (fuera de la ventana de 24h)"
                            className={`p-3 rounded-xl transition flex-shrink-0 hidden sm:inline-flex ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                            <LayoutTemplate size={20} />
                        </button>

                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            className={`flex-1 min-w-0 border-none rounded-xl px-5 py-3.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${isDark ? 'bg-slate-700 text-white placeholder:text-slate-500' : 'bg-slate-100 placeholder:text-slate-400'}`}
                            placeholder={`Escribe a ${group.name}...`}
                            autoFocus
                        />

                        {input.trim() || pendingFile ? (
                            <button type="submit" disabled={isUploading}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white p-3.5 rounded-xl transition disabled:opacity-40 shadow-md active:scale-95 flex-shrink-0">
                                {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                            </button>
                        ) : (
                            <button type="button" onClick={e => { e.stopPropagation(); startRecording(); }}
                                title="Grabar nota de voz"
                                disabled={isUploading}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white p-3.5 rounded-xl transition disabled:opacity-40 shadow-md active:scale-95 flex-shrink-0">
                                <Mic size={20} />
                            </button>
                        )}
                    </div>
                )}
                <p className={`text-[10px] text-center mt-2 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                    Cada cliente lo recibe en su chat individual de WhatsApp. Laura responde a los clientes del grupo, salvo que un trabajador esté atendiendo.
                </p>
            </form>
        </div>
    );
}
