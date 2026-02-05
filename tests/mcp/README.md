# MCP Testing

This folder contains two ways to exercise the MCP server over HTTP/SSE.

## MCP Inspector (interactive)

1. Ensure the MCP server is running at `http://penroselamarck-api:8080`.

### Container

2. Run the inspector container:

```bash
docker compose run --rm --service-ports mcp-inspector
```

3. Open the URL shown in the inspector logs (commonly `http://localhost:5173` or
   `http://localhost:6274`), select the `penroselamarck` server, then run
   `tools/list` and call each tool.

### Local

2. Run the inspector with the provided config:

```bash
npx @modelcontextprotocol/inspector \
    --config tests/mcp/config.json \
    --server penroselamarck
```

3. Select the `penroselamarck` server, then run `tools/list` and call each tool.

## FastMCP client (scripted)

### Container

1. Run the FastMCP smoke test container:

```bash
docker compose run --rm mcp-fastmcp
```

### Local

1. Install test dependencies:

```bash
pip install -r tests/python-requirements.txt
```

2. Run the smoke test:

```bash
python tests/mcp/fastmcp_client.py --sse-url http://penroselamarck-api:8080/v1/mcp/sse
```

The script lists tools and calls each MCP tool in a safe, ordered flow.
