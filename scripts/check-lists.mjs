// Guard for the owner's lists (CLAUDE.md, "Feature backlog, built list and ideas").
// Fails when an ID is planned and built at once, an ID repeats, an ID lacks this repo's prefix (the "Item IDs are XX-1"
// line in FEATURE_BACKLOG.md), or package.json's version has no BUILT.md entry
// (skipped where BUILT.md says "No version numbers here").
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function checkLists(dir = '.') {
  const read = (file) => (existsSync(`${dir}/${file}`) ? readFileSync(`${dir}/${file}`, 'utf8') : '')
  const ids = (text, re) => [...text.matchAll(re)].map((m) => m[1])
  const built = read('BUILT.md')
  const backlog = read('FEATURE_BACKLOG.md')
  const prefix = backlog.match(/Item IDs are ([A-Z]{2})-1\b/)?.[1]
  const planned = ids(backlog, /^###\s+([A-Z]{2}-\d+[a-z]?)\b/gm)
  const shipped = ids(built, /^-\s+([A-Z]{2}-\d+[a-z]?)\b/gm)
  const ideas = ids(read('IDEAS.md'), /^-\s+(I-\d+)\b/gm)
  const errors = []
  if (backlog && !prefix) errors.push('FEATURE_BACKLOG.md has no "Item IDs are XX-1" line naming this repo\'s prefix')
  for (const id of [...planned, ...shipped])
    if (prefix && !id.startsWith(`${prefix}-`)) errors.push(`${id} does not use this repo's prefix ${prefix}-`)
  for (const [file, list] of [['FEATURE_BACKLOG.md', planned], ['BUILT.md', shipped], ['IDEAS.md', ideas]])
    for (const id of new Set(list.filter((x, i) => list.indexOf(x) !== i))) errors.push(`${id} appears twice in ${file}`)
  for (const id of planned)
    if (shipped.includes(id)) errors.push(`${id} is in both FEATURE_BACKLOG.md and BUILT.md: cut it from the backlog`)
  const version = JSON.parse(read('package.json') || '{}').version
  if (version && version !== '0.0.0' && !built.includes('No version numbers here') && !new RegExp(`(?<![\\d.])${version.replace(/\./g, '\\.')}(?!\\d)`).test(built))
    errors.push(`package.json is ${version} but BUILT.md has no entry for it: add "## <date> — v${version}" with what shipped`)
  return errors
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errors = checkLists()
  if (errors.length) {
    console.error(`check-lists failed (rules: CLAUDE.md, "Feature backlog, built list and ideas"):\n- ${errors.join('\n- ')}`)
    process.exit(1)
  }
  console.log('check-lists: ok')
}
