# WebDAV MCP Server

A Model Context Protocol (MCP) server that exposes a single tool for making authenticated WebDAV requests against a configured WebDAV endpoint. It communicates over stdio so it can be embedded into compatible AI / agent runtimes.

## Features

- Implements MCP server via `@modelcontextprotocol/sdk`.
- Single tool `dav_request` supporting common WebDAV methods: `PROPFIND`, `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, `GET`, `PUT`, `DELETE`.
- Property presets for simpler `PROPFIND` requests (built-ins: `basic`, `detailed`, `minimal`).
- Tools to enumerate and inspect presets: `list_property_presets`, `get_property_preset`.
- Automatic Basic Authentication using environment variables.
- Depth header handling for `PROPFIND`.
- Returns structured JSON (status, headers, body) wrapped as MCP text content.
- Graceful shutdown on `SIGINT`.

## Why

This server allows an AI assistant (or any MCP client) to inspect and manipulate resources on a WebDAV server: listing directories (`PROPFIND`), creating collections (`MKCOL`), uploading/downloading files (`PUT`/`GET`), moving/copying resources, and managing locks.

## Prerequisites

- Node.js 18+ (for native `fetch` and ES modules)
- A reachable WebDAV server URL.
- (Optional) WebDAV credentials (username and password) if the server requires authentication.

## Installation

Clone the repository:

```bash
git clone <your-fork-url> webdav-mcp
cd webdav-mcp
```

Install dependencies:

```bash
npm install
```

(No build step is strictly required at runtime since TypeScript is compiled when publishing; you can add a build step if you later introduce multiple files or wish to distribute compiled JS.)

## Configuration

Set the following environment variables before starting the server:

| Variable | Required | Description |
|----------|----------|-------------|
| `DAV_SERVER_URL` | Yes | Base URL of the WebDAV server, e.g. `https://dav.example.com/remote.php/webdav/` |
| `DAV_USERNAME` | Optional | Username for Basic Auth |
| `DAV_PASSWORD` | Optional | Password for Basic Auth |

If `DAV_USERNAME` and `DAV_PASSWORD` are both set, Basic Authentication is added automatically.

### Property Presets Configuration

Optional environment variables for preset handling:

| Variable | Default | Description |
|----------|---------|-------------|
| `DAV_PROPERTY_PRESETS_DIR` | `./property-presets` | Directory containing JSON files with preset definitions. Each file may be a single preset object or an array of presets. |
| `DAV_PROPERTY_PRESETS_TTL_MS` | `5000` | Millisecond TTL for cache before checking for file changes. |

If the directory does not exist, built-in presets are still available.

## Usage

Run the server (stdio mode):

```bash
node src/server.ts
```

Or make it executable directly (shebang is present):

```bash
chmod +x src/server.ts
./src/server.ts
```

Integrate it with an MCP-compatible client by declaring it as a stdio server command. Example (pseudo client config):

```json
{
  "servers": [
    {
      "name": "webdav",
      "command": "node",
      "args": ["/absolute/path/to/webdav-mcp/src/server.ts"],
      "env": {
        "DAV_SERVER_URL": "https://dav.example.com/remote.php/webdav/",
        "DAV_USERNAME": "alice",
        "DAV_PASSWORD": "s3cret"
      }
    }
  ]
}
```

### Tool: `dav_request`

Input JSON schema (simplified):

```json
{
  "method": "PROPFIND|PROPPATCH|MKCOL|COPY|MOVE|LOCK|UNLOCK|GET|PUT|DELETE",
  "path": "<relative path>",
  "body": "<optional XML or other content>",
  "headers": {"<name>": "<value>"},
  "depth": "0|1|infinity"
  "preset": "<optional preset name>",
  "additionalProperties": [ {"namespace": "DAV:", "name": "quota-used-bytes"} ]
}
```

Minimum required fields: `method`, `path`.

If `preset` is provided for a `PROPFIND` request, the `body` field is ignored and automatically generated from the preset plus any `additionalProperties` supplied.

### Tools: `list_property_presets`, `get_property_preset`

List presets:

```json
{
  "name": "list_property_presets",
  "arguments": {}
}
```

Get a preset definition:

```json
{
  "name": "get_property_preset",
  "arguments": {"name": "basic"}
}
```

Example `PROPFIND` using a preset:

```json
{
  "name": "dav_request",
  "arguments": {
    "method": "PROPFIND",
    "path": "/photos",
    "depth": "1",
    "preset": "basic"
  }
}
```

With extra properties:

```json
{
  "name": "dav_request",
  "arguments": {
    "method": "PROPFIND",
    "path": "/media",
    "depth": "1",
    "preset": "basic",
    "additionalProperties": [
      {"namespace": "DAV:", "name": "quota-used-bytes"}
    ]
  }
}
```

### Examples

List a directory (depth 1):

```json
{
  "name": "dav_request",
  "arguments": {
    "method": "PROPFIND",
    "path": "/",
    "depth": "1"
  }
}
```

Upload a file (PUT):

```json
{
  "name": "dav_request",
  "arguments": {
    "method": "PUT",
    "path": "/notes/todo.txt",
    "body": "Finish documentation"
  }
}
```

Delete a resource:

```json
{
  "name": "dav_request",
  "arguments": {
    "method": "DELETE",
    "path": "/notes/old.txt"
  }
}
```

## Development

TypeScript configuration lives in `tsconfig.json`. Useful commands:

```bash
# Type checking only
npx tsc --noEmit

# Build to dist (if you add a build script later)
npx tsc
```

You can add a script block to `package.json`:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  }
}
```

Then run:

```bash
npm run typecheck
npm run build
```

Run tests (covers preset logic):

```bash
npm test
```

## Error Handling

Errors are returned with `isError: true` and a JSON body containing an `error` field. The server also logs MCP-level errors to stderr with prefix `[MCP Error]`.

## Security Notes

- Only Basic Authentication is supported presently.
- Avoid embedding credentials directly in client config—prefer environment variables or a secret manager.
- HTTPS is strongly recommended for `DAV_SERVER_URL`.
- The tool returns raw response bodies; if XML may contain sensitive data, handle accordingly.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `DAV_SERVER_URL environment variable is not set` | Missing configuration | Export the variable before starting the server |
| Authentication fails (401) | Wrong credentials | Verify `DAV_USERNAME`/`DAV_PASSWORD` |
| Empty PROPFIND result | Wrong `Depth` or path | Adjust `depth` or check path correctness |
| Tool not listed | MCP client not connected properly | Ensure the command and path are correct |
| Preset not found | Wrong preset name | Use `list_property_presets` to view available names |

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Make changes with TypeScript strictness preserved.
4. Submit a pull request with a clear description.

Please use British English spelling in documentation.

## Licence

Specify your licence here (e.g. MIT). Add a `LICENCE` file to formalise.

---

© 2025