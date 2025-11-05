#!/usr/bin/env node
import { getAllPresets, getPreset, generatePropfindXml, mergeProperties, clearCache } from '../presets/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

function assert(condition: any, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function testBuiltinPresets() {
  const presets = getAllPresets();
  const names = presets.map(p => p.name);
  assert(names.includes('basic'), 'basic preset missing');
  assert(names.includes('detailed'), 'detailed preset missing');
  assert(names.includes('minimal'), 'minimal preset missing');
}

function testGenerateXml() {
  const preset = getPreset('basic');
  assert(preset, 'basic preset not found');
  const xml = generatePropfindXml(preset!.properties);
  assert(xml.includes('<D:displayname/>'), 'XML missing displayname');
  assert(xml.startsWith('<?xml'), 'XML should start with declaration');
}

function testMergeProperties() {
  const preset = getPreset('minimal');
  assert(preset, 'minimal preset not found');
  const merged = mergeProperties(preset!.properties, [{ namespace: 'DAV:', name: 'getcontentlength' }]);
  assert(merged.length === 2, 'Merge should add property');
  // Add duplicate
  const merged2 = mergeProperties(merged, [{ namespace: 'DAV:', name: 'getcontentlength' }]);
  assert(merged2.length === 2, 'Duplicate should be deduped');
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
  }
}

export function runAllTests() {
  testBuiltinPresets();
  testGenerateXml();
  testMergeProperties();
  testUserPresetOverride();
  console.log('All tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}
