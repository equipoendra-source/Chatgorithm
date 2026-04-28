import { useState, useEffect, useRef } from 'react';
import {
    BookOpen, Upload, FileText, Loader2, Trash2, CheckCircle2,
    AlertCircle, X, Database, Sparkles
} from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

interface KnowledgeDoc {
    source: string;
    chunks: number;
    uploadedAt: string;
    sizeChars: number;
}

export default function BotKnowledgeManager() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const loadDocs = async () => {
        try {
            const r = await fetch(`${API_URL}/bot/knowledge`);
            if (r.ok) {
                const data = await r.json();
                setDocs(Array.isArray(data) ? data : []);
            }
        } catch { }
        finally { setLoading(false); }
    };

    useEffect(() => { loadDocs(); }, []);

    const handleUpload = async (file: File) => {
        if (!file) return;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!['pdf', 'docx', 'txt', 'md'].includes(ext)) {
            setError('Formato no soportado. Usa PDF, DOCX, TXT o MD.');
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            setError('Archivo demasiado grande (máx. 20 MB).');
            return;
        }
        setError(null);
        setUploading(true);
        setProgress('Subiendo y extrayendo texto...');
        try {
            const fd = new FormData();
            fd.append('file', file);
            const r = await fetch(`${API_URL}/bot/knowledge/upload`, { method: 'POST', body: fd });
            const data = await r.json();
            if (!r.ok || !data.success) {
                setError(data.error || 'Error subiendo el documento');
            } else {
                setProgress(`✅ ${data.source} procesado (${data.chunksProcessed}/${data.chunksTotal} chunks)`);
                await loadDocs();
                setTimeout(() => setProgress(''), 4000);
            }
        } catch (e: any) {
            setError('Error de conexión: ' + e.message);
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleDelete = async (source: string) => {
        if (!confirm(`¿Borrar "${source}" de la base de conocimiento de Laura?`)) return;
        try {
            const r = await fetch(`${API_URL}/bot/knowledge/${encodeURIComponent(source)}`, { method: 'DELETE' });
            if (r.ok) loadDocs();
            else alert('Error borrando documento');
        } catch (e: any) {
            alert('Error: ' + e.message);
        }
    };

    const formatSize = (chars: number): string => {
        if (chars < 1000) return `${chars} caracteres`;
        if (chars < 1_000_000) return `${(chars / 1000).toFixed(1)}k caracteres`;
        return `${(chars / 1_000_000).toFixed(2)}M caracteres`;
    };

    const formatDate = (iso: string): string => {
        if (!iso) return '-';
        try {
            return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return iso; }
    };

    const totalChunks = docs.reduce((acc, d) => acc + d.chunks, 0);
    const totalChars = docs.reduce((acc, d) => acc + d.sizeChars, 0);

    return (
        <div className={`rounded-2xl border p-6 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
            {/* Cabecera */}
            <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
                        <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Documentos de Laura</h2>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sube tu catálogo, tarifas, FAQ... Laura aprenderá de ellos.</p>
                    </div>
                </div>
            </div>

            {/* Aviso */}
            <div className={`mb-5 p-4 rounded-xl border-l-4 border-blue-500 text-xs ${isDark ? 'bg-blue-500/10 text-blue-200' : 'bg-blue-50 text-blue-800'}`}>
                <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <strong>¿Cómo funciona?</strong> Cuando subes un documento, lo dividimos en pequeños trozos y los indexamos en una base vectorial.
                        Cuando un cliente pregunta algo, Laura busca automáticamente la información relevante y responde con datos reales de tu negocio.
                        <br /><br />
                        <strong>Formatos soportados:</strong> PDF, Word (.docx), Texto (.txt, .md). Máx. 20 MB por archivo.
                    </div>
                </div>
            </div>

            {/* Drop zone */}
            <label className={`block p-8 rounded-xl border-2 border-dashed cursor-pointer transition mb-5 ${uploading
                ? (isDark ? 'border-purple-500 bg-purple-500/5' : 'border-purple-400 bg-purple-50')
                : (isDark ? 'border-white/10 bg-slate-800/30 hover:border-white/30' : 'border-slate-300 bg-slate-50 hover:border-slate-400')}`}>
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                }} className="hidden" disabled={uploading} />
                <div className="text-center">
                    {uploading ? (
                        <>
                            <Loader2 className="w-10 h-10 mx-auto mb-3 text-purple-500 animate-spin" />
                            <div className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Procesando documento...</div>
                            {progress && <div className={`text-xs mt-2 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>{progress}</div>}
                            <div className={`text-xs mt-2 italic ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Esto puede tardar varios segundos según el tamaño.</div>
                        </>
                    ) : (
                        <>
                            <Upload className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                            <div className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Pulsa para subir un documento</div>
                            <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>PDF · Word (.docx) · TXT · MD</div>
                        </>
                    )}
                </div>
            </label>

            {/* Mensajes */}
            {error && (
                <div className={`mb-5 p-3 rounded-lg flex items-start gap-2 text-sm ${isDark ? 'bg-red-500/10 text-red-300 border border-red-500/30' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="flex-1">{error}</div>
                    <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
                </div>
            )}
            {progress && !uploading && (
                <div className={`mb-5 p-3 rounded-lg flex items-start gap-2 text-sm ${isDark ? 'bg-green-500/10 text-green-300 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>{progress}</div>
                </div>
            )}

            {/* Estadísticas */}
            {docs.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                        <div className="text-2xl font-bold text-blue-500">{docs.length}</div>
                        <div className={`text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Documentos</div>
                    </div>
                    <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                        <div className="text-2xl font-bold text-purple-500">{totalChunks}</div>
                        <div className={`text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Trozos indexados</div>
                    </div>
                    <div className={`p-3 rounded-lg text-center ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                        <div className="text-2xl font-bold text-pink-500">{formatSize(totalChars).replace(' caracteres', '')}</div>
                        <div className={`text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{totalChars >= 1000 ? 'k caracteres' : 'caracteres'}</div>
                    </div>
                </div>
            )}

            {/* Lista de documentos */}
            <div>
                <h3 className={`text-xs font-bold uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Documentos subidos</h3>
                {loading ? (
                    <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
                ) : docs.length === 0 ? (
                    <div className={`p-8 rounded-lg text-center ${isDark ? 'bg-slate-800/30 text-slate-500' : 'bg-slate-50 text-slate-400'}`}>
                        <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Aún no hay documentos. Sube el primero arriba.</p>
                        <p className={`text-xs mt-2 italic ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                            Sin documentos, Laura solo usa el prompt configurado en el wizard.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {docs.map(d => (
                            <div key={d.source}
                                className={`p-3 rounded-lg border flex items-center gap-3 ${isDark ? 'bg-slate-800/30 border-white/5' : 'bg-white border-slate-200'}`}>
                                <FileText className="w-5 h-5 text-purple-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className={`font-semibold text-sm truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{d.source}</div>
                                    <div className={`flex flex-wrap gap-x-3 gap-y-0.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                        <span>{d.chunks} trozos</span>
                                        <span>{formatSize(d.sizeChars)}</span>
                                        <span>Subido: {formatDate(d.uploadedAt)}</span>
                                    </div>
                                </div>
                                <button onClick={() => handleDelete(d.source)}
                                    className={`p-2 rounded-lg ${isDark ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-red-50 text-red-500'}`}
                                    title="Eliminar de la base de conocimiento">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
