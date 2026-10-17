import "server-only";

// Cache tags hold internal ids and public handles only, never PII (they're stored in plain text).

export const creatorTag = (profileId: string) => `creator:${profileId}`;
/** Per-handle tag, so a cached "not found" for a handle is dropped when someone claims it. */
export const handleTag = (handleLower: string) => `handle:${handleLower}`;

export function profileChangeTags(change: { profileId: string; handles: string[] }): string[] {
  return [creatorTag(change.profileId), ...change.handles.map(handleTag)];
}
