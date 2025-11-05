# Proposal: Versioning Support (DeltaV)

## Summary
Implement support for WebDAV versioning extensions (DeltaV protocol, RFC 3253) to enable version control operations on WebDAV resources, including version history querying, checking out resources for editing, checking in new versions, and retrieving historical versions of files.

## Goals
- Enable basic versioning operations: checkout, checkin, uncheckout.
- Allow querying version history for versioned resources.
- Support retrieving specific historical versions.
- Provide version property querying (version names, creation dates, authors).
- Detect and report server versioning capabilities.
- Maintain backward compatibility with non-versioning WebDAV servers.
- Integrate with existing tools where appropriate.

## Non-Goals
- Advanced branching and merging (focus on linear version history initially).
- Workspace management (complex DeltaV feature; future extension).
- Baseline and configuration management (advanced DeltaV features).
- Automatic conflict resolution (user/agent must handle conflicts).
- Version metadata beyond standard DeltaV properties.

## User Stories
1. As a user, I can check out a document for editing, preventing concurrent modifications.
2. As a user, I can check in a modified document, creating a new version in the history.
3. As an agent, I can query the version history of a file to understand its evolution.
4. As an operator, I can retrieve a specific historical version for audit or recovery.
5. As a developer, I can cancel a checkout (uncheckout) if changes are no longer needed.

## Use Cases
- Document management systems requiring version control.
- Collaborative editing with exclusive write locks.
- Audit trails for regulatory compliance.
- Content recovery (restore previous version after error).
- Tracking changes to configuration files or data.

## Design Overview
Introduce new MCP tools for versioning operations:

1. `dav_version_control`
   - Enable version control on a resource (VERSION-CONTROL method).
2. `dav_checkout`
   - Check out a version-controlled resource for editing (CHECKOUT method).
3. `dav_checkin`
   - Check in changes, creating a new version (CHECKIN method).
4. `dav_uncheckout`
   - Cancel checkout, discarding changes (UNCHECKOUT method).
5. `dav_version_history`
   - Query version history for a resource (PROPFIND on version history resource).
6. `dav_get_version`
   - Retrieve a specific historical version (GET on version URL).
7. `dav_version_capabilities`
   - Query server versioning capabilities (OPTIONS + DASL queries).

### Server Capability Detection
On first use, detect server DeltaV support:
- Send OPTIONS request to DAV_SERVER_URL.
- Check for `DAV: version-control` in response headers.
- Cache capability status (TTL: session lifetime or configurable).
- If versioning not supported, return helpful error from versioning tools.

Example OPTIONS response:
```
DAV: 1, 2, version-control, checkout-in-place
```

### Tool 1: Enable Version Control
```json
{
  "name": "dav_version_control",
  "arguments": {
    "path": "/documents/contract.pdf"
  }
}
```

Sends VERSION-CONTROL request:
```http
VERSION-CONTROL /documents/contract.pdf HTTP/1.1
Host: dav.example.com
```

Response on success (201 Created):
```json
{
  "status": 201,
  "headers": {"location": "/documents/contract.pdf"},
  "message": "Version control enabled",
  "versionHistoryUrl": "/version-history/12345"
}
```

### Tool 2: Checkout
```json
{
  "name": "dav_checkout",
  "arguments": {
    "path": "/documents/contract.pdf"
  }
}
```

Sends CHECKOUT request:
```http
CHECKOUT /documents/contract.pdf HTTP/1.1
Host: dav.example.com
```

Response on success (200 OK):
```json
{
  "status": 200,
  "headers": {},
  "message": "Resource checked out",
  "checkedOut": true
}
```

### Tool 3: Checkin
```json
{
  "name": "dav_checkin",
  "arguments": {
    "path": "/documents/contract.pdf",
    "comment": "Updated terms in section 3"
  }
}
```

Sends CHECKIN request (comment in request body or via property):
```http
CHECKIN /documents/contract.pdf HTTP/1.1
Host: dav.example.com
Content-Type: text/plain

Updated terms in section 3
```

Response on success (201 Created):
```json
{
  "status": 201,
  "headers": {"location": "/version-history/12345/v2"},
  "message": "Version created",
  "versionUrl": "/version-history/12345/v2",
  "versionName": "v2"
}
```

### Tool 4: Uncheckout
```json
{
  "name": "dav_uncheckout",
  "arguments": {
    "path": "/documents/contract.pdf"
  }
}
```

Sends UNCHECKOUT request:
```http
UNCHECKOUT /documents/contract.pdf HTTP/1.1
Host: dav.example.com
```

Response on success (200 OK):
```json
{
  "status": 200,
  "message": "Checkout cancelled"
}
```

### Tool 5: Version History
```json
{
  "name": "dav_version_history",
  "arguments": {
    "path": "/documents/contract.pdf"
  }
}
```

Implementation:
1. PROPFIND on resource to get `version-history` property (href).
2. PROPFIND on version-history URL with `depth: 1` to list versions.
3. Parse multistatus response and extract version details.

Response:
```json
{
  "versionHistoryUrl": "/version-history/12345",
  "versions": [
    {
      "versionName": "v1",
      "versionUrl": "/version-history/12345/v1",
      "creationDate": "2025-01-15T10:00:00Z",
      "creator": "alice",
      "comment": "Initial version"
    },
    {
      "versionName": "v2",
      "versionUrl": "/version-history/12345/v2",
      "creationDate": "2025-01-20T14:30:00Z",
      "creator": "bob",
      "comment": "Updated terms in section 3"
    }
  ]
}
```

### Tool 6: Get Version
```json
{
  "name": "dav_get_version",
  "arguments": {
    "path": "/documents/contract.pdf",
    "versionName": "v1"
  }
}
```

Implementation:
1. Get version history to map versionName to versionUrl.
2. Send GET request to versionUrl.
3. Return version content.

Response:
```json
{
  "status": 200,
  "headers": {"content-type": "application/pdf"},
  "body": "<binary content or base64>",
  "versionName": "v1",
  "versionUrl": "/version-history/12345/v1"
}
```

### Tool 7: Version Capabilities
```json
{
  "name": "dav_version_capabilities",
  "arguments": {}
}
```

Response:
```json
{
  "versioningSupported": true,
  "features": [
    "version-control",
    "checkout-in-place",
    "version-history",
    "checkout",
    "checkin",
    "uncheckout"
  ],
  "workspaceSupported": false,
  "branchingSupported": false
}
```

### Typical Workflow
1. Enable version control: `dav_version_control` (if not already enabled).
2. Check out for editing: `dav_checkout`.
3. Modify resource content: `dav_request` with method PUT.
4. Check in changes: `dav_checkin` (creates new version).

Or, to cancel:
3. Cancel checkout: `dav_uncheckout` (discard changes).

### Integration with Existing Tools
Extend `dav_request` tool schema to optionally support DeltaV methods:
- Add `VERSION-CONTROL`, `CHECKOUT`, `CHECKIN`, `UNCHECKOUT` to allowed methods.
- Provide convenience tools as wrappers with simplified schemas.

Alternatively, keep versioning tools separate for clarity (recommended initially).

### Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `DAV_VERSION_CAPABILITIES_TTL_MS` | Cache TTL for capability detection | `300000` (5 min) |
| `DAV_VERSION_HISTORY_DEPTH` | Max version history entries to retrieve | `100` |

### Data Structures (TypeScript)
```ts
interface VersionInfo {
  versionName: string;
  versionUrl: string;
  creationDate: string; // ISO 8601
  creator?: string;
  comment?: string;
}

interface VersionHistoryResponse {
  versionHistoryUrl: string;
  versions: VersionInfo[];
}

interface VersionCapabilities {
  versioningSupported: boolean;
  features: string[];
  workspaceSupported: boolean;
  branchingSupported: boolean;
}
```

### Error Modes
- Server does not support versioning: return clear error with suggestion to check server capabilities.
- Resource not version-controlled: error suggests enabling version control first.
- Checkout conflict (already checked out by another user): return 423 Locked status with lock owner info.
- Checkin without checkout: error indicating checkout required.
- Version not found: error listing available versions.

### Security Considerations
- Checkout creates exclusive lock; ensure proper timeout and cleanup.
- Version history may contain sensitive data; respect access controls.
- Uncheckout allows discarding changes; confirm user intent in UI/agent.
- Historical versions bypass current permissions; server must enforce access control.

### Performance Considerations
- Version history queries may be expensive for resources with many versions.
- Limit version history depth via `DAV_VERSION_HISTORY_DEPTH`.
- Cache capability detection results to avoid repeated OPTIONS requests.
- Consider pagination for large version histories (future).

### Incremental Rollout Plan
1. Implement server capability detection (OPTIONS parsing).
2. Add VERSION-CONTROL, CHECKOUT, CHECKIN, UNCHECKOUT request methods.
3. Implement version history querying (PROPFIND on version-history).
4. Add version retrieval (GET on version URLs).
5. Add all seven versioning tools with schemas.
6. Update README with versioning examples.
7. Add unit tests for capability detection, request generation.
8. Add integration tests with mock DeltaV server.

### Testing Strategy
- Unit tests for OPTIONS parsing and capability detection.
- Tests for version history parsing from multistatus XML.
- Tests for error handling (versioning not supported, checkout conflicts).
- Integration tests simulating full workflow (enable, checkout, edit, checkin).
- Integration tests for uncheckout and version retrieval.

### Open Questions
- Support auto-versioning (server creates version on every PUT)? (Initially no; explicit checkin only.)
- Provide diff between versions? (Future: compare two version contents.)
- Support version labels (named versions like "release-1.0")? (Future extension.)
- Workspace support for branching? (Future, complex.)

### Future Extensions
- Version comparison and diff generation.
- Version labels and tagging (e.g. "stable", "release-1.0").
- Workspace management for branching.
- Automatic versioning configuration.
- Merge operations for branched versions.
- Version property customisation (additional metadata).

### Example Conversation (Human ↔ Agent)

```
Human: Enable version control on /docs/proposal.md and check it out.

Agent: I will enable versioning and check out the document.
Agent Tool Invocations:
1. dav_version_control with path "/docs/proposal.md"
2. dav_checkout with path "/docs/proposal.md"

Tool Responses:
1. {"status": 201, "message": "Version control enabled"}
2. {"status": 200, "message": "Resource checked out"}

Agent: Versioning enabled and document checked out. You can now edit it.

## Rating and Rationale

**Score: 4/10**

This proposal receives a below-average score for the following reasons:

**Suitability (Poor):** DeltaV (WebDAV versioning extensions, RFC 3253) is a niche protocol that is not widely implemented by WebDAV servers. The proposal itself acknowledges this is an "extension" rather than core WebDAV functionality. Most modern WebDAV servers (like Nextcloud, ownCloud) either don't support DeltaV or have moved to different versioning mechanisms. This makes the feature useful for only a small subset of potential users.

**Goodness-of-fit (Moderate):** The proposal does integrate with existing architecture by adding new methods (VERSION-CONTROL, CHECKOUT, CHECKIN, UNCHECKOUT) to the WebDAV request handling. The capability detection approach is sensible. However, it adds seven new tools specifically for versioning, which significantly expands the API surface area.

**Value Delivered (Low):** For the rare users with DeltaV-capable servers, this provides value for version control workflows. However, given the limited server support, most users won't benefit. Modern document versioning is typically handled at the application layer (Nextcloud, SharePoint) rather than via DeltaV, making this feature redundant for many use cases.

**Limited Scope Expansion (Moderate):** While the proposal explicitly excludes advanced features (branching, merging, workspaces), it still involves significant complexity: (1) Seven new tools with different schemas and behaviors, (2) Version history querying requires PROPFIND on version-history resources, (3) Rollback strategy for uncheckout needs careful implementation, (4) Checkout creates exclusive locks that require timeout and cleanup management. The "future extensions" section lists substantial additional features (version comparison, labeling, workspaces, merging) that would further expand scope.

The implementation requires understanding of DeltaV protocol nuances, XML parsing for version history, and careful handling of concurrent access scenarios. The benefit-to-complexity ratio is poor given limited server support.