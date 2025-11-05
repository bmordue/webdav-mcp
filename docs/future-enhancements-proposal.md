# Proposal: Future Enhancements for Property Presets & WebDAV MCP Server

## Summary
This document enumerates potential enhancements that build upon the newly introduced property presets feature and broader server capabilities. Each item is intentionally scoped so it can be delivered incrementally. No scoring is applied; prioritisation can be performed separately.

## Goals
- Increase flexibility of preset definitions (inheritance, composition).
- Broaden WebDAV capability coverage (e.g. special PROPFIND modes, PROPPATCH consistency).
- Improve developer ergonomics (validation, tooling, editing workflow).
- Enhance security and robustness (XML escaping, resource limits, input hardening).
- Provide performance optimisations (smarter caching, batching strategies).
- Lay groundwork for future automation (capability discovery, template placeholders).

## Candidate Enhancements

### 1. Preset Inheritance / Composition
Allow a preset to extend one or more base presets, merging property lists. Example:
```json
{
  "name": "media-extended",
  "extends": ["media", "detailed"],
  "properties": [
    {"namespace": "http://ns.example.com/photo/", "name": "iso"}
  ]
}
```
Rules:
- Detect cycles and reject if found.
- Later presets in `extends` win on duplicate property clashes (though duplicates are currently deduped).
- Provide an error listing cycle chain if inheritance is invalid.

### 2. Special Preset Keywords (allprop / propname)
Support pseudo-presets `allprop` and `propname` mapping to the relevant minimal XML bodies:
- `allprop`: `<D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>`
- `propname`: `<D:propfind xmlns:D="DAV:"><D:propname/></D:propfind>`
Implementation:
- Intercept before normal property expansion.
- Disallow mixing these with `additionalProperties` (return validation error).

### 3. PROPPATCH Presets (Write Operations)
Introduce `property-update-presets` directory supporting common PROPPATCH bodies (set/remove patterns). Schema example:
```json
{
  "name": "set-comment",
  "description": "Apply a comment property",
  "operations": [
    {
      "action": "set",
      "namespace": "http://example.com/meta/",
      "name": "comment",
      "value": "Reviewed"
    }
  ]
}
```
Add new tool `dav_patch_with_preset` or extend `dav_request` with `patchPreset`. Ensure value XML escaping.

### 4. Rich XML Escaping & Validation
Current names are restricted; extend to:
- Escape element names only if we broaden allowed characters (currently not required due to whitelist).
- Normalise namespace URIs (strip trailing spaces, reject control characters).
- Implement a safe XML builder using explicit tokenisation rather than string concatenation.

### 5. Capability Discovery & Adaptive Presets
Add tool `discover_capabilities` performing an OPTIONS request or interpreting specific well-known responses to build a capability profile:
- Supported methods
- Supported live properties
- Maximum depth allowed
Then annotate presets as: available / partially available / unknown. Provide a filtering tool `list_supported_presets`.

### 6. Preset Editing Tool
Add MCP tool `create_or_update_property_preset` taking a definition and writing to disk (with validation & backup):
- Writes into `DAV_PROPERTY_PRESETS_DIR`.
- Auto-formats JSON array file if it already exists.
- Returns summary (created, updated, warnings).
Security: restrict maximum size and enforce sanitisation.

### 7. Template Placeholders in Presets
Permit placeholder tokens in property names or namespaces for organisational customisation. Example:
```json
{
  "name": "tenant-doc-meta",
  "properties": [
    {"namespace": "http://example.com/${TENANT}/doc/", "name": "classification"}
  ]
}
```
Resolution rules:
- Environment variables only; do not allow arbitrary runtime substitution via arguments (to avoid injection).
- If missing variable, warn and skip property.

### 8. Performance Optimisations
- Precompute XML bodies for built-in presets at startup.
- Switch cache invalidation from periodic TTL to fs watch (optional; fallback to TTL if watch unsupported).
- Batch network calls for consecutive PROPFIND preset requests with identical depth/path by reusing parsed XML DOM (internal micro-cache for 100ms window).

### 9. Security Hardening
- Rate-limit number of preset-based requests per minute to mitigate large fan-out attacks.
- Enforce a global maximum size for generated XML (e.g. 64 KiB) before aborting.
- Add configurable denylist for namespaces.
- Audit logging: record preset name, property count, user (if available), timestamp.

### 10. Enhanced Testing Strategy
Add tests for:
- Inheritance edge cases (cycles, deep chains, duplicates).
- Special keywords `allprop` / `propname`.
- XML builder escaping unusual characters if whitelist relaxed.
- Failure modes (invalid namespace URI, oversize XML, missing environment variables for placeholders).
- Benchmark tests measuring XML generation throughput.

### 11. Observability & Metrics
Introduce optional metrics collection (e.g. Prometheus exposition) for:
- Preset hits vs misses
- Cache refresh count
- Average XML generation time
- Error rates per tool

### 12. Documentation Enhancements
- Add a dedicated `docs/presets.md` with a matrix of built-in properties and guidance on extension.
- Provide examples for complex scenarios (combining presets + additionalProperties, placeholders, inheritance graph).

### 13. Graceful Degradation & Fallback
If a property in a preset repeatedly fails (e.g. server returns `404 Not Found` or `404` equivalent for property), optionally mark it as suppressed and exclude from subsequent XML for a configurable cooling period.

### 14. Command-Line Utility
Add a CLI subcommand (e.g. `node dist/cli.js preset validate <file>`) for offline validation and pretty-printing of presets.

### 15. Safe Concurrency Handling
Ensure updates to presets directory (when editing tool added) are atomic:
- Write to temp file then rename.
- Acquire a process-level lock (e.g. lockfile) during write.

## Incremental Rollout Suggestion
1. XML builder refactor (security foundation).
2. Special presets (`allprop`, `propname`).
3. Inheritance & composition.
4. Editing tool + validation CLI.
5. Capability discovery & supported filter.
6. Performance refinements (precompute, watch FS).
7. PROPPATCH presets.
8. Metrics & observability.
9. Placeholders & fallback suppression.
10. Security hardening extras.

## Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Increased complexity of presets (inheritance) | Keep inheritance single-level initially; expand after stabilisation. |
| XML injection via relaxed character set | Maintain strict whitelist; escape values in PROPPATCH bodies rigorously. |
| Race conditions on preset edits | Atomic file writes + reload after successful rename. |
| Performance degradation with watch | Allow opt-out to TTL mode via env flag. |
| Overfetch with capability discovery | Cache OPTIONS responses; configurable expiry. |

## Open Questions
- Should inheritance allow property removal (negative list)?
- Do we need versioning for preset definitions (e.g. schema version field)?
- Should placeholders permit a limited set of transformations (lowercase, trim)?
- How to surface audit logs to MCP clients (new tool vs external sink)?

## Conclusion
The outlined enhancements provide a roadmap for evolving presets from a convenience feature into a robust, extensible configuration layer that supports richer WebDAV interactions, improved security, and better operational insight.
