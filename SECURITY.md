# Security policy

## Reporting a vulnerability

Please report a vulnerability privately, never in a public issue:

- **GitHub:** use private vulnerability reporting on this repository (Security tab → "Report a vulnerability").
- **E-mail:** hi@heyresearch.xyz, with a subject line starting with "Security".

Include what you found, where (file, endpoint or package version), and the steps to reproduce it.

## Scope

In scope: HEY Research Lab's own code and services:

- the packages and apps in this repository (`@hey-research-lab/sdk`, `@hey-research-lab/mcp`, the source adapters, the
  scoring package);
- heyresearch.xyz, its public API (`/api/*`, `/api/v1/*`), the hosted MCP endpoint and the HEY Telegram bot.

Out of scope: projects HEY researches, their contracts and sites; third-party providers HEY reads; Robinhood Chain
itself; and findings that need a compromised device or account, social engineering, or volumetric denial of service.
Please test only against your own accounts and data, and do not access or change anyone else's.
