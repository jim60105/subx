/**
 * Sample values the home list's specimens show. They are file names,
 * extensions, and timecodes — data, not prose — so they are constants rather
 * than locale strings. The translate specimen is prose and lives in the locale
 * files instead.
 */
export const SPECIMENS = {
  match: { video: "S01E03.mkv", subtitle: "[Sub] 03.ass" },
  convert: { from: ".srt", to: [".ass", ".vtt", ".sub"] },
  sync: { before: "00:01:12,400", after: "00:01:13,150" },
} as const;

/** Every literal a specimen renders; feeds the hard-coded-string allowlist. */
export const SPECIMEN_TEXTS: readonly string[] = [
  SPECIMENS.match.video,
  SPECIMENS.match.subtitle,
  SPECIMENS.convert.from,
  ...SPECIMENS.convert.to,
  SPECIMENS.sync.before,
  SPECIMENS.sync.after,
];
