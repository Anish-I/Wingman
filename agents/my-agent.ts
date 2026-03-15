import { agent, Sandbox } from "@21st-sdk/agent";
const mcpConfig = `{"mcpServers":{"21st-dev":{"type":"http","url":"https://api.21st.dev/mcp","headers":{"Authorization":"Bearer an_sk_aef5e6046a62b48754c00479071441685c363354dcae152576ff654f454fe38d"}}}}`;
export default agent({
  model: "claude-sonnet-4-6",
  sandbox: Sandbox({
    files: {
      "/home/user/.mcp.json": mcpConfig,
    },
  }),
  systemPrompt: `You are a full-stack coding assistant. Use the configured MCP servers whenever they are helpful.`,
})