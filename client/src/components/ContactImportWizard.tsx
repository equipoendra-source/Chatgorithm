import { useState, useRef } from 'react';
import {
    Upload, Database, RefreshCw, CheckCircle2, AlertTriangle, X, FileText,
    Download, ChevronRight, ChevronLeft, Users, UserPlus, UserCheck, AlertCircle
} from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

type Step = 'upload' | 'preview' | 'importing' | 'done';

interface PreviewRow {
    line: number;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    department?: string;
    tags?: string[];
    exists?: boolean;
}

interface InvalidRow { line: number; name: string; phone: string; reason: string; }

interface PreviewResponse {
    success: boolean;
    separator: string;
    headersDetected: string[];
    mapping: Record<string, number>;
    unknownColumns: string[];
    stats: {
        totalRows: number;
        valid: number;
        invalid: number;
        duplicatesInFile: number;
        alreadyExists: number;
        newContacts: number;
    };
    preview: PreviewRow[];
    invalidPreview: InvalidRow[];
    allValid: PreviewRow[];
}

interface ImportError { phone: string; name: string; reason: string; }

export default function ContactImportWizard() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [step, setStep] = useState<Step>('upload');
    const [file, setFile] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const [analyzing, setAnalyzing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [preview, setPreview] = useState<PreviewResponse | null>(null);

    // Opciones de import
    const [markOptIn, setMarkOptIn] = useState(false);
    const [updateExisting, setUpdateExisting] = useState(true);
    const [defaultDepartment, setDefaultDepartment] = useState('');
    const [defaultTagsRaw, setDefaultTagsRaw] = useState('');

    // Progreso
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [result, setResult] = useState({ created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as ImportError[] });

    const reset = () => {
        setStep('upload'); setFile(null); setPreview(null); setErrorMsg('');
        setMarkOptIn(false); setUpdateExisting(true); setDefaultDepartment(''); setDefaultTagsRaw('');
        setProgress({ current: 0, total: 0 });
        setResult({ created: 0, updated: 0, skipped: 0, failed: 0, errors: [] });
        if (fileRef.current) fileRef.current.value = '';
    };

    const downloadTemplate = () => {
        window.open(`${API_URL}/contacts/import-template`, '_blank');
    };

    const analyze = async () => {
        if (!file) return;
        setAnalyzing(true); setErrorMsg('');
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(`${API_URL}/contacts/import-preview`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setErrorMsg(data.error || 'Error analizando el archivo');
            } else {
                setPreview(data);
                setStep('preview');
            }
        } catch (e: any) {
            setErrorMsg('Error de conexión: ' + e.message);
        } finally {
            setAnalyzing(false);
        }
    };

    const startImport = async () => {
        if (!preview) return;
        setStep('importing');
        setErrorMsg('');

        const allRows = preview.allValid;
        // Si NO se actualizan existentes, los filtramos antes para no enviarlos al backend
        const rowsToSend = updateExisting ? allRows : allRows.filter(r => !r.exists);

        const defaultTags = defaultTagsRaw.split(/[,;]/).map(t => t.trim()).filter(Boolean);
        const options = {
            markOptIn, updateExisting,
            optInSource: 'import-csv',
            defaultDepartment: defaultDepartment.trim(),
            defaultTags,
        };

        const CHUNK = 100;
        setProgress({ current: 0, total: rowsToSend.length });
        let totals = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as ImportError[] };

        for (let i = 0; i < rowsToSend.length; i += CHUNK) {
            const slice = rowsToSend.slice(i, i + CHUNK);
            try {
                const res = await fetch(`${API_URL}/contacts/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows: slice, options }),
                });
                const data = await res.json();
                if (data && data.success) {
                    totals.created += data.created || 0;
                    totals.updated += data.updated || 0;
                    totals.skipped += data.skipped || 0;
                    totals.failed += data.failed || 0;
                    if (Array.isArray(data.errors)) totals.errors.push(...data.errors);
                } else {
                    // Si el chunk entero falló, todas se cuentan como failed
                    totals.failed += slice.length;
                    slice.forEach(s => totals.errors.push({ phone: s.phone, name: s.name, reason: data?.error || 'Error desconocido del servidor' }));
                }
            } catch (e: any) {
                totals.failed += slice.length;
                slice.forEach(s => totals.errors.push({ phone: s.phone, name: s.name, reason: 'Error de conexión: ' + e.message }));
            }
            setProgress({ current: Math.min(i + CHUNK, rowsToSend.length), total: rowsToSend.length });
            setResult({ ...totals });
        }
        setStep('done');
    };

    const downloadErrors = () => {
        if (result.errors.length === 0) return;
        const header = 'Telefono,Nombre,Motivo\n';
        const body = result.errors.map(e => `"${(e.phone || '').replace(/"/g, '""')}","${(e.name || '').replace(/"/g, '""')}","${(e.reason || '').replace(/"/g, '""')}"`).join('\n');
        const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'errores-importacion.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    // Estilos comunes
    const card = `rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`;
    const subCard = `rounded-xl border ${isDark ? 'bg-slate-800/30 border-slate-700' : 'bg-slate-50 border-slate-200'}`;

    return (
        <div className={`max-w-4xl mx-auto p-6 md:p-8 ${card}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                        <Database size={24} className="text-emerald-600" />
                    </div>
                    <div>
                        <h2 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Importar Contactos</h2>
                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sube tu base de clientes desde un archivo CSV o Excel exportado.</p>
                    </div>
                </div>
                {step !== 'upload' && (
                    <button onClick={reset} className={`text-xs font-semibold px-3 py-2 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <X size={14} className="inline mr-1" /> Cancelar
                    </button>
                )}
            </div>

            {/* Pasos visuales */}
            <div className="flex items-center gap-2 mb-8 text-xs font-semibold">
                {(['upload', 'preview', 'importing', 'done'] as Step[]).map((s, i) => {
                    const labels = ['Subir', 'Revisar', 'Importar', 'Resumen'];
                    const isActive = step === s;
                    const isPast = (['upload', 'preview', 'importing', 'done'] as Step[]).indexOf(step) > i;
                    return (
                        <div key={s} className="flex items-center gap-2 flex-1">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? 'bg-emerald-600 text-white' : isPast ? 'bg-emerald-100 text-emerald-700' : (isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500')}`}>
                                {isPast ? <CheckCircle2 size={14} /> : i + 1}
                            </div>
                            <span className={`hidden sm:inline ${isActive ? 'text-emerald-600' : (isDark ? 'text-slate-400' : 'text-slate-500')}`}>{labels[i]}</span>
                            {i < 3 && <div className={`flex-1 h-0.5 ${isPast ? 'bg-emerald-300' : (isDark ? 'bg-slate-700' : 'bg-slate-200')}`} />}
                        </div>
                    );
                })}
            </div>

            {/* PASO 1 — UPLOAD */}
            {step === 'upload' && (
                <div className="space-y-5">
                    <div className={`p-4 rounded-xl border flex gap-3 items-start ${isDark ? 'bg-blue-900/20 border-blue-800/50' : 'bg-blue-50 border-blue-200'}`}>
                        <FileText className={`shrink-0 mt-0.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} size={20} />
                        <div className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                            <p className="mb-2"><strong>Acepta CSV con cabecera</strong>, separador <code>,</code> o <code>;</code> (Excel español).</p>
                            <p className="mb-2">Cabeceras reconocidas (cualquier sinónimo):</p>
                            <ul className="text-xs space-y-1 ml-4 list-disc">
                                <li><strong>Nombre</strong> (también: name, cliente, contacto)</li>
                                <li><strong>Teléfono</strong> ⚠️ obligatorio (también: phone, móvil, whatsapp)</li>
                                <li><strong>Email</strong> (opcional, también: correo, mail)</li>
                                <li><strong>Dirección</strong> (opcional, también: address, domicilio)</li>
                                <li><strong>Departamento</strong> (opcional, también: department, depto)</li>
                                <li><strong>Etiquetas</strong> (opcional, separadas por <code>;</code> dentro de la celda)</li>
                            </ul>
                            <button onClick={downloadTemplate} className="mt-3 text-xs font-bold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                                <Download size={12} /> Descargar plantilla CSV
                            </button>
                        </div>
                    </div>

                    <label className={`block p-8 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${file ? (isDark ? 'border-emerald-600 bg-emerald-500/5' : 'border-emerald-400 bg-emerald-50/50') : (isDark ? 'border-slate-600 hover:border-slate-500 bg-slate-800/30' : 'border-slate-300 hover:border-emerald-400 bg-slate-50')}`}>
                        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={(e) => { setFile(e.target.files?.[0] || null); setErrorMsg(''); }} className="hidden" />
                        {file ? (
                            <div className="flex items-center justify-center gap-3">
                                <FileText className="text-emerald-600" size={28} />
                                <div className="text-left">
                                    <div className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-800'}`}>{file.name}</div>
                                    <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB · pulsa para cambiar</div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <Upload size={32} className={`mx-auto mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                                <div className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Pulsa para elegir un archivo CSV</div>
                                <div className="text-xs text-slate-500 mt-1">o arrástralo aquí</div>
                            </div>
                        )}
                    </label>

                    {errorMsg && (
                        <div className={`p-4 rounded-xl border flex gap-3 items-start ${isDark ? 'bg-red-900/20 border-red-800/50 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <div className="text-sm">{errorMsg}</div>
                        </div>
                    )}

                    <button
                        onClick={analyze}
                        disabled={!file || analyzing}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        {analyzing ? <RefreshCw className="animate-spin" size={18} /> : <ChevronRight size={18} />}
                        {analyzing ? 'Analizando archivo...' : 'Analizar archivo'}
                    </button>
                </div>
            )}

            {/* PASO 2 — PREVIEW */}
            {step === 'preview' && preview && (
                <div className="space-y-5">
                    {/* Estadísticas */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className={`p-4 rounded-xl ${subCard}`}>
                            <div className="text-xs text-slate-400 font-semibold uppercase mb-1">Total leídas</div>
                            <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{preview.stats.totalRows}</div>
                        </div>
                        <div className={`p-4 rounded-xl ${subCard}`}>
                            <div className="text-xs text-emerald-500 font-semibold uppercase mb-1">Nuevos</div>
                            <div className="text-2xl font-bold text-emerald-600">{preview.stats.newContacts}</div>
                        </div>
                        <div className={`p-4 rounded-xl ${subCard}`}>
                            <div className="text-xs text-blue-500 font-semibold uppercase mb-1">Ya existen</div>
                            <div className="text-2xl font-bold text-blue-600">{preview.stats.alreadyExists}</div>
                        </div>
                        <div className={`p-4 rounded-xl ${subCard}`}>
                            <div className="text-xs text-red-500 font-semibold uppercase mb-1">Inválidas</div>
                            <div className="text-2xl font-bold text-red-600">{preview.stats.invalid}</div>
                        </div>
                    </div>

                    {/* Cabeceras detectadas */}
                    <div className={`p-4 rounded-xl ${subCard}`}>
                        <div className={`text-xs font-bold uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Cabeceras detectadas (separador: <code>{preview.separator === '\t' ? 'TAB' : preview.separator}</code>)</div>
                        <div className="flex flex-wrap gap-1.5">
                            {preview.headersDetected.map((h, i) => {
                                const matched = Object.values(preview.mapping).includes(i);
                                return (
                                    <span key={i} className={`text-xs px-2 py-1 rounded-md border ${matched ? (isDark ? 'bg-emerald-900/30 text-emerald-300 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200') : (isDark ? 'bg-slate-700 text-slate-400 border-slate-600' : 'bg-slate-100 text-slate-500 border-slate-200')}`}>
                                        {matched && <CheckCircle2 size={10} className="inline mr-1" />}
                                        {h}
                                    </span>
                                );
                            })}
                        </div>
                        {preview.unknownColumns.length > 0 && (
                            <div className="text-xs text-slate-400 mt-2">Columnas no mapeadas (se ignorarán): {preview.unknownColumns.join(', ')}</div>
                        )}
                    </div>

                    {/* Vista previa de filas */}
                    {preview.preview.length > 0 && (
                        <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                            <div className={`px-4 py-2 text-xs font-bold uppercase ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                                Vista previa (primeras {preview.preview.length} filas válidas)
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className={`text-xs uppercase ${isDark ? 'bg-slate-900/50 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                                        <tr>
                                            <th className="px-3 py-2 text-left">Línea</th>
                                            <th className="px-3 py-2 text-left">Nombre</th>
                                            <th className="px-3 py-2 text-left">Teléfono</th>
                                            <th className="px-3 py-2 text-left">Email</th>
                                            <th className="px-3 py-2 text-left">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-200'}`}>
                                        {preview.preview.map((r, i) => (
                                            <tr key={i} className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                                                <td className="px-3 py-2 text-xs text-slate-400">{r.line}</td>
                                                <td className={`px-3 py-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{r.name || <span className="text-slate-400 italic">(sin nombre)</span>}</td>
                                                <td className="px-3 py-2 font-mono text-xs">{r.phone}</td>
                                                <td className="px-3 py-2 text-xs">{r.email || '—'}</td>
                                                <td className="px-3 py-2">
                                                    {r.exists ? (
                                                        <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Existe</span>
                                                    ) : (
                                                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Nuevo</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Filas inválidas */}
                    {preview.invalidPreview.length > 0 && (
                        <div className={`p-4 rounded-xl border ${isDark ? 'bg-red-900/10 border-red-800/40' : 'bg-red-50/50 border-red-200'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle size={16} className="text-red-500" />
                                <span className={`text-sm font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>Filas que se descartarán ({preview.stats.invalid})</span>
                            </div>
                            <div className="text-xs space-y-1 max-h-40 overflow-y-auto">
                                {preview.invalidPreview.map((r, i) => (
                                    <div key={i} className={`${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                        Línea {r.line}: <strong>{r.name || '(sin nombre)'}</strong> [{r.phone || 'sin teléfono'}] — {r.reason}
                                    </div>
                                ))}
                                {preview.stats.invalid > preview.invalidPreview.length && (
                                    <div className="text-xs text-slate-400 italic mt-2">y {preview.stats.invalid - preview.invalidPreview.length} más...</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Opciones de importación */}
                    <div className={`p-4 rounded-xl space-y-4 ${subCard}`}>
                        <div className={`text-xs font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Opciones</div>

                        <label className="flex items-start gap-3 cursor-pointer">
                            <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="mt-1 w-4 h-4 accent-emerald-600" />
                            <div>
                                <div className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Actualizar contactos existentes</div>
                                <div className="text-xs text-slate-500">Si un teléfono ya existe en la base de datos, sobrescribe nombre/email/dirección. Desactívalo para conservar lo que ya hay.</div>
                            </div>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer">
                            <input type="checkbox" checked={markOptIn} onChange={(e) => setMarkOptIn(e.target.checked)} className="mt-1 w-4 h-4 accent-orange-600" />
                            <div>
                                <div className={`text-sm font-semibold ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>Marcar opt-in marketing</div>
                                <div className="text-xs text-slate-500">⚠️ Marca SOLO si tienes constancia documental de que estos clientes te dieron consentimiento previo para recibir promociones (RGPD). Si dudas, déjalo desmarcado.</div>
                            </div>
                        </label>

                        <div className="grid md:grid-cols-2 gap-3">
                            <div>
                                <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Departamento por defecto (opcional)</label>
                                <input type="text" value={defaultDepartment} onChange={(e) => setDefaultDepartment(e.target.value)} placeholder="Ej: TALLER" className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300'}`} />
                            </div>
                            <div>
                                <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Etiquetas adicionales (separa por <code>,</code>)</label>
                                <input type="text" value={defaultTagsRaw} onChange={(e) => setDefaultTagsRaw(e.target.value)} placeholder="Ej: importado-2026, antiguo-cliente" className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300'}`} />
                            </div>
                        </div>
                    </div>

                    {/* Botones */}
                    <div className="flex gap-3">
                        <button onClick={() => setStep('upload')} className={`flex-1 py-3 rounded-xl font-bold border ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                            <ChevronLeft size={16} className="inline mr-1" /> Atrás
                        </button>
                        <button
                            onClick={startImport}
                            disabled={preview.stats.valid === 0}
                            className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
                        >
                            <Upload size={18} />
                            Importar {updateExisting ? preview.stats.valid : preview.stats.newContacts} contactos
                        </button>
                    </div>
                </div>
            )}

            {/* PASO 3 — IMPORTING */}
            {step === 'importing' && (
                <div className="space-y-6 py-8">
                    <div className="text-center">
                        <RefreshCw className="animate-spin mx-auto text-emerald-600 mb-4" size={48} />
                        <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Importando contactos...</div>
                        <div className="text-sm text-slate-500 mt-1">No cierres esta ventana hasta que termine.</div>
                    </div>

                    <div>
                        <div className="flex justify-between text-xs font-semibold mb-2">
                            <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Procesados</span>
                            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{progress.current} / {progress.total}</span>
                        </div>
                        <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                            <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300" style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }} />
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                        <div className={`p-3 rounded-xl text-center ${subCard}`}>
                            <UserPlus className="mx-auto mb-1 text-emerald-600" size={18} />
                            <div className="text-lg font-bold text-emerald-600">{result.created}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Nuevos</div>
                        </div>
                        <div className={`p-3 rounded-xl text-center ${subCard}`}>
                            <UserCheck className="mx-auto mb-1 text-blue-600" size={18} />
                            <div className="text-lg font-bold text-blue-600">{result.updated}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Actualizados</div>
                        </div>
                        <div className={`p-3 rounded-xl text-center ${subCard}`}>
                            <Users className="mx-auto mb-1 text-slate-500" size={18} />
                            <div className="text-lg font-bold text-slate-500">{result.skipped}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Saltados</div>
                        </div>
                        <div className={`p-3 rounded-xl text-center ${subCard}`}>
                            <AlertTriangle className="mx-auto mb-1 text-red-500" size={18} />
                            <div className="text-lg font-bold text-red-500">{result.failed}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Fallidos</div>
                        </div>
                    </div>
                </div>
            )}

            {/* PASO 4 — DONE */}
            {step === 'done' && (
                <div className="space-y-6">
                    <div className={`p-6 rounded-xl text-center border ${result.failed === 0 ? (isDark ? 'bg-emerald-900/20 border-emerald-800/50' : 'bg-emerald-50 border-emerald-200') : (isDark ? 'bg-yellow-900/20 border-yellow-800/50' : 'bg-yellow-50 border-yellow-200')}`}>
                        {result.failed === 0 ? (
                            <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={56} />
                        ) : (
                            <AlertTriangle className="mx-auto text-yellow-500 mb-3" size={56} />
                        )}
                        <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                            {result.failed === 0 ? '¡Importación completada!' : 'Importación completada con avisos'}
                        </div>
                        <div className="text-sm text-slate-500 mt-1">
                            {result.created + result.updated} contactos en la base de datos.
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className={`p-4 rounded-xl text-center ${subCard}`}>
                            <UserPlus className="mx-auto mb-1 text-emerald-600" size={22} />
                            <div className="text-2xl font-bold text-emerald-600">{result.created}</div>
                            <div className="text-xs text-slate-400 uppercase font-bold mt-1">Creados</div>
                        </div>
                        <div className={`p-4 rounded-xl text-center ${subCard}`}>
                            <UserCheck className="mx-auto mb-1 text-blue-600" size={22} />
                            <div className="text-2xl font-bold text-blue-600">{result.updated}</div>
                            <div className="text-xs text-slate-400 uppercase font-bold mt-1">Actualizados</div>
                        </div>
                        <div className={`p-4 rounded-xl text-center ${subCard}`}>
                            <Users className="mx-auto mb-1 text-slate-500" size={22} />
                            <div className="text-2xl font-bold text-slate-500">{result.skipped}</div>
                            <div className="text-xs text-slate-400 uppercase font-bold mt-1">Saltados (ya existían)</div>
                        </div>
                        <div className={`p-4 rounded-xl text-center ${subCard}`}>
                            <AlertTriangle className="mx-auto mb-1 text-red-500" size={22} />
                            <div className="text-2xl font-bold text-red-500">{result.failed}</div>
                            <div className="text-xs text-slate-400 uppercase font-bold mt-1">Errores</div>
                        </div>
                    </div>

                    {result.errors.length > 0 && (
                        <div className={`p-4 rounded-xl border ${isDark ? 'bg-red-900/10 border-red-800/40' : 'bg-red-50/50 border-red-200'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle size={16} className="text-red-500" />
                                    <span className={`text-sm font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>{result.errors.length} contactos no se pudieron procesar</span>
                                </div>
                                <button onClick={downloadErrors} className="text-xs font-bold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700">
                                    <Download size={12} /> Descargar errores
                                </button>
                            </div>
                            <div className="text-xs space-y-1 max-h-40 overflow-y-auto">
                                {result.errors.slice(0, 10).map((e, i) => (
                                    <div key={i} className={isDark ? 'text-red-300' : 'text-red-700'}>
                                        <strong>{e.name || '(sin nombre)'}</strong> [{e.phone}] — {e.reason}
                                    </div>
                                ))}
                                {result.errors.length > 10 && (
                                    <div className="text-xs text-slate-400 italic mt-2">y {result.errors.length - 10} más (descarga el CSV para verlos todos)</div>
                                )}
                            </div>
                        </div>
                    )}

                    <button onClick={reset} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg active:scale-95">
                        Importar otro archivo
                    </button>
                </div>
            )}
        </div>
    );
}
