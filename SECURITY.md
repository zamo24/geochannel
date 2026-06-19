# Security Policy

## Supported Versions

GeoChannel is currently a developer preview. Security fixes are applied to the
latest release and the `main` branch. Older preview releases may not receive
backports.

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Select **Report a vulnerability**.

Include affected versions, reproduction steps, impact, and any suggested
mitigation. Reports will be acknowledged as capacity permits; no response-time
SLA is currently offered.

## Deployment Responsibility

The default Docker Compose stack is intended for local development. Operators
are responsible for TLS, Redis authentication and persistence, secret
management, network controls, monitoring, backups, upgrades, and incident
response in deployed environments.
