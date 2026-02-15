let counter = 0;
export function generateId(prefix = 'el'): string {
  return `${prefix}-${Date.now()}-${++counter}`;
}
