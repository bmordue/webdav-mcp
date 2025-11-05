#!/usr/bin/env node
import { getAllPresets, getPreset, generatePropfindXml, mergeProperties } from '../presets/index.js';

function assert(condition: any, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function testBuiltinPresets() {
  const presets = await getAllPresets();
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

export async function runAllTests() {
  await testBuiltinPresets();
  await testGenerateXml();
  await testMergeProperties();
  console.log('All tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}
