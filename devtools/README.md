# mv37-devtools

Docker-wrapped repository bootstrap tooling for the Move37 GitHub repository.

## Usage

Run through the host wrapper so `gh` authentication stays on the host:

```bash
devtools/bin/mv37-devtools doctor
devtools/bin/mv37-devtools bootstrap plan
devtools/bin/mv37-devtools bootstrap apply
```

The default config lives at `devtools/config/move37.repo.toml`.

You can also run the tool through Docker Compose:

```bash
export GITHUB_TOKEN="$(gh auth token)"
docker compose run --rm devtools doctor
docker compose run --rm devtools bootstrap plan
```
