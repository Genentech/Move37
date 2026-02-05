# MCP Testing

This folder contains two ways to exercise the MCP server over HTTP/SSE.

## MCP Inspector (interactive)

1. Ensure the MCP server is running at `http://penroselamarck-mcp:8080`.
2. Run the inspector with the provided config:

```bash
npx @modelcontextprotocol/inspector \
    --config tests/mcp/config.json \
    --server penroselamarck
```

3. Select the `penroselamarck` server, then run `tools/list` and call each tool.

## FastMCP client (scripted)

1. Install test dependencies:

```bash
pip install -r tests/python-requirements.txt
```

2. Run the smoke test:

```bash
python tests/mcp/fastmcp_client.py --sse-url http://penroselamarck-mcp:8080/v1/mcp/sse
```

The script lists tools and calls each MCP tool in a safe, ordered flow.
