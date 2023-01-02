import type { StoredScript } from '../types';

export function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/[^\w-]+/g, '');
}

export function getScriptList() {
  const savedScripts = localStorage.getItem('savedScripts');
  if (!savedScripts) return [];
  return Object.values(JSON.parse(savedScripts)).reverse() as StoredScript[];
}

export function getScriptSavedInLocalStorage(
  title?: string,
): StoredScript | undefined {
  if (!title) return undefined;

  const scripts = localStorage.getItem('savedScripts');
  const s = scripts ? JSON.parse(scripts)[slug(title)] : null;

  return s
    ? {
        title: String(s.title),
        script: String(s.script),
        date: new Date(s.date),
      }
    : undefined;
}

export function saveScriptToLocalStorage(title: string, script: string) {
  if (!title) throw new Error('Title cannot be empty.');
  const scripts = localStorage.getItem('savedScripts');
  const newScript = {
    title,
    date: new Date(),
    script,
  };

  if (scripts) {
    const parsedScripts = JSON.parse(scripts);
    const newScripts = { ...parsedScripts, [slug(newScript.title)]: newScript };
    localStorage.setItem('savedScripts', JSON.stringify(newScripts));
  } else {
    localStorage.setItem(
      'savedScripts',
      JSON.stringify({ [slug(newScript.title)]: newScript }),
    );
  }
}

export function removeScriptFromLocalStorage(title: string) {
  const savedScripts = localStorage.getItem('savedScripts');
  if (!savedScripts) return;
  const filteredScripts = JSON.parse(savedScripts);
  delete filteredScripts[slug(title)];
  localStorage.setItem('savedScripts', JSON.stringify(filteredScripts));
}
