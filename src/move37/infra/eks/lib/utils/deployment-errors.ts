export class StackVersionFileNotFoundError extends Error {
  constructor(path: string) {
    super(`stack-version file not found: ${path}`);
    this.name = "StackVersionFileNotFoundError";
  }
}

export class StackVersionFileParseError extends Error {
  constructor(path: string, details: string) {
    super(`failed to parse stack-version file '${path}': ${details}`);
    this.name = "StackVersionFileParseError";
  }
}

export class MissingStackVersionError extends Error {
  constructor(path: string, target: string) {
    super(`missing stack version for '${target}' in ${path}`);
    this.name = "MissingStackVersionError";
  }
}
