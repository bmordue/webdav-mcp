#!/usr/bin/env node
import { getAllPresets, getPreset, generatePropfindXml, mergeProperties, clearCache } from '../presets/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const PRESETS_DIR = path.join(PROJECT_ROOT, 'property-presets');

function assert(condition: any, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function testBuiltinPresets() {
  const presets = await getAllPresets();
// Helper to clean up test presets directory
function cleanupPresetsDir() {
  if (fs.existsSync(PRESETS_DIR)) {
    fs.rmSync(PRESETS_DIR, { recursive: true, force: true });
  }
}

// Helper to create preset directory
function ensurePresetsDir() {
  if (!fs.existsSync(PRESETS_DIR)) {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
  }
}

// Helper to wait for cache TTL
function waitForCacheTTL() {
  const waitMs = 5100; // Default TTL is 5000ms
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    // busy wait
  }
}

// Helper to trigger cache invalidation via mtime change
function triggerCacheInvalidation(filePath: string, content: any) {
  const waitMs = 10;
  const start = Date.now();
  while (Date.now() - start < waitMs) {}
  fs.writeFileSync(filePath, JSON.stringify(content));
}

function testBuiltinPresets() {
  const presets = getAllPresets();
  const names = presets.map(p => p.name);
  assert(names.includes('basic'), 'basic preset missing');
  assert(names.includes('detailed'), 'detailed preset missing');
  assert(names.includes('minimal'), 'minimal preset missing');
}

async function testGenerateXml() {
  const preset = await getPreset('basic');
  assert(preset, 'basic preset not found');
  const xml = generatePropfindXml(preset!.properties);
  assert(xml.includes('<D:displayname/>'), 'XML missing displayname');
  assert(xml.startsWith('<?xml'), 'XML should start with declaration');
}

async function testMergeProperties() {
  const preset = await getPreset('minimal');
  assert(preset, 'minimal preset not found');
  const merged = mergeProperties(preset!.properties, [{ namespace: 'DAV:', name: 'getcontentlength' }]);
  assert(merged.length === 2, 'Merge should add property');
  // Add duplicate
  const merged2 = mergeProperties(merged, [{ namespace: 'DAV:', name: 'getcontentlength' }]);
  assert(merged2.length === 2, 'Duplicate should be deduped');
}


function testXmlEscaping() {
  // Test that special XML characters in namespace URIs are properly escaped
  const properties = [
    { namespace: 'http://example.com/ns?foo=bar&baz=qux', name: 'test1' },
    { namespace: 'http://test.com/ns<script>', name: 'test2' },
    { namespace: 'DAV:', name: 'displayname' }
  ];
  const xml = generatePropfindXml(properties);
  // Verify ampersands are escaped
  assert(xml.includes('&amp;'), 'Ampersands should be escaped');
  assert(!xml.includes('foo=bar&baz'), 'Unescaped ampersands should not be present');
  // Verify angle brackets are escaped
  assert(xml.includes('&lt;'), 'Less-than signs should be escaped');
  assert(xml.includes('&gt;'), 'Greater-than signs should be escaped');
  assert(!xml.includes('<script>'), 'Unescaped script tags should not be present');
}


function testUserPresetOverride() {
  // Set up a temporary presets directory
  const tempDir = path.join(os.tmpdir(), 'test-presets-override');
  const oldEnv = process.env.DAV_PROPERTY_PRESETS_DIR;
  const oldTTL = process.env.DAV_PROPERTY_PRESETS_TTL_MS;
  
  try {
    // Create test directory and a custom "basic" preset that overrides the built-in
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    
    const customBasic = {
      name: 'basic',
      description: 'Custom basic preset',
      properties: [
        { namespace: 'DAV:', name: 'custom-prop' }
      ]
    };
    
    fs.writeFileSync(
      path.join(tempDir, 'custom.json'),
      JSON.stringify(customBasic, null, 2)
    );
    
    // Set environment to use our test directory
    process.env.DAV_PROPERTY_PRESETS_DIR = tempDir;
    process.env.DAV_PROPERTY_PRESETS_TTL_MS = '0'; // Disable cache TTL to force immediate reload
    
    // Clear the cache to force reload with new environment
    clearCache();
    
    const presets = getAllPresets();
    const basic = getPreset('basic');
    
    assert(basic, 'basic preset should exist');
    assert(basic!.description === 'Custom basic preset', 'User preset should override built-in description');
    assert(basic!.properties.length === 1, 'User preset should have custom properties');
    assert(basic!.properties[0]?.name === 'custom-prop', 'User preset should have custom-prop');
  } finally {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    // Restore environment
    if (oldEnv) {
      process.env.DAV_PROPERTY_PRESETS_DIR = oldEnv;
    } else {
      delete process.env.DAV_PROPERTY_PRESETS_DIR;
    }
    if (oldTTL) {
      process.env.DAV_PROPERTY_PRESETS_TTL_MS = oldTTL;
    } else {
      delete process.env.DAV_PROPERTY_PRESETS_TTL_MS;
    }

 function testGenerateXmlMultipleNamespaces() {
  const properties = [
    { namespace: 'DAV:', name: 'displayname' },
    { namespace: 'http://example.com/ns1', name: 'customprop1' },
    { namespace: 'http://example.com/ns2', name: 'customprop2' },
    { namespace: 'http://example.com/ns1', name: 'customprop3' }
  ];
  const xml = generatePropfindXml(properties);
  
  // Check that all namespaces are declared
  assert(xml.includes('xmlns:D="DAV:"'), 'Missing DAV: namespace declaration');
  assert(xml.includes('xmlns:N0="http://example.com/ns1"'), 'Missing ns1 namespace declaration');
  assert(xml.includes('xmlns:N1="http://example.com/ns2"'), 'Missing ns2 namespace declaration');
  
  // Check that all properties are present with correct prefixes
  assert(xml.includes('<D:displayname/>'), 'Missing DAV: property');
  assert(xml.includes('<N0:customprop1/>'), 'Missing ns1 property 1');
  assert(xml.includes('<N1:customprop2/>'), 'Missing ns2 property');
  assert(xml.includes('<N0:customprop3/>'), 'Missing ns1 property 2');
}

function testFileLoadingValidJSON() {
  cleanupPresetsDir();
  ensurePresetsDir();
  
  try {
    // Create a valid preset file with array
    const preset1 = {
      name: 'custom1',
      description: 'Custom preset 1',
      properties: [
        { namespace: 'DAV:', name: 'displayname' },
        { namespace: 'DAV:', name: 'getcontentlength' }
      ]
    };
    const file1 = path.join(PRESETS_DIR, 'custom1.json');
    fs.writeFileSync(file1, JSON.stringify([preset1]));
    
    // Create a valid preset file with single object
    const preset2 = {
      name: 'custom2',
      properties: [
        { namespace: 'DAV:', name: 'resourcetype' }
      ]
    };
    fs.writeFileSync(path.join(PRESETS_DIR, 'custom2.json'), JSON.stringify(preset2));
    
    // Trigger cache reload
    triggerCacheInvalidation(file1, [preset1]);
    
    const presets = getAllPresets();
    const names = presets.map(p => p.name);
    
    assert(names.includes('custom1'), 'custom1 preset not loaded');
    assert(names.includes('custom2'), 'custom2 preset not loaded');
    
    const c1 = getPreset('custom1');
    assert(c1 && c1.description === 'Custom preset 1', 'custom1 description mismatch');
    assert(c1 && c1.properties.length === 2, 'custom1 should have 2 properties');
  } finally {
    cleanupPresetsDir();
  }
}

// New test: File loading with malformed JSON
function testFileLoadingMalformedJSON() {
  cleanupPresetsDir();
  ensurePresetsDir();
  
  try {
    // Create malformed JSON file
    fs.writeFileSync(path.join(PRESETS_DIR, 'malformed.json'), '{ invalid json }');
    
    // Create valid preset
    const validPreset = {
      name: 'validone',
      properties: [{ namespace: 'DAV:', name: 'displayname' }]
    };
    const validFile = path.join(PRESETS_DIR, 'valid.json');
    fs.writeFileSync(validFile, JSON.stringify(validPreset));
    
    // Trigger cache reload
    triggerCacheInvalidation(validFile, validPreset);
    
    // Should not throw, malformed file should be skipped
    const presets = getAllPresets();
    const names = presets.map(p => p.name);
    
    // Valid preset should still be loaded
    assert(names.includes('validone'), 'Valid preset should be loaded despite malformed file');
  } finally {
    cleanupPresetsDir();
  }
}

// New test: Validation with invalid names
function testValidationInvalidNames() {
  cleanupPresetsDir();
  ensurePresetsDir();
  
  try {
    // Invalid names
    const invalidPresets = [
      { name: '', properties: [{ namespace: 'DAV:', name: 'displayname' }] },
      { name: 'has spaces', properties: [{ namespace: 'DAV:', name: 'displayname' }] },
      { name: 'has@symbols', properties: [{ namespace: 'DAV:', name: 'displayname' }] },
      { name: 'valid-name', properties: [{ namespace: 'DAV:', name: 'displayname' }] } // This one is valid
    ];
    const file = path.join(PRESETS_DIR, 'invalid.json');
    fs.writeFileSync(file, JSON.stringify(invalidPresets));
    
    // Trigger cache reload
    triggerCacheInvalidation(file, invalidPresets);
    
    const presets = getAllPresets();
    const names = presets.map(p => p.name);
    
    // Only the valid preset should be loaded
    assert(!names.includes(''), 'Empty name should be rejected');
    assert(!names.includes('has spaces'), 'Name with spaces should be rejected');
    assert(!names.includes('has@symbols'), 'Name with @ should be rejected');
    assert(names.includes('valid-name'), 'Valid name should be accepted');
  } finally {
    cleanupPresetsDir();
  }
}

// New test: Validation with missing properties
function testValidationMissingProperties() {
  cleanupPresetsDir();
  ensurePresetsDir();
  
  try {
    const invalidPresets = [
      { name: 'no-props' }, // Missing properties array
      { name: 'empty-props', properties: [] }, // Empty properties array
      { name: 'valid-props', properties: [{ namespace: 'DAV:', name: 'displayname' }] } // Valid
    ];
    const file = path.join(PRESETS_DIR, 'missing.json');
    fs.writeFileSync(file, JSON.stringify(invalidPresets));
    
    // Trigger cache reload
    triggerCacheInvalidation(file, invalidPresets);
    
    const presets = getAllPresets();
    const names = presets.map(p => p.name);
    
    assert(!names.includes('no-props'), 'Preset without properties should be rejected');
    assert(!names.includes('empty-props'), 'Preset with empty properties should be rejected');
    assert(names.includes('valid-props'), 'Preset with valid properties should be accepted');
  } finally {
    cleanupPresetsDir();
  }
}

// New test: Validation with oversized presets
function testValidationOversizedPresets() {
  cleanupPresetsDir();
  ensurePresetsDir();
  
  try {
    // Create preset with 101 properties (exceeds MAX_PROPERTIES_PER_PRESET of 100)
    const oversizedProperties = [];
    for (let i = 0; i < 101; i++) {
      oversizedProperties.push({ namespace: 'DAV:', name: `prop${i}` });
    }
    const oversizedPreset = {
      name: 'oversized',
      properties: oversizedProperties
    };
    
    // Create a valid preset
    const validPreset = {
      name: 'normalsize',
      properties: [{ namespace: 'DAV:', name: 'displayname' }]
    };
    
    const file = path.join(PRESETS_DIR, 'size-test.json');
    fs.writeFileSync(file, JSON.stringify([oversizedPreset, validPreset]));
    
    // Trigger cache reload
    triggerCacheInvalidation(file, [oversizedPreset, validPreset]);
    
    const presets = getAllPresets();
    const names = presets.map(p => p.name);
    
    assert(!names.includes('oversized'), 'Oversized preset should be rejected');
    assert(names.includes('normalsize'), 'Normal-sized preset should be accepted');
  } finally {
    cleanupPresetsDir();
  }
}

// New test: Cache TTL expiration
function testCacheTTLExpiration() {
  cleanupPresetsDir();
  ensurePresetsDir();
  
  try {
    // Create initial preset
    const preset1 = {
      name: 'ttl-test1',
      properties: [{ namespace: 'DAV:', name: 'displayname' }]
    };
    const file = path.join(PRESETS_DIR, 'ttl.json');
    fs.writeFileSync(file, JSON.stringify(preset1));
    
    // First load - trigger cache
    triggerCacheInvalidation(file, preset1);
    
    let presets = getAllPresets();
    let names = presets.map(p => p.name);
    assert(names.includes('ttl-test1'), 'Initial preset should be loaded');
    
    // Second load (should use cache)
    presets = getAllPresets();
    names = presets.map(p => p.name);
    assert(names.includes('ttl-test1'), 'Cached preset should be returned');
    
    // Wait for TTL to expire
    waitForCacheTTL();
    
    // Update the preset file
    const preset2 = {
      name: 'ttl-test2',
      properties: [{ namespace: 'DAV:', name: 'resourcetype' }]
    };
    fs.writeFileSync(file, JSON.stringify(preset2));
    
    // Load after TTL expiration - should reload and get new preset
    presets = getAllPresets();
    names = presets.map(p => p.name);
    assert(names.includes('ttl-test2'), 'New preset should be loaded after TTL expiration');
    assert(!names.includes('ttl-test1'), 'Old preset should not be present after reload');
  } finally {
    cleanupPresetsDir();
  }
}

// New test: Cache mtime-based invalidation
function testCacheMtimeInvalidation() {
  cleanupPresetsDir();
  ensurePresetsDir();
  
  try {
    const file = path.join(PRESETS_DIR, 'mtime.json');
    
    // Create initial preset
    const preset1 = {
      name: 'mtime-test1',
      properties: [{ namespace: 'DAV:', name: 'displayname' }]
    };
    fs.writeFileSync(file, JSON.stringify(preset1));
    
    // First load - trigger cache
    triggerCacheInvalidation(file, preset1);
    
    let presets = getAllPresets();
    let names = presets.map(p => p.name);
    assert(names.includes('mtime-test1'), 'Initial preset should be loaded');
    
    // Modify the file (this changes mtime)
    const preset2 = {
      name: 'mtime-test2',
      properties: [{ namespace: 'DAV:', name: 'resourcetype' }]
    };
    triggerCacheInvalidation(file, preset2);
    
    // Load again - cache should be invalidated due to mtime change
    presets = getAllPresets();
    names = presets.map(p => p.name);
    assert(names.includes('mtime-test2'), 'New preset should be loaded after mtime change');
    assert(!names.includes('mtime-test1'), 'Old preset should not be present after mtime change');
  } finally {
    cleanupPresetsDir();
  }
}

// New test: Validation with invalid namespaces
function testValidationInvalidNamespaces() {
  cleanupPresetsDir();
  ensurePresetsDir();
  
  try {
    const presets = [
      {
        name: 'invalid-ns',
        properties: [
          { namespace: 'not-a-uri', name: 'prop1' }, // Invalid namespace
          { namespace: 'DAV:', name: 'displayname' } // Valid
        ]
      }
    ];
    const file = path.join(PRESETS_DIR, 'ns.json');
    fs.writeFileSync(file, JSON.stringify(presets));
    
    // Trigger cache reload
    triggerCacheInvalidation(file, presets);
    
    const loadedPresets = getAllPresets();
    const preset = loadedPresets.find(p => p.name === 'invalid-ns');
    
    // Preset should exist but invalid namespace property should be filtered out
    assert(preset !== undefined, 'Preset should be loaded');
    assert(preset && preset.properties.length === 1, 'Invalid namespace property should be filtered');
    assert(preset && preset.properties[0] && preset.properties[0].namespace === 'DAV:', 'Only valid property should remain');
  } finally {
    cleanupPresetsDir();
  }
}

export async function runAllTests() {
  await testBuiltinPresets();
  await testGenerateXml();
  await testMergeProperties();
  
  testXmlEscaping();

  testGenerateXmlMultipleNamespaces();

  testUserPresetOverride();
  
  // Wait for cache to expire before running file loading tests
  // This ensures the cache from testBuiltinPresets() doesn't interfere
  console.log('Waiting for cache TTL to expire before file loading tests...');
  waitForCacheTTL();
  
  console.log('Running file loading tests...');
  testFileLoadingValidJSON();
  testFileLoadingMalformedJSON();
  
  console.log('Running validation tests...');
  testValidationInvalidNames();
  testValidationMissingProperties();
  testValidationOversizedPresets();
  testValidationInvalidNamespaces();
  
  console.log('Running cache tests...');
  testCacheTTLExpiration();
  testCacheMtimeInvalidation();

  console.log('All tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}
