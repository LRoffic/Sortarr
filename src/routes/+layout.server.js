import { getCurrentVersionDetails } from '$lib/updater.server.js';

export const load = async ({ locals }) => {
  const versionDetails = getCurrentVersionDetails();
  return {
    user: locals.user ?? null,
    currentVersion: versionDetails.version,
    lastUpdatedAt: versionDetails.lastUpdatedAt
  };
};
