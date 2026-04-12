export interface DeltaAlert {
  url: string;
  severity: 'high' | 'medium' | 'low';
  percentageChanged: number;
  changedFields: string[];
  timestamp: Date;
  previousVersion: number | null;
  currentVersion: number;
}

interface DiffResult {
  percentageChanged: number;
  changedFields: string[];
}

export function detectChanges(
  previous: unknown,
  current: unknown,
  url: string = ''
): DeltaAlert {
  const diff = deepDiff(previous, current);
  const percentageChanged = diff.percentageChanged;
  
  let severity: 'high' | 'medium' | 'low';
  if (percentageChanged > 50 || hasNonNullToModified(previous, current)) {
    severity = 'high';
  } else if (percentageChanged > 20) {
    severity = 'medium';
  } else {
    severity = 'low';
  }

  return {
    url,
    severity,
    percentageChanged,
    changedFields: diff.changedFields,
    timestamp: new Date(),
    previousVersion: null,
    currentVersion: 1,
  };
}

function deepDiff(previous: unknown, current: unknown): DiffResult {
  const changedFields: string[] = [];
  
  if (previous === null || current === null) {
    if (previous !== current) {
      return { percentageChanged: 100, changedFields: ['*'] };
    }
    return { percentageChanged: 0, changedFields: [] };
  }

  if (typeof previous !== typeof current) {
    return { percentageChanged: 100, changedFields: ['*'] };
  }

  if (typeof previous !== 'object') {
    if (previous !== current) {
      return { percentageChanged: 100, changedFields: ['*'] };
    }
    return { percentageChanged: 0, changedFields: [] };
  }

  if (Array.isArray(previous) && Array.isArray(current)) {
    return diffArrays(previous, current);
  }

  if (Array.isArray(previous) || Array.isArray(current)) {
    return { percentageChanged: 100, changedFields: ['*'] };
  }

  return diffObjects(previous as Record<string, unknown>, current as Record<string, unknown>);
}

function diffObjects(
  prev: Record<string, unknown>,
  curr: Record<string, unknown>
): DiffResult {
  const changedFields: string[] = [];
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  let changedCount = 0;

  for (const key of allKeys) {
    const prevValue = prev[key];
    const currValue = curr[key];

    if (isObject(prevValue) && isObject(currValue)) {
      const nestedDiff = deepDiff(prevValue, currValue);
      if (nestedDiff.percentageChanged > 0) {
        changedFields.push(...nestedDiff.changedFields.map(f => `${key}.${f}`));
        changedCount += nestedDiff.percentageChanged / 100 * Object.keys(prevValue).length;
      }
    } else if (!Object.is(prevValue, currValue)) {
      changedFields.push(key);
      changedCount++;
    }
  }

  const totalFields = allKeys.size;
  const percentageChanged = totalFields > 0 ? (changedCount / totalFields) * 100 : 0;

  return { percentageChanged, changedFields };
}

function diffArrays(prev: unknown[], curr: unknown[]): DiffResult {
  const maxLen = Math.max(prev.length, curr.length);
  let changedCount = 0;
  const changedFields: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const prevItem = prev[i];
    const currItem = curr[i];

    if (i >= prev.length || i >= curr.length) {
      changedFields.push(`[${i}]`);
      changedCount++;
    } else if (isObject(prevItem) && isObject(currItem)) {
      const nestedDiff = deepDiff(prevItem, currItem);
      if (nestedDiff.percentageChanged > 0) {
        changedFields.push(...nestedDiff.changedFields.map(f => `[${i}].${f}`));
        changedCount++;
      }
    } else if (!Object.is(prevItem, currItem)) {
      changedFields.push(`[${i}]`);
      changedCount++;
    }
  }

  const percentageChanged = maxLen > 0 ? (changedCount / maxLen) * 100 : 0;
  return { percentageChanged, changedFields };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNonNullToModified(previous: unknown, current: unknown): boolean {
  if (previous === null || current === null) return false;
  
  if (typeof previous === 'object' && typeof current === 'object') {
    if (Array.isArray(previous) || Array.isArray(current)) return false;
    
    const prevObj = previous as Record<string, unknown>;
    const currObj = current as Record<string, unknown>;
    
    for (const key of Object.keys(prevObj)) {
      if (prevObj[key] !== null && currObj[key] !== undefined && prevObj[key] !== currObj[key]) {
        return true;
      }
    }
  }
  
  return false;
}
