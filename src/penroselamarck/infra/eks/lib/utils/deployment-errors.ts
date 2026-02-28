/**
 * Base error for invalid deployment configuration values.
 *
 * :param message: Human-readable error message.
 * :returns: A typed deployment configuration error instance.
 * :side effects:
 *   - Sets ``name`` to the runtime class name.
 *   - Rebinds prototype for reliable ``instanceof`` checks after transpilation.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      throw new DeploymentConfigurationError("Invalid deployment configuration.");
 */
export class DeploymentConfigurationError extends Error {
  /**
   * Construct a deployment configuration error.
   *
   * :param message: Human-readable error message.
   * :returns: ``DeploymentConfigurationError``.
   * :side effects:
   *   - Sets ``name`` to the runtime class name.
   *   - Rebinds prototype for reliable ``instanceof`` checks after transpilation.
   * :raises: None.
   *
   * :example:
   *   .. code-block:: ts
   *
   *      const err = new DeploymentConfigurationError("Missing required variable.");
   */
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error raised when ``stack-version.yaml`` cannot be found.
 *
 * :param filePath: Absolute or relative path expected for the stack version file.
 * :returns: A typed stack-version-file-not-found error instance.
 * :side effects:
 *   - Formats and sets an actionable message instructing to create the file.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      throw new StackVersionFileNotFoundError("/repo/infra/eks/stack-version.yaml");
 */
export class StackVersionFileNotFoundError extends DeploymentConfigurationError {
  /**
   * Construct a stack-version-file-not-found error.
   *
   * :param filePath: Absolute or relative path expected for the stack version file.
   * :returns: ``StackVersionFileNotFoundError``.
   * :side effects:
   *   - Formats and sets an actionable message instructing to create the file.
   * :raises: None.
   *
   * :example:
   *   .. code-block:: ts
   *
   *      const err = new StackVersionFileNotFoundError("stack-version.yaml");
   */
  constructor(filePath: string) {
    super(
      `Stack version file not found at ${filePath}. Create stack-version.yaml with keys 'eks' and 'oidc'.`,
    );
  }
}

/**
 * Error raised when ``stack-version.yaml`` has invalid syntax or content.
 *
 * :param filePath: Path to the stack version file.
 * :param lineNumber: 1-based line number that failed validation.
 * :param reason: Detailed parse/validation reason.
 * :returns: A typed stack-version-file-parse error instance.
 * :side effects:
 *   - Formats and sets an actionable parse error message.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      throw new StackVersionFileParseError("stack-version.yaml", 3, "Missing value.");
 */
export class StackVersionFileParseError extends DeploymentConfigurationError {
  /**
   * Construct a stack-version-file-parse error.
   *
   * :param filePath: Path to the stack version file.
   * :param lineNumber: 1-based line number that failed validation.
   * :param reason: Detailed parse/validation reason.
   * :returns: ``StackVersionFileParseError``.
   * :side effects:
   *   - Formats and sets an actionable parse error message.
   * :raises: None.
   *
   * :example:
   *   .. code-block:: ts
   *
   *      const err = new StackVersionFileParseError(
   *        "/repo/infra/eks/stack-version.yaml",
   *        4,
   *        "Unsupported key 'foo'.",
   *      );
   */
  constructor(filePath: string, lineNumber: number, reason: string) {
    super(`Invalid stack version file ${filePath} at line ${lineNumber}: ${reason}`);
  }
}

/**
 * Error raised when a target stack version is missing from ``stack-version.yaml``.
 *
 * :param stackLabel: Logical stack label shown in the error message.
 * :param stackKey: Required key in ``stack-version.yaml``.
 * :param filePath: Path to ``stack-version.yaml``.
 * :returns: A typed missing-stack-version error instance.
 * :side effects:
 *   - Formats and sets an actionable message instructing which key to add.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      throw new MissingStackVersionError("penroselamarck-eks", "eks", "stack-version.yaml");
 */
export class MissingStackVersionError extends DeploymentConfigurationError {
  /**
   * Construct a missing-stack-version error.
   *
   * :param stackLabel: Logical stack label shown in the error message.
   * :param stackKey: Required key in ``stack-version.yaml``.
   * :param filePath: Path to ``stack-version.yaml``.
   * :returns: ``MissingStackVersionError``.
   * :side effects:
   *   - Formats and sets an actionable message instructing which key to add.
   * :raises: None.
   *
   * :example:
   *   .. code-block:: ts
   *
   *      const err = new MissingStackVersionError(
   *        "penroselamarck-github-oidc-bootstrap",
   *        "oidc",
   *        "stack-version.yaml",
   *      );
   */
  constructor(stackLabel: string, stackKey: string, filePath: string) {
    super(
      `You have to specify a stack version. Set key '${stackKey}' for stack ${stackLabel} in ${filePath}.`,
    );
  }
}
