import { JobStatus } from '../models/job.model';

export const STATUS_ORDER: JobStatus[] = [
  'NEW',
  'ASSIGNED',
  'TRANSCRIBED',
  'REVIEWED',
  'COMPLETED',
];

export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  const fromIndex = STATUS_ORDER.indexOf(from);
  const toIndex = STATUS_ORDER.indexOf(to);
  return toIndex === fromIndex + 1;
}

export function getNextStatus(current: JobStatus): JobStatus | null {
  const index = STATUS_ORDER.indexOf(current);
  return index >= 0 && index < STATUS_ORDER.length - 1
    ? STATUS_ORDER[index + 1]!
    : null;
}
