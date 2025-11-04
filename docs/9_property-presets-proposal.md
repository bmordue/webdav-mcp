# Proposal: WebDAV Property Presets Feature

## Summary
Provide a mechanism for users to define reusable property sets (presets) for PROPFIND operations, allowing consistent property queries across multiple requests without repeating verbose XML property specifications.

## Goals
- Allow users to define named property presets with commonly queried WebDAV properties.
- Support standard WebDAV properties (DAV: namespace) and custom properties.
- Expose presets to MCP clients via a discovery tool (`list_property_presets`).
- Allow PROPFIND requests to reference presets by name instead of full XML bodies.
- Keep storage format simple (human-editable JSON or YAML).
- Provide sensible built-in presets (e.g. "basic", "detailed", "minimal").
- Maintain backward compatibility with existing raw PROPFIND XML bodies.

## Non-Goals
- Automatic property discovery from server capabilities (future work).
- Dynamic property validation against server schemas.
- Property value transformation or filtering.
- Support for PROPPATCH presets (focus on PROPFIND only initially).

## User Stories
1. As a user, I can define a preset named "media" that queries creation date, content type, size, and custom EXIF properties.
2. As a user, I can execute a PROPFIND using a preset name instead of crafting XML manually.
3. As an agent author, I can list available presets to determine which property set is most appropriate for my task.
4. As an operator, I can create organisation-wide presets for consistent metadata extraction.
5. As a developer, I can combine a preset with additional ad-hoc properties in a single request.

## Use Cases
- Media library management (query file metadata consistently).
- Document management systems (standard document properties).
- Collaborative file systems (ownership, permissions, modification times).
- Audit and compliance (consistent property sets for reporting).

## Design Overview
Introduce three new MCP tools:

1. `list_property_presets`
   - Returns array of preset descriptors: name, description, properties list.
2. `dav_request_with_preset` (or extend existing `dav_request`)
   - Input: method (PROPFIND), path, preset name, optional additional properties.
   - Constructs appropriate PROPFIND XML body from preset definition.
3. `get_property_preset`
   - Input: preset name.
   - Returns full preset definition for inspection.

### Storage Format
A directory `property-presets/` (configurable via `DAV_PROPERTY_PRESETS_DIR`, default `./property-presets`). Each JSON file contains preset definitions:

```json
[
  {
    "name": "basic",
    "description": "Essential file properties",
    "properties": [
      {"namespace": "DAV:", "name": "displayname"},
      {"namespace": "DAV:", "name": "getcontentlength"},
      {"namespace": "DAV:", "name": "getlastmodified"},
      {"namespace": "DAV:", "name": "resourcetype"}
    ]
  },
  {
    "name": "media",
    "description": "Media file metadata",
    "properties": [
      {"namespace": "DAV:", "name": "displayname"},
      {"namespace": "DAV:", "name": "getcontenttype"},
      {"namespace": "DAV:", "name": "getcontentlength"},
      {"namespace": "http://ns.example.com/photo/", "name": "dateTaken"},
      {"namespace": "http://ns.example.com/photo/", "name": "camera"}
    ]
  }
]
```

### Built-in Presets
Provide three built-in presets loaded by default:

**basic:**
- displayname
- getcontentlength
- getlastmodified
- resourcetype
- getcontenttype

**detailed:**
- All basic properties plus:
- creationdate
- getetag
- supportedlock
- lockdiscovery

**minimal:**
- resourcetype only (to distinguish files from collections)

### XML Generation
Convert preset to PROPFIND XML body:

```xml
<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:P="http://ns.example.com/photo/">
  <D:prop>
    <D:displayname/>
    <D:getcontenttype/>
    <D:getcontentlength/>
    <P:dateTaken/>
    <P:camera/>
  </D:prop>
</D:propfind>
```

### Integration with Existing Tool
Option 1: Extend `dav_request` with optional `preset` parameter:
```json
{
  "method": "PROPFIND",
  "path": "/photos",
  "depth": "1",
  "preset": "media"
}
```

Option 2: New dedicated tool `propfind_with_preset`:
```json
{
  "preset": "media",
  "path": "/photos",
  "depth": "1",
  "additionalProperties": [
    {"namespace": "DAV:", "name": "quota-used-bytes"}
  ]
}
```

Recommendation: Option 1 for simplicity, with automatic XML body generation when `preset` is provided.

### Validation Rules
- `name`: unique, alphanumeric with hyphens/underscores.
- `properties`: array of objects with `namespace` and `name` fields.
- `namespace`: valid URI (at least basic format check).
- `name`: non-empty string.
- Warn if preset references properties with duplicate namespace/name pairs.

### MCP Tool Schemas

`list_property_presets` response example:
```json
{
  "presets": [
    {
      "name": "basic",
      "description": "Essential file properties",
      "propertyCount": 5,
      "builtin": true
    },
    {
      "name": "media",
      "description": "Media file metadata",
      "propertyCount": 5,
      "builtin": false
    }
  ]
}
```

