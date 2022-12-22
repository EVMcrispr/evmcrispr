import type { type Script } from '../components/library-scripts';

export function getScriptSavedInLocalStorage(hashId?: string) {
  if (!hashId) return false;

  const scripts = localStorage.getItem('savedScripts');
  const findScript = scripts
    ? JSON.parse(scripts).find((s: Script) => s.hashId === hashId)
    : null;

  return findScript;
}
