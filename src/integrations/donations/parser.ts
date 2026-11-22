import type { DonorMessage, OfferRow, PastedOffer } from '../../domain/donorTypes'
import { catalogFingerprint } from '../../domain/fingerprint'
import type {
  Catalog,
  DonationItem,
  Ingredient,
  PackageKind,
  Storage,
  Unit,
} from '../../domain/types'
import { validateStockLot } from '../../domain/validation'

export const PARSER_ID = 'local-offer-1.4'
const words: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
}
const countToken = '(?:\\d+|' + Object.keys(words).join('|') + ')'
const numberToken = '\\d+(?:[.,]\\d+)?'
const unitToken =
  '(?:kilograms?|kilogramy|kilogramu|kg|grams?|gramy|gramu|g|millilit(?:er|re)s?|ml|lit(?:er|re)s?|litry|litru|l|each|pieces?|units?|kusy|kusu|ks)'
const measured = new RegExp(
  '(?:(?<![\\w.,-])|(?<=\\d[x×]))(' + numberToken + ')\\s*(' + unitToken + ')\\b',
  'gi',
)
const packageCount = new RegExp(
  '\\b(' +
    countToken +
    ')\\s*(?:[x×]\\s*\\d|(?:sealed\\s+)?(?:pouches|packets|packs|packages|cartons|cans|tins|tubs|sachets|bags|baleni|sacku)\\b)',
  'i',
)
const countSize = new RegExp(
  '\\b(' + countToken + ')\\s+(?=' + numberToken + '\\s*' + unitToken + '\\b)',
  'i',
)
const qualifier =
  /\b(around|approximately|about|approx|few|several|between|asi|cca|nekolik|less than|more than|at least|up to)\b|\d\s*(?:[-–—]|to|az)\s*\d|(?:^|\s)[-−]\s*\d|\d\s*\/\s*\d/
const packageDoubt =
  /\b(not|no|without|never|unknown|unconfirmed|uncertain|unsure|maybe|perhaps|nejsou|neni|bez)\b/
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
const norm = (s: string) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const safeInt = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n > 0
const unitBase = (u: string): { unit: Unit; factor: number } =>
  /^(kg|kilogram)/.test(u)
    ? { unit: 'g', factor: 1000 }
    : /^(g|gram)/.test(u)
      ? { unit: 'g', factor: 1 }
      : /^(ml|millilit)/.test(u)
        ? { unit: 'ml', factor: 1 }
        : /^(l|lit)/.test(u)
          ? { unit: 'ml', factor: 1000 }
          : { unit: 'each', factor: 1 }
// A single separator before three digits can be a thousands mark or a decimal.
function canonicalQuantity(token: string, factor: number): number {
  if (/^[1-9]\d*[.,]\d{3}$/.test(token)) return NaN
  const [whole, fraction = ''] = token.split(/[.,]/)
  const places = factor === 1000 ? 3 : 0
  if (/[^0]/.test(fraction.slice(places))) return NaN
  return Number(whole) * factor + Number(fraction.slice(0, places).padEnd(places, '0'))
}
const verbDate =
  /\b(delivery|deliver(?:ed)?|arrival|dodani|dodavka|best[ -]before|minimalni trvanlivost|use[ -]by|spotrebujte do)\s*[:=]?\s*(\d{4}-\d{2}-\d{2})(?!\d)/gi
const baseAliases: Record<string, string[]> = {
  bread: ['chleb', 'chleba'],
  ready_chickpeas: ['ready-to-eat chickpeas', 'varena cizrna'],
  dry_pasta: ['dry pasta', 'pasta', 'suche testoviny', 'testoviny'],
  dry_rice: ['dry rice', 'sucha ryze'],
  oats: ['ovesne vlocky'],
  uht_milk: ['uht mleko'],
  sweetcorn: ['kukurice'],
  ready_beans: ['varene fazole'],
}
const stores = ['ambient', 'fridge', 'freezer'] as const
export const packageKinds: PackageKind[] = [
  'bulk',
  'pull_tab_can',
  'opener_can',
  'carton',
  'packet',
  'tub',
  'wrapped',
  'sealed',
]
export function dayOffset(value: string, weekStart: string): number | null {
  const iso = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return NaN
    const t = Date.parse(v + 'T00:00:00Z')
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? t : NaN
  }
  const d = (iso(value) - iso(weekStart)) / 86400000
  return Number.isInteger(d) ? d : null
}

