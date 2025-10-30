# WebDAV MCP Server

A Model Context Protocol (MCP) server that exposes a single tool for making authenticated WebDAV requests against a configured WebDAV endpoint. It communicates over stdio so it can be embedded into compatible AI / agent runtimes.

## Features

- Implements MCP server via `@modelcontextprotocol/sdk`.
- Single tool `dav_request` supporting common WebDAV methods: `PROPFIND`, `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, `GET`, `PUT`, `DELETE`.
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
}
```

Minimum required fields: `method`, `path`.

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