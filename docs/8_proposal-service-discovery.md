# Proposal: CalDAV/CardDAV Service Discovery

## Summary

Introduce a high-level tool to automate the discovery of essential CalDAV and CardDAV service URLs. This tool will simplify the initial client setup by locating the user's principal URL, calendar home set, and address book home set, which are required starting points for most calendar and contact operations.

## Goals

-   Provide a new MCP tool, `discover_services`, that requires no arguments.
-   The tool will perform the necessary sequence of `PROPFIND` requests to discover key service URLs.
-   It will return a structured object containing the discovered URLs for the principal, calendar home, and address book home.
-   Abstract away the complexity of the WebDAV discovery process from the end-user or agent.
-   Provide clear error messages if the discovery process fails at any step.

## Non-Goals

-   This tool will not perform any actions beyond discovery (e.g., it will not list calendars or contacts).
-   It will not parse or interpret the contents of any resources beyond what is necessary for discovery.
-   It will not manage authentication credentials; it will use the existing server configuration for authentication.

## User Stories

1.  As a new user, I can call a single tool to find the correct URLs for my calendar and address book without needing to know the underlying WebDAV discovery protocol.
2.  As an agent developer, I can use this tool as the first step in a workflow to configure a client for a user's CalDAV or CardDAV account.
3.  As an operator, if the discovery fails, I receive a clear error message indicating which step of the process failed (e.g., "Could not find calendar-home-set property").

## Rating and Rationale

**Score: 8/10**

This proposal scores highly for the following reasons:

**Suitability (Excellent):** Service discovery is essential for CalDAV and CardDAV operations. The proposal addresses a real bootstrapping problem—users and agents need to discover service endpoints before they can perform useful work. This is a fundamental requirement for any CalDAV/CardDAV implementation.

**Goodness-of-fit (Excellent):** The implementation fits perfectly with the existing architecture. It uses the same `PROPFIND` operations that are already supported, just orchestrating them in a specific sequence. The tool requires no arguments and returns structured URLs, making it simple and intuitive to use.

**Value Delivered (High):** This tool eliminates manual configuration steps and protocol knowledge requirements. Users can call a single tool to discover all necessary service URLs instead of reading WebDAV specifications. This is particularly valuable for agent developers who want to build CalDAV/CardDAV functionality without deep protocol expertise.

**Limited Scope Expansion (Excellent):** The proposal is remarkably focused—it performs discovery only, with no additional features. The implementation is straightforward: two sequential PROPFIND requests with XML parsing. There are no complex dependencies, persistent state, or configuration requirements. The rollout plan is minimal and achievable.

The only minor limitation is that it specifically targets CalDAV/CardDAV discovery, making it less generally applicable than some other proposals. However, this focus is also a strength, as it keeps the implementation simple and targeted.

## Design Overview

The `discover_services` tool will execute a series of `PROPFIND` requests as follows:

1.  **Find the Principal URL:** It will start with a `PROPFIND` request on the root URL (`/`) to discover the `current-user-principal` URL.
2.  **Find Service Homes:** Once the principal URL is known, it will perform a second `PROPFIND` request on that URL to find the `calendar-home-set` and `addressbook-home-set` properties.

The tool will parse the XML responses from these requests to extract the relevant URLs.

### MCP Tool Schema

**`discover_services` Input:**

None (the tool takes no arguments).

**`discover_services` Response Example:**

```json
{
  "principalUrl": "/dav/principals/users/johndoe/",
  "calendarHomeSetUrl": "/dav/calendars/users/johndoe/",
  "addressBookHomeSetUrl": "/dav/addressbooks/users/johndoe/"
}
```

### Error Handling

-   If the `current-user-principal` property is not found, the tool will return an error.
-   If the `calendar-home-set` or `addressbook-home-set` properties are not found on the principal resource, the tool will return an error.
-   The tool will return a standard MCP error object on any HTTP failure.

## Security Considerations

-   The tool will rely on the existing authentication mechanism. There are no new security considerations specific to this tool.

## Incremental Rollout Plan

1.  Add the `discover_services` tool to the list of available tools in `server.ts`.
2.  Implement the handler for the `discover_services` tool, including the logic for the two-step `PROPFIND` process.
3.  Add unit tests to verify the discovery logic and error handling.
