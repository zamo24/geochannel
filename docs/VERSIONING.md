# Versioning and Compatibility

GeoChannel uses [Semantic Versioning](https://semver.org/) for public releases.
During the developer preview, releases remain in the `0.x` series.

## Coordinated Release Version

GeoChannel uses one coordinated version across its public release artifacts:

- the Git tag and GitHub release
- `@geochannel/client`
- `@geochannel/contracts`
- the GeoChannel backend container

For example, a future release `v0.2.0` would correspond to:

```text
Git tag:                 v0.2.0
@geochannel/client:      0.2.0
@geochannel/contracts:   0.2.0
Backend container:       0.2.0
```

The backend, client, and contracts are developed and tested together. Keeping
them on one version makes compatibility and deployment status explicit.
Independent component versions may be introduced later if their release
cadences materially diverge.

Workspace-only packages, examples, and the demonstration web application are
not independent public release artifacts, even when their package metadata
follows the coordinated repository version.

## Version Selection

GeoChannel applies these rules before `1.0.0`:

| Change | Version increment | Example |
| --- | --- | --- |
| Backward-compatible bug, security, or operational fix | Patch | `0.1.0` to `0.1.1` |
| Backward-compatible feature or public endpoint addition | Minor | `0.1.1` to `0.2.0` |
| Backward-incompatible API, SDK, configuration, or storage change | Minor | `0.2.0` to `0.3.0` |
| First stable compatibility commitment | Major | `0.x` to `1.0.0` |

Although Semantic Versioning permits breaking changes between `0.x` minor
versions, GeoChannel makes a stronger preview commitment:

> Patch releases are backward-compatible. Breaking changes require a new minor
> release and an explicit migration note.

Documentation-only changes normally do not produce a release unless they
correct documentation shipped with an already published artifact.

## Compatibility Surface

The following are public compatibility surfaces:

- HTTP routes, methods, authentication, status codes, request bodies, response
  bodies, and error structures
- Server-Sent Events frame types, field meanings, ordering, cursor behavior,
  replay behavior, and reconnect behavior
- exports, runtime behavior, and TypeScript declarations in
  `@geochannel/client`
- types, constants, and runtime validators in `@geochannel/contracts`
- required environment variables, supported values, and security-sensitive
  defaults
- Redis key formats or stored data that must survive an upgrade
- container entrypoints, ports, health checks, and documented deployment
  requirements

Additive optional response or stream fields are normally backward-compatible.
Consumers should ignore fields they do not recognize.

A change is breaking when an existing supported consumer or deployment must
change before upgrading. Examples include removing or renaming a field,
changing authentication behavior, adding a required environment variable,
changing cursor semantics, or making stored Redis data unreadable.

## Release Channels

GeoChannel uses three release channels:

| Channel | Identifier | Intended use |
| --- | --- | --- |
| Development | Commit on `main` | Development and CI only |
| Release candidate | `v0.2.0-rc.1` | Integration and upgrade validation |
| Release | `v0.2.0` | Supported developer-preview release |

When npm packages are published, release candidates should use the `next`
distribution tag and stable preview releases should use the `latest`
distribution tag.

Container consumers should pin the complete version, such as `0.2.0` or
`0.2.0-rc.1`. Floating tags such as `latest`, `0`, or `0.2` may be published
for convenience, but should not be used for controlled deployments.

## Release Process

Each release should follow this sequence:

1. Determine the next version from the compatibility impact.
2. Update the coordinated versions for all public artifacts and synchronized
   lockfiles.
3. Add user-facing release notes, including migration instructions for every
   breaking change.
4. Complete the [pre-release checklist](PRE_RELEASE_CHECKLIST.md).
5. Build release artifacts from a clean commit.
6. Publish and validate a release candidate when backend, stream, contract, or
   deployment behavior changed materially.
7. Validate downstream integration and upgrade behavior.
8. Create an annotated Git tag matching the version:

   ```bash
   git tag -a v0.2.0 -m "GeoChannel v0.2.0"
   git push origin v0.2.0
   ```

9. Publish npm packages, the backend container, and the GitHub release from
   that exact tagged commit, when those artifacts are part of the release.

Release artifacts must not be built from an uncommitted, untagged, or dirty
working tree.

## Downstream Consumption

Downstream deployments should consume released artifacts instead of copying
the GeoChannel source tree. They should record one exact GeoChannel version in
a clearly owned dependency or deployment file.

An upgrade should be made through a dedicated pull request that:

- updates the pinned GeoChannel version
- runs downstream integration and deployment tests
- reviews release notes and migration instructions
- records any required deployment-specific configuration or overlay changes

Automated tooling may open upgrade pull requests, but promotion and deployment
should remain explicit review steps. Changes from downstream deployments
should be reviewed before being proposed upstream, especially to avoid
exposing credentials, customer data, or deployment-specific configuration.

## Stability Target

GeoChannel will move to `1.0.0` when the project is prepared to maintain a
stable public API, SDK, stream protocol, and documented upgrade path. The
decision should be based on demonstrated integrations and operational
experience rather than elapsed time.
