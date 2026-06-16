// server.mjs — HTTP -> MCP bridge for the Allure dashboard "Create task in Huly" button.
//
// Flow:  browser  ->  POST /huly/issue  (same origin, via nginx /api/)  ->  this bridge
//        this bridge is an MCP CLIENT to your existing Huly MCP server (same one you
//        use in Claude Code) and calls its "create issue" tool. The Huly token lives
//        ONLY here, never in the frontend bundle.
//
// Env:
//   HULY_MCP_URL        URL of your Huly MCP server (streamable-http / SSE transport)
//   HULY_TOKEN          bearer token for the MCP server (the one that works in Claude Code)
//   HULY_PROJECT        default Huly project key, e.g. "QA"
//   HULY_CREATE_TOOL    name of the MCP tool that creates an issue (default: create_issue)
//   PORT                default 8090
//
// If your Huly MCP server is a stdio command instead of a URL, swap the transport
// (see the commented StdioClientTransport block below) — everything else stays the same.

import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const {
  HULY_MCP_URL,
  HULY_TOKEN,
  HULY_PROJECT = "QA",
  HULY_CREATE_TOOL = "create_issue",
  PORT = 8090,
} = process.env;

async function withMcp(fn) {
  const transport = new StreamableHTTPClientTransport(new URL(HULY_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${HULY_TOKEN}` } },
  });
  // --- stdio alternative (if your MCP server is a local command) ---
  // const transport = new StdioClientTransport({
  //   command: "npx", args: ["-y", "@your/huly-mcp"], env: { HULY_TOKEN },
  // });
  const client = new Client({ name: "huly-bridge", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// POST /huly/issue
// body: { project, passRate, threshold, failedTests: [..], reportUrl, pipelineUrl }
app.post("/huly/issue", async (req, res) => {
  const { project, passRate, threshold, failedTests = [], reportUrl, pipelineUrl } = req.body || {};
  if (!project) return res.status(400).json({ error: "project is required" });

  const title = `[Allure] ${project} pass rate ${Math.round(passRate)}% (< ${threshold}%)`;
  const description = [
    `Autotest run for **${project}** dropped below the ${threshold}% threshold.`,
    ``,
    `**Pass rate:** ${Math.round(passRate)}%`,
    failedTests.length ? `**Failing tests:**\n${failedTests.map((t) => `- ${t}`).join("\n")}` : "",
    reportUrl ? `\n[Allure report](${reportUrl})` : "",
    pipelineUrl ? `[GitLab pipeline](${pipelineUrl})` : "",
  ].filter(Boolean).join("\n");

  try {
    const result = await withMcp((client) =>
      client.callTool({
        name: HULY_CREATE_TOOL,
        // NOTE: match these argument names to YOUR Huly MCP tool's input schema.
        arguments: {
          project: HULY_PROJECT,
          title,
          description,
          priority: passRate < 70 ? "Urgent" : "High",
        },
      })
    );
    // MCP tools return { content: [...] }; pull out the issue key/url if present.
    const text = (result?.content || []).map((c) => c.text).filter(Boolean).join("\n");
    const key = (text.match(/[A-Z]+-\d+/) || [])[0] || null;
    res.json({ ok: true, key, url: key && process.env.HULY_BASE ? `${process.env.HULY_BASE}` : null, raw: text });
  } catch (err) {
    console.error("[huly-bridge] create issue failed:", err);
    res.status(502).json({ error: "huly_mcp_failed", detail: String(err?.message || err) });
  }
});

app.listen(PORT, () => console.log(`[huly-bridge] listening on :${PORT}`));
