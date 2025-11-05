# Proposal: Batch Operations Support

## Summary
Enable clients to submit multiple WebDAV operations as a single atomic or best-effort batch request, reducing round-trip latency and improving efficiency when performing bulk operations like copying multiple files, deleting collections, or updating properties across resources.

## Goals
- Allow submission of multiple WebDAV requests (GET, PUT, DELETE, PROPFIND, etc.) in a single MCP tool call.
- Support both atomic (all-or-nothing) and best-effort (continue on error) execution modes.
- Provide detailed per-operation results including success/failure status and error messages.
- Maintain compatibility with existing single-operation `dav_request` tool.
- Reduce network overhead and latency for bulk operations.
- Enable transaction-like semantics where supported by server (future: WebDAV TRANSACTION extension).

## Non-Goals
- Server-side transaction support (initial version is client-side only; operations execute sequentially).
- Automatic operation reordering or optimisation (execute in submission order).
- Cross-server batch operations (single DAV_SERVER_URL only).
- Complex conditional logic between operations (no if-then-else; use best-effort mode).

## User Stories
1. As a user, I can delete 50 old log files in one request instead of 50 separate requests.
2. As a user, I can copy a directory structure by batching multiple MKCOL and COPY operations.
3. As an agent, I can upload multiple files atomically, rolling back all uploads if any fails.
4. As an operator, I receive a detailed breakdown of which operations succeeded and which failed.
5. As a developer, I can perform mixed operations (PROPFIND to list, then DELETE selected items) in one batch.

## Use Cases
- Bulk file deletion or movement.
- Uploading multiple related files (e.g. website deployment: HTML, CSS, images).
- Directory structure creation (multiple MKCOL operations).
- Metadata updates across multiple resources (PROPPATCH batch).
- Backup operations (GET multiple files efficiently).

## Design Overview
Introduce one new MCP tool:

1. `dav_batch_request`
   - Input: array of operation definitions, execution mode (atomic/best-effort).
   - Output: array of results corresponding to each operation.

### Request Format
```json
{
  "operations": [
    {
      "id": "op1",
      "method": "MKCOL",
      "path": "/backup/2025-01"
    },
    {
      "id": "op2",
      "method": "PUT",
      "path": "/backup/2025-01/data.txt",
      "body": "important data"
    },
    {
      "id": "op3",
      "method": "PROPFIND",
      "path": "/backup/2025-01",
      "depth": "1"
    }
  ],
  "mode": "atomic"
}
```

### Execution Modes

**atomic**: Execute operations sequentially; if any fails, attempt rollback of previous operations and return error.
- Rollback strategy: reverse operations in reverse order (DELETE for PUT, DELETE for MKCOL, etc.).
- Rollback is best-effort; some operations may not be reversible.
- Suitable for: critical operations where partial completion is unacceptable.

**best-effort**: Execute all operations sequentially; continue even if some fail.
- Collect all results; return mixed success/failure array.
- Suitable for: bulk operations where partial success is acceptable (e.g. deleting old files).

**parallel** (future): Execute independent operations concurrently.
- Requires dependency analysis to avoid conflicts.
- Initial version: sequential execution only.

### Response Format
```json
{
  "mode": "atomic",
  "overallSuccess": true,
  "results": [
    {
      "id": "op1",
      "success": true,
      "status": 201,
      "headers": {"location": "/backup/2025-01/"},
      "body": ""
    },
    {
      "id": "op2",
      "success": true,
      "status": 201,
      "headers": {},
      "body": ""
    },
    {
      "id": "op3",
      "success": true,
      "status": 207,
      "headers": {"content-type": "text/xml"},
      "body": "<multistatus>...</multistatus>"
    }
  ]
}
```

Failure example (atomic mode):
```json
{
  "mode": "atomic",
  "overallSuccess": false,
  "rolledBack": true,
  "results": [
    {
      "id": "op1",
      "success": true,
      "status": 201,
      "rolledBack": true
    },
    {
      "id": "op2",
      "success": false,
      "status": 409,
      "error": "Conflict: resource exists"
    }
  ]
}
```

### Operation Schema
Each operation in the batch follows the same schema as `dav_request`:
```ts
interface BatchOperation {
  id?: string; // optional user-provided identifier for correlation
  method: DavMethod;
  path: string;
  body?: string;
  headers?: Record<string, string>;
  depth?: "0" | "1" | "infinity";
}
```

If `id` is not provided, operations are numbered sequentially (op-0, op-1, ...).

### Validation Rules
- Maximum batch size: configurable via `DAV_BATCH_MAX_OPERATIONS` (default: 100).
- All operations must have valid method and path.
- Duplicate IDs not allowed.
- Empty operations array returns error.

### Rollback Strategy (Atomic Mode)
Define reverse operations for common methods:

| Original | Reverse |
|----------|---------|
| PUT (created) | DELETE |
| MKCOL | DELETE |
| DELETE | (no rollback possible; log warning) |
| COPY | DELETE destination |
| MOVE | MOVE back (best effort) |
| PROPPATCH | PROPPATCH with previous values (not implemented initially) |

Rollback limitations:
- DELETE cannot be rolled back (data loss).
- PROPPATCH rollback requires capturing previous state (future enhancement).
- Server-side changes (e.g. external modifications during batch) may interfere.

### Execution Flow (Atomic Mode)
1. Validate all operations upfront.
2. Execute operations sequentially, capturing state for rollback.
3. If operation fails:
   a. Reverse all previous successful operations in reverse order.
   b. Mark rolled-back operations in result.
   c. Return overall failure with partial results.
4. If all succeed, return success with full results.

