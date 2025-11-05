#!/usr/bin/env node
import { runAllTests } from './presets.test.js';

try {
  runAllTests();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
