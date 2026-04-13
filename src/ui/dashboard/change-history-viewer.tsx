import { VersionedData, getVersions, getLatestVersion, computeChecksum } from '../../monitoring/version-storage.js';

export { VersionedData } from '../../monitoring/version-storage.js';

export interface DiffEntry {
  version: number;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

export interface ChangeSummary {
  version: number;
  timestamp: Date;
  checksum: string;
  totalChanges: number;
  diffs: DiffEntry[];
}

/**
 * Compute diff between two data objects
 */
export function computeDiff(oldData: unknown, newData: unknown, basePath = ''): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  
  if (oldData === newData) return diffs;
  
  if (typeof oldData !== typeof newData) {
    return [{
      version: 0,
      field: basePath || '(root)',
      oldValue: oldData,
      newValue: newData,
      changeType: 'modified',
    }];
  }
  
  if (Array.isArray(oldData) && Array.isArray(newData)) {
    const maxLen = Math.max(oldData.length, newData.length);
    for (let i = 0; i < maxLen; i++) {
      const itemPath = basePath ? `${basePath}[${i}]` : `[${i}]`;
      if (i >= oldData.length) {
        diffs.push({ version: 0, field: itemPath, oldValue: undefined, newValue: newData[i], changeType: 'added' });
      } else if (i >= newData.length) {
        diffs.push({ version: 0, field: itemPath, oldValue: oldData[i], newValue: undefined, changeType: 'removed' });
      } else {
        diffs.push(...computeDiff(oldData[i], newData[i], itemPath));
      }
    }
    return diffs;
  }
  
  if (typeof oldData === 'object' && oldData !== null && typeof newData === 'object' && newData !== null) {
    const oldKeys = Object.keys(oldData as Record<string, unknown>);
    const newKeys = Object.keys(newData as Record<string, unknown>);
    const allKeys = new Set([...oldKeys, ...newKeys]);
    
    for (const key of allKeys) {
      const fieldPath = basePath ? `${basePath}.${key}` : key;
      const oldVal = (oldData as Record<string, unknown>)[key];
      const newVal = (newData as Record<string, unknown>)[key];
      
      if (!(key in (oldData as Record<string, unknown>))) {
        diffs.push({ version: 0, field: fieldPath, oldValue: undefined, newValue: newVal, changeType: 'added' });
      } else if (!(key in (newData as Record<string, unknown>))) {
        diffs.push({ version: 0, field: fieldPath, oldValue: oldVal, newValue: undefined, changeType: 'removed' });
      } else {
        diffs.push(...computeDiff(oldVal, newVal, fieldPath));
      }
    }
    return diffs;
  }
  
  if (oldData !== newData) {
    return [{
      version: 0,
      field: basePath || '(root)',
      oldValue: oldData,
      newValue: newData,
      changeType: 'modified',
    }];
  }
  
  return diffs;
}

/**
 * Get all changes between consecutive versions for a URL
 */
export function getVersionHistory(url: string, limit?: number): ChangeSummary[] {
  const versions = getVersions(url, limit);
  const history: ChangeSummary[] = [];
  
  for (let i = 1; i < versions.length; i++) {
    const prev = versions[i - 1];
    const curr = versions[i];
    const diffs = computeDiff(prev.data, curr.data);
    
    history.push({
      version: curr.version,
      timestamp: curr.timestamp,
      checksum: curr.checksum,
      totalChanges: diffs.length,
      diffs,
    });
  }
  
  if (versions.length === 1) {
    history.push({
      version: versions[0].version,
      timestamp: versions[0].timestamp,
      checksum: versions[0].checksum,
      totalChanges: 0,
      diffs: [],
    });
  }
  
  return history;
}

/**
 * Search versions by checksum or partial match on data
 */
export function searchVersions(url: string, query: string): VersionedData[] {
  const versions = getVersions(url);
  const lowerQuery = query.toLowerCase();
  
  return versions.filter((v: VersionedData) => {
    if (v.checksum.toLowerCase().includes(lowerQuery)) return true;
    
    const dataStr = JSON.stringify(v.data).toLowerCase();
    if (dataStr.includes(lowerQuery)) return true;
    
    return false;
  });
}

/**
 * Get a specific version by version number
 */
export function getVersionByNumber(url: string, version: number): VersionedData | null {
  const versions = getVersions(url);
  return versions.find((v: VersionedData) => v.version === version) ?? null;
}

/**
 * Compare two specific versions
 */
export function compareVersions(url: string, fromVersion: number, toVersion: number): ChangeSummary | null {
  const from = getVersionByNumber(url, fromVersion);
  const to = getVersionByNumber(url, toVersion);
  
  if (!from || !to) return null;
  
  const diffs = computeDiff(from.data, to.data);
  
  return {
    version: to.version,
    timestamp: to.timestamp,
    checksum: to.checksum,
    totalChanges: diffs.length,
    diffs,
  };
}

/**
 * Format a timestamp for display
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Get change type label with color indicator
 */
export function getChangeTypeLabel(type: DiffEntry['changeType']): { label: string; symbol: string } {
  switch (type) {
    case 'added':
      return { label: 'Added', symbol: '+' };
    case 'removed':
      return { label: 'Removed', symbol: '-' };
    case 'modified':
      return { label: 'Modified', symbol: '~' };
  }
}

/**
 * Export version data as JSON string
 */
export function exportVersion(version: VersionedData): string {
  return JSON.stringify({
    url: version.url,
    version: version.version,
    timestamp: version.timestamp.toISOString(),
    checksum: version.checksum,
    data: version.data,
  }, null, 2);
}

/**
 * Check if data has changed between versions
 */
export function hasChanges(url: string): boolean {
  const latest = getLatestVersion(url);
  if (!latest) return false;
  const versions = getVersions(url, 2);
  return versions.length > 1;
}
