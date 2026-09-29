import { useEffect, useState } from 'react';

// Móvil = por debajo del breakpoint `md` de Tailwind (768px), el mismo corte
// que usan las clases `md:` para cambiar entre el diseño de móvil y el de PC.
// Vale igual para la APK y para el navegador del móvil.
const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
    );
    useEffect(() => {
        const mql = window.matchMedia(MOBILE_QUERY);
        const onChange = () => setIsMobile(mql.matches);
        onChange();
        // Safari < 14 solo tiene addListener.
        if (mql.addEventListener) mql.addEventListener('change', onChange);
        else mql.addListener(onChange);
        return () => {
            if (mql.removeEventListener) mql.removeEventListener('change', onChange);
            else mql.removeListener(onChange);
        };
    }, []);
    return isMobile;
}
