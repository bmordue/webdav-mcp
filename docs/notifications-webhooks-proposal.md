# Proposal: Notification and Webhook Integration

## Summary
Enable the WebDAV MCP server to subscribe to server-side events and changes, delivering real-time notifications to MCP clients via webhooks or polling mechanisms. This allows agents and applications to react to resource modifications, creation, deletion, and property changes without continuous polling.

## Goals
- Subscribe to WebDAV server events (file creation, modification, deletion, property changes).
- Support standard WebDAV notification mechanisms where available.
- Provide polling-based change detection as fallback for servers without native notification support.
- Expose subscription management tools (create, list, cancel subscriptions).
- Deliver notifications to configurable webhook endpoints.
- Support filtering notifications by resource path, event type, and properties.
- Maintain subscription state across server restarts (persistent storage).

## Non-Goals
- Real-time bidirectional communication (WebSocket); use HTTP webhooks.
- Complex event aggregation or buffering (deliver events as they occur).
- Cross-server event federation.
- Guaranteed delivery semantics (best-effort webhook delivery).
- Event replay or historical event querying.

## User Stories
1. As a user, I can subscribe to notifications for a specific directory to be alerted when files are added.
2. As an agent, I can react to file modifications by triggering automated processing workflows.
3. As an operator, I can monitor a WebDAV server for compliance events (e.g. locked files).
4. As a developer, I can integrate WebDAV changes into CI/CD pipelines via webhooks.
5. As a system administrator, I can track resource deletions for audit purposes.

## Use Cases
- Automated backup triggers when files are modified.
- Real-time synchronisation between WebDAV server and external systems.
- Collaborative workflow notifications (document checked out by user X).
- Security monitoring (unusual file access patterns).
- Content publishing pipelines (trigger build when content changes).

## Design Overview
Introduce new MCP tools for notification management:

1. `dav_subscribe`
   - Create a subscription for events on specified resources.
2. `dav_list_subscriptions`
   - List active subscriptions.
3. `dav_unsubscribe`
   - Cancel an existing subscription.
4. `dav_get_notifications`
   - Retrieve pending notifications (polling mode).

### Notification Mechanisms

**Server-native (WebDAV SUBSCRIBE)**: If server supports RFC 5789 (WebDAV Notifications):
- Use SUBSCRIBE method to create server-side subscriptions.
- Server sends notifications to specified callback URL.
- Requires publicly accessible webhook endpoint.

**Polling-based**: For servers without native notification support:
- Periodically query resource properties (PROPFIND).
- Track changes via etag, last-modified, or custom change tokens.
- Detect differences and generate synthetic notifications.
- Configurable polling interval (default: 60 seconds).

**Hybrid**: Combine both approaches where applicable.

### Subscription Schema
```json
{
  "name": "dav_subscribe",
  "arguments": {
    "path": "/documents",
    "depth": "infinity",
    "events": ["created", "modified", "deleted", "locked", "unlocked"],
    "webhookUrl": "https://example.com/webhook/webdav-events",
    "filters": {
      "pathPattern": "*.pdf",
      "properties": [
        {"name": "getcontenttype", "namespace": "DAV:", "value": "application/pdf"}
      ]
    },
    "pollingInterval": 60
  }
}
```

Response:
```json
{
  "subscriptionId": "sub-abc123",
  "path": "/documents",
  "depth": "infinity",
  "events": ["created", "modified", "deleted", "locked", "unlocked"],
  "webhookUrl": "https://example.com/webhook/webdav-events",
  "mechanism": "polling",
  "createdAt": "2025-01-30T10:00:00Z",
  "expiresAt": "2025-02-30T10:00:00Z"
}
```

### Event Types
Standard events based on WebDAV operations:
- `created`: New resource created (PUT, MKCOL).
- `modified`: Resource content or properties changed (PUT, PROPPATCH).
- `deleted`: Resource deleted (DELETE).
- `moved`: Resource moved or renamed (MOVE).
- `copied`: Resource copied (COPY).
- `locked`: Resource locked (LOCK).
- `unlocked`: Resource unlocked (UNLOCK).
- `versioned`: New version created (CHECKIN in DeltaV).

### Webhook Payload Format
When an event occurs, deliver JSON payload to webhook URL:

```json
{
  "subscriptionId": "sub-abc123",
  "timestamp": "2025-01-30T11:15:30Z",
  "events": [
    {
      "eventId": "evt-xyz789",
      "eventType": "modified",
      "resourcePath": "/documents/report.pdf",
      "timestamp": "2025-01-30T11:15:30Z",
      "properties": {
        "getlastmodified": "2025-01-30T11:15:30Z",
        "getetag": "\"abc123def456\"",
        "getcontentlength": "524288"
      },
      "previousEtag": "\"old123etag456\""
    }
  ]
}
```

### Polling-based Change Detection
For servers without native notification support:

