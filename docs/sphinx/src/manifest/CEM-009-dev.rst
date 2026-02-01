Development Environment
=======================

``CEM-009``

IDE
---

``CEM-009-000``

Specification
~~~~~~~~~~~~~

vscode is the recommended IDE.

Motivation
~~~~~~~~~~

TODO

Utils
~~~~~

**VS Code Keyboard Shortcuts (Windows)**

.. list-table::
  :header-rows: 1
  :widths: 40 60

  * - Action
    - Shortcut
  * - Command Palette
    - ``Ctrl+Shift+P`` or ``F1``
  * - Quick Open File
    - ``Ctrl+P``
  * - Toggle Terminal
    - ``Ctrl+```
  * - New Terminal
    - ``Ctrl+Shift+```
  * - Toggle Sidebar
    - ``Ctrl+B``
  * - Go to Symbol
    - ``Ctrl+Shift+O``
  * - Find in Files
    - ``Ctrl+Shift+F``
  * - Replace in Files
    - ``Ctrl+Shift+H``
  * - Multi-cursor Selection
    - ``Ctrl+Alt+Down/Up``
  * - Select All Occurrences
    - ``Ctrl+Shift+L``
  * - Rename Symbol
    - ``F2``
  * - Format Document
    - ``Shift+Alt+F``
  * - Comment Line
    - ``Ctrl+/``
  * - Duplicate Line
    - ``Shift+Alt+Down/Up``
  * - Delete Line
    - ``Ctrl+Shift+K``

**VS Code Keyboard Shortcuts (macOS)**

.. list-table::
  :header-rows: 1
  :widths: 40 60

  * - Action
    - Shortcut
  * - Command Palette
    - ``Cmd+Shift+P`` or ``F1``
  * - Quick Open File
    - ``Cmd+P``
  * - Toggle Terminal
    - ``Ctrl+```
  * - New Terminal
    - ``Ctrl+Shift+```
  * - Toggle Sidebar
    - ``Cmd+B``
  * - Go to Symbol
    - ``Cmd+Shift+O``
  * - Find in Files
    - ``Cmd+Shift+F``
  * - Replace in Files
    - ``Cmd+Shift+H``
  * - Multi-cursor Selection
    - ``Cmd+Option+Down/Up``
  * - Select All Occurrences
    - ``Cmd+Shift+L``
  * - Rename Symbol
    - ``F2``
  * - Format Document
    - ``Shift+Option+F``
  * - Comment Line
    - ``Cmd+/``
  * - Duplicate Line
    - ``Shift+Option+Down/Up``
  * - Delete Line
    - ``Cmd+Shift+K``

Remote (AWS)
------

``CEM-009-001``

Specification
~~~~~~~~~~~~~

- The VS Code + Docker engine + Devcontainer + EC2 setup is a recommended remote development environment.
- Install the VS Code Remote - Containers extension.
- Install the VS Code devcontainer extension.
- TODO setup for EC2.

Motivation
~~~~~~~~~~

- Docker engine for container hosting.
- Devcontainer to encapsulate project dependencies in a portable environment.
- VS Code is the recommended IDE (see CEM-008-000).
- Cloud-native approach: use AWS/AZ extensively. EC2 or AZ VM are recommended
  VMs for hosting development environments, enabling scalable compute/memory/network.

Remote (ONA)
------------

``CEM-009-002``

Specification
~~~~~~~~~~~~~

ONA provides a secure, ephemeral development environment in Roche's VPC. It
creates pre-configured standardized environments, enabling quick onboarding.
ONA also provides "ONA agents" connecting the development environment to Claude code.

Onboarding and documentation: ONA.


Motivation
~~~~~~~~~~

- Ease of use: available for Roche account holders with minimal onboarding.
- Secure environment: code and data remain within Roche's secure VPC.
- Fast onboarding: version-controlled devcontainer.json ensures consistent tooling.
- Personal IDE: supports VS Code, JetBrains, Cursor, or SSH.
- AI assistants: Claude code and agents via ONA agents for autonomous development.
- Scalable: decouples development from corporate laptop constraints.

Devcontainer
------------

``CEM-009-003``

TODO