`get_property_preset` input/output:
```json
// Input
{"name": "media"}

// Output
{
  "name": "media",
  "description": "Media file metadata",
  "properties": [
    {"namespace": "DAV:", "name": "displayname"},
    {"namespace": "DAV:", "name": "getcontenttype"},
    ...
  ]
}
```

### Execution Flow
1. Client calls `dav_request` with `preset` parameter.
2. Server loads preset definition (from built-ins or cached user presets).
3. If preset not found, return error listing available presets.
4. Generate PROPFIND XML body from preset properties.
5. Merge with any `additionalProperties` if provided.
6. Execute PROPFIND using generated XML.
7. Return structured response as normal.

### Caching Strategy
- Load built-in presets once at startup.
- Cache user-defined presets with TTL (similar to saved queries: 5 seconds default).
- Invalidate on file mtime change.
- Provide `DAV_PROPERTY_PRESETS_TTL_MS` environment variable.

### Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `DAV_PROPERTY_PRESETS_DIR` | Directory containing preset definition files | `./property-presets` |
| `DAV_PROPERTY_PRESETS_TTL_MS` | Cache TTL in milliseconds | `5000` |

### Data Structures (TypeScript)
```ts
interface PropertyDefinition {
  namespace: string; // e.g. "DAV:" or "http://example.com/ns/"
  name: string;      // e.g. "displayname"
}

interface PropertyPreset {
  name: string;
  description?: string;
  properties: PropertyDefinition[];
  builtin?: boolean; // true for built-in presets
}
```

### Error Modes
- Missing presets directory: use built-ins only; log info message.
- Malformed JSON: log warning, skip file.
- Unknown preset referenced: error with list of available preset names.
- Invalid property definition (missing namespace/name): skip property with warning.

### Security Considerations
- Property names are used in XML generation; validate to prevent injection.
- Namespace URIs should be validated as URIs (basic check).
- Limit total properties per preset (e.g. 100) to prevent abuse.
- Limit total preset definitions (e.g. 200) to prevent DoS.

### Performance Considerations
- XML generation is lightweight (simple string concatenation/templating).
- Preset cache prevents repeated file I/O.
- PROPFIND performance depends on server; preset merely constructs request.

### Incremental Rollout Plan
1. Define built-in presets as constants.
2. Implement preset loading and caching module.
3. Add XML generation function from property list.
4. Extend `dav_request` handler to accept `preset` parameter.
5. Add `list_property_presets` and `get_property_preset` tools.
6. Update README with preset documentation.
7. Add unit tests for XML generation, preset loading, validation.

### Testing Strategy
- Unit tests for XML generation from property lists.
- Tests for namespace handling and XML escaping.
- Tests for preset loading, caching, and TTL expiry.
- Tests for built-in presets.
- Integration test executing PROPFIND with preset against mock server.

### Open Questions
- Should presets support property hierarchies or grouping? (Initially no.)
- Allow presets to inherit from other presets? (Future extension.)
- Support allprop/propname shortcuts via preset? (Possible: special preset names "allprop", "propname".)
- Provide UI/tool for creating presets? (Initially manual editing only.)

### Future Extensions
- Preset inheritance (e.g. "media-extended" extends "media").
- Property value filters (e.g. only return properties matching pattern).
- PROPPATCH presets for consistent property updates.
- Server capability detection to validate presets against supported properties.
- Preset templates with placeholders (e.g. namespace URI substitution).

### Example Conversation (Human ↔ Agent)

```
Human: List available property presets.

Agent: I will enumerate property presets.
Agent Tool Invocation:
{
  "name": "list_property_presets",
  "arguments": {}
}

Tool Response:
{
  "presets": [
    {
      "name": "basic",
      "description": "Essential file properties",
      "propertyCount": 5,
      "builtin": true
    },
    {
      "name": "media",
      "description": "Media file metadata",
      "propertyCount": 5,
      "builtin": false
    }
  ]
}

Agent: Two presets available: 'basic' (built-in, 5 properties) and 'media' (custom, 5 properties).

## Rating and Rationale

**Score: 9/10**

This proposal receives a high score for the following reasons:

**Suitability (Excellent):** Property presets directly address a common pain point in WebDAV operations—the verbosity and complexity of PROPFIND requests. This is a core operation that every WebDAV user performs frequently, making this feature highly suitable for the project.

**Goodness-of-fit (Excellent):** The proposal integrates seamlessly with the existing architecture. It extends the current `dav_request` tool without requiring major structural changes. The caching mechanism and file-based storage align well with the project's lightweight design philosophy.

**Value Delivered (High):** Users gain significant productivity improvements through reusable property sets, reducing errors and improving consistency. The inclusion of built-in presets ("basic", "detailed", "minimal") provides immediate value without configuration. This is particularly valuable for agents that need to make consistent property queries.

**Limited Scope Expansion (Excellent):** The proposal is well-contained with clear boundaries. It explicitly excludes PROPPATCH presets and complex features in the initial version. The implementation complexity is low—primarily involving XML generation and simple file-based storage with caching. The incremental rollout plan is sensible and achievable.

The only minor concern is the need for proper XML sanitisation to prevent injection attacks, but this is acknowledged in the security considerations and is a manageable risk.