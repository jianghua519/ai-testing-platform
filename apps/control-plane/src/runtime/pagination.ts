import type { ControlPlanePage } from '../types.js';

export class PaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaginationError';
  }
}

export interface CursorPosition {
  primary: string;
  secondary: string;
}

export const encodeCursor = (position: CursorPosition): string =>
  Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');

export const decodeCursor = (cursor?: string): CursorPosition | undefined => {
  if (!cursor) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CursorPosition>;
    if (typeof parsed.primary !== 'string' || typeof parsed.secondary !== 'string') {
      throw new PaginationError('invalid cursor payload');
    }
    return {
      primary: parsed.primary,
      secondary: parsed.secondary,
    };
  } catch (error) {
    if (error instanceof PaginationError) {
      throw error;
    }
    throw new PaginationError('invalid cursor');
  }
};

export const parseLimit = (raw: string | null, fallback: number, max: number): number => {
  if (raw == null || raw === '') {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new PaginationError(`limit must be an integer between 1 and ${max}`);
  }
  return value;
};

const isAfterCursorDesc = (position: CursorPosition, cursor: CursorPosition): boolean =>
  position.primary < cursor.primary || (position.primary === cursor.primary && position.secondary < cursor.secondary);

export const paginateDescending = <T>(
  items: T[],
  limit: number,
  getPosition: (item: T) => CursorPosition,
  cursor?: string,
): ControlPlanePage<T> => {
  const cursorPosition = decodeCursor(cursor);
  const filteredItems = cursorPosition
    ? items.filter((item) => isAfterCursorDesc(getPosition(item), cursorPosition))
    : items;

  const window = filteredItems.slice(0, limit + 1);
  const visibleItems = window.slice(0, limit);
  const nextCursor = window.length > limit && visibleItems.length > 0
    ? encodeCursor(getPosition(visibleItems[visibleItems.length - 1]))
    : undefined;

  return {
    items: visibleItems,
    nextCursor,
  };
};
