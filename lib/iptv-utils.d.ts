import { Channel } from '@/types/iptv';

export function isSeriesCategory(name: string): boolean;
export function isFilmCategory(name: string): boolean;
export function detectCategoryIcon(name: string): string;
export function isAdultCategoryName(name: string): boolean;
export function isSeparatorChannel(ch?: Channel | null): boolean;
export function cleanSeparatorName(name: string): string;
export function shouldExcludeChannelByPrefix(channelName: string, excludedPrefixes: string[]): boolean;
export function detectResolution(name: string): '4K' | 'FHD' | 'HD' | 'SD';
export function extractAttribute(line: string, attrName: string): string;