### Execution Flow (Best-Effort Mode)
1. Validate all operations upfront.
2. Execute operations sequentially.
3. Capture result (success or failure) for each operation.
4. Continue regardless of individual failures.
5. Return all results with overall success = (all succeeded).

### Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `DAV_BATCH_MAX_OPERATIONS` | Maximum operations per batch | `100` |
| `DAV_BATCH_TIMEOUT_MS` | Total timeout for batch execution | `60000` (60s) |

### Data Structures (TypeScript)
```ts
interface BatchRequestArgs {
  operations: BatchOperation[];
  mode: "atomic" | "best-effort";
  continueOnError?: boolean; // deprecated in favour of mode
}

interface BatchOperationResult {
  id: string;
  success: boolean;
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
  rolledBack?: boolean;
}

interface BatchResponse {
  mode: string;
  overallSuccess: boolean;
  rolledBack?: boolean;
  results: BatchOperationResult[];
}
```

### Error Modes
- Validation error (invalid operation): return error before execution.
- Timeout: return partial results with timeout error for remaining operations.
- Network error: handle per-operation; in atomic mode, trigger rollback.
- Server unavailable: fail entire batch immediately.

### Security Considerations
- Batch operations amplify impact of malicious requests; enforce rate limiting.
- Rollback operations may delete resources; ensure proper authorisation.
- Large batches could cause DoS; limit via `DAV_BATCH_MAX_OPERATIONS`.
- Credential exposure same as single operations (use environment variables).

### Performance Considerations
- Sequential execution means total time = sum of individual operation times.
- Future parallel execution could reduce latency significantly.
- Rollback adds overhead; atomic mode slower than best-effort.
- Network round-trips reduced from N to 1 (MCP client to server).

### Incremental Rollout Plan
1. Implement batch operation validation and parsing.
2. Add sequential execution logic for best-effort mode.
3. Implement rollback strategy for atomic mode.
4. Add `dav_batch_request` tool with schema.
5. Add timeout handling and resource cleanup.
6. Update README with batch operation examples.
7. Add unit tests for validation, execution, rollback.
8. Add integration tests with mock WebDAV server.

### Testing Strategy
- Unit tests for operation validation (max size, duplicate IDs).
- Tests for best-effort mode with mixed success/failure.
- Tests for atomic mode with rollback on failure.
- Tests for rollback strategy correctness (PUT → DELETE, MKCOL → DELETE).
- Integration tests simulating network failures, timeouts.
- Performance tests with large batches (e.g. 100 operations).

### Open Questions
- Should we support operation dependencies (e.g. op2 depends on op1 success)? (Future: explicit dependency graph.)
- Provide progress updates for long-running batches? (Future: streaming results.)
- Support nested batches? (Initially no.)
- Parallel execution safety: how to detect conflicting operations? (Future: path-based conflict detection.)

### Future Extensions
- Parallel execution mode with dependency analysis.
- Transaction support via WebDAV TRANSACTION extension (RFC 3253 section 13).
- Conditional execution (if-modified-since, etag matching across batch).
- Progress notifications (emit partial results as operations complete).
- Batch templates (predefined batch operation sequences).
- Rollback capture for PROPPATCH (store previous property values).

### Example Conversation (Human ↔ Agent)

```
Human: Upload three files to /documents/ in one go.

Agent: I will batch upload the files.
Agent Tool Invocation:
{
  "name": "dav_batch_request",
  "arguments": {
    "operations": [
      {
        "id": "upload-readme",
        "method": "PUT",
        "path": "/documents/README.md",
        "body": "# Project Documentation"
      },
      {
        "id": "upload-license",
        "method": "PUT",
        "path": "/documents/LICENSE",
        "body": "MIT License ..."
      },
      {
        "id": "upload-notes",
        "method": "PUT",
        "path": "/documents/notes.txt",
        "body": "Meeting notes ..."
      }
    ],
    "mode": "atomic"
  }
}

Tool Response:
{
  "mode": "atomic",
  "overallSuccess": true,
  "results": [
    {"id": "upload-readme", "success": true, "status": 201},
    {"id": "upload-license", "success": true, "status": 201},
    {"id": "upload-notes", "success": true, "status": 201}
  ]
}

Agent: All three files uploaded successfully.

## Rating and Rationale

**Score: 6/10**

This proposal receives a moderate score for the following reasons:

**Suitability (Moderate):** Batch operations are useful for reducing network round-trips and improving efficiency for bulk operations. This is a legitimate need for WebDAV usage, particularly for operations like bulk deletes, multi-file uploads, or directory structure creation.

**Goodness-of-fit (Moderate):** The proposal builds on the existing `dav_request` tool by adding orchestration logic. However, it's purely client-side batching (sequential execution), not true server-side batch processing. While this maintains compatibility with all WebDAV servers, it provides limited performance benefits beyond reducing MCP client-to-server round-trips.

**Value Delivered (Moderate):** Users gain convenience through consolidated operations and better error handling (atomic vs. best-effort modes). The detailed per-operation results are valuable for troubleshooting. However, since operations execute sequentially, the latency savings are minimal—the main benefit is reduced API calls and better error handling.

**Limited Scope Expansion (Concerning):** This proposal has significant complexity and potential for scope creep: (1) The rollback strategy is complex and incomplete (cannot rollback DELETE operations), (2) The atomic mode introduces transaction-like semantics that are inherently problematic without server support, (3) Future extensions mention parallel execution, server-side transactions, and complex dependency management—all of which would substantially increase complexity, and (4) Security implications of batch operations (amplified malicious requests, DoS potential) require careful handling.

The proposal is honest about limitations (sequential execution only, best-effort rollback) but the atomic mode may create false expectations about transactional guarantees. Implementation and testing complexity are high relative to value delivered.