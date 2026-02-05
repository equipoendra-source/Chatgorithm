import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, CheckCircle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeSelectionModalProps {
    onComplete: () => void;
}

export const ThemeSelectionModal: React.FC<ThemeSelectionModalProps> = ({ onComplete }) => {
    const { theme, setTheme } = useTheme();
    const [activeSide, setActiveSide] = useState<'light' | 'dark' | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [selected, setSelected] = useState<'light' | 'dark' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const originalThemeRef = useRef<'light' | 'dark'>(theme);

    useEffect(() => {
        // Store original theme on mount
        originalThemeRef.current = theme;
        // Intro animation
        const timer = setTimeout(() => setIsVisible(true), 100);
        return () => clearTimeout(timer);
    }, []);

    // Live preview: change theme on hover
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (selected) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const midpoint = rect.width / 2;

        if (x < midpoint) {
            if (activeSide !== 'light') {
                setActiveSide('light');
                setTheme('light'); // Live preview!
            }
        } else {
            if (activeSide !== 'dark') {
                setActiveSide('dark');
                setTheme('dark'); // Live preview!
            }
        }
    };

    const handleMouseLeave = () => {
        if (!selected) {
            setActiveSide(null);
            // Restore original theme when mouse leaves
            setTheme(originalThemeRef.current);
        }
    };

    const handleSelect = (selectedTheme: 'light' | 'dark') => {
        setSelected(selectedTheme);
        setActiveSide(selectedTheme);
        setTheme(selectedTheme);
        // Update the original ref so it doesn't revert
        originalThemeRef.current = selectedTheme;
        // Add a small delay to show the selection effect before closing
        setTimeout(() => {
            setIsVisible(false);
            setTimeout(onComplete, 500); // Wait for exit animation
        }, 800);
    };

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={`fixed inset-0 z-[100] flex transition-opacity duration-700 ease-in-out font-sans ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
        >
            {/* SOLID OPAQUE BACKGROUND - Completely hides the app behind */}
            <div className="absolute inset-0 bg-slate-950 z-[-1]"></div>

            {/* LIGHT SIDE */}
            <div
                className={`relative h-full flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${selected === 'dark' ? 'w-0 min-w-0 opacity-0' :
                    selected === 'light' ? 'w-full' :
                        activeSide === 'dark' ? 'w-[35%] opacity-80' :
                            activeSide === 'light' ? 'w-[65%]' : 'w-1/2'
                    } bg-gradient-to-br from-amber-50 via-white to-sky-50`}
                onClick={() => handleSelect('light')}
            >
                {/* Background Decor */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                    <div className={`absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full transition-all duration-700 ${activeSide === 'light' ? 'bg-orange-300/50 blur-[120px] scale-110' : 'bg-orange-300/30 blur-[100px] scale-100'
                        }`}></div>
                    <div className={`absolute bottom-[-20%] right-[-20%] w-[70%] h-[70%] rounded-full transition-all duration-700 ${activeSide === 'light' ? 'bg-yellow-300/50 blur-[120px] scale-110' : 'bg-yellow-300/30 blur-[100px] scale-100'
                        }`}></div>
                    <div className={`absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[50%] h-[50%] rounded-full transition-all duration-700 ${activeSide === 'light' ? 'bg-blue-200/40 blur-[80px] scale-125' : 'bg-blue-200/20 blur-[60px] scale-100'
                        }`}></div>
                </div>

                {/* Animated Grid Pattern */}
                <div className={`absolute inset-0 opacity-[0.04] pointer-events-none transition-opacity duration-500 ${activeSide === 'light' ? 'opacity-[0.06]' : ''
                    }`} style={{
                        backgroundImage: 'linear-gradient(rgba(0,0,0,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.15) 1px, transparent 1px)',
                        backgroundSize: '50px 50px'
                    }}></div>

                <div className={`relative z-10 p-12 rounded-3xl transition-all duration-500 transform ${activeSide === 'light' ? 'scale-110 bg-white/70 backdrop-blur-xl shadow-2xl shadow-orange-500/40 border border-white/80' : 'scale-100'
                    } ${selected === 'light' ? 'scale-125' : ''}`}>
                    <div className="flex flex-col items-center gap-6">
                        <div className={`w-28 h-28 rounded-full bg-gradient-to-tr from-orange-400 via-amber-400 to-yellow-300 flex items-center justify-center shadow-2xl transition-all duration-700 ${activeSide === 'light' ? 'shadow-orange-400/60 rotate-[360deg] scale-110' : 'shadow-yellow-500/40 rotate-0'
                            }`}>
                            <Sun className={`w-14 h-14 text-white drop-shadow-lg transition-all duration-500 ${activeSide === 'light' ? 'scale-110' : ''
                                }`} fill="currentColor" strokeWidth={1.5} />
                        </div>
                        <div className="text-center">
                            <h2 className={`text-4xl font-black text-slate-800 mb-2 tracking-tight transition-all duration-300 ${activeSide === 'light' ? 'text-5xl' : ''
                                }`}>Modo Claro</h2>
                            <p className={`font-medium text-lg transition-all duration-300 ${activeSide === 'light' ? 'text-amber-700' : 'text-slate-600'
                                }`}>Limpio, nítido y profesional.</p>
                        </div>

                        {selected === 'light' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-3xl animate-in fade-in zoom-in duration-300">
                                <CheckCircle className="w-24 h-24 text-green-500 drop-shadow-xl animate-bounce" fill="white" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Floating particles for light mode */}
                <div className={`absolute inset-0 pointer-events-none overflow-hidden transition-opacity duration-500 ${activeSide === 'light' ? 'opacity-100' : 'opacity-0'}`}>
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="absolute w-2 h-2 rounded-full bg-yellow-400/70 animate-float" style={{
                            left: `${15 + i * 15}%`,
                            top: `${20 + (i % 3) * 25}%`,
                            animationDelay: `${i * 0.3}s`,
                            animationDuration: `${3 + i * 0.5}s`
                        }}></div>
                    ))}
                </div>
            </div>

            {/* Divider Line */}
            <div className={`absolute left-1/2 top-0 bottom-0 w-[2px] transform -translate-x-1/2 z-30 pointer-events-none transition-all duration-500 ${selected ? 'opacity-0' :
                activeSide ? 'opacity-0' : 'opacity-100'
                }`}>
                <div className="w-full h-full bg-gradient-to-b from-transparent via-purple-400/50 to-transparent"></div>
            </div>

            {/* DARK SIDE */}
            <div
                className={`relative h-full flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${selected === 'light' ? 'w-0 min-w-0 opacity-0' :
                    selected === 'dark' ? 'w-full' :
                        activeSide === 'light' ? 'w-[35%] opacity-80' :
                            activeSide === 'dark' ? 'w-[65%]' : 'w-1/2'
                    } bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black`}
                onClick={() => handleSelect('dark')}
            >
                {/* Background Decor */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                    <div className={`absolute top-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full transition-all duration-700 ${activeSide === 'dark' ? 'bg-indigo-500/40 blur-[150px] scale-110' : 'bg-indigo-600/20 blur-[120px] scale-100'
                        }`}></div>
                    <div className={`absolute bottom-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full transition-all duration-700 ${activeSide === 'dark' ? 'bg-purple-600/40 blur-[150px] scale-110' : 'bg-purple-600/20 blur-[120px] scale-100'
                        }`}></div>
                    <div className={`absolute top-[30%] left-[40%] w-[40%] h-[40%] rounded-full transition-all duration-700 ${activeSide === 'dark' ? 'bg-cyan-500/30 blur-[100px] scale-125' : 'bg-cyan-500/10 blur-[80px] scale-100'
                        }`}></div>
                </div>

                {/* Star pattern */}
                <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${activeSide === 'dark' ? 'opacity-100' : 'opacity-40'
                    }`}>
                    {[...Array(20)].map((_, i) => (
                        <div key={i} className="absolute w-1 h-1 rounded-full bg-white animate-twinkle" style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 3}s`,
                            opacity: 0.4 + Math.random() * 0.6
                        }}></div>
                    ))}
                </div>

                <div className={`relative z-10 p-12 rounded-3xl transition-all duration-500 transform ${activeSide === 'dark' ? 'scale-110 bg-slate-800/70 backdrop-blur-xl shadow-2xl shadow-indigo-500/50 border border-white/15' : 'scale-100'
                    } ${selected === 'dark' ? 'scale-125' : ''}`}>
                    <div className="flex flex-col items-center gap-6">
                        <div className={`w-28 h-28 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-2xl transition-all duration-700 ${activeSide === 'dark' ? 'shadow-purple-500/60 -rotate-12 scale-110' : 'shadow-indigo-500/40 rotate-0'
                            }`}>
                            <Moon className={`w-14 h-14 text-white drop-shadow-lg transition-all duration-500 ${activeSide === 'dark' ? 'scale-110' : ''
                                }`} fill="currentColor" strokeWidth={1.5} />
                        </div>
                        <div className="text-center">
                            <h2 className={`text-4xl font-black text-white mb-2 tracking-tight transition-all duration-300 ${activeSide === 'dark' ? 'text-5xl' : ''
                                }`}>Modo Oscuro</h2>
                            <p className={`font-medium text-lg transition-all duration-300 ${activeSide === 'dark' ? 'text-purple-300' : 'text-slate-400'
                                }`}>Elegante, moderno y cómodo.</p>
                        </div>

                        {selected === 'dark' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-3xl animate-in fade-in zoom-in duration-300">
                                <CheckCircle className="w-24 h-24 text-green-400 drop-shadow-xl animate-bounce" fill="#0f172a" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* CENTER LABEL - Much better visibility with solid background */}
            <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40 transition-all duration-500 ${selected || activeSide ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
                }`}>
                <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-[2px] rounded-full shadow-2xl shadow-purple-500/50">
                    <div className="bg-slate-900 backdrop-blur-xl text-white font-bold text-xl px-8 py-4 rounded-full uppercase tracking-widest">
                        <span className="bg-gradient-to-r from-amber-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">Elige tu estilo</span>
                    </div>
                </div>
            </div>

            {/* Hint arrows when hovering */}
            <div className={`absolute bottom-8 left-1/2 transform -translate-x-1/2 pointer-events-none z-40 transition-all duration-300 ${selected ? 'opacity-0' : activeSide ? 'opacity-100' : 'opacity-0'
                }`}>
                <p className={`text-sm font-semibold px-5 py-2.5 rounded-full backdrop-blur-xl border-2 shadow-lg transition-all duration-300 ${activeSide === 'light'
                    ? 'bg-white/90 text-slate-700 border-amber-400/60 shadow-amber-500/20'
                    : 'bg-slate-800/90 text-white border-purple-500/50 shadow-purple-500/20'
                    }`}>
                    Haz clic para seleccionar
                </p>
            </div>
        </div>
    );
};
