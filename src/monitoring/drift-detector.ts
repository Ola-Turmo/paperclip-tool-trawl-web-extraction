import { getVersions } from './version-storage.js';
import { computeChecksum } from './version-storage.js';

export interface DriftPrediction {
  url: string;
  status: 'stable' | 'volatile' | 'drifting';
  confidence: number;
  trend: number[];
  lastAnalyzed: Date;
  versionCount: number;
}

export function analyzeDrift(url: string): DriftPrediction {
  const versions = getVersions(url);
  
  if (versions.length < 2) {
    return {
      url,
      status: versions.length === 1 ? 'drifting' : 'stable',
      confidence: 0,
      trend: [],
      lastAnalyzed: new Date(),
      versionCount: versions.length,
    };
  }

  const checksums = versions.map(v => v.checksum);
  const trend: number[] = [];
  
  for (let i = 1; i < checksums.length; i++) {
    const prevChecksum = checksums[i - 1];
    const currChecksum = checksums[i];
    
    if (prevChecksum === currChecksum) {
      trend.push(0);
    } else {
      const prevData = versions[i - 1].data;
      const currData = versions[i].data;
      const diff = computeDiffPercentage(prevData, currData);
      trend.push(diff);
    }
  }

  const recentVersions = versions.slice(-3);
  const recentChecksums = recentVersions.map(v => v.checksum);
  const allSameRecent = recentChecksums.every(c => c === recentChecksums[0]);

  if (allSameRecent && versions.length >= 3) {
    return {
      url,
      status: 'stable',
      confidence: Math.min(0.5 + (versions.length * 0.05), 0.95),
      trend,
      lastAnalyzed: new Date(),
      versionCount: versions.length,
    };
  }

  const avgChange = trend.length > 0
    ? trend.reduce((a, b) => a + b, 0) / trend.length
    : 0;

  if (avgChange > 30) {
    return {
      url,
      status: 'volatile',
      confidence: Math.min(0.5 + (avgChange / 100), 0.95),
      trend,
      lastAnalyzed: new Date(),
      versionCount: versions.length,
    };
  }

  if (avgChange > 10) {
    return {
      url,
      status: 'drifting',
      confidence: Math.min(0.5 + (avgChange / 100), 0.9),
      trend,
      lastAnalyzed: new Date(),
      versionCount: versions.length,
    };
  }

  return {
    url,
    status: 'stable',
    confidence: 0.7,
    trend,
    lastAnalyzed: new Date(),
    versionCount: versions.length,
  };
}

function computeDiffPercentage(prev: unknown, curr: unknown): number {
  if (prev === null || curr === null) {
    return prev === curr ? 0 : 100;
  }

  if (typeof prev !== typeof curr) {
    return 100;
  }

  if (typeof prev !== 'object') {
    return prev === curr ? 0 : 100;
  }

  if (Array.isArray(prev) && Array.isArray(curr)) {
    const maxLen = Math.max(prev.length, curr.length);
    if (maxLen === 0) return 0;
    
    let diffCount = 0;
    const maxCompare = Math.min(prev.length, curr.length);
    
    for (let i = 0; i < maxCompare; i++) {
      if (!Object.is(prev[i], curr[i])) {
        diffCount++;
      }
    }
    
    diffCount += Math.abs(prev.length - curr.length);
    return (diffCount / maxLen) * 100;
  }

  if (Array.isArray(prev) || Array.isArray(curr)) {
    return 100;
  }

  const prevObj = prev as Record<string, unknown>;
  const currObj = curr as Record<string, unknown>;
  
  const allKeys = new Set([...Object.keys(prevObj), ...Object.keys(currObj)]);
  if (allKeys.size === 0) return 0;
  
  let diffCount = 0;
  for (const key of allKeys) {
    if (!Object.is(prevObj[key], currObj[key])) {
      diffCount++;
    }
  }
  
  return (diffCount / allKeys.size) * 100;
}
