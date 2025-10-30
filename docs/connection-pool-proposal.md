# Proposal: Connection Pool and Multi-Server Support

## Summary
Enhance the WebDAV MCP server to support multiple WebDAV server connections simultaneously, with intelligent connection pooling, automatic failover, and load balancing across server instances. This enables agents to work with multiple WebDAV endpoints, mirror operations across servers, and improve reliability through redundancy.

## Goals
- Support connecting to multiple WebDAV servers concurrently.
- Provide server profiles for managing multiple endpoint configurations.
- Implement connection pooling for improved performance and resource utilisation.
- Enable automatic failover to backup servers when primary server is unavailable.
- Support load balancing strategies (round-robin, random, least-connections).
- Allow operations to target specific servers or server groups.
- Maintain backward compatibility with single-server configuration.
- Persist connection pool state and server health metrics.

## Non-Goals
- Cross-server transaction coordination (distributed transactions).
- Automatic data synchronisation between servers (user/agent responsibility).
- Server discovery or auto-configuration (manual server profile setup).
- Advanced routing logic (complex conditional server selection).
- Connection multiplexing over single TCP connection (use HTTP/2 features).

## User Stories
1. As a user, I can configure backup WebDAV servers for automatic failover.
2. As an agent, I can replicate files to multiple servers for redundancy.
3. As an operator, I can distribute load across multiple WebDAV server instances.
4. As a developer, I can work with development, staging, and production servers from one MCP instance.
5. As a system administrator, I can monitor server health and connection pool statistics.

## Use Cases
- High availability deployments with failover.
- Multi-region file distribution (replicate to servers in different regions).
- Development workflow (switch between dev/staging/prod environments).
- Load distribution for read-heavy operations.
- Gradual migration from one WebDAV server to another.

## Design Overview
Introduce new MCP tools for multi-server management:

1. `dav_add_server`
   - Add a new server profile to the connection pool.
2. `dav_list_servers`
   - List configured server profiles with health status.
3. `dav_remove_server`
   - Remove a server profile from the pool.
4. `dav_set_active_server`
   - Set the default active server for operations.
5. `dav_pool_stats`
   - Get connection pool statistics and health metrics.

Extend existing `dav_request` tool:
- Add optional `serverId` parameter to target specific server.
- Add optional `serverGroup` parameter to target all servers in a group.

### Server Profile Schema
```json
{
  "serverId": "production",
  "url": "https://dav.example.com/remote.php/webdav/",
  "username": "alice",
  "password": "s3cret",
  "priority": 1,
  "group": "prod",
  "maxConnections": 10,
  "timeout": 30000,
  "retryAttempts": 3,
  "healthCheckInterval": 60,
  "enabled": true
}
```

### Server Groups
Organise servers into logical groups:
- `primary`: Main production servers.
- `backup`: Failover servers.
- `dev`: Development servers.
- `staging`: Staging environment.
- Custom groups as needed.

### Add Server Profile
```json
{
  "name": "dav_add_server",
  "arguments": {
    "serverId": "backup-eu",
    "url": "https://backup.example.com/webdav/",
    "username": "alice",
    "password": "s3cret",
    "priority": 2,
    "group": "backup",
    "maxConnections": 5,
    "enabled": true
  }
}
```

Response:
```json
{
  "success": true,
  "serverId": "backup-eu",
  "message": "Server profile added",
  "poolSize": 3
}
```

### List Servers
```json
{
  "name": "dav_list_servers",
  "arguments": {
    "includeHealth": true
  }
}
```

Response:
```json
{
  "servers": [
    {
      "serverId": "production",
      "url": "https://dav.example.com/webdav/",
      "priority": 1,
      "group": "primary",
      "enabled": true,
      "health": {
        "status": "healthy",
        "lastCheck": "2025-01-30T12:00:00Z",
        "responseTime": 45,
        "uptime": 99.9
      },
      "connections": {
        "active": 2,
        "idle": 3,
        "max": 10
      }
    },
    {
      "serverId": "backup-eu",
      "url": "https://backup.example.com/webdav/",
      "priority": 2,
      "group": "backup",
      "enabled": true,
      "health": {
        "status": "healthy",
        "lastCheck": "2025-01-30T12:00:00Z",
        "responseTime": 120,
        "uptime": 98.5
      },
      "connections": {
        "active": 0,
        "idle": 2,
        "max": 5
      }
    }
  ],
  "activeServerId": "production"
}
```

