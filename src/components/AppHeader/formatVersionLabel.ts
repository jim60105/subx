export function formatVersionLabel(version: string, gitHash: string | null): string {
  return gitHash === null ? version : `${version} · ${gitHash}`;
}
