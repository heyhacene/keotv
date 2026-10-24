export interface AppUpdateInfo {
  hasUpdate: boolean;
  currentBuild: number;
  latestBuild: number;
  latestVersionName: string;
  publishedAt?: string;
  releaseNotes?: string;
  downloadUrl: string;
  downloaderCode: string;
}

export const CURRENT_BUILD_NUMBER =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BUILD_NUMBER
    ? parseInt(process.env.NEXT_PUBLIC_BUILD_NUMBER, 10) || 52
    : 52;
export const DOWNLOADER_CODE = '4317787';
export const DIRECT_APK_URL = 'https://tinyurl.com/keo-apk';

/**
 * Checks GitHub Releases for a newer build of KeoTV.
 * Compares current build number with release tag or title.
 */
export async function checkForAppUpdate(currentBuild: number = CURRENT_BUILD_NUMBER): Promise<AppUpdateInfo> {
  try {
    const res = await fetch('https://api.github.com/repos/heyhacene/keotv/releases/latest', {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const tag = String(data.tag_name || '');
    const name = String(data.name || '');

    // Extract build number from tag (e.g. "v1.0.0-build.22") or name (e.g. "KeoTV v1.0.0 (Build 22)")
    const matchTag = tag.match(/build\.(\d+)/i);
    const matchName = name.match(/build\s*(\d+)/i);
    const extractedBuild = matchTag ? parseInt(matchTag[1], 10) : (matchName ? parseInt(matchName[1], 10) : 0);

    const hasUpdate = extractedBuild > currentBuild;

    return {
      hasUpdate,
      currentBuild,
      latestBuild: extractedBuild || currentBuild,
      latestVersionName: name || tag || `Build ${extractedBuild}`,
      publishedAt: data.published_at,
      releaseNotes: data.body || '',
      downloadUrl: DIRECT_APK_URL,
      downloaderCode: DOWNLOADER_CODE,
    };
  } catch {
    return {
      hasUpdate: false,
      currentBuild,
      latestBuild: currentBuild,
      latestVersionName: `Build ${currentBuild}`,
      downloadUrl: DIRECT_APK_URL,
      downloaderCode: DOWNLOADER_CODE,
    };
  }
}
