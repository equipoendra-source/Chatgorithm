// Normalización de strings para búsquedas tolerantes a tildes / mayúsculas.
//
// Problema: por defecto JS `"Andrés".toLowerCase().includes("andres")` devuelve
// false porque la 'é' acentuada NO es la misma code-unit que 'e'. En español
// (y otros idiomas con diacríticos) los usuarios esperan que "andres"
// encuentre "Andrés", "jose" encuentre "José", etc.
//
// Esta función descompone los caracteres con `NFD` (Normalization Form
// Decomposed), separando la letra base de su marca diacrítica combinante,
// y elimina esas marcas con un regex sobre el rango Unicode ̀-ͯ
// (Combining Diacritical Marks). El resultado es minúsculas + sin tildes.
//
// Nota lingüística: la "ñ" se descompone en "n" + tilde combinante, así que
// "Niño" se normaliza a "nino". En la práctica los usuarios hispanos suelen
// teclear "nino" buscando "niño" — comportamiento esperado en buscadores.
//
// Para caracteres no latinos (cirílico, chino, árabe) `normalize('NFD')` no
// descompone marcas si no las tienen → el replace no cambia nada → la
// función se comporta como `.toLowerCase()` simple. No rompe nada.
export function normalizeForSearch(s: string | undefined | null): string {
    if (!s) return '';
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