1. On subscription creation, capture baseline state:
   - PROPFIND on subscribed path with specified depth.
   - Store resource hrefs, etags, last-modified dates, content lengths.
2. Periodically (every `pollingInterval` seconds):
   - PROPFIND on subscribed path.
   - Compare current state with stored baseline.
   - Detect changes:
     - New hrefs → `created` events.
     - Missing hrefs → `deleted` events.
     - Changed etag/last-modified → `modified` events.
   - Update baseline with current state.
   - Generate and deliver notifications for detected changes.

### Subscription Storage
Persist subscriptions to survive server restarts:
- Storage location: configurable via `DAV_SUBSCRIPTIONS_FILE` (default: `./subscriptions.json`).
- Format: JSON array of subscription objects.
- Load on startup; save on create/delete.

Example storage:
```json
[
  {
    "subscriptionId": "sub-abc123",
    "path": "/documents",
    "depth": "infinity",
    "events": ["created", "modified", "deleted"],
    "webhookUrl": "https://example.com/webhook",
    "mechanism": "polling",
    "pollingInterval": 60,
    "createdAt": "2025-01-30T10:00:00Z",
    "expiresAt": "2025-02-30T10:00:00Z",
    "baseline": {
      "/documents/file1.pdf": {"etag": "\"abc123\"", "lastModified": "2025-01-29T10:00:00Z"},
      "/documents/file2.pdf": {"etag": "\"def456\"", "lastModified": "2025-01-28T14:30:00Z"}
    }
  }
]
```

### Webhook Delivery
- Use HTTP POST to deliver notifications.
- Include `X-WebDAV-Subscription-ID` header with subscription ID.
- Retry on failure: exponential backoff (1s, 2s, 4s, 8s, 16s, give up).
- Log delivery failures to stderr.
- Optionally cancel subscription after N consecutive failures (configurable).

### List Subscriptions
```json
{
  "name": "dav_list_subscriptions",
  "arguments": {}
}
```

Response:
```json
{
  "subscriptions": [
    {
      "subscriptionId": "sub-abc123",
      "path": "/documents",
      "depth": "infinity",
      "events": ["created", "modified", "deleted"],
      "webhookUrl": "https://example.com/webhook",
      "mechanism": "polling",
      "createdAt": "2025-01-30T10:00:00Z",
      "expiresAt": "2025-02-30T10:00:00Z"
    }
  ]
}
```

### Unsubscribe
```json
{
  "name": "dav_unsubscribe",
  "arguments": {
    "subscriptionId": "sub-abc123"
  }
}
```

Response:
```json
{
  "success": true,
  "message": "Subscription sub-abc123 cancelled"
}
```

### Get Notifications (Polling Mode Alternative)
For clients without webhook endpoints, provide polling API:

```json
{
  "name": "dav_get_notifications",
  "arguments": {
    "subscriptionId": "sub-abc123",
    "since": "2025-01-30T10:00:00Z"
  }
}
```

Response:
```json
{
  "subscriptionId": "sub-abc123",
  "notifications": [
    {
      "eventId": "evt-xyz789",
      "eventType": "modified",
      "resourcePath": "/documents/report.pdf",
      "timestamp": "2025-01-30T11:15:30Z"
    }
  ],
  "hasMore": false
}
```

Store notifications in memory (limited buffer, e.g. last 1000 events) or file-based queue.

### Validation Rules
- `path`: valid resource path.
- `depth`: "0", "1", or "infinity".
- `events`: array of valid event types.
- `webhookUrl`: valid HTTP/HTTPS URL (or omit for polling mode).
- `pollingInterval`: minimum 10 seconds, maximum 3600 seconds.
- `expiresAt`: optional; default 30 days from creation.

### Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `DAV_SUBSCRIPTIONS_FILE` | Subscription persistence file | `./subscriptions.json` |
| `DAV_NOTIFICATION_BUFFER_SIZE` | Max notifications to buffer | `1000` |
| `DAV_WEBHOOK_TIMEOUT_MS` | Timeout for webhook delivery | `5000` (5s) |
| `DAV_WEBHOOK_MAX_RETRIES` | Max retry attempts for failed webhooks | `5` |
| `DAV_POLLING_MIN_INTERVAL` | Minimum polling interval (seconds) | `10` |

### Data Structures (TypeScript)
```ts
interface Subscription {
  subscriptionId: string;
  path: string;
  depth: "0" | "1" | "infinity";
  events: EventType[];
  webhookUrl?: string;
  filters?: SubscriptionFilters;
  mechanism: "server-native" | "polling";
  pollingInterval?: number; // seconds
  createdAt: string; // ISO 8601
  expiresAt?: string; // ISO 8601
  baseline?: Record<string, ResourceState>; // for polling
}

type EventType = "created" | "modified" | "deleted" | "moved" | "copied" | "locked" | "unlocked" | "versioned";

interface SubscriptionFilters {
  pathPattern?: string; // glob pattern
  properties?: PropertyCriterion[];
}

interface ResourceState {
  etag?: string;
  lastModified?: string;
  contentLength?: string;
}

interface NotificationEvent {
  eventId: string;
  eventType: EventType;
  resourcePath: string;
  timestamp: string;
  properties?: Record<string, string>;
  previousEtag?: string;
}

interface WebhookPayload {
  subscriptionId: string;
  timestamp: string;
  events: NotificationEvent[];
}
```

