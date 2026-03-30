import React, { useState, useEffect, useRef } from 'react';
import {
    Send, Hash, User as UserIcon, MessageSquare, Paperclip, X,
    Image as ImageIcon, FileAudio, FileVideo, File, Mic, Square,
    Play, Pause, Download, Camera, Smile, Video
} from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { useTheme } from '../context/ThemeContext';
import { API_URL } from '../config/api';

interface TeamMessage {
    id?: string;
    content: string;
    sender: string;
    timestamp: string;
    channel: string;
}

// ─── Custom Audio Player ─────────────────────────────────────────────────────
const CustomAudioPlayer = ({ src, isMe, isDark }: { src: string; isMe: boolean; isDark: boolean }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    }, [playbackRate]);

    const togglePlay = () => {
        const a = audioRef.current;
        if (!a) return;
        if (isPlaying) a.pause(); else a.play();
        setIsPlaying(!isPlaying);
    };
    const toggleSpeed = () => {
        const speeds = [1, 1.25, 1.5, 2];
        setPlaybackRate(speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length]);
    };
    const onTimeUpdate = () => {
        const a = audioRef.current;
        if (!a) return;
        setCurrentTime(a.currentTime);
        setProgress((a.currentTime / (a.duration || 1)) * 100);
    };
    const onLoadedMetadata = (e: any) => setDuration(e.currentTarget.duration);
    const onEnded = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0); };
    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const a = audioRef.current;
        if (!a) return;
        a.currentTime = (Number(e.target.value) / 100) * duration;
        setProgress(Number(e.target.value));
    };
    const safeTime = (time: any) => {
        try {
            const date = new Date(time);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    };
    const fmt = (t: number) => {
        if (isNaN(t)) return '0:00';
        return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    };

    return (
        <div className={`flex items-center gap-2 p-2 rounded-xl w-full max-w-[300px] select-none
            ${isMe ? 'bg-white/10 border border-white/10 text-white' : (isDark ? 'bg-slate-700/50 text-slate-100' : 'bg-slate-100 text-slate-700')}`}>
            <audio ref={audioRef} src={src} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={onEnded} className="hidden" />
            <button onClick={togglePlay}
                className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full transition
                    ${isMe ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                <input type="range" min="0" max="100" value={progress} onChange={handleSeek}
                    className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${isMe ? 'accent-white' : 'accent-indigo-500'}`} />
                <div className="flex justify-between items-center text-[10px] opacity-70">
                    <span className="font-mono">{currentTime === 0 && !isPlaying ? fmt(duration) : fmt(currentTime)}</span>
                    <div className="flex items-center gap-1">
                        <button onClick={toggleSpeed}
                            className={`px-1 py-0.5 rounded text-[9px] font-bold ${isMe ? 'bg-black/20' : 'bg-slate-200'}`}>
                            {playbackRate}x
                        </button>
                        <a href={src} download target="_blank" rel="noreferrer"
                            className={`p-0.5 rounded ${isMe ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
                            <Download size={12} />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Component ────────────────────────────────────────────────────────────────
interface TeamChatProps {
    socket: any;
    user: { username: string };
    channel: string;
}

export function TeamChat({ socket, user, channel }: TeamChatProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [messages, setMessages] = useState<TeamMessage[]>([]);
    const [input, setInput] = useState('');
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Separate inputs for photo and video capture (combining them causes Android to default to video)
    const photoInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // Keep a ref to channel/user/socket so onstop closures always have latest values
    const channelRef = useRef(channel);
    const userRef = useRef(user);
    const socketRef = useRef(socket);
    useEffect(() => { channelRef.current = channel; }, [channel]);
    useEffect(() => { userRef.current = user; }, [user]);
    useEffect(() => { socketRef.current = socket; }, [socket]);

    // ── Channel listeners ──────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;
        setMessages([]);

        let channelId = channel;
        if (channel !== 'general') {
            const participants = [user.username, channel].sort();
            channelId = participants.join('_');
        }

        socket.emit('request_team_history', channelId);

        const handleHistory = (data: { channel: string; history: TeamMessage[] }) => {
            if (data.channel === channelId) setMessages(data.history);
        };
        const handleNewMsg = (msg: TeamMessage) => {
            if (msg.channel === channelId) setMessages(prev => [...prev, msg]);
        };

        socket.on('team_history', handleHistory);
        socket.on('team_message', handleNewMsg);

        return () => {
            socket.off('team_history', handleHistory);
            socket.off('team_message', handleNewMsg);
        };
    }, [socket, channel, user.username]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Recording timer ────────────────────────────────────────────────────
    useEffect(() => {
        let interval: any;
        if (isRecording) interval = setInterval(() => setRecordingDuration(d => d + 1), 1000);
        else setRecordingDuration(0);
        return () => clearInterval(interval);
    }, [isRecording]);

    const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    // ── Upload ────────────────────────────────────────────────────────────
    const uploadFile = async (file: File) => {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            // Corrected: API_URL already includes /api, so we use /team/upload
            const res = await fetch(`${API_URL}/team/upload`, { method: 'POST', body: formData });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Upload failed ${res.status}: ${text}`);
            }
            return await res.json();
        } catch (e: any) {
            console.error('❌ [TeamChat] Upload error:', e);
            alert(`Error al subir: ${e.message}`);
            return null;
        } finally {
            setIsUploading(false);
        }
    };

    // Helper: resolve channel ID (same logic used everywhere)
    const resolveChannelId = (ch: string, username: string) => {
        if (ch === 'general') return 'general';
        const participants = [username, ch].sort();
        return participants.join('_');
    };

    // ── Audio Recording ────────────────────────────────────────────────────
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            let mimeType = 'audio/webm';
            let ext = 'webm';
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
                if (MediaRecorder.isTypeSupported(format.mime)) {
                    mimeType = format.mime;
                    ext = format.ext;
                    break;
                }
            }

            console.log(`🎤 [Team] Formato seleccionado: ${mimeType} (.${ext})`);

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                audioBitsPerSecond: 32000
            });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const chunks = audioChunksRef.current;
                if (chunks.length === 0) {
                    alert('⚠️ El micrófono no ha capturado datos. Comprueba los permisos.');
                    return;
                }

                try {
                    const finalMimeType = mimeType.split(';')[0].trim();
                    const finalExt = ext;

                    const audioBlob = new Blob(chunks, { type: finalMimeType });
                    // @ts-ignore
                    const audioFile = new File([audioBlob], `voice.${finalExt}`, { type: finalMimeType });

                    console.log(`🎤 [Team] Enviando audio nativo (${finalExt}): ${audioFile.size} bytes`);
                    
                    const data = await uploadFile(audioFile);
                    if (data?.url) {
                        const currentChannel = channelRef.current;
                        const currentUser = userRef.current;
                        const targetChannel = resolveChannelId(currentChannel, currentUser.username);

                        socketRef.current.emit('send_team_message', {
                            content: `FILE_UPLOAD:::${data.mimetype}:::${data.filename}:::${data.url}:::`,
                            sender: currentUser.username,
                            channel: targetChannel,
                        });
                        console.log('✅ [Team] Socket emitido');
                    }
                } catch (err) {
                    console.error('❌ [Team] Error en onstop:', err);
                } finally {
                    stream.getTracks().forEach(t => t.stop());
                }
            };

            mediaRecorder.start(200); // Send chunks every 200ms
            setIsRecording(true);
        } catch (e: any) {
            alert(`Error micro: ${e.message}`);
        }
    };

    const stopRecording = (send: boolean = true) => {
        if (mediaRecorderRef.current && isRecording) {
            setIsRecording(false); // HIDE IMMEDIATELY for snappiness
            if (!send) audioChunksRef.current = [];
            
            if (mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        }
    };

    // ── Send text / file ─────────────────────────────────────────────────
    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isRecording) {
            stopRecording(true);
            return;
        }
        if (!input.trim() && !pendingFile) return;

        const targetChannel = resolveChannelId(channel, user.username);
        let finalContent = input.trim();

        if (pendingFile) {
            const data = await uploadFile(pendingFile);
            if (data?.url) {
                finalContent = `FILE_UPLOAD:::${data.mimetype}:::${data.filename}:::${data.url}:::${input.trim()}`;
            } else return;
            setPendingFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (photoInputRef.current) photoInputRef.current.value = '';
            if (videoInputRef.current) videoInputRef.current.value = '';
        }

        if (!finalContent) return;

        socket.emit('send_team_message', { content: finalContent, sender: user.username, channel: targetChannel });
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

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) setPendingFile(e.target.files[0]);
    };

    // ── Render message ────────────────────────────────────────────────────
    const renderMessageContent = (content: string) => {
        if (content.startsWith('FILE_UPLOAD:::')) {
            const parts = content.split(':::');
            const mediaType = parts[1] || '';
            const filename = parts[2] || '';
            const relativeUrl = parts[3] || '';
            const textStr = parts.slice(4).join(':::');

            const API_BASE = API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
            const fullUrl = relativeUrl.startsWith('http') ? relativeUrl
                : relativeUrl.startsWith('/') ? `${API_BASE}${relativeUrl}` : `${API_BASE}/${relativeUrl}`;

            return (
                <div className="flex flex-col gap-2">
                    {mediaType.startsWith('image/') && (
                        <img src={fullUrl} alt={filename}
                            className="max-w-[200px] md:max-w-[250px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(fullUrl, '_blank')} />
                    )}
                    {mediaType.startsWith('video/') && (
                        <video src={fullUrl} controls className="max-w-[200px] md:max-w-[250px] rounded-lg" />
                    )}
                    {mediaType.startsWith('audio/') && (
                        <CustomAudioPlayer src={fullUrl} isMe={false} isDark={isDark} />
                    )}
                    {!mediaType.startsWith('image/') && !mediaType.startsWith('video/') && !mediaType.startsWith('audio/') && (
                        <div className="flex items-center gap-2 p-2 bg-black/10 rounded">
                            <File size={20} />
                            <a href={fullUrl} target="_blank" rel="noreferrer" className="underline truncate text-sm">{filename}</a>
                        </div>
                    )}
                    {textStr && <p className="mt-1 whitespace-pre-wrap">{textStr}</p>}
                </div>
            );
        }
        return <p className="whitespace-pre-wrap">{content}</p>;
    };

    // ── JSX ───────────────────────────────────────────────────────────────
    return (
        <div
            className={`flex flex-col h-full ${isDark ? 'bg-slate-900' : 'bg-slate-50/30'}`}
            onClick={() => { setShowEmojiPicker(false); setShowMobileMenu(false); }}
        >
            {/* Header */}
            <div className={`p-4 pl-16 md:pl-4 border-b flex items-center gap-3 shadow-sm z-10 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className={`p-2 rounded-lg ${channel === 'general'
                    ? (isDark ? 'bg-indigo-900/50 text-indigo-400' : 'bg-indigo-100 text-indigo-600')
                    : (isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-600')}`}>
                    {channel === 'general' ? <Hash size={24} /> : <UserIcon size={24} />}
                </div>
                <div>
                    <h2 className={`font-bold text-xl capitalize ${isDark ? 'text-white' : 'text-slate-800'}`}>{channel}</h2>
                    <p className={`text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {channel === 'general' ? 'Sala común' : 'Mensajería Privada'}
                    </p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                        <MessageSquare size={48} className="opacity-50" />
                        <p className="font-medium">No hay mensajes aún.</p>
                        <p className="text-xs">Sé el primero en escribir.</p>
                    </div>
                )}
                {messages.map((m, idx) => {
                    const isMe = m.sender === user.username;
                    const showHeader = idx === 0 || messages[idx - 1].sender !== m.sender;
                    return (
                        <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
                            {showHeader && (
                                <span className={`text-[10px] font-bold mb-1 px-1 uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {m.sender} • {safeTime(m.timestamp)}
                                </span>
                            )}
                            <div className={`px-5 py-3 rounded-2xl text-sm shadow-sm max-w-[85%] md:max-w-[70%] leading-relaxed
                                ${isMe
                                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                                    : (isDark ? 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm')}`}>
                                {renderMessageContent(m.content)}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <form
                onSubmit={sendMessage}
                onClick={e => e.stopPropagation()}
                className={`p-4 border-t relative ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
            >
                {/* Hidden inputs — SEPARATED to control accept per input */}
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                {/* Photo only: opens camera in photo mode on Android */}
                <input type="file" ref={photoInputRef} accept="image/*" capture={"environment" as any} className="hidden" onChange={handleFileSelect} />
                {/* Video only: opens camera in video mode on Android */}
                <input type="file" ref={videoInputRef} accept="video/*" capture={"environment" as any} className="hidden" onChange={handleFileSelect} />

                {/* File preview */}
                {pendingFile && (
                    <div className={`absolute bottom-full left-0 w-full p-3 flex items-center justify-between border-b shadow-sm
                        ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-2 overflow-hidden">
                            {pendingFile.type.startsWith('image/') ? <ImageIcon size={20} className="text-blue-500" />
                                : pendingFile.type.startsWith('video/') ? <FileVideo size={20} className="text-purple-500" />
                                : pendingFile.type.startsWith('audio/') ? <FileAudio size={20} className="text-orange-500" />
                                : <File size={20} className="text-slate-500" />}
                            <span className="text-sm truncate font-medium max-w-[200px]">{pendingFile.name}</span>
                        </div>
                        <button type="button"
                            onClick={() => {
                                setPendingFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                                if (photoInputRef.current) photoInputRef.current.value = '';
                                if (videoInputRef.current) videoInputRef.current.value = '';
                            }}
                            className="p-1 rounded-full hover:bg-black/10 text-slate-500">
                            <X size={16} />
                        </button>
                    </div>
                )}

                {/* Recording banner */}
                {isRecording && (
                    <div className="absolute bottom-full left-0 w-full bg-red-50 text-red-600 p-3 text-sm font-bold flex items-center justify-between gap-3 shadow-lg z-30 border-t border-red-200">
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                            </span>
                            <span className="text-lg font-mono tracking-wider">{fmtTime(recordingDuration)}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => stopRecording(false)} title="Cancelar Grabación"
                                className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition">
                                <X size={14} strokeWidth={2.5} /> Cancelar
                            </button>
                            <button type="button" onClick={() => stopRecording(true)} title="Enviar Audio"
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm">
                                <Send size={14} className="ml-0.5" /> Enviar
                            </button>
                        </div>
                    </div>
                )}

                {/* Emoji picker */}
                {showEmojiPicker && (
                    <div className="absolute bottom-full left-4 mb-2 z-50 shadow-2xl rounded-xl"
                        onClick={e => e.stopPropagation()}>
                        <EmojiPicker onEmojiClick={onEmojiClick} width={300} height={380} previewConfig={{ showPreview: false }} />
                    </div>
                )}

                <div className="flex gap-2 max-w-4xl mx-auto w-full items-center">

                    {/* ── Mobile menu (+) ── */}
                    <div className="relative md:hidden">
                        <button type="button"
                            onClick={e => { e.stopPropagation(); setShowMobileMenu(!showMobileMenu); }}
                            className={`p-2.5 rounded-full flex-shrink-0 transition ${showMobileMenu
                                ? 'bg-indigo-100 text-indigo-600 rotate-45'
                                : (isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100')}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                        </button>
                        {showMobileMenu && (
                            <div className={`absolute bottom-full left-0 mb-2 rounded-xl shadow-xl border z-50 p-2 animate-in slide-in-from-bottom-2 min-w-[190px]
                                ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}
                                onClick={e => e.stopPropagation()}>
                                {/* Foto — opens camera in PHOTO mode */}
                                <button type="button" onClick={() => { photoInputRef.current?.click(); setShowMobileMenu(false); }}
                                    className={`w-full text-left px-3 py-2.5 text-sm rounded-lg flex items-center gap-3 ${isDark ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-blue-50 text-slate-700'}`}>
                                    <Camera className="w-4 h-4 text-blue-500" /> Hacer foto
                                </button>
                                {/* Vídeo — opens camera in VIDEO mode */}
                                <button type="button" onClick={() => { videoInputRef.current?.click(); setShowMobileMenu(false); }}
                                    className={`w-full text-left px-3 py-2.5 text-sm rounded-lg flex items-center gap-3 ${isDark ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-purple-50 text-slate-700'}`}>
                                    <Video className="w-4 h-4 text-purple-500" /> Grabar vídeo
                                </button>
                                {/* File */}
                                <button type="button" onClick={() => { fileInputRef.current?.click(); setShowMobileMenu(false); }}
                                    className={`w-full text-left px-3 py-2.5 text-sm rounded-lg flex items-center gap-3 ${isDark ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-50 text-slate-700'}`}>
                                    <Paperclip className="w-4 h-4 text-slate-400" /> Adjuntar archivo
                                </button>
                                {/* Emoji */}
                                <button type="button" onClick={() => { setShowEmojiPicker(true); setShowMobileMenu(false); }}
                                    className={`w-full text-left px-3 py-2.5 text-sm rounded-lg flex items-center gap-3 ${isDark ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-yellow-50 text-slate-700'}`}>
                                    <Smile className="w-4 h-4 text-yellow-500" /> Emojis
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── Desktop buttons ── */}
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                        title="Adjuntar archivo"
                        className={`p-3 rounded-xl transition flex-shrink-0 hidden md:flex ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                        <Paperclip size={20} />
                    </button>
                    <button type="button" onClick={() => photoInputRef.current?.click()} disabled={isUploading}
                        title="Hacer foto"
                        className={`p-3 rounded-xl transition flex-shrink-0 hidden md:flex ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                        <Camera size={20} />
                    </button>

                    {/* Text input */}
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        className={`flex-1 border-none rounded-xl px-5 py-3.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all
                            ${isDark ? 'bg-slate-700 text-white placeholder:text-slate-500' : 'bg-slate-100 placeholder:text-slate-400'}`}
                        placeholder={isUploading ? 'Subiendo...' : isRecording ? 'Grabando... (pulsa ■ para parar)' : `Escribe en #${channel}...`}
                        disabled={isUploading || isRecording}
                        autoFocus
                    />

                    {/* Desktop Emoji */}
                    <button type="button"
                        onClick={e => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }}
                        title="Emojis"
                        className={`p-3 rounded-xl transition flex-shrink-0 hidden md:flex
                            ${showEmojiPicker ? 'text-indigo-500 bg-indigo-50' : (isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500')}`}>
                        <Smile size={20} />
                    </button>

                    {/* Send / Mic */}
                    {input.trim() || pendingFile || isRecording ? (
                        <button type="submit" disabled={isUploading}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white p-3.5 rounded-xl transition disabled:opacity-50 shadow-md active:scale-95 flex-shrink-0">
                            <Send size={20} />
                        </button>
                    ) : (
                        <button type="button"
                            onClick={startRecording}
                            title="Grabar audio"
                            className={`p-3.5 rounded-xl text-white transition shadow-md active:scale-95 flex-shrink-0
                                ${isDark ? 'bg-slate-600 hover:bg-slate-500' : 'bg-slate-700 hover:bg-slate-600'}`}>
                            <Mic size={20} />
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}