function resolveIngredient(text: string, ingredients: Ingredient[]) {
  const hay = ' ' + norm(text) + ' '
  const hits = ingredients.flatMap((i) =>
    [i.name, i.id, ...(i.aliases ?? []), ...(baseAliases[i.id] ?? [])]
      .map(norm)
      .filter((alias) => alias && hay.includes(' ' + alias + ' '))
      .map((alias) => ({ i, alias })),
  )
  // A generic alias contained in a longer product name belongs to that name.
  const specific = hits.filter(
    (hit) =>
      !hits.some(
        (other) =>
          other.alias !== hit.alias && (' ' + other.alias + ' ').includes(' ' + hit.alias + ' '),
      ),
  )
  const ids = new Set(specific.map((h) => h.i.id))
  if (ids.size === 1 && !specific.every((h) => ['rice', 'ryze'].includes(h.alias)))
    return { id: specific[0].i.id, match: 'matched' as const, phrase: specific[0].alias }
  return {
    id: null,
    match: ids.size || /\b(rice|ryze)\b/.test(hay) ? ('ambiguous' as const) : ('unknown' as const),
    phrase: null,
  }
}

function chunks(text: string) {
  const out: { raw: string; start: number; line: number; continued: boolean }[] = []
  const split = new RegExp(
    '\\s*,?\\s+(?:and|a)\\s+(?=(?:' +
      countToken +
      '|a few|a couple|several|around|asi|nekolik)\\b)',
    'gi',
  )
  for (const line of text.matchAll(/[^\r\n]+/g)) {
    const lineNumber = text.slice(0, line.index).split(/\r\n|\r|\n/).length
    let start = 0
    const emit = (end: number) => {
      const part = line[0].slice(start, end),
        raw = part.trim()
      if (!raw) return
      if (out.length === 64) throw Error('Review at most 64 item groups per offer.')
      out.push({
        raw,
        start: line.index! + start + part.indexOf(raw),
        line: lineNumber,
        continued: start > 0,
      })
    }
    for (const cut of line[0].matchAll(split)) {
      // Keep both bounds of “between 10 and 15” in the same unresolved row.
      if (
        /\bbetween\s+\d+(?:[.,]\d+)?(?:\s+[^\s,]+)?$/i.test(line[0].slice(start, cut.index).trim())
      )
        continue
      emit(cut.index)
      start = cut.index! + cut[0].length
    }
    emit(line[0].length)
  }
  return out
}

