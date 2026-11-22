import type { UserRef } from '../types';
import { Avatar } from './ui';

/** Responsable d'une fiche : avatar + nom (ou tiret). */
export function Owner({ owner, compact = false }: { owner?: UserRef | null; compact?: boolean }) {
  if (!owner) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={owner.name}>
      <Avatar name={owner.name} size={compact ? 'xs' : 'sm'} />
      <span className="truncate">{compact ? owner.name.split(' ')[0] : owner.name}</span>
    </span>
  );
}
