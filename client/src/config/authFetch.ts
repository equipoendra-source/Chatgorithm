// [P0 SEGURIDAD] Interceptor global de fetch.
//
// En lugar de tocar las ~90 llamadas fetch repartidas por la app, instalamos
// UN interceptor que añade automáticamente la cabecera `Authorization: Bearer
// <sessionToken>` SOLO a las peticiones que van a NUESTRA API (`${API_BASE_URL}/api/...`).
// Las descargas a Cloudinary / media / otros orígenes NO se tocan.
//
// El backend solo EXIGE ese token cuando ENFORCE_API_AUTH=true en Render. Por
// eso enviar el token de más mientras el flag está en false es inofensivo: el
// servidor lo ignora. Así desplegamos cliente y servidor sin ventana rota.
//
// Si el servidor responde 401 (token caducado/ inválido con el flag activado),
// limpiamos la sesión de agente y recargamos para volver al login.

import { API_BASE_URL } from './api';

const USER_KEY = 'chatgorithm_user';
const API_PREFIX = `${API_BASE_URL}/api`;
// El login de empresa NO debe disparar el auto-logout por 401 (su 401 significa
// "credenciales de empresa incorrectas", no "sesión de agente caducada").
const COMPANY_AUTH_PATH = `${API_BASE_URL}/api/company-auth`;

function getSessionToken(): string | null {
    try {
        const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
        if (!raw) return null;
        const u = JSON.parse(raw);
        return (u && typeof u.sessionToken === 'string' && u.sessionToken) ? u.sessionToken : null;
    } catch {
        return null;
    }
}

function urlOf(input: RequestInfo | URL): string {
    try {
        if (typeof input === 'string') return input;
        if (input instanceof URL) return input.href;
        // Request
        return (input as Request).url || '';
    } catch {
        return '';
    }
}

let installed = false;
let forcingLogin = false;

export function installAuthFetch(): void {
    if (installed) return;
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    installed = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = urlOf(input);
        const isOurApi = url.startsWith(API_PREFIX);

        // Inyectar el token solo en llamadas a nuestra API y solo si lo tenemos.
        if (isOurApi) {
            const token = getSessionToken();
            if (token) {
                const headers = new Headers(
                    (init && init.headers) ||
                    (input instanceof Request ? input.headers : undefined)
                );
                if (!headers.has('Authorization')) {
                    headers.set('Authorization', `Bearer ${token}`);
                }
                init = { ...(init || {}), headers };
            }
        }

        const response = await originalFetch(input as any, init);

        // Auto-logout si el backend rechaza la sesión (flag activado + token malo).
        // Excluimos el login de empresa (su 401 = credenciales, no sesión caducada)
        // y solo actuamos si llegamos a enviar un token.
        if (
            response.status === 401 &&
            isOurApi &&
            !url.startsWith(COMPANY_AUTH_PATH) &&
            getSessionToken() &&
            !forcingLogin
        ) {
            forcingLogin = true;
            console.warn('🔒 [auth] Sesión no válida (401). Volviendo al login…');
            try {
                localStorage.removeItem(USER_KEY);
                sessionStorage.removeItem(USER_KEY);
            } catch { /* ignore */ }
            // Recargar para que App vuelva a la pantalla de login.
            try { window.location.reload(); } catch { /* ignore */ }
        }

        return response;
    };
}