export function parseOffer(
  message: DonorMessage,
  catalog: Catalog,
  weekStart: string,
  id: string,
): PastedOffer {
  if (!message.text.trim() || message.text.length > 16000)
    throw Error('Enter 1–16,000 characters of offer text.')
  if (dayOffset(weekStart, weekStart) !== 0 || new Date(weekStart + 'T00:00:00Z').getUTCDay() !== 1)
    throw Error('The model week must start on a valid ISO Monday.')
  if (!id.trim()) throw Error('A durable offer ID is required.')
  const parts = chunks(message.text)
  const rows: OfferRow[] = []
  for (const part of parts) {
    const { raw, start, line } = part,
      lower = fold(raw)
    const row: OfferRow = {
      id: 'row-' + (rows.length + 1),
      sourceText: raw,
      span: [start, start + raw.length],
      line,
      ingredientId: null,
      match: 'unknown',
      quantity: null,
      unit: null,
      packageCount: null,
      packageSize: null,
      basis: null,
      deliveryDate: null,
      expiryDate: null,
      expiryType: null,
      packageKind: null,
      storage: null,
      afterOpening: null,
      canRepack: null,
      requiresCanOpener: null,
      availableFromDay: null,
      usableThroughDay: null,
      excludedReason: null,
      evidence: {},
      edits: {},
    }
    function field<K extends keyof OfferRow>(key: K, value: OfferRow[K], source: string) {
      row[key] = value
      row.evidence[key] = source
    }
    const product = resolveIngredient(raw, catalog.ingredients)
    row.match = product.match
    if (product.id) {
      field('ingredientId', product.id, raw)
    } else if (
      part.continued &&
      product.match === 'unknown' &&
      rows.at(-1)?.ingredientId &&
      new RegExp(
        '^' +
          countToken +
          '\\s+(?:[x×]\\s*)?' +
          numberToken +
          '\\s*' +
          unitToken +
          '\\s+(?:packets?|packs?|pouches?|cartons?|cans?)\\s*[,.;]',
        'i',
      ).test(lower)
    ) {
      const prior = rows.at(-1)!
      field('ingredientId', prior.ingredientId, prior.evidence.ingredientId + ' / ' + raw)
      row.match = 'matched'
    }
    const matches = [...lower.matchAll(measured)]
    const writtenCount = lower.match(packageCount),
      directCount = lower.match(countSize),
      count = writtenCount ?? directCount
    // A definite pack count survives review even when its edible size and total are unknown.
    if (
      !matches.length &&
      writtenCount &&
      !qualifier.test(lower) &&
      !packageDoubt.test(lower) &&
      !/[.,]$/.test(lower.slice(0, writtenCount.index)) &&
      [...lower.matchAll(new RegExp(packageCount.source, 'gi'))].length === 1
    ) {
      const n = words[writtenCount[1]] ?? Number(writtenCount[1])
      if (safeInt(n))
        field(
          'packageCount',
          n,
          raw.slice(writtenCount.index!, writtenCount.index! + writtenCount[0].length),
        )
    }
    if (
      !qualifier.test(lower.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')) &&
      matches.length === 1 &&
      !/\b(gross|brutto)\b/.test(lower) &&
      !/\d+[.,]\d+\s*(?:[x×]|(?:sealed )?(?:packages|packets|pouches|cans|cartons|tubs|tins)\b)/.test(
        lower,
      )
    ) {
      const m = matches[0],
        base = unitBase(m[2]),
        amount = canonicalQuantity(m[1], base.factor)
      const n = count ? (words[count[1]] ?? Number(count[1])) : null
      if (safeInt(amount) && (n === null || safeInt(n))) {
        field('unit', base.unit, raw.slice(m.index!, m.index! + m[0].length))
        if (n === null) field('quantity', amount, raw)
        else {
          field('packageCount', n, raw.slice(count!.index!, count!.index! + count![0].length))
          const explicitTotal = /\b(total|combined|altogether|across all|celkem)\b/.test(lower)
          const perPackage =
            !!directCount ||
            !!writtenCount?.[0].match(/[x×]\s*\d$/) ||
            /\b(each|per (?:pouch|can|tin|packet|carton|pack|tub|bag)|kazd[ey])\b/.test(lower) ||
            new RegExp(
              '(?:pouches|packets|cartons|cans|tins|tubs|bags)\\s+of\\s+' +
                numberToken +
                '\\s*' +
                unitToken +
                '\\b',
            ).test(lower)
          if (explicitTotal) field('quantity', amount, raw)
          else if (perPackage && safeInt(n * amount)) {
            field('packageSize', amount, row.evidence.unit)
            field('quantity', n * amount, raw)
          }
        }
      }
    }
    const bases = [...lower.matchAll(/\b(drained|edible|net|scedene|jedle|netto)\b/g)]
    if (bases.length === 1 && !/\b(gross|brutto|unknown|unspecified)\b/.test(lower)) {
      const b = bases[0]
      field(
        'basis',
        /drained|scedene/.test(b[0]) ? 'drained' : /net/.test(b[0]) ? 'net' : 'edible',
        raw.slice(b.index!, b.index! + b[0].length),
      )
    }
    const kinds: { re: RegExp; k: PackageKind }[] = [
      { re: /\b(?:pull[ -]tab|ring[ -]pull) cans?\b/, k: 'pull_tab_can' },
      { re: /\bopener[ -]required cans?\b/, k: 'opener_can' },
      { re: /\b(?:sealed )?(?:pouch(?:es)?|packets?|sachets?|sacky|sacku)\b/, k: 'packet' },
      { re: /\bcartons?\b/, k: 'carton' },
      { re: /\btubs?\b/, k: 'tub' },
      { re: /\b(?:repackable bulk|bulk for repacking)\b/, k: 'bulk' },
    ]
    const seen = kinds.flatMap((k) => {
      const m = lower.match(k.re)
      return m ? [{ k: k.k, m }] : []
    })
    if (seen.length === 1 && !packageDoubt.test(lower)) {
      const { k, m } = seen[0],
        phrase = raw.slice(m.index!, m.index! + m[0].length)
      field('packageKind', k, phrase)
      field('canRepack', k === 'bulk', phrase)
      field('requiresCanOpener', k === 'opener_can', phrase)
    }
    const ds = [...lower.matchAll(verbDate)]
    const delivery = ds.filter((d) => /^(deliv|arrival|doda)/.test(d[1])),
      expiry = ds.filter((d) => !delivery.includes(d))
    if (delivery.length === 1)
      field(
        'deliveryDate',
        delivery[0][2],
        raw.slice(delivery[0].index!, delivery[0].index! + delivery[0][0].length),
      )
    if (expiry.length === 1) {
      const e = expiry[0],
        phrase = raw.slice(e.index!, e.index! + e[0].length)
      field('expiryType', /use|spotrebujte/.test(e[1]) ? 'use-by' : 'best-before', phrase)
      field('expiryDate', e[2], phrase)
    }
    // Storage is recognized only in explicitly labeled before/after-opening fields.
    for (const [key, label] of [
      ['storage', 'before opening'],
      ['afterOpening', 'after opening'],
    ] as const) {
      const clauses = [...lower.matchAll(new RegExp(label + '\\s*[:=]\\s*([^.,;]*)', 'g'))]
      if (clauses.length === 1) {
        const m = clauses[0],
          value = m[1].trim() as Storage
        if (stores.includes(value)) field(key, value, raw.slice(m.index!, m.index! + m[0].length))
      }
    }
    rows.push(row)
  }
  return {
    id,
    version: 1,
    parserId: PARSER_ID,
    catalogRevision: catalogFingerprint(catalog),
    weekStart,
    message: structuredClone(message),
    rows,
  }
}

export function rowIssues(row: OfferRow, catalog: Catalog, weekStart: string): string[] {
  if (row.excludedReason !== null)
    return typeof row.excludedReason === 'string' && row.excludedReason.trim()
      ? []
      : ['Give a reason for excluding this row.']
  const issues: string[] = []
  const product = catalog.ingredients.find((i) => i.id === row.ingredientId)
  if (!product || !['matched', 'operator'].includes(row.match))
    issues.push('Select the exact catalog product.')
  if (
    product &&
    (product.reviewStatus !== 'demo' ||
      product.declaration !== 'declared' ||
      !Array.isArray(product.allergens) ||
      !product.provenance?.trim())
  )
    issues.push('A reviewed product declaration is required.')
  if (!safeInt(row.quantity)) issues.push('Enter a positive whole quantity in the canonical unit.')
  if (!['g', 'ml', 'each'].includes(row.unit ?? '') || (product && product.unit !== row.unit))
    issues.push('The quantity unit must match the product’s canonical unit.')
  if (!['edible', 'drained', 'net'].includes(row.basis ?? ''))
    issues.push('Confirm the usable quantity basis from the label.')
  if (product && /drained/i.test(product.edibleBasis ?? '') && row.basis === 'net')
    issues.push(
      'Use edible or drained content for this product. Net weight alone cannot establish it.',
    )
  if (
    !row.packageKind ||
    !packageKinds.includes(row.packageKind) ||
    typeof row.canRepack !== 'boolean' ||
    typeof row.requiresCanOpener !== 'boolean'
  )
    issues.push('Confirm package type, repacking, and opening requirements.')
  if (
    row.canRepack === false &&
    (!safeInt(row.packageCount) ||
      !safeInt(row.packageSize) ||
      row.packageCount * row.packageSize !== row.quantity)
  )
    issues.push('Sealed package count × usable package size must equal the total quantity.')
  if (row.canRepack === true && (row.packageCount !== null || row.packageSize !== null))
    issues.push('Measured bulk does not use a separate sealed-package count or size.')
  if (
    !stores.includes(row.storage as (typeof stores)[number]) ||
    !stores.includes(row.afterOpening as (typeof stores)[number])
  )
    issues.push('Confirm storage before and after opening.')
  if (product && product.storage !== 'ambient' && row.storage && row.storage !== product.storage)
    issues.push('Storage conflicts with this catalog product’s cold-storage requirement.')
  const delivery = row.deliveryDate ? dayOffset(row.deliveryDate, weekStart) : null
  if (delivery === null) issues.push('Enter or confirm a valid ISO delivery date.')
  const expiry = row.expiryDate ? dayOffset(row.expiryDate, weekStart) : null
  if (
    (row.expiryDate ||
      row.expiryType ||
      /\b(best[ -]before|use[ -]by|minimalni trvanlivost|spotrebujte do)\b/.test(
        fold(row.sourceText),
      )) &&
    (expiry === null || !['best-before', 'use-by'].includes(row.expiryType ?? ''))
  )
    issues.push('Check the stated expiry date and label type together.')
  if (delivery !== null && expiry !== null && expiry < delivery)
    issues.push('The stated expiry precedes delivery.')
  const from = row.availableFromDay,
    to = row.usableThroughDay
  if (
    from === null ||
    to === null ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to > 6 ||
    from > to
  )
    issues.push('Explicitly confirm an ordered Monday–Sunday model window.')
  if (from !== null && delivery !== null && from < delivery)
    issues.push('The model window starts before delivery.')
  if (to !== null && expiry !== null && to > expiry)
    issues.push('Shorten the model window to the stated label date.')
  if (row.packageKind && row.canRepack !== null && row.requiresCanOpener !== null) {
    if (
      (row.packageKind === 'bulk') !== row.canRepack ||
      (row.packageKind !== 'sealed' && (row.packageKind === 'opener_can') !== row.requiresCanOpener)
    )
      issues.push('Package type and opening/repacking information disagree.')
  }
  return issues
}

export function offerItems(doc: PastedOffer, catalog: Catalog): DonationItem[] {
  if (
    !doc.id?.trim() ||
    !doc.parserId?.trim() ||
    !Number.isSafeInteger(doc.version) ||
    doc.version < 1 ||
    !doc.message?.text?.trim() ||
    !Array.isArray(doc.rows) ||
    !doc.rows.length ||
    doc.rows.length > 64 ||
    dayOffset(doc.weekStart, doc.weekStart) !== 0 ||
    new Date(doc.weekStart + 'T00:00:00Z').getUTCDay() !== 1
  )
    throw Error('Invalid offer identity, message, version, or model calendar.')
  if (doc.catalogRevision !== catalogFingerprint(catalog))
    throw Error('The product catalog changed. Parse and review the offer again.')
  const ids = new Set<string>(),
    items: DonationItem[] = [],
    productIds = new Set(catalog.ingredients.map((p) => p.id))
  for (const row of doc.rows) {
    if (!row.id?.trim() || ids.has(row.id)) throw Error('Offer row identifiers must be unique.')
    ids.add(row.id)
    if (
      !Array.isArray(row.span) ||
      row.span.length !== 2 ||
      !row.span.every(Number.isSafeInteger) ||
      row.span[0] < 0 ||
      row.span[1] <= row.span[0] ||
      row.span[1] > doc.message.text.length ||
      doc.message.text.slice(...row.span) !== row.sourceText ||
      !row.sourceText.trim() ||
      row.line !== doc.message.text.slice(0, row.span[0]).split(/\r\n|\r|\n/).length ||
      !row.edits ||
      !row.evidence
    )
      throw Error('Source provenance for ' + row.id + ' is incomplete.')
    const issues = rowIssues(row, catalog, doc.weekStart)
    if (issues.length) throw Error('Line ' + row.line + ': ' + issues.join(' '))
    if (row.excludedReason !== null) continue
    const lot: DonationItem['lot'] = {
      id: doc.id + '-' + row.id,
      ingredientId: row.ingredientId!,
      quantityBaseUnits: row.quantity!,
      packageSize: row.canRepack ? 1 : row.packageSize!,
      packageCount: row.packageCount,
      canRepack: row.canRepack!,
      requiresCanOpener: row.requiresCanOpener!,
      packageKind: row.packageKind!,
      availableFromDay: row.availableFromDay!,
      usableThroughDay: row.usableThroughDay!,
      storage: row.storage!,
      afterOpening: row.afterOpening!,
      received: false,
      sourceOfferId: doc.id,
      reviewStatus: 'demo',
      provenance: `${doc.message.kind === 'agentboxd' ? 'Agentboxd message ' + doc.message.externalId + ' · ' : ''}Donor offer ${doc.id} · ${row.id}, line ${row.line} · ${row.basis} content · delivery ${row.deliveryDate}${row.expiryDate ? ' · ' + row.expiryType + ' ' + row.expiryDate : ''}`,
    }
    const errors = validateStockLot(lot, productIds)
    if (errors.length) throw Error(errors.join(' '))
    items.push({ lot, unit: row.unit! })
  }
  if (!items.length) throw Error('At least one reviewed item must be included.')
  return items
}
