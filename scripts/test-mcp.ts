#!/usr/bin/env bun
/**
 * Test script for UberSearch MCP Server
 *
 * Tests the MCP server functionality by sending requests and checking responses
 */

export {};

const { spawn } = await import("node:child_process");

async function testMCPServer() {
  console.log("Starting MCP Server...\n");

  // Start the MCP server
  const serverProcess = spawn("bun", ["run", "src/mcp-server.ts"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "inherit"],
  });

  let serverReady = false;

  // Wait for server to send initial capabilities
  serverProcess.stdout.on("data", (data) => {
    const lines = data
      .toString()
      .split("\n")
      .filter((l: string) => l.trim());
    for (const line of lines) {
      try {
        const response = JSON.parse(line);
        if (response.result?.serverInfo) {
          console.log("✓ MCP Server is ready");
          console.log(`  Name: ${response.result.serverInfo.name}`);
          console.log(`  Version: ${response.result.serverInfo.version}\n`);
          serverReady = true;
        } else if (response.result?.tools) {
          console.log(
            `✓ Available tools: ${response.result.tools.map((t: any) => t.name).join(", ")}\n`,
          );
        } else {
          console.log("Response:", JSON.stringify(response, null, 2));
        }
      } catch {
        // Ignore non-JSON output
      }
    }
  });

  serverProcess.on("error", (err) => {
    console.error("Server error:", err);
    process.exit(1);
  });

  // Wait a bit for server to start, then send initialize request
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Send initialize request (required by MCP protocol)
  const initRequest = `${JSON.stringify({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-mcp", version: "1.0.0" },
    },
  })}\n`;
  serverProcess.stdin.write(initRequest);

  // Wait for initialize response
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (!serverReady) {
    console.error("Server did not start properly");
    process.exit(1);
  }

  // Test 1: List tools
  console.log("Test 1: Listing tools...");
  const listRequest = `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  })}\n`;

  serverProcess.stdin.write(listRequest);
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Test 2: Search (will fail without API keys, but tests the tool interface)
  console.log("Test 2: Calling uber_search...");
  const searchRequest = `${JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "uber_search",
      arguments: {
        query: "test query",
        limit: 5,
        strategy: "all",
      },
    },
  })}\n`;

  serverProcess.stdin.write(searchRequest);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Test 3: Credits
  console.log("Test 3: Calling uber_search_credits...");
  const creditsRequest = `${JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "uber_search_credits",
      arguments: {},
    },
  })}\n`;

  serverProcess.stdin.write(creditsRequest);
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Test 4: Health
  console.log("Test 4: Calling uber_search_health...");
  const healthRequest = `${JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "uber_search_health",
      arguments: {},
    },
  })}\n`;

  serverProcess.stdin.write(healthRequest);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Cleanup
  console.log("\n✓ Tests complete. Shutting down server...");
  serverProcess.kill("SIGTERM");
  setTimeout(() => {
    process.exit(0);
  }, 500);
}

// Run tests
testMCPServer().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
