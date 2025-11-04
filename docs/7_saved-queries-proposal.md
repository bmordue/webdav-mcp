# Proposal: Saved WebDAV Query Feature

## Summary
Provide a mechanism for users to define and persist a set of commonly used WebDAV request "queries" (parameterised request templates) that the MCP server can enumerate and execute on demand. These [...]  

## Goals
- Allow users to persist named WebDAV request templates.
- Support parameter interpolation (e.g. placeholders within path or body).
- Expose saved queries to MCP clients via a discovery tool (`list_saved_queries`).
- Allow invocation via a dedicated tool (`run_saved_query`) referencing the saved name and providing parameter values.
- Keep storage format simple (human-editable) and version controllable (e.g. JSON or YAML file under `saved-queries/`).
- Fail safely with clear validation errors when required parameters are missing.
- Maintain separation between sensitive runtime credentials and non-sensitive saved query definitions.

## Non-Goals
- Complex conditional logic within templates (if/else). Use simple token substitution only.
- Query sharing/synchronisation between different deployments (left for future work).
- A general-purpose templating language; we only need lightweight placeholder replacement, not loops or conditionals.

## User Stories
1. As a user, I can create a file defining a named PROPFIND query to list the immediate children of the root collection and re-use it via a short name.
2. As a user, I can define a template for uploading a text file given a filename and content parameters.
3. As an agent author, I can ask the MCP server for all saved queries to decide which one to call programmatically.
4. As an agent, I can execute a saved query by name, supplying required parameters, and receive the normal structured response.
5. As an operator, I receive a clear error if I reference a saved query that does not exist or omit required parameters.

## Use Cases
- Routine directory listings (root, specific collections).
- Frequently repeated metadata extractions via PROPFIND with specific XML bodies.
- Standardised PUT operations for certain paths (e.g. daily log upload).
- Bulk operations orchestrated externally by iterating over a saved query list.

## Design Overview
Introduce two new MCP tools:

1. `list_saved_queries`
   - Returns an array of saved query descriptors: name, method, path template, parameters, description.
2. `run_saved_query`
   - Input: name (string), params (object of key/value)
   - Resolves template, performs placeholder substitution, dispatches underlying request using existing `dav_request` logic.

### Storage Format
A directory `saved-queries/` (configurable via env var `DAV_SAVED_QUERIES_DIR`, default `./saved-queries`). Each file is either JSON or YAML (initially, support JSON only for simplicity) containin[...]  

```json
[
  {
    "name": "list_root",
    "description": "List root collection depth 1",
    "method": "PROPFIND",
    "path": "/",
    "depth": "1"
  },
  {
    "name": "put_text_file",
    "description": "Upload a text file at /notes/<filename>",
    "method": "PUT",
    "path": "/notes/{{filename}}",
    "body": "{{content}}",
    "requiredParams": ["filename", "content"]
  }
]
```

### Template Substitution
- Placeholders use `{{paramName}}` syntax.
- Substitution applied to `path`, `body`, and any header values.
- If a required parameter is absent, return an MCP error with a message listing missing keys.
- No escaping rules initially; assume parameters are safe for insertion. (Future: add XML/URL sanitisation.)

### Validation Rules
- `name`: unique (collision => last wins or error; choose error to surface mistakes).
- `method`: one of allowed WebDAV methods.
- `path`: string; may contain placeholders.
- `requiredParams`: array of strings; each must appear at least once in either `path` or `body` or headers (advisory warning if not).
- Optional: `depth`, `headers`.

### MCP Tool Schemas

`list_saved_queries` response example:
```json
{
  "queries": [
    {
      "name": "list_root",
      "description": "List root collection depth 1",
      "method": "PROPFIND",
      "pathTemplate": "/",
      "requiredParams": [],
      "depth": "1"
    }
  ]
}
```

`run_saved_query` input schema:
```json
{
  "name": "<savedQueryName>",
  "params": {"param": "value"}
}
```

### Execution Flow
1. `run_saved_query` handler loads saved queries cache (refreshing if TTL expired or file timestamps changed).
2. Finds query by name; if missing, error.
3. Validates required parameters; if missing, error.
4. Performs substitution on applicable fields.
5. Builds arguments object and delegates to existing `handleDavRequest`.
6. Returns resulting content unchanged.

### Caching Strategy
- Maintain in-memory cache keyed by filename with parsed queries.
- Invalidate on mtime change or after a short TTL (e.g. 5 seconds) to avoid frequent disk I/O.
- Provide an environment variable `DAV_SAVED_QUERIES_TTL_MS` to configure.

### Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `DAV_SAVED_QUERIES_DIR` | Directory containing saved query definition files | `./saved-queries` |
| `DAV_SAVED_QUERIES_TTL_MS` | Milliseconds before reloading definitions | `5000` |

### Data Structures (TypeScript)
Pseudo types:
```ts
interface SavedQueryDefinition {
  name: string;
  description?: string;
  method: DavRequestArgs['method'];
  path: string; // may contain placeholders
  body?: string; // may contain placeholders
  headers?: Record<string, string>; // values may contain placeholders
  depth?: DavRequestArgs['depth'];
  requiredParams?: string[];
}
```

### Error Modes
- Missing definitions directory: return empty list for `list_saved_queries`; for `run_saved_query` emit error if directory absent AND query not cached.
- Malformed JSON: log warning, skip file.
- Duplicate names: error and skip duplicates after first occurrence.
- Missing required parameters: MCP error listing missing names.

