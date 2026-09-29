// Perfiles que gestionan pedidos de piezas: Recambios y Taller.
// OJO: el perfil "TALLER" tiene ROL "Admin" (no "Taller"), así que además del
// rol se comprueba el NOMBRE del perfil. Misma regla que el servidor
// (isPartsProfile) y que el botón de Pedidos de Piezas del Sidebar.
export function isPartsProfile(user?: { role?: string; username?: string } | null): boolean {
    const r = (user?.role || '').toLowerCase();
    const u = (user?.username || '').toLowerCase();
    return ['recambios', 'taller'].includes(r) || u.includes('recambios') || u.includes('taller');
}
