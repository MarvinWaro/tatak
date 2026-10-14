// localStorage can be missing or throw (private mode, blocked storage), so every access is guarded.

export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable; the card still works until the tab closes.
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const cardKey = (slug: string) => `tatak:card:${slug}`;
export const backupSeenKey = (slug: string) => `tatak:backup-seen:${slug}`;