### Security Considerations
- Parameters directly interpolated; risk of path traversal (e.g. `../`). Mitigation: optional sanitisation pass; initial version documents risk.
- Body injection—ensure no credentials are inserted accidentally; credentials remain environment-based.
- Denial of service via huge number of definitions; limit maximum queries per file (e.g. 500) and maximum placeholder expansion length.

### Performance Considerations
- Queries are small; memory footprint negligible.
- Disk scanning limited by TTL; acceptable for typical usage.
- Substitution O(n * p) where n characters and p placeholders; trivial scale.

### Incremental Rollout Plan
1. Implement parsing & caching layer (internal module).
2. Add new tool schemas and handlers.
3. Integrate substitution + validation; delegate to existing request logic.
4. Provide initial documentation & examples in README update.
5. Add unit tests for: loading, substitution, missing parameters, duplication, execution.
6. Optional later: YAML support, sanitisation, remote sync.

### Testing Strategy
- Unit tests for template substitution function (placeholder detection, missing params).
- Tests for loading multiple files and handling duplicates.
- Tests for `run_saved_query` calling underlying request with substituted args.
- Integration test using a mock fetch (simulate WebDAV responses).

### Open Questions
- Should we allow default parameter values? (Possible extension: `defaults` field.)
- Support for partial parameter expansion leaving `{{placeholder}}` intact or treat as error? (Proposed: error.)
- Provide a tool to create/update saved queries from client? (Initially manual file edit only.)
- Should header names be parameterisable? (Initially no—only values.)

### Future Extensions
- Add `update_saved_query` and `create_saved_query` tools with write-access safeguards.
- Add placeholder filters (e.g. `{{filename|urlencode}}`).
- Add grouping/tagging for queries.
- Provide summarised docs tool returning markdown description of all queries.

### Example Conversation (Human ↔ Agent)
Illustrative end-to-end flow once the feature is implemented.

```
Human: Can you list the saved WebDAV queries?

Agent: I will enumerate saved queries.
Agent Tool Invocation:
{
  "name": "list_saved_queries",
  "arguments": {}
}

Tool Response:
{
  "queries": [
    {
      "name": "list_root",
      "description": "List root collection depth 1",
      "method": "PROPFIND",
      "pathTemplate": "/",
      "requiredParams": [],
      "depth": "1"
    },
    {
      "name": "put_text_file",
      "description": "Upload a text file at /notes/<filename>",
      "method": "PUT",
      "pathTemplate": "/notes/{{filename}}",
      "requiredParams": ["filename", "content"]
    }
  ]
}

Agent: Available queries are 'list_root' and 'put_text_file'. What shall I run?

Human: Run the one that lists the root.

Agent: Executing 'list_root'.
Agent Tool Invocation:
{
  "name": "run_saved_query",
  "arguments": {
    "name": "list_root",
    "params": {}
  }
}

Tool Response (simplified):
{
  "status": 207,
  "headers": {"content-type": "text/xml; charset=utf-8"},
  "body": "<multistatus>...</multistatus>"
}

Agent: Directory listing returned. Shall I upload a note file?

Human: Yes, create meeting.txt with content 'Agenda draft'.

Agent: Executing upload via saved query.
Agent Tool Invocation:
{
  "name": "run_saved_query",
  "arguments": {
    "name": "put_text_file",
    "params": {
      "filename": "meeting.txt",
      "content": "Agenda draft"
    }
  }
}

Tool Response:
{
  "status": 201,
  "headers": {"content-length": "0"},
  "body": ""
}

Agent: /notes/meeting.txt created successfully.

Human: Try uploading another file but forget the content.

Agent: Attempting with missing parameter to show error.
Agent Tool Invocation:
{
  "name": "run_saved_query",
  "arguments": {
    "name": "put_text_file",
    "params": {
      "filename": "empty.txt"
    }
  }
}

Tool Error Response:
{
  "isError": true,
  "error": "Missing required parameters: content"
}

Agent: The server rejected the request because 'content' was not supplied.
```

### Conversation Highlights
- Discovery without prior hard-coding (via `list_saved_queries`).
- Parameter safety and validation (clear missing parameter error).
- Template reuse reduces request verbosity.
- Consistent response format identical to direct `dav_request` usage.

## Rating and Rationale

**Score: 7/10**

This proposal receives a good score for the following reasons:

**Suitability (Good):** Saved queries address a common pattern in WebDAV usage—repeating similar requests with different parameters. This is a legitimate usability enhancement that would benefit both interactive users and automated agents.

**Goodness-of-fit (Good):** The proposal integrates well with existing architecture by building on the current `dav_request` tool. The file-based storage approach is consistent with the project's lightweight philosophy, and the template substitution mechanism is straightforward. The caching strategy is sensible and similar to the property presets proposal.

**Value Delivered (Good):** Users gain significant productivity through reusable templates, reducing errors and ensuring consistency. The parameter validation and clear error messages add value. The ability to version-control query definitions (as JSON files) is a nice benefit for teams.

**Limited Scope Expansion (Moderate):** While the proposal is focused on template substitution, there are several areas of concern: (1) Parameter injection security requires careful handling of path traversal and XML injection, (2) The temptation to add "just one more feature" like conditionals, loops, or sanitisation filters could lead to scope creep, and (3) The proposal acknowledges several "future extensions" that could expand scope significantly.

The implementation complexity is moderate—template parsing and substitution are well-understood problems, but the security considerations around parameter injection need careful attention. The proposal wisely limits initial scope to simple placeholder replacement without complex logic.

## Conclusion
This feature introduces a lightweight, human-readable mechanism to store and re-use named WebDAV request templates, improving ergonomics for both human users and automated agents. The approach mi[...]  
