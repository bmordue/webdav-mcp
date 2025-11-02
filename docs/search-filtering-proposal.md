# Proposal: Resource Search and Filtering

## Summary
Provide advanced search and filtering capabilities for WebDAV resources, enabling clients to efficiently locate files and collections based on property values, content patterns, metadata criteria, and hierarchical relationships without manually traversing the entire directory tree.

## Goals
- Enable property-based search (e.g. find all files modified after date X).
- Support content search within text files (full-text or pattern matching).
- Allow hierarchical scope specification (search within subtree).
- Provide sorting and pagination for large result sets.
- Integrate with existing property presets for consistent result formatting.
- Leverage DASL (WebDAV Search and Locate) protocol where server supports it.
- Fallback to client-side filtering when server lacks DASL support.

## Non-Goals
- Indexing or caching search results server-side (client responsibility).
- Complex query languages (keep syntax simple and declarative).
- Real-time search result updates (search is point-in-time snapshot).
- Cross-server federated search (single DAV_SERVER_URL only).

## User Stories
1. As a user, I can find all PDF files larger than 10MB modified in the last week.
2. As a user, I can search for files containing specific text within their content.
3. As an agent, I can locate all resources with a specific custom property value.
4. As an operator, I can find all locked resources across the entire server.
5. As a developer, I can filter collections by creation date and sort by name.

## Use Cases
- Document management (find contracts by date, type, author).
- Media library search (photos by camera model, date taken, GPS coordinates).
- Audit and compliance (locate files not accessed in 2 years).
- Backup scheduling (find files modified since last backup).
- Content migration (identify resources by type for migration planning).

## Design Overview
Introduce two new MCP tools:

1. `dav_search`
   - Input: search criteria, scope, sorting, pagination.
   - Output: array of matching resources with properties.
2. `dav_advanced_search` (optional future extension)
   - Supports complex queries with AND/OR/NOT logic.

### Search Criteria Specification
Use declarative JSON criteria rather than query language string:

```json
{
  "scope": "/documents",
  "depth": "infinity",
  "criteria": {
    "properties": [
      {
        "name": "getlastmodified",
        "namespace": "DAV:",
        "operator": "greater_than",
        "value": "2025-01-01T00:00:00Z"
      },
      {
        "name": "getcontenttype",
        "namespace": "DAV:",
        "operator": "equals",
        "value": "application/pdf"
      }
    ],
    "content": {
      "pattern": "invoice",
      "caseSensitive": false
    }
  },
  "sort": {
    "property": {"name": "getlastmodified", "namespace": "DAV:"},
    "direction": "descending"
  },
  "limit": 50,
  "offset": 0,
  "preset": "basic"
}
```

### Supported Operators
For property comparisons:
- `equals` / `not_equals`
- `greater_than` / `less_than` / `greater_or_equal` / `less_or_equal`
- `contains` / `not_contains` (substring match)
- `matches` (regex pattern, optional)
- `exists` / `not_exists` (property presence)

### Execution Modes

**Server-side (DASL)**: If server supports DASL (detected via OPTIONS request or configuration):
- Translate criteria to DASL SEARCH request XML.
- Submit SEARCH request to server.
- Parse multistatus response and return results.

**Client-side (fallback)**: If server lacks DASL support:
- Perform recursive PROPFIND to gather resources.
- Filter results locally based on criteria.
- Apply sorting and pagination locally.
- Warning: may be slow for large hierarchies.

Configuration: `DAV_SEARCH_MODE` environment variable: `auto` (default), `server-only`, `client-only`.

### DASL XML Generation (Server-side Mode)
Example SEARCH request for "find PDFs modified after 2025-01-01":

