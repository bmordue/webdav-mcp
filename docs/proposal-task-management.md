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
-   **`update_task`**: This tool will take a `taskUrl` and a `data` object. It will first `GET` the existing task (including its ETag), modify its iCalendar data based on the `data` object, and then `PUT` the updated resource back to the server using a conditional request with the `If-Match` header to prevent race conditions.

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

## Incremental Rollout Plan

1.  First, implement the `create_task` tool, which depends on the `generate_structured_data` tool.
2.  Next, implement the `list_tasks` tool, including the logic to parse the `REPORT` response.
3.  Finally, implement the `update_task` tool.
4.  Add comprehensive unit and integration tests for all three tools.
