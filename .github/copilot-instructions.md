# GitHub Copilot Instructions for webdav-mcp

## Project Overview

This repository implements a Model Context Protocol (MCP) server that provides a single tool (`dav_request`) for making authenticated WebDAV requests. The server communicates over stdio and can be embedded into AI/agent runtimes.

**Technology Stack:**
- TypeScript with strict mode enabled
- Node.js 18+ (for native fetch and ES modules)
- `@modelcontextprotocol/sdk` for MCP server implementation
- Single-file architecture (`src/server.ts`)

**Key Features:**
- WebDAV methods: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, GET, PUT, DELETE
- Automatic Basic Authentication via environment variables
- Depth header handling for PROPFIND operations
- Structured JSON responses (status, headers, body)

## Code Style and Conventions

### Language and Spelling
- **Use British English spelling** in all documentation, comments, and user-facing text
- Examples: "behaviour" not "behavior", "authorisation" not "authorization", "licence" not "license"

### TypeScript Standards
- Maintain strict TypeScript settings as defined in `tsconfig.json`
- Use explicit type annotations for function parameters and return types
- Follow existing patterns for error handling and async/await
- Avoid `any` types; use proper type definitions
- Use ES modules syntax (`import`/`export`)

### Code Organisation
- Keep the server architecture simple and maintainable
- Follow the existing class-based structure (`WebDAVServer` class)
- Use private methods for internal functionality
- Maintain separation between setup, handlers, and business logic

### Error Handling
- Return errors with `isError: true` and a JSON body containing an `error` field
- Log MCP-level errors to stderr with prefix `[MCP Error]`
- Validate environment variables and configuration at runtime
- Provide helpful error messages for common issues

## Build and Development

### Type Checking
Run TypeScript type checking with:
```bash
npx tsc --noEmit
```

### Building
If needed, compile TypeScript to JavaScript:
```bash
npx tsc
```
Output goes to `dist/` directory (excluded from git via `.gitignore`).

### Running the Server
```bash
node src/server.ts
```

Or make executable and run directly:
```bash
chmod +x src/server.ts
./src/server.ts
```

### Testing
- Currently, there is no formal test infrastructure
- Manual testing can be done by integrating with an MCP-compatible client
- When adding tests in the future, use a standard testing framework (e.g., Jest, Mocha)

## Environment Variables

Required configuration:
- `DAV_SERVER_URL` (required): Base URL of the WebDAV server
- `DAV_USERNAME` (optional): Username for Basic Authentication
- `DAV_PASSWORD` (optional): Password for Basic Authentication

## Security Considerations

- Only Basic Authentication is currently supported
- Never commit credentials to source code
- Always use HTTPS for `DAV_SERVER_URL` in production
- Be mindful of sensitive data in WebDAV response bodies
- Follow secure coding practices for handling user input
- Validate and sanitise all input parameters

## Contribution Guidelines

### Making Changes
1. Maintain minimal code changes to achieve the goal
2. Preserve existing functionality unless explicitly changing it
3. Ensure TypeScript type checking passes (`npx tsc --noEmit`)
4. Update documentation if changes affect public API or configuration
5. Follow the existing code structure and patterns

### Documentation
- Update `README.md` for user-facing changes
- Add inline comments only when necessary to explain complex logic
- Keep documentation clear and concise
- Use British English spelling

### Dependencies
- Minimise new dependencies
- Only update existing dependencies when necessary for bug fixes or security
- Use exact versions in `package.json` where possible

## Task Suitability

**Well-suited tasks for Copilot:**
- Bug fixes in the WebDAV request handling
- Adding support for additional WebDAV methods
- Improving error messages and error handling
- Documentation improvements
- Adding validation for request parameters
- Code refactoring for better maintainability
- Adding TypeScript type improvements

**Tasks requiring careful human review:**
- Security-related changes (authentication, credentials handling)
- Changes to the MCP protocol implementation
- Architectural changes (moving to multi-file structure)
- Changes to environment variable handling
- Breaking API changes

## Common Patterns

### Adding a New WebDAV Method
1. Add the method to the `DavRequestArgs` interface enum
2. Update the `inputSchema` enum in the tool definition
3. No special handler is typically needed (generic fetch handles most methods)
4. Update documentation in `README.md`

### Error Response Format
```typescript
{
  content: [
    {
      type: "text",
      text: JSON.stringify({
        error: errorMessage,
      }, null, 2),
    },
  ],
  isError: true,
}
```

### Success Response Format
```typescript
{
  content: [
    {
      type: "text",
      text: JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText,
      }, null, 2),
    },
  ],
}
```

## File Structure

```
.
├── .github/
│   └── copilot-instructions.md  (this file)
├── docs/                        (feature proposals)
├── src/
│   └── server.ts               (main server implementation)
├── package.json                (dependencies)
├── tsconfig.json               (TypeScript configuration)
└── README.md                   (user documentation)
```

## Additional Notes

- The server is designed for single-file simplicity
- Proposals for new features are documented in the `docs/` directory
- The project uses stdio transport for MCP communication
- Graceful shutdown is handled via SIGINT signal
