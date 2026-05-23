// Helper compartido para asignar un color consistente a cada cuenta
// (línea de WhatsApp / PhoneId). El color se deriva por hash determinista
// del id, así el mismo número tiene siempre el mismo color en toda la app:
// Sidebar, ChatWindow, AppointmentToast, AnalyticsDashboard, etc.
//
// Si en el futuro hay >12 cuentas (paleta cíclica), los colores se reutilizan.
// La paleta está pensada para tener buen contraste tanto en tema claro como
// oscuro y ser distinguible para daltónicos en la mayoría de casos.

export interface AccountInfo {
    id: string;
    name: string;
}

// Paleta de 12 colores Tailwind con buena legibilidad en ambos temas.
const PALETTE: { name: string, hex: string, bg: string, bgDark: string, text: string, textDark: string, border: string, borderDark: string }[] = [
    { name: 'indigo',  hex: '#6366f1', bg: 'bg-indigo-100',  bgDark: 'bg-indigo-900/40',  text: 'text-indigo-700',  textDark: 'text-indigo-300',  border: 'border-indigo-300',  borderDark: 'border-indigo-700' },
    { name: 'emerald', hex: '#10b981', bg: 'bg-emerald-100', bgDark: 'bg-emerald-900/40', text: 'text-emerald-700', textDark: 'text-emerald-300', border: 'border-emerald-300', borderDark: 'border-emerald-700' },
    { name: 'amber',   hex: '#f59e0b', bg: 'bg-amber-100',   bgDark: 'bg-amber-900/40',   text: 'text-amber-700',   textDark: 'text-amber-300',   border: 'border-amber-300',   borderDark: 'border-amber-700' },
    { name: 'rose',    hex: '#f43f5e', bg: 'bg-rose-100',    bgDark: 'bg-rose-900/40',    text: 'text-rose-700',    textDark: 'text-rose-300',    border: 'border-rose-300',    borderDark: 'border-rose-700' },
    { name: 'sky',     hex: '#0ea5e9', bg: 'bg-sky-100',     bgDark: 'bg-sky-900/40',     text: 'text-sky-700',     textDark: 'text-sky-300',     border: 'border-sky-300',     borderDark: 'border-sky-700' },
    { name: 'fuchsia', hex: '#d946ef', bg: 'bg-fuchsia-100', bgDark: 'bg-fuchsia-900/40', text: 'text-fuchsia-700', textDark: 'text-fuchsia-300', border: 'border-fuchsia-300', borderDark: 'border-fuchsia-700' },
    { name: 'teal',    hex: '#14b8a6', bg: 'bg-teal-100',    bgDark: 'bg-teal-900/40',    text: 'text-teal-700',    textDark: 'text-teal-300',    border: 'border-teal-300',    borderDark: 'border-teal-700' },
    { name: 'orange',  hex: '#f97316', bg: 'bg-orange-100',  bgDark: 'bg-orange-900/40',  text: 'text-orange-700',  textDark: 'text-orange-300',  border: 'border-orange-300',  borderDark: 'border-orange-700' },
    { name: 'violet',  hex: '#8b5cf6', bg: 'bg-violet-100',  bgDark: 'bg-violet-900/40',  text: 'text-violet-700',  textDark: 'text-violet-300',  border: 'border-violet-300',  borderDark: 'border-violet-700' },
    { name: 'lime',    hex: '#84cc16', bg: 'bg-lime-100',    bgDark: 'bg-lime-900/40',    text: 'text-lime-700',    textDark: 'text-lime-300',    border: 'border-lime-300',    borderDark: 'border-lime-700' },
    { name: 'cyan',    hex: '#06b6d4', bg: 'bg-cyan-100',    bgDark: 'bg-cyan-900/40',    text: 'text-cyan-700',    textDark: 'text-cyan-300',    border: 'border-cyan-300',    borderDark: 'border-cyan-700' },
    { name: 'pink',    hex: '#ec4899', bg: 'bg-pink-100',    bgDark: 'bg-pink-900/40',    text: 'text-pink-700',    textDark: 'text-pink-300',    border: 'border-pink-300',    borderDark: 'border-pink-700' }
];

// Hash determinista simple: suma de char codes módulo paleta. Estable entre
// sesiones para un mismo id.
function hashId(id: string): number {
    if (!id) return 0;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) >>> 0;
    return h;
}

// Devuelve el objeto entero (hex + clases Tailwind) por si el componente
// necesita varios colores derivados.
export function colorForAccount(id: string | null | undefined) {
    if (!id) return PALETTE[0]; // fallback consistente
    return PALETTE[hashId(id) % PALETTE.length];
}

// Atajo cuando solo se necesita el HEX (gráficas, border-left con style).
export function hexForAccount(id: string | null | undefined): string {
    return colorForAccount(id).hex;
}

// Atajo para conseguir el nombre amistoso. Recibe el array de accounts del
// estado del Sidebar/App y devuelve el name correspondiente o un fallback
// con los últimos 4 dígitos del id.
export function nameForAccount(id: string | null | undefined, accounts: AccountInfo[] | null | undefined): string {
    if (!id) return '';
    const found = (accounts || []).find(a => a.id === id);
    if (found) return found.name;
    return `Línea ${id.slice(-4)}`;
}
