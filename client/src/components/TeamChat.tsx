import React, { useState, useEffect, useRef } from 'react';
import { Send, Hash, User as UserIcon, MessageSquare } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface TeamMessage {
    id?: string;
    content: string;
    sender: string;
    timestamp: string;
    channel: string;
}

interface TeamChatProps {
    socket: any;
    user: { username: string };
    channel: string; // Recibe el canal desde el Sidebar
}

export function TeamChat({ socket, user, channel }: TeamChatProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [messages, setMessages] = useState<TeamMessage[]>([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Pedir historial cuando cambia el canal
    useEffect(() => {
        if (!socket) return;
        setMessages([]);

        let channelId = channel;
        if (channel !== 'general') {
            // ID consistente para chat privado (alfabético)
            const participants = [user.username, channel].sort();
            channelId = participants.join('_');
        }

        socket.emit('request_team_history', channelId);

        const handleHistory = (data: { channel: string, history: TeamMessage[] }) => {
            if (data.channel === channelId) {
                setMessages(data.history);
            }
        };

        const handleNewMsg = (msg: TeamMessage) => {
            if (msg.channel === channelId) {
                setMessages(prev => [...prev, msg]);
            }
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

    const sendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        let targetChannel = channel;
        if (channel !== 'general') {
            const participants = [user.username, channel].sort();
            targetChannel = participants.join('_');
        }

        const msg = {
            content: input,
            sender: user.username,
            channel: targetChannel
        };

        socket.emit('send_team_message', msg);
        setInput('');
    };

    return (
        <div className={`flex flex-col h-full ${isDark ? 'bg-slate-900' : 'bg-slate-50/30'}`}>
            {/* Header del Chat - extra padding izquierdo en móvil para botón atrás */}
            <div className={`p-4 pl-16 md:pl-4 border-b flex items-center gap-3 shadow-sm z-10 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                <div className={`p-2 rounded-lg ${channel === 'general'
                        ? (isDark ? 'bg-indigo-900/50 text-indigo-400' : 'bg-indigo-100 text-indigo-600')
                        : (isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-600')
                    }`}>
                    {channel === 'general' ? <Hash size={24} /> : <UserIcon size={24} />}
                </div>
                <div>
                    <h2 className={`font-bold text-xl capitalize ${isDark ? 'text-white' : 'text-slate-800'}`}>{channel}</h2>
                    <p className={`text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {channel === 'general' ? 'Sala común' : 'Mensajería Privada'}
                    </p>
                </div>
            </div>

            {/* Lista de Mensajes */}
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
                                    {m.sender} • {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                            <div className={`px-5 py-3 rounded-2xl text-sm shadow-sm max-w-[85%] md:max-w-[70%] leading-relaxed ${isMe
                                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                                    : (isDark ? 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm')
                                }`}>
                                {m.content}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className={`p-4 border-t ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="flex gap-3 max-w-4xl mx-auto w-full">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className={`flex-1 border-none rounded-xl px-5 py-3.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${isDark
                                ? 'bg-slate-700 text-white placeholder:text-slate-500'
                                : 'bg-slate-100 placeholder:text-slate-400'
                            }`}
                        placeholder={`Escribe en #${channel}...`}
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={!input.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white p-3.5 rounded-xl transition disabled:opacity-50 shadow-md active:scale-95"
                    >
                        <Send size={20} />
                    </button>
                </div>
            </form>
        </div>
    );
}