### Remove Server
```json
{
  "name": "dav_remove_server",
  "arguments": {
    "serverId": "backup-eu"
  }
}
```

Response:
```json
{
  "success": true,
  "message": "Server backup-eu removed from pool"
}
```

### Set Active Server
```json
{
  "name": "dav_set_active_server",
  "arguments": {
    "serverId": "staging"
  }
}
```

Response:
```json
{
  "success": true,
  "previousServerId": "production",
  "activeServerId": "staging"
}
```

### Pool Statistics
```json
{
  "name": "dav_pool_stats",
  "arguments": {}
}
```

Response:
```json
{
  "totalServers": 3,
  "healthyServers": 2,
  "unhealthyServers": 1,
  "totalConnections": {
    "active": 5,
    "idle": 12,
    "max": 25
  },
  "requestStats": {
    "total": 1543,
    "successful": 1520,
    "failed": 23,
    "failoverCount": 8
  },
  "averageResponseTime": 67
}
```

### Extended dav_request with Server Targeting
```json
{
  "name": "dav_request",
  "arguments": {
    "method": "PROPFIND",
    "path": "/",
    "depth": "1",
    "serverId": "backup-eu"
  }
}
```

Or target all servers in a group:
```json
{
  "name": "dav_request",
  "arguments": {
    "method": "PUT",
    "path": "/backup/important.txt",
    "body": "critical data",
    "serverGroup": "backup"
  }
}
```

Response for group operation:
```json
{
  "results": [
    {
      "serverId": "backup-eu",
      "success": true,
      "status": 201,
      "headers": {},
      "body": ""
    },
    {
      "serverId": "backup-us",
      "success": true,
      "status": 201,
      "headers": {},
      "body": ""
    }
  ]
}
```

### Connection Pooling
Maintain connection pool per server:
- Pre-establish connections up to `maxConnections`.
- Reuse idle connections for subsequent requests.
- Close idle connections after timeout (configurable TTL).
- Create new connections on demand when pool exhausted.
- Use HTTP Keep-Alive for connection reuse.

### Failover Strategy
When request to primary server fails:
1. Check if failover is enabled (`DAV_FAILOVER_ENABLED`, default true).
2. Select backup server based on priority (lower priority number = higher priority).
3. Retry request on backup server.
4. If backup succeeds, log failover event.
5. Continue using backup until health check shows primary recovered.
6. Optionally notify via webhook/log when failover occurs.

Failover triggers:
- Network errors (connection refused, timeout).
- 5xx server errors (500, 502, 503, 504).
- Repeated 4xx errors (configurable threshold).

### Load Balancing Strategies
When multiple servers have same priority:
- **round-robin**: Cycle through servers sequentially.
- **random**: Select random server from pool.
- **least-connections**: Select server with fewest active connections.
- **response-time**: Select server with lowest average response time.

Configuration: `DAV_LOAD_BALANCE_STRATEGY` environment variable.

### Health Checks
Periodically check server health:
- Send OPTIONS or lightweight PROPFIND to server.
- Measure response time and success.
- Mark server unhealthy after N consecutive failures.
- Mark server healthy after M consecutive successes.
- Interval configurable via `healthCheckInterval` per server.

Health status:
- `healthy`: Server responding normally.
- `degraded`: Server responding slowly or with occasional errors.
- `unhealthy`: Server not responding or consistently failing.

### Server Profile Storage
Persist server profiles to survive restarts:
- Storage location: `DAV_SERVERS_FILE` (default: `./servers.json`).
- Encrypt sensitive fields (passwords) using simple encryption or external secret manager.
- Load on startup; save on add/remove/update.

Example storage:
```json
{
  "activeServerId": "production",
  "servers": [
    {
      "serverId": "production",
      "url": "https://dav.example.com/webdav/",
      "username": "alice",
      "passwordEncrypted": "encrypted-value",
      "priority": 1,
      "group": "primary",
      "maxConnections": 10,
      "timeout": 30000,
      "retryAttempts": 3,
      "healthCheckInterval": 60,
      "enabled": true
    }
  ]
}
```

### Backward Compatibility
When no server profiles configured:
- Use environment variables (`DAV_SERVER_URL`, `DAV_USERNAME`, `DAV_PASSWORD`) as default server.
- Auto-create default server profile with ID "default".
- Existing configurations continue to work unchanged.

### Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `DAV_SERVERS_FILE` | Server profiles storage file | `./servers.json` |
| `DAV_FAILOVER_ENABLED` | Enable automatic failover | `true` |
| `DAV_LOAD_BALANCE_STRATEGY` | Load balancing strategy | `round-robin` |
| `DAV_POOL_IDLE_TIMEOUT_MS` | Idle connection timeout | `60000` (1 min) |
| `DAV_HEALTH_CHECK_ENABLED` | Enable health checks | `true` |
| `DAV_DEFAULT_MAX_CONNECTIONS` | Default max connections per server | `10` |

### Data Structures (TypeScript)
```ts
interface ServerProfile {
  serverId: string;
  url: string;
  username?: string;
  password?: string;
  priority: number; // 1 = highest priority
  group?: string;
  maxConnections: number;
  timeout: number; // milliseconds
  retryAttempts: number;
  healthCheckInterval: number; // seconds
  enabled: boolean;
}

interface ServerHealth {
  status: "healthy" | "degraded" | "unhealthy";
  lastCheck: string; // ISO 8601
  responseTime: number; // milliseconds
  uptime: number; // percentage
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

interface ConnectionStats {
  active: number;
  idle: number;
  max: number;
}

interface PoolStats {
  totalServers: number;
  healthyServers: number;
  unhealthyServers: number;
  totalConnections: ConnectionStats;
  requestStats: {
    total: number;
    successful: number;
    failed: number;
    failoverCount: number;
  };
  averageResponseTime: number;
}
```

### Error Modes
- All servers in pool unavailable: return error listing server statuses.
- Invalid serverId in request: error with list of valid server IDs.
- Duplicate serverId in add_server: validation error.
- Remove active server: warn and switch to next available server.
- Connection pool exhausted: queue request or return error (configurable).

### Security Considerations
- Encrypt stored passwords (use encryption key from environment variable).
- Validate server URLs (prevent SSRF via invalid URLs).
- Credential isolation: each server has own credentials.
- Rate-limit health checks to prevent DoS.
- Log failover events for security monitoring.

### Performance Considerations
- Connection reuse reduces TCP handshake overhead.
- Connection pool reduces latency for concurrent requests.
- Health checks add background load; configure intervals appropriately.
- Failover adds latency on failure; acceptable for reliability.
- Group operations execute sequentially; consider parallel execution (future).

### Incremental Rollout Plan
1. Implement server profile data structures and storage.
2. Add server profile management tools (add, list, remove).
3. Implement connection pool per server.
4. Add server selection logic (priority, load balancing).
5. Implement failover mechanism.
6. Add health check scheduler.
7. Extend `dav_request` with server targeting.
8. Add backward compatibility layer for environment variables.
9. Update README with multi-server examples.
10. Add unit tests for server selection, failover, load balancing.

### Testing Strategy
- Unit tests for server selection algorithms (priority, load balancing).
- Tests for failover logic and server health transitions.
- Tests for connection pool management (acquire, release, timeout).
- Integration tests with multiple mock servers.
- Failure simulation tests (network errors, server unavailability).
- Performance tests for connection pool efficiency.

### Open Questions
- Support DNS-based server discovery? (Future: SRV records.)
- Allow dynamic server weight adjustments based on performance? (Future: adaptive load balancing.)
- Provide connection pool per-server override? (Yes, via maxConnections in profile.)
- Support client-side request routing rules (e.g. route by path pattern)? (Future extension.)

### Future Extensions
- Distributed tracing across servers (OpenTelemetry integration).
- Automatic server discovery via DNS SRV or mDNS.
- Server-side affinity (sticky sessions for locked resources).
- Connection multiplexing using HTTP/2.
- Cross-server caching and request deduplication.
- Geographic routing (select nearest server based on latency).

### Example Conversation (Human ↔ Agent)

```
Human: Add a backup server in EU region.

Agent: I will add the backup server to the connection pool.
Agent Tool Invocation:
{
  "name": "dav_add_server",
  "arguments": {
    "serverId": "backup-eu",
    "url": "https://eu-backup.example.com/webdav/",
    "username": "alice",
    "password": "s3cret",
    "priority": 2,
    "group": "backup",
    "maxConnections": 5,
    "enabled": true
  }
}

Tool Response:
{
  "success": true,
  "serverId": "backup-eu",
  "message": "Server profile added",
  "poolSize": 2
}

Agent: Backup server added. You now have 2 servers in the pool.

---