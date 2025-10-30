# Proposal: Simplified CalDAV Calendar Query Tool

## Summary

Introduce a high-level tool, `query_calendar`, designed to simplify common CalDAV queries. This tool will allow users to fetch calendar events within a specific date range without needing to construct a complex XML `REPORT` request manually.

## Goals

-   Provide a new MCP tool, `query_calendar`, that accepts a calendar URL, a start date, and an end date.
-   The tool will generate and execute the appropriate CalDAV `REPORT` request to filter events by the specified time range.
-   Return the raw iCalendar data for the matching events.
-   Abstract away the complexity of the CalDAV `calendar-query` `REPORT` operation.
-   Provide clear error messages for common issues, such as an invalid calendar URL or incorrect date formats.

## Non-Goals

-   This tool will not parse the iCalendar data in the response. It will return the raw data as a string.
-   It will not support complex queries beyond a simple time-range filter (e.g., no filtering by event properties).
-   It will not perform any write operations (e.g., creating or updating events).

## User Stories

1.  As a user, I can retrieve all calendar events for next week by providing the calendar URL and the start and end dates.
2.  As an agent developer, I can easily integrate calendar data into my application by using a simple tool to fetch events, without needing to become an expert in the CalDAV protocol.
3.  As an operator, if I provide a URL that is not a valid calendar, I receive a clear error message.

## Design Overview

The `query_calendar` tool will take a calendar URL, a start date, and an end date as arguments. It will construct an XML body for a `calendar-query` `REPORT` request, including a `time-range` filter. It will then execute this `REPORT` request against the provided calendar URL.

### MCP Tool Schema

**`query_calendar` Input:**

```json
{
  "type": "object",
  "properties": {
    "calendarUrl": {
      "type": "string",
      "description": "The URL of the calendar to query."
    },
    "startDate": {
      "type": "string",
      "description": "The start date for the query in ISO 8601 format (e.g., '2023-01-01T00:00:00Z')."
    },
    "endDate": {
      "type": "string",
      "description": "The end date for the query in ISO 8601 format (e.g., '2023-01-31T23:59:59Z')."
    }
  },
  "required": ["calendarUrl", "startDate", "endDate"]
}
```

**`query_calendar` Response Example:**

The tool will return the raw response from the `dav_request` tool, which will contain the multi-status XML response from the server. The body of the response will be a string containing the iCalendar data for the matching events.

### Error Handling

-   The tool will validate that the provided `startDate` and `endDate` are in a valid ISO 8601 format.
-   It will return an error if the underlying `dav_request` call fails.

## Security Considerations

-   This tool does not introduce any new security risks, as it relies on the existing `dav_request` tool for all server communication.

## Incremental Rollout Plan

1.  Add the `query_calendar` tool to the list of available tools in `server.ts`.
2.  Implement the handler for `query_calendar`, including the logic to generate the `REPORT` request body.
3.  Add unit tests to verify that the XML body is generated correctly and that the tool handles date validation.
