# Proposal: Simplified CalDAV Task (VTODO) Management Tools

## Summary

Introduce a set of high-level tools for managing tasks (VTODO components in iCalendar) in a CalDAV repository. These tools will provide a simplified interface for creating, listing, and updating tasks, abstracting away the underlying CalDAV and iCalendar complexities.

## Goals

-   Provide a new MCP tool, `create_task`, that takes a simple JSON object and creates a new VTODO resource.
-   Provide a `list_tasks` tool that fetches all VTODOs from a specified calendar.
-   Provide an `update_task` tool that modifies an existing VTODO.
-   These tools will leverage the proposed `generate_structured_data` tool for creating the iCalendar data.
-   Return simple, structured JSON responses rather than raw iCalendar data where possible.

## Non-Goals

-   These tools will not manage calendar events (VEVENTs), only tasks (VTODOs).
-   They will not support all possible properties of a VTODO, focusing on the most common ones like summary, due date, priority, and status.

## User Stories

1.  As a user, I can create a new task by providing its title and due date.
2.  As a user, I can list all of my outstanding tasks in a given project (calendar).
3.  As a user, I can mark a task as "completed" by calling a simple `update_task` tool.
4.  As an agent developer, I can build a simple to-do list application on top of these high-level tools.

## Design Overview

This feature will consist of three new MCP tools:

-   **`create_task`**: This tool will take a `calendarUrl` and a `data` object. It will use the `generate_structured_data` tool to create an iCalendar string for the new task and then use a `PUT` request to save it to the server.
-   **`list_tasks`**: This tool will take a `calendarUrl` and perform a `REPORT` request to fetch all VTODO components. It will then parse the results to return a simple JSON array of tasks.
-   **`update_task`**: This tool will take a `taskUrl` and a `data` object. It will first `GET` the existing task, capturing the `ETag` header from the response. It will then modify the iCalendar data based on the `data` object, and `PUT` the updated resource back to the server with an `If-Match` header containing the ETag value. This prevents the "lost update" problem by ensuring the update only succeeds if the resource has not been modified by another client since it was retrieved.

### MCP Tool Schemas

**`create_task` Input:**
```json
{
  "calendarUrl": "<url>",
  "data": { "summary": "Finish report", "dueDate": "2023-12-31T23:59:59Z" }
}
```

**`list_tasks` Response Example:**
```json
{
  "tasks": [
    {
      "url": "<url-to-task-1>",
      "summary": "Finish report",
      "dueDate": "2023-12-31T23:59:59Z",
      "status": "NEEDS-ACTION"
    }
  ]
}
```

**`update_task` Input:**
```json
{
  "taskUrl": "<url-to-task-1>",
  "data": { "status": "COMPLETED" }
}
```

## Security Considerations

-   This feature involves writing data to the server, so care must be taken to validate and sanitize all inputs to prevent injection attacks.
-   All operations are confined to the user's own calendars, so there is no risk of cross-user data access.
-   The `update_task` tool uses ETags with the `If-Match` header to prevent race conditions and lost updates. If the resource has been modified by another client between the GET and PUT operations, the server will return a 412 Precondition Failed status, and the operation will need to be retried.

## Incremental Rollout Plan

1.  First, implement the `create_task` tool, which depends on the `generate_structured_data` tool.
2.  Next, implement the `list_tasks` tool, including the logic to parse the `REPORT` response.
3.  Finally, implement the `update_task` tool.
4.  Add comprehensive unit and integration tests for all three tools.

## Rating and Rationale

**Score: 5/10**

This proposal receives a middle-of-the-road score for the following reasons:

**Suitability (Moderate):** Task management (VTODO) is a legitimate CalDAV use case, and providing simplified tools for task operations makes sense. However, this is a fairly narrow use case compared to general WebDAV functionality or even general calendar operations (events are more commonly used than tasks).

**Goodness-of-fit (Moderate):** The proposal builds on other proposals (`generate_structured_data` for iCalendar generation), creating dependency chains. The use of ETags with `If-Match` headers for optimistic locking in `update_task` is good practice and shows understanding of WebDAV concurrency patterns.

**Value Delivered (Moderate):** For users who specifically need task management, this provides significant value by abstracting VTODO complexity. The high-level interface (creating tasks with simple JSON) is much easier than manual iCalendar construction. However, the value is limited to the subset of users who use CalDAV for task management rather than just events.

**Limited Scope Expansion (Moderate):** While the proposal explicitly focuses on tasks (not events) and limits supported properties, there are several concerns: (1) It depends on the `generate_structured_data` tool being implemented first, (2) The VTODO specification is extensive, and users will likely request support for additional properties beyond the "most common ones" (due date, priority, status), (3) The proposal only covers create, list, and update—users will likely want delete, search, and filtering capabilities, leading to scope expansion.

The implementation requires CalDAV REPORT parsing and iCalendar VTODO handling, which adds non-trivial complexity. The narrow focus on tasks rather than more general calendar object management limits applicability.
