import { useEffect, useState } from 'react';

/** `Date.now()` refrescado cada `intervaloMs`, para los "hace N s" y el estado de senal. */
export function useReloj(intervaloMs = 1000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => window.clearInterval(id);
  }, [intervaloMs]);
  return ahora;
}
