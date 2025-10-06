#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

// Configuration from environment variables
const DAV_SERVER_URL = process.env.DAV_SERVER_URL || "";
const DAV_USERNAME = process.env.DAV_USERNAME || "";
const DAV_PASSWORD = process.env.DAV_PASSWORD || "";

interface DavRequestArgs {
  method: "PROPFIND" | "PROPPATCH" | "MKCOL" | "COPY" | "MOVE" | "LOCK" | "UNLOCK" | "GET" | "PUT" | "DELETE";
  path: string;
  body?: string;
  headers?: Record<string, string>;
  depth?: "0" | "1" | "infinity";
}

class WebDAVServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "webdav-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "dav_request",
          description: "Make a WebDAV request to the configured server. Handles authentication automatically.",
          inputSchema: {
            type: "object",
            properties: {
              method: {
                type: "string",
                enum: ["PROPFIND", "PROPPATCH", "MKCOL", "COPY", "MOVE", "LOCK", "UNLOCK", "GET", "PUT", "DELETE"],
                description: "The WebDAV HTTP method to use",
              },
              path: {
                type: "string",
                description: "The path on the WebDAV server (relative to the base URL)",
              },
              body: {
                type: "string",
                description: "The request body (typically XML for WebDAV operations)",
              },
              headers: {
                type: "object",
                description: "Additional headers to include in the request",
                additionalProperties: {
                  type: "string",
                },
              },
              depth: {
                type: "string",
                enum: ["0", "1", "infinity"],
                description: "Depth header for PROPFIND requests (0 = resource only, 1 = resource + immediate children, infinity = all)",
              },
            },
            required: ["method", "path"],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "dav_request") {
        return await this.handleDavRequest(request.params.arguments as DavRequestArgs);
      }
      
      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  private async handleDavRequest(args: DavRequestArgs) {
    try {
      // Validate configuration
      if (!DAV_SERVER_URL) {
        throw new Error("DAV_SERVER_URL environment variable is not set");
      }

      // Build the full URL
      const url = new URL(args.path, DAV_SERVER_URL).toString();

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/xml; charset=utf-8",
        ...args.headers,
      };

      // Add depth header for PROPFIND
      if (args.depth) {
        headers["Depth"] = args.depth;
      }

      // Add authentication if credentials are provided
      if (DAV_USERNAME && DAV_PASSWORD) {
        const auth = Buffer.from(`${DAV_USERNAME}:${DAV_PASSWORD}`).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
      }

      // Make the request
      const response = await fetch(url, {
        method: args.method,
        headers,
        body: args.body,
      });

      const responseText = await response.text();

      return {
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
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("WebDAV MCP Server running on stdio");
  }
}

// Start the server
const server = new WebDAVServer();
server.run().catch(console.error);