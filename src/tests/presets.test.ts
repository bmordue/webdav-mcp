#!/usr/bin/env node
import { getAllPresets, getPreset, generatePropfindXml, mergeProperties } from '../presets/index.js';

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

export function runAllTests() {
  testBuiltinPresets();
  testGenerateXml();
  testMergeProperties();
  testXmlEscaping();
  console.log('All tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}
