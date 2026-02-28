# @genentech/penroselamarck

TypeScript SDK for the Penrose-Lamarck REST API.

## Install

```bash
npm install @genentech/penroselamarck
```

## Usage

```ts
import { PenroseLamarckClient } from "@genentech/penroselamarck";

const client = new PenroseLamarckClient({
  baseUrl: "http://localhost:8080",
  token: "<bearer-token>",
});

const exercises = await client.listExercises({ language: "en", limit: 10 });
```

## React hook

```ts
import { useExerciseGraph } from "@genentech/penroselamarck/react";

const { data, loading, error, refresh } = useExerciseGraph({
  baseUrl: "http://localhost:8080",
  token: "<bearer-token>",
  language: "en",
});
```
