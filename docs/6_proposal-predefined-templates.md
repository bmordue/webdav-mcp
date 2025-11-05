# Proposal: Pre-defined CalDAV/CardDAV Query Templates

## Summary

Introduce a tool, `run_predefined_template`, that allows the execution of a set of curated, pre-defined templates for common CalDAV and CardDAV operations. This feature will provide a simpler entry point than the fully custom "Saved Queries" feature, offering a library of ready-to-use queries for frequent tasks.

## Goals

-   Provide a new MCP tool, `run_predefined_template`, which takes a template name and an optional set of parameters.
-   Ship the server with a built-in library of useful templates for common CalDAV and CardDAV operations.
-   Examples of pre-defined templates could include: `list_all_calendars`, `list_all_address_books`, `get_calendar_object_by_url`, `get_contact_by_uid`.
-   The implementation should be based on the same underlying mechanism as the "Saved Queries" feature, but the templates would be read-only and shipped with the server.
-   Provide a `list_predefined_templates` tool to allow users and agents to discover the available templates.

## Non-Goals

-   This feature will not allow users to create or modify the pre-defined templates. The "Saved Queries" feature is intended for user-defined queries.
-   The templates will not support complex logic, only simple parameter substitution.

## User Stories

1.  As a new user, I can quickly get started by using a set of well-documented, pre-defined templates for common tasks without having to write my own queries.
2.  As an agent developer, I can rely on a stable, versioned set of built-in queries to interact with CalDAV and CardDAV servers.
3.  As a user, I can list all the available pre-defined templates to see what operations are supported out-of-the-box.

## Design Overview

The `run_predefined_template` tool will work similarly to the proposed `run_saved_query` tool. It will look up a template by name from a built-in library, substitute any provided parameters, and execute the underlying `dav_request`.

A new tool, `list_predefined_templates`, will return a list of the available templates with their names, descriptions, and required parameters.

### Example Pre-defined Templates

-   **`list_calendars`**: Performs a `PROPFIND` on the calendar home set to list all of a user's calendars.
-   **`list_address_books`**: Performs a `PROPFIND` on the address book home set to list all of a user's address books.
-   **`get_event_by_uid`**: Takes a `calendarUrl` and a `uid` parameter and performs a `REPORT` to fetch a specific event.

### MCP Tool Schemas

**`list_predefined_templates` Response Example:**
```json
{
  "templates": [
    {
      "name": "list_calendars",
      "description": "Lists all calendars in the user's calendar home set.",
      "requiredParams": []
    },
    {
      "name": "get_event_by_uid",
      "description": "Gets a single calendar event by its UID.",
      "requiredParams": ["calendarUrl", "uid"]
    }
  ]
}
```

**`run_predefined_template` Input:**
```json
{
  "name": "<templateName>",
  "params": { "param": "value" }
}
```

## Security Considerations

-   As this feature is based on the same mechanism as saved queries, it carries the same security considerations. All templates will be read-only operations to minimize risk.

## Incremental Rollout Plan

1.  Implement the underlying mechanism for loading built-in templates.
2.  Add a library of initial templates for common CalDAV and CardDAV operations.
3.  Add the `run_predefined_template` and `list_predefined_templates` tools to `server.ts`.
4.  Add unit tests for template loading and execution.

## Rating and Rationale

**Score: 6/10**

This proposal receives a moderate score for the following reasons:

**Suitability (Moderate):** Predefined templates provide convenience for common CalDAV/CardDAV operations, which is valuable for new users. However, this is essentially a subset of the "Saved Queries" feature—the main difference is that templates are built-in and read-only rather than user-defined.

**Goodness-of-fit (Good):** The proposal explicitly states it builds on the same mechanism as saved queries, which means good architectural alignment. The read-only nature simplifies implementation compared to saved queries. If saved queries are implemented first, adding predefined templates is straightforward.

**Value Delivered (Moderate):** The value is primarily in providing quick-start examples and reducing the learning curve for CalDAV/CardDAV operations. Users get a curated set of working examples without needing to create their own queries. However, the value is somewhat limited because: (1) sophisticated users will likely create their own queries anyway, and (2) the examples could alternatively be provided as documentation or sample query files.

**Limited Scope Expansion (Good):** The proposal is well-constrained—it's explicitly read-only and doesn't support user modifications. The scope is limited to providing built-in templates. However, there's a dependency on the saved queries feature being implemented first, which adds indirect complexity.

The main concern is whether this provides enough incremental value over the saved queries feature to justify separate implementation. It could be argued that sample query files in the repository would achieve similar goals with less code. However, having built-in templates accessible via tools does provide better discoverability for agents.
