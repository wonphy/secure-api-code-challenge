# Security risk register

This document records known security findings that are accepted for this proof
of concept, including the rationale, mitigations, and review triggers. It is
not a substitute for deployment controls, incident response, or a production
risk-management process.

## Accepted dependency finding: `braces` stack-exhaustion denial of service

| Field                   | Decision                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Finding                 | `GHSA-vfj7-8cjw-p6xm` / CVE-2026-93687: `braces` versions through `3.0.3` can exhaust the Node.js call stack while processing deeply nested brace patterns.                                                                                                                                                                                                              |
| Severity                | High according to the advisory; impact is availability of the affected Node.js process.                                                                                                                                                                                                                                                                                  |
| Dependency path         | `http-proxy-middleware` → `micromatch` → `braces`.                                                                                                                                                                                                                                                                                                                       |
| Current use             | The gateway configures one fixed, developer-controlled proxy filter: `/api/users`. It does not accept a glob or route-filter pattern from an HTTP client, request body, query parameter, environment value, or tenant configuration.                                                                                                                                     |
| Reachability assessment | The vulnerable parser processes matching patterns, not the client pathname being matched. With the fixed filter above, an unauthenticated caller cannot supply a deeply nested brace pattern to this code path. Exploitability in the current implementation is therefore assessed as low.                                                                               |
| Why retained            | `http-proxy-middleware` is a maintained proxy library. Replacing it with a bespoke in-process proxy would increase application-owned HTTP edge-case and maintenance risk for a finding that is not reachable in this design. In a production deployment, reverse-proxy responsibilities would ordinarily sit at an API gateway, ingress, load balancer, or service mesh. |
| Compensating controls   | Keep `pathFilter` developer-controlled; prohibit user- or tenant-supplied glob patterns; enforce gateway rate limiting and restart/health-check controls at infrastructure level; retain dependency scanning; and keep the backend private with mTLS where required.                                                                                                     |
| Review trigger          | Reassess on a `braces`, `micromatch`, or `http-proxy-middleware` release; on any proxy configuration change; before allowing dynamic route filters; and at least every 90 days while the finding remains open.                                                                                                                                                           |
| Owner                   | Gateway/service owner.                                                                                                                                                                                                                                                                                                                                                   |

The GitHub advisory currently lists no patched `braces` version. Do not add a
package override that merely changes audit output without an upstream security
fix. When a compatible fix is available, update the dependency chain, rerun
the full test suite and production dependency audit, and remove this entry.
