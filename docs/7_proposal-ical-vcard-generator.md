# Proposal: iCalendar and vCard Generation Tool

## Summary

Introduce a helper tool, `generate_structured_data`, that converts a simple JSON object into a valid iCalendar (for events and tasks) or vCard (for contacts) string. This tool will simplify the process of creating new calendar entries or contacts by abstracting away the specific syntax of the iCalendar and vCard formats.

## Goals

-   Provide a new MCP tool, `generate_structured_data`, that accepts a `type` (`event`, `task`, or `contact`) and a JSON object with the data.
-   The tool will generate a correctly formatted iCalendar or vCard string.
-   This string can then be used in a `PUT` request with the `dav_request` tool to create a new resource on the server.
-   Provide clear validation and error messages for missing or invalid fields in the input JSON.

## Non-Goals

-   This tool will not perform any WebDAV operations itself. It is a pure data transformation tool.
-   It will not support all fields and features of the iCalendar and vCard specifications, but will focus on the most common and essential ones.
-   It will not parse iCalendar or vCard data, only generate it.

## User Stories

1.  As a user, I can create a new calendar event by providing a simple JSON object with the event's title, start time, and end time, without needing to know the iCalendar format.
2.  As an agent developer, I can easily create new contacts and calendar entries by building a simple JSON object, which is easier than constructing a raw iCalendar or vCard string.
3.  As a user, if I forget to include a required field, such as the `summary` for an event, I receive a clear error message.

## Design Overview

The `generate_structured_data` tool will take a `type` parameter and a `data` object. Based on the `type`, it will use a different schema to validate the `data` object and a different generator to produce the output string.

### MCP Tool Schema

**`generate_structured_data` Input:**

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": ["event", "task", "contact"],
      "description": "The type of data to generate."
    },
    "data": {
      "type": "object",
      "description": "A JSON object with the data for the entry."
    }
  },
  "required": ["type", "data"]
}
```

**Example `data` for an `event`:**
```json
{
  "summary": "Team Meeting",
  "startTime": "2023-12-01T10:00:00Z",
  "endTime": "2023-12-01T11:00:00Z",
  "location": "Conference Room 1"
}
```

**`generate_structured_data` Response Example:**

```json
{
  "formattedString": "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//My App//EN\nBEGIN:VEVENT\nUID:12345\nDTSTAMP:20231120T100000Z\nSUMMARY:Team Meeting\nDTSTART:20231201T100000Z\nDTEND:20231201T110000Z\nLOCATION:Conference Room 1\nEND:VEVENT\nEND:VCALENDAR"
}
```

## Security Considerations

-   This is a data transformation tool and has no direct interaction with the WebDAV server. However, the generated output should be properly escaped to prevent any injection attacks when it is used in a subsequent `PUT` request. The tool will handle this internally.

## Incremental Rollout Plan

1.  Add the `generate_structured_data` tool to `server.ts`.
2.  Implement the generator logic for iCalendar events as the first supported type.
3.  Add support for tasks and contacts in subsequent iterations.
4.  Add robust validation for the input `data` object.
5.  Add unit tests for the generation and validation logic.

## Rating and Rationale

**Score: 7/10**

This proposal receives a good score for the following reasons:

**Suitability (Good):** iCalendar and vCard generation is essential for CalDAV/CardDAV write operations. The proposal addresses a real need—creating properly formatted iCalendar and vCard data is complex and error-prone. This tool would simplify the creation of calendar events, tasks, and contacts.

**Goodness-of-fit (Good):** The proposal fits well as a pure data transformation tool that doesn't interact directly with WebDAV. It can be used in combination with the existing `dav_request` tool (PUT method) to create resources. This separation of concerns is architecturally sound.

**Value Delivered (Good):** Users gain a significant productivity improvement by working with simple JSON objects instead of learning iCalendar/vCard syntax. The validation and error messaging provide clear feedback for missing or invalid fields. This is particularly valuable for agent developers who want to create calendar/contact resources programmatically.

**Limited Scope Expansion (Moderate):** While the proposal explicitly limits itself to data generation (not parsing), it still involves three different data types (events, tasks, contacts), each with different schemas and validation rules. The iCalendar and vCard specifications are extensive, and there may be pressure to support additional fields beyond the "common ones." The proposal acknowledges this by stating "will focus on the most common and essential ones," which is wise but may lead to scope creep over time.

The incremental rollout plan is sensible, starting with events and adding tasks and contacts later. However, proper iCalendar/vCard generation requires attention to details like UID generation, DTSTAMP formatting, line folding, and escaping—which adds implementation complexity.
