const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

/** Parse duration strings like `15m`, `7d`, `1h30m`, `500ms`, `2.5s`. */
export function parseDuration(input: string): number {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('empty duration');
  }

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (!/^(\d+(?:\.\d+)?(ms|s|m|h|d))+$/.test(trimmed)) {
    throw new Error(`invalid duration: ${input}`);
  }

  const re = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/g;
  let total = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(trimmed)) !== null) {
    const value = Number(match[1]);
    const unit = match[2];
    switch (unit) {
      case 'ms':
        total += value;
        break;
      case 's':
        total += value * MS_PER_SECOND;
        break;
      case 'm':
        total += value * MS_PER_MINUTE;
        break;
      case 'h':
        total += value * MS_PER_HOUR;
        break;
      case 'd':
        total += value * MS_PER_DAY;
        break;
      default:
        throw new Error(`unknown duration unit: ${unit}`);
    }
  }

  return Math.round(total);
}

export function splitDuration(ms: number): DurationParts {
  const abs = Math.abs(Math.trunc(ms));
  const days = Math.floor(abs / MS_PER_DAY);
  const hours = Math.floor((abs % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((abs % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((abs % MS_PER_MINUTE) / MS_PER_SECOND);
  const milliseconds = abs % MS_PER_SECOND;
  return { days, hours, minutes, seconds, milliseconds };
}

/** Human-readable compact duration, e.g. `1h 5m`, `3.2s`, `250ms`. */
export function formatDuration(ms: number, options?: { precise?: boolean }): string {
  if (!Number.isFinite(ms)) {
    return 'invalid';
  }

  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms);

  if (abs < MS_PER_SECOND) {
    return `${sign}${Math.round(abs)}ms`;
  }

  if (abs < MS_PER_MINUTE) {
    const secs = abs / MS_PER_SECOND;
    return `${sign}${options?.precise ? secs.toFixed(1) : Math.round(secs)}s`;
  }

  const parts = splitDuration(abs);
  const chunks: string[] = [];

  if (parts.days) chunks.push(`${parts.days}d`);
  if (parts.hours) chunks.push(`${parts.hours}h`);
  if (parts.minutes) chunks.push(`${parts.minutes}m`);
  if (parts.seconds && chunks.length < 2) chunks.push(`${parts.seconds}s`);

  return `${sign}${chunks.join(' ') || '0s'}`;
}

/** Relative time from now, e.g. `5 minutes ago`, `in 2 hours`. */
export function formatRelativeTime(date: Date | number | string, now = Date.now()): string {
  const target = typeof date === 'number' ? date : new Date(date).getTime();
  const diff = target - now;
  const abs = Math.abs(diff);
  const past = diff < 0;

  const unit =
    abs < MS_PER_MINUTE
      ? { value: Math.round(abs / MS_PER_SECOND), name: 'second' }
      : abs < MS_PER_HOUR
        ? { value: Math.round(abs / MS_PER_MINUTE), name: 'minute' }
        : abs < MS_PER_DAY
          ? { value: Math.round(abs / MS_PER_HOUR), name: 'hour' }
          : { value: Math.round(abs / MS_PER_DAY), name: 'day' };

  const label = unit.value === 1 ? unit.name : `${unit.name}s`;
  return past ? `${unit.value} ${label} ago` : `in ${unit.value} ${label}`;
}
