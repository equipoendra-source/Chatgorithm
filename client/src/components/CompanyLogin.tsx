import { useState } from 'react';
import { Building2, Lock, LogIn, Loader2, AlertCircle } from 'lucide-react';

interface CompanyConfig {
    companyId: string;
    companyName: string;
    backendUrl: string;
}

interface CompanyLoginProps {
    onSuccess: (config: CompanyConfig) => void;
    authServerUrl: string;
}

export function CompanyLogin({ onSuccess, authServerUrl }: CompanyLoginProps) {
    const [companyId, setCompanyId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await fetch(`${authServerUrl}/api/company-auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyId: companyId.trim().toLowerCase(), password })
            });

            const data = await response.json();

            if (data.success) {
                // Guardar configuración permanentemente
                const config: CompanyConfig = {
                    companyId: data.companyId,
                    companyName: data.companyName,
                    backendUrl: data.backendUrl
                };
                localStorage.setItem('company_config', JSON.stringify(config));
                onSuccess(config);
            } else {
                setError(data.error || 'Error de autenticación');
            }
        } catch (err: any) {
            console.error('Company auth error:', err);
            setError('No se pudo conectar con el servidor');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full flex flex-col items-center justify-center font-sans relative z-10 p-4">

            {/* Logo and title */}
            <div className="mb-8 text-center relative">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/25 mx-auto mb-6 border border-white/10">
                    <Building2 className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Chatgorithm</h1>
                <p className="text-slate-400 font-medium">Introduce las credenciales de tu empresa</p>
            </div>

            {/* Login form */}
            <div className="w-full max-w-sm relative">
                <form onSubmit={handleSubmit} className="glass-panel p-8 rounded-2xl shadow-2xl space-y-6">

                    {/* Company ID field */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide ml-1 mb-2 block">
                            ID de Empresa
                        </label>
                        <div className="relative">
                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                            <input
                                type="text"
                                value={companyId}
                                onChange={(e) => setCompanyId(e.target.value)}
                                placeholder="ej: mi-empresa"
                                className="w-full pl-12 pr-4 py-3.5 glass-input font-medium"
                                autoComplete="off"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Password field */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide ml-1 mb-2 block">
                            Contraseña de Acceso
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-12 pr-4 py-3.5 glass-input font-medium tracking-wider"
                            />
                        </div>
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Submit button */}
                    <button
                        type="submit"
                        disabled={isLoading || !companyId.trim() || !password}
                        className="w-full glass-button font-bold py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Conectando...
                            </>
                        ) : (
                            <>
                                <LogIn className="w-5 h-5" />
                                Conectar
                            </>
                        )}
                    </button>
                </form>

                {/* Help text */}
                <p className="text-center text-slate-500 text-xs mt-6">
                    ¿No tienes credenciales? Contacta al administrador
                </p>
            </div>

            {/* Footer */}
            <div className="fixed bottom-6 text-xs text-slate-600 font-medium tracking-wide z-10">
                © 2026 Chatgorithm • Secure Enterprise System
            </div>
        </div>
    );
}
