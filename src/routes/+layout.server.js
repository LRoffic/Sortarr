import { getCurrentVersion } from '$lib/updater.server.js';

export const load = async ({ locals }) => {
  return {
    user: locals.user ?? null,
    currentVersion: getCurrentVersion()
  };
};
