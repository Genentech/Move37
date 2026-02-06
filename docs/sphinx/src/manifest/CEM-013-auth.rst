Authorisation
=============

``CEM-013-000``

🤖 OIDC Provider
----------------

``CEM-013-000``

Specification
~~~~~~~~~~~~~

.. include:: ./CEM-013-000.rst

Motivation
~~~~~~~~~~

.. list-table:: OIDC & Identity Providers for AI systems
   :widths: 15 17 17 17 17 17
   :header-rows: 1
   :stub-columns: 1

   * - Feature
     - Clerk
     - Auth0 (Okta)
     - Logto
     - WorkOS
     - Zitadel
   * - **AI Focus**
     - Frontend AI DX
     - Agentic Auth & FGA
     - Modern SaaS & AI
     - Enterprise Agents
     - Multi-tenancy
   * - **Setup Speed**
     - Instant (React/Next)
     - Medium (Enterprise)
     - Fast (OSS/Cloud)
     - Fast (API-first)
     - Medium
   * - **Key AI Feature**
     - Shared User Pools
     - Token Vault for RAG
     - M2M & API Keys
     - Enterprise SSO
     - Fine-grained RBAC
   * - **Best For**
     - Fast-moving startups
     - Regulated Enterprise
     - Open-source lovers
     - B2B SaaS Growth
     - Complex Permissioning
   * - **Complexity**
     - Very Low
     - High
     - Low to Medium
     - Low
     - Medium

Auth0 Setup (MCP + Codex CLI)
-----------------------------

Use this when connecting Codex CLI to the MCP server with Auth0. Codex CLI performs OAuth via
Dynamic Client Registration (DCR), so the MCP server must explicitly support OAuth and expose
the protected resource metadata endpoint. The flow used is **Authorization Code + PKCE**.

1. Auth0 Dashboard: create an **API** and set its **Identifier** to your audience
   (e.g. ``https://penroselamarck/``).
   - Auth0 Dashboard: set **Default Audience** under **Tenant Settings → API Authorization
     Settings** to exactly ``https://penroselamarck/`` to ensure DCR clients receive JWT access
     tokens for this API.
2. Auth0 Dashboard: enable **Dynamic Client Registration (DCR)** and
   **Enable Application Connections**.
   - Navigation: ``Settings → Advanced``.
3. Auth0 Dashboard: for the API **Application Access Policy**, set **User Access** to
   **Allow** and **Client Access** to **Deny**.
4. Ensure at least one connection exists (Database or Social).
5. Promote that connection to **domain level**. DCR creates **third‑party** clients that cannot
   be enabled per‑app, so domain‑level promotion is required for DCR logins to work.
   - You **must** obtain a Management API token using
     ``Applications → APIs → Auth0 Management API → API Explorer``.
     Without this token, the commands below will fail.

.. code-block:: bash

   export AUTH0_DOMAIN="YOUR_TENANT.us.auth0.com"
   export MGMT_TOKEN="YOUR_MGMT_API_TOKEN"
   export CONNECTION_NAME="google-oauth2"  # or Username-Password-Authentication

   # Fetch the connection id
   CONNECTION_ID=$(curl -s "https://${AUTH0_DOMAIN}/api/v2/connections?name=${CONNECTION_NAME}" \
     -H "Authorization: Bearer ${MGMT_TOKEN}" | jq -r '.[0].id')

   # Promote to domain-level so third-party apps can use it
   curl -s -X PATCH "https://${AUTH0_DOMAIN}/api/v2/connections/${CONNECTION_ID}" \
     -H "Authorization: Bearer ${MGMT_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"is_domain_connection": true}'

6. Configure MCP (``.env``) and restart the container:

.. code-block:: bash

   AUTH0_DOMAIN=YOUR_TENANT.us.auth0.com
   AUTH0_AUDIENCE=https://penroselamarck/

7. Configure Codex CLI and login:
   - Set ``mcp_oauth_callback_port = 1455`` in ``~/.codex/config.toml``.
   - Set ``mcp_oauth_credentials_store = "file"`` if you want MCP OAuth tokens stored in a
     file instead of the OS keyring.
   - The callback URL is **not** the MCP server. It is the local loopback URL Codex listens on.
     Ensure the Auth0 application callback URL includes ``http://localhost:1455/auth/callback``.
   - Run:

.. code-block:: bash

   codex mcp login penroselamarck

8. Validate OAuth metadata (optional):

.. code-block:: bash

   curl -s http://penroselamarck-api:8080/.well-known/oauth-protected-resource | jq
