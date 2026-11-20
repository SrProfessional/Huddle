// Huddle: the repo's `.codex/config.toml` (Issue #215). OpenAI Codex reads it in a trusted project: it declares the Huddle marketplace and
// enables the plugin in that repo only, so a machine with Codex needs one `codex plugin marketplace upgrade huddle` (docs/design.md §25).

export const CODEX_FILE = '.codex/config.toml';
const SOURCE = 'https://github.com/SrProfessional/Huddle.git';
const MARKETPLACE = `[marketplaces.huddle]\nsource_type = "git"\nsource = "${SOURCE}"\n`;
const PLUGIN = '[plugins."huddle@huddle"]\nenabled = true\n';
export const CODEX_TABLES = `${MARKETPLACE}\n${PLUGIN}`;

/** { text } to write (the project's own text kept, the missing Huddle tables added once), or { reason } when it must be left alone. */
export function mergeCodexConfig(current) {
  const own = current ?? '';
  if (own.trim() === '') return { text: CODEX_TABLES };
  const hasMarket = /^\[marketplaces\.huddle\]\s*$/m.test(own);
  if (hasMarket && !own.includes('SrProfessional/Huddle')) return { reason: 'it names another source for the huddle marketplace' };
  const add = [hasMarket ? null : MARKETPLACE, /^\[plugins\."huddle@huddle"\]\s*$/m.test(own) ? null : PLUGIN].filter(Boolean);
  if (!add.length) return { text: own };
  return { text: `${own}${own.endsWith('\n') ? '' : '\n'}\n${add.join('\n')}` };
}