### Error Modes
- Webhook URL unreachable: retry with exponential backoff; log failures.
- Invalid subscription ID in unsubscribe: return error.
- Polling interval too short: validation error with minimum value.
- Server-native subscription fails: fallback to polling mode.
- Subscription expired: auto-delete and notify via final webhook.

### Security Considerations
- Webhook URLs must be validated (HTTPS preferred; HTTP allowed with warning).
- Avoid exposing sensitive data in webhook payloads; include hrefs only, require subsequent fetch for details.
- Rate-limit subscription creation (e.g. max 100 subscriptions).
- Webhook retry backoff prevents DoS on external endpoints.
- Subscription expiry prevents resource leaks.

### Performance Considerations
- Polling-based mechanism generates periodic PROPFIND requests; ensure reasonable intervals.
- Large directory trees with `depth: infinity` expensive; warn users.
- Baseline state storage grows with resource count; consider periodic cleanup.
- Webhook delivery failures add retry overhead; limit retries.

### Incremental Rollout Plan
1. Implement subscription storage (load/save JSON).
2. Add `dav_subscribe` tool with validation and persistence.
3. Implement polling-based change detection algorithm.
4. Add background polling scheduler.
5. Implement webhook delivery with retry logic.
6. Add `dav_list_subscriptions`, `dav_unsubscribe` tools.
7. Add `dav_get_notifications` for polling mode.
8. Optional: detect and use server-native SUBSCRIBE if available.
9. Update README with notification examples.
10. Add unit tests for change detection, webhook delivery, subscription management.

### Testing Strategy
- Unit tests for baseline state comparison and change detection.
- Tests for subscription validation and storage.
- Tests for webhook delivery and retry logic.
- Integration tests with mock webhook endpoint.
- Tests for subscription expiry and cleanup.
- Performance tests with large directory trees.

### Open Questions
- Support batching notifications (deliver multiple events in single webhook call)? (Yes, as shown in payload format.)
- Provide notification filtering at client side (after delivery)? (Initially no; filter at subscription level.)
- Allow subscription modification (change filters/events)? (Initially no; unsubscribe and re-subscribe.)
- Support multiple webhook URLs per subscription? (Future: webhook URL array.)

### Future Extensions
- WebSocket-based real-time notifications (alternative to webhooks).
- Server-native subscription support (SUBSCRIBE method, RFC 5789).
- Notification acknowledgment and replay.
- Dead-letter queue for failed webhook deliveries.
- Notification transformation and filtering rules.
- Subscription sharing between multiple MCP server instances.

### Example Conversation (Human ↔ Agent)

```
Human: Subscribe to changes in /documents directory and send notifications to my webhook.

Agent: I will create a subscription for the /documents directory.
Agent Tool Invocation:
{
  "name": "dav_subscribe",
  "arguments": {
    "path": "/documents",
    "depth": "1",
    "events": ["created", "modified", "deleted"],
    "webhookUrl": "https://example.com/webhook/dav-events",
    "pollingInterval": 60
  }
}

Tool Response:
{
  "subscriptionId": "sub-abc123",
  "path": "/documents",
  "depth": "1",
  "events": ["created", "modified", "deleted"],
  "webhookUrl": "https://example.com/webhook/dav-events",
  "mechanism": "polling",
  "createdAt": "2025-01-30T10:00:00Z",
  "expiresAt": "2025-02-30T10:00:00Z"
}

Agent: Subscription created (ID: sub-abc123). You will receive webhook notifications for file changes in /documents.

---

[Later, when a file is modified, webhook receives:]

POST https://example.com/webhook/dav-events
X-WebDAV-Subscription-ID: sub-abc123
Content-Type: application/json

{
  "subscriptionId": "sub-abc123",
  "timestamp": "2025-01-30T11:15:30Z",
  "events": [
    {
      "eventId": "evt-xyz789",
      "eventType": "modified",
      "resourcePath": "/documents/report.pdf",
      "timestamp": "2025-01-30T11:15:30Z",
      "properties": {
        "getlastmodified": "2025-01-30T11:15:30Z",
        "getetag": "\"abc123def456\""
      }
    }
  ]
}
```

## Conclusion
This notification and webhook integration feature enables reactive workflows, real-time synchronisation, and event-driven automation for WebDAV resources. By supporting both server-native and polling-based mechanisms, the feature provides broad compatibility while offering optimal performance where supported. The persistent subscription model ensures reliability across server restarts, and the webhook delivery system enables seamless integration with external systems and workflows.