```xml
<?xml version="1.0" encoding="utf-8" ?>
<D:searchrequest xmlns:D="DAV:">
  <D:basicsearch>
    <D:select>
      <D:prop>
        <D:displayname/>
        <D:getcontentlength/>
        <D:getlastmodified/>
      </D:prop>
    </D:select>
    <D:from>
      <D:scope>
        <D:href>/documents</D:href>
        <D:depth>infinity</D:depth>
      </D:scope>
    </D:from>
    <D:where>
      <D:and>
        <D:eq>
          <D:prop><D:getcontenttype/></D:prop>
          <D:literal>application/pdf</D:literal>
        </D:eq>
        <D:gt>
          <D:prop><D:getlastmodified/></D:prop>
          <D:literal>2025-01-01T00:00:00Z</D:literal>
        </D:gt>
      </D:and>
    </D:where>
  </D:basicsearch>
</D:searchrequest>
```

### Response Format
```json
{
  "matches": [
    {
      "href": "/documents/invoice-2025-01-15.pdf",
      "properties": {
        "displayname": "invoice-2025-01-15.pdf",
        "getcontentlength": "245678",
        "getlastmodified": "2025-01-15T14:30:00Z",
        "getcontenttype": "application/pdf"
      }
    },
    {
      "href": "/documents/report-Q1.pdf",
      "properties": {
        "displayname": "report-Q1.pdf",
        "getcontentlength": "1024000",
        "getlastmodified": "2025-01-20T09:15:00Z",
        "getcontenttype": "application/pdf"
      }
    }
  ],
  "totalMatches": 2,
  "hasMore": false,
  "searchMode": "server"
}
```

### Client-side Filtering Algorithm
1. Perform PROPFIND with `depth: infinity` on scope path.
2. Parse multistatus response into resource list.
3. For each resource, evaluate property criteria:
   - Extract property values from PROPFIND response.
   - Apply operator logic (equals, greater_than, contains, etc.).
   - Include resource if all criteria match (AND logic).
4. If content search specified, fetch resource content (GET) and search:
   - Skip for collections and non-text types.
   - Apply pattern matching.
5. Sort results by specified property and direction.
6. Apply pagination (offset, limit).
7. Return filtered and paginated results.

Note: Client-side content search is expensive (requires GET for each candidate file); provide warning in response.

### Validation Rules
- `scope`: must be valid path.
- `depth`: one of "0", "1", "infinity".
- `criteria.properties`: array of property criteria, each with name, namespace, operator, value.
- `operator`: one of supported operators.
- `value`: type-appropriate (string, number, ISO date).
- `sort.property`: valid property reference.
- `sort.direction`: "ascending" or "descending".
- `limit`: positive integer, max 1000 (configurable via `DAV_SEARCH_MAX_RESULTS`).
- `offset`: non-negative integer.

### Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `DAV_SEARCH_MODE` | Search mode: auto, server-only, client-only | `auto` |
| `DAV_SEARCH_MAX_RESULTS` | Maximum results per search | `1000` |
| `DAV_SEARCH_TIMEOUT_MS` | Timeout for search operation | `30000` (30s) |
| `DAV_SEARCH_CONTENT_MAX_SIZE` | Max file size for content search (bytes) | `1048576` (1MB) |

### Data Structures (TypeScript)
```ts
interface PropertyCriterion {
  name: string;
  namespace: string;
  operator: "equals" | "not_equals" | "greater_than" | "less_than" | 
            "greater_or_equal" | "less_or_equal" | "contains" | 
            "not_contains" | "matches" | "exists" | "not_exists";
  value?: string | number;
}

interface ContentCriterion {
  pattern: string;
  caseSensitive?: boolean;
  regex?: boolean;
}

interface SearchCriteria {
  properties?: PropertyCriterion[];
  content?: ContentCriterion;
}

interface SearchArgs {
  scope: string;
  depth?: "0" | "1" | "infinity";
  criteria: SearchCriteria;
  sort?: {
    property: {name: string; namespace: string};
    direction: "ascending" | "descending";
  };
  limit?: number;
  offset?: number;
  preset?: string; // property preset for result formatting
}

interface SearchResult {
  href: string;
  properties: Record<string, string>;
}

interface SearchResponse {
  matches: SearchResult[];
  totalMatches: number;
  hasMore: boolean;
  searchMode: "server" | "client";
  warnings?: string[];
}
```

### Error Modes
- Server-only mode but server lacks DASL support: return error suggesting client mode.
- Invalid criteria (e.g. regex syntax error): validation error before execution.
- Timeout during search: return partial results with warning.
- Content search on binary file: skip with warning.
- Permission denied on some resources: continue search, note in warnings.

### Security Considerations
- Client-side search may fetch many resources; enforce timeout and result limits.
- Content search could expose sensitive data; respect server access controls.
- Regex patterns could cause ReDoS; sanitise or limit complexity.
- Large searches may cause DoS; enforce `DAV_SEARCH_MAX_RESULTS`.

### Performance Considerations
- Server-side search (DASL) is efficient; offloads work to server.
- Client-side search requires full tree traversal; expensive for large hierarchies.
- Content search requires GET for each candidate; very expensive.
- Provide warnings when client-side mode is used or content search is requested.
- Consider caching PROPFIND results for repeated searches (future).

### Incremental Rollout Plan
1. Implement property criteria parsing and validation.
2. Add client-side filtering logic (PROPFIND + local filter).
3. Implement sorting and pagination.
4. Add DASL XML generation and server-side search support.
5. Add server capability detection (OPTIONS request).
6. Implement content search (with warnings).
7. Add `dav_search` tool schema and handler.
8. Update README with search examples.
9. Add unit tests for criteria parsing, filtering, DASL XML generation.
10. Add integration tests with mock DASL-capable server.

### Testing Strategy
- Unit tests for criteria validation and operator logic.
- Tests for DASL XML generation from criteria.
- Tests for client-side filtering algorithm correctness.
- Tests for sorting and pagination.
- Integration tests with mock server (both DASL and non-DASL).
- Performance tests with large result sets (e.g. 10,000 resources).

### Open Questions
- Support logical OR between criteria? (Initially AND only; future: explicit AND/OR tree.)
- Allow negation of entire criteria groups? (Future: NOT operator.)
- Provide query builder tool for clients? (Future: interactive query construction.)
- Cache search results? (Initially no; client responsibility.)

### Future Extensions
- Complex query language with AND/OR/NOT trees.
- Saved searches (similar to saved queries).
- Search result subscriptions (notify when new matches appear).
- Faceted search (group results by property values).
- Fuzzy matching and relevance scoring.
- Index-backed search for better performance.

### Example Conversation (Human ↔ Agent)

```
Human: Find all large PDF files modified this year.

Agent: I will search for PDFs over a certain size modified in 2025.
Agent Tool Invocation:
{
  "name": "dav_search",
  "arguments": {
    "scope": "/",
    "depth": "infinity",
    "criteria": {
      "properties": [
        {
          "name": "getcontenttype",
          "namespace": "DAV:",
          "operator": "equals",
          "value": "application/pdf"
        },
        {
          "name": "getcontentlength",
          "namespace": "DAV:",
          "operator": "greater_than",
          "value": "10485760"
        },
        {
          "name": "getlastmodified",
          "namespace": "DAV:",
          "operator": "greater_or_equal",
          "value": "2025-01-01T00:00:00Z"
        }
      ]
    },
    "sort": {
      "property": {"name": "getcontentlength", "namespace": "DAV:"},
      "direction": "descending"
    },
    "limit": 20
  }
}

Tool Response:
{
  "matches": [
    {
      "href": "/documents/annual-report-2025.pdf",
      "properties": {
        "getcontentlength": "52428800",
        "getlastmodified": "2025-01-30T10:00:00Z"
      }
    },
    {
      "href": "/archive/presentation.pdf",
      "properties": {
        "getcontentlength": "15728640",
        "getlastmodified": "2025-02-15T14:30:00Z"
      }
    }
  ],
  "totalMatches": 2,
  "hasMore": false,
  "searchMode": "server"
}

Agent: Found 2 large PDFs: annual-report-2025.pdf (50MB) and presentation.pdf (15MB).