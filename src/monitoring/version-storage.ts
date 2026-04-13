import { createHash } from 'crypto';

export interface VersionedData {
  url: string;
  data: unknown;
  checksum: string;
  timestamp: Date;
  version: number;
}

export interface VersionEntry {
  data: unknown;
  checksum: string;
  timestamp: Date;
  version: number;
}

const MAX_VERSIONS_PER_URL = 100;
const versionHistory = new Map<string, VersionEntry[]>();

export function computeChecksum(data: unknown): string {
  const jsonString = JSON.stringify(data, Object.keys(data as object).sort());
  return createHash('sha256').update(jsonString, 'utf8').digest('hex');
}

export function saveVersion(url: string, data: unknown): VersionedData {
  const checksum = computeChecksum(data);
  const versions = versionHistory.get(url) ?? [];
  
  const existingIndex = versions.findIndex(v => v.checksum === checksum);
  if (existingIndex !== -1) {
    return {
      url,
      data,
      checksum,
      timestamp: versions[existingIndex].timestamp,
      version: versions[existingIndex].version,
    };
  }

  const version = versions.length + 1;
  const entry: VersionEntry = {
    data,
    checksum,
    timestamp: new Date(),
    version,
  };

  versions.push(entry);

  if (versions.length > MAX_VERSIONS_PER_URL) {
    versions.shift();
    for (let i = 0; i < versions.length; i++) {
      versions[i].version = i + 1;
    }
  }

  versionHistory.set(url, versions);

  return {
    url,
    data,
    checksum,
    timestamp: entry.timestamp,
    version: entry.version,
  };
}

export function getVersions(url: string, limit?: number): VersionedData[] {
  const versions = versionHistory.get(url) ?? [];
  const result = versions.map(v => ({
    url,
    data: v.data,
    checksum: v.checksum,
    timestamp: v.timestamp,
    version: v.version,
  }));
  
  if (limit !== undefined) {
    return result.slice(-limit);
  }
  return result;
}

export function getLatestVersion(url: string): VersionedData | null {
  const versions = versionHistory.get(url);
  if (!versions || versions.length === 0) return null;
  
  const latest = versions[versions.length - 1];
  return {
    url,
    data: latest.data,
    checksum: latest.checksum,
    timestamp: latest.timestamp,
    version: latest.version,
  };
}

export function clearVersions(url: string): boolean {
  return versionHistory.delete(url);
}
