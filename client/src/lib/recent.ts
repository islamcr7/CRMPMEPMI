import { useEffect, useState } from 'react';
import { useAuth } from './auth';

/** Fiches récemment consultées (mémorisées dans ce navigateur, par utilisateur). */
export interface RecentItem {
  kind: 'company' | 'contact' | 'deal' | 'document';
  id: string;
  title: string;
  sub?: string;
  to: string;
}

const MAX = 8;
const EVENT = 'crm:recent';
const key = (userId: string) => `crm-recent-${userId}`;

function read(userId: string): RecentItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function useRecent() {
  const { user } = useAuth();
  const [items, setItems] = useState<RecentItem[]>(() => (user ? read(user.id) : []));
  useEffect(() => {
    if (!user) return;
    const refresh = () => setItems(read(user.id));
    refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [user]);
  return items;
}

/** À appeler sur une page de fiche une fois les données chargées. */
export function useTrackRecent(item: RecentItem | null) {
  const { user } = useAuth();
  const sig = item ? `${item.kind}:${item.id}:${item.title}:${item.sub ?? ''}` : '';
  useEffect(() => {
    if (!user || !item) return;
    try {
      const list = [item, ...read(user.id).filter((i) => !(i.kind === item.kind && i.id === item.id))].slice(0, MAX);
      localStorage.setItem(key(user.id), JSON.stringify(list));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* stockage indisponible : on ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sig]);
}
