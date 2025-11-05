import fs from 'fs';
import path from 'path';

export interface PropertyDefinition {
  namespace: string;
  name: string;
}

export interface PropertyPreset {
  name: string;
  description?: string;
  properties: PropertyDefinition[];
  builtin?: boolean;
}

const BUILTIN_PRESETS: PropertyPreset[] = [
  {
    name: 'basic',
    description: 'Essential file properties',
    builtin: true,
    properties: [
      { namespace: 'DAV:', name: 'displayname' },
      { namespace: 'DAV:', name: 'getcontentlength' },
      { namespace: 'DAV:', name: 'getlastmodified' },
      { namespace: 'DAV:', name: 'resourcetype' },
      { namespace: 'DAV:', name: 'getcontenttype' }
    ]
  },
  {
    name: 'detailed',
    description: 'Detailed resource properties',
    builtin: true,
    properties: [
      { namespace: 'DAV:', name: 'displayname' },
      { namespace: 'DAV:', name: 'getcontentlength' },
      { namespace: 'DAV:', name: 'getlastmodified' },
      { namespace: 'DAV:', name: 'resourcetype' },
      { namespace: 'DAV:', name: 'getcontenttype' },
      { namespace: 'DAV:', name: 'creationdate' },
      { namespace: 'DAV:', name: 'getetag' },
      { namespace: 'DAV:', name: 'supportedlock' },
      { namespace: 'DAV:', name: 'lockdiscovery' }
    ]
  },
  {
    name: 'minimal',
    description: 'Minimal properties (resourcetype only)',
    builtin: true,
    properties: [
      { namespace: 'DAV:', name: 'resourcetype' }
    ]
  }
];

const MAX_PROPERTIES_PER_PRESET = 100;
const MAX_PRESETS_TOTAL = 200;
const PRESETS_DIR = process.env.DAV_PROPERTY_PRESETS_DIR || path.resolve(process.cwd(), 'property-presets');
const TTL_MS = Number(process.env.DAV_PROPERTY_PRESETS_TTL_MS || '5000');

interface CacheEntry {
  loadedAt: number;
  presets: PropertyPreset[];
  mtimes: Record<string, number>;
}

let cache: CacheEntry | null = null;

function isValidNamespace(ns: string): boolean {
  // Basic URI validation: must contain ':' and at least one '/'
  if (ns === 'DAV:') return true; // Special case DAV: pseudo-URI
  try {
    const url = new URL(ns);
    return !!url.protocol;
  } catch {
    return false;
  }
}

function sanitizeName(name: string): string {
  return name.trim();
}

function validatePreset(preset: any): PropertyPreset | null {
  if (!preset || typeof preset !== 'object') return null;
  const name = sanitizeName(preset.name);
  if (!name || !/^[-_a-zA-Z0-9]+$/.test(name)) return null;
  if (!Array.isArray(preset.properties)) return null;
  const properties: PropertyDefinition[] = [];
  for (const p of preset.properties) {
    if (!p || typeof p !== 'object') continue;
    const { namespace, name } = p as PropertyDefinition;
    if (!namespace || !name) continue;
    if (!isValidNamespace(namespace)) continue;
    if (!/^[-_a-zA-Z0-9:.]+$/.test(name)) continue; // allow common chars
    properties.push({ namespace, name });
  }
  if (properties.length === 0 || properties.length > MAX_PROPERTIES_PER_PRESET) return null;
  return {
    name,
    description: typeof preset.description === 'string' ? preset.description : undefined,
    properties,
    builtin: preset.builtin === true,
  };
}

function loadUserPresets(): PropertyPreset[] {
  if (!fs.existsSync(PRESETS_DIR)) {
    // Still cache built-ins so subsequent calls are fast
    cache = { loadedAt: Date.now(), presets: [...BUILTIN_PRESETS], mtimes: {} };
    return cache.presets;
  }
  const all: PropertyPreset[] = [];
  const mtimes: Record<string, number> = {};
  const files = fs.readdirSync(PRESETS_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const full = path.join(PRESETS_DIR, file);
    try {
      const stat = fs.statSync(full);
      mtimes[full] = stat.mtimeMs;
      const raw = fs.readFileSync(full, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const v = validatePreset(entry);
          if (v) all.push(v); else console.warn(`[presets] Invalid preset in ${file} skipped`);
        }
      } else {
        const v = validatePreset(parsed);
        if (v) all.push(v); else console.warn(`[presets] Invalid preset object in ${file} skipped`);
      }
    } catch (e) {
      console.warn(`[presets] Failed to load ${file}: ${(e as Error).message}`);
    }
  }
  if (all.length > MAX_PRESETS_TOTAL) {
    console.warn(`[presets] Too many presets loaded (${all.length}), truncating to ${MAX_PRESETS_TOTAL}`);
    return all.slice(0, MAX_PRESETS_TOTAL);
  }
  cache = { loadedAt: Date.now(), presets: [...BUILTIN_PRESETS, ...all], mtimes };
  return cache.presets;
}

function cacheValid(): boolean {
  if (!cache) return false;
  if (Date.now() - cache.loadedAt > TTL_MS) return false;
  // Check mtime changes
  for (const [file, mtime] of Object.entries(cache.mtimes)) {
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs !== mtime) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function getAllPresets(): PropertyPreset[] {
  if (cacheValid()) return cache!.presets;
  return loadUserPresets();
}

export function getPreset(name: string): PropertyPreset | undefined {
  return getAllPresets().find(p => p.name === name);
}

/**
 * Escapes special XML characters in attribute values to prevent XML injection.
 * @param value The string value to escape
 * @returns The escaped string safe for use in XML attributes
 */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generatePropfindXml(properties: PropertyDefinition[]): string {
  // Collect unique namespaces -> prefix mapping
  const namespaces = Array.from(new Set(properties.map(p => p.namespace)));
  const prefixMap: Record<string, string> = {};
  let counter = 0;
  for (const ns of namespaces) {
    if (ns === 'DAV:') {
      prefixMap[ns] = 'D';
      continue;
    }
    prefixMap[ns] = `N${counter++}`;
  }
  // Build XML
  const xmlnsDecl = Object.entries(prefixMap)
    .map(([ns, prefix]) => `xmlns:${prefix}="${escapeXmlAttribute(ns)}"`)
    .join(' ');
  const propLines = properties.map(p => `<${prefixMap[p.namespace]}:${p.name}/>`) // names validated
    .join('\n    ');
  return `<?xml version="1.0" encoding="utf-8"?>\n<D:propfind ${xmlnsDecl}>\n  <D:prop>\n    ${propLines}\n  </D:prop>\n</D:propfind>`;
}

export function mergeProperties(base: PropertyDefinition[], extra?: PropertyDefinition[]): PropertyDefinition[] {
  const all = [...base, ...(extra || [])];
  const seen = new Set<string>();
  const dedup: PropertyDefinition[] = [];
  for (const p of all) {
    const key = `${p.namespace}::${p.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(p);
    }
  }
  return dedup;
}