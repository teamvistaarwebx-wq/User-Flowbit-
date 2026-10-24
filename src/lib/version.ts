/** The release people see (Settings footer). Keep in step with package.json "version" (lib/version.test checks). */
export const APP_VERSION = '2.0.0'

/** "Flowbit 2.0": major.minor, the patch is only for us. */
export const APP_VERSION_LABEL = `Flowbit ${APP_VERSION.split('.').slice(0, 2).join('.')}`
