# Move37 Fern Workspace

This workspace owns the public developer portal for Move37:

- API reference generated from the FastAPI OpenAPI spec
- SDK documentation and snippets for TypeScript and Python
- handwritten guides for CLI and integration workflows

## Local preview

Run through Docker Compose:

```bash
docker compose --profile docs up --build fern-docs
```

The container:

1. exports the OpenAPI spec from `move37.api.server`
2. writes the generated spec to `fern/openapi/move37.openapi.json`
3. starts `fern docs dev`

The preview is exposed on `http://localhost:3000`.

## Regenerate the OpenAPI spec manually

If you already have the Python dependencies installed locally, you can refresh the spec without Docker:

```bash
cd fern
python3 scripts/export_openapi.py
```

## Generate SDK previews locally

Fern local SDK generation requires Docker plus a Fern token:

```bash
export FERN_TOKEN=...
cd fern
fern generate --local --group ts-sdk
fern generate --local --group python-sdk
```

Generated SDK previews are configured to land in `sdks/typescript` and `sdks/python` at the repository root.
