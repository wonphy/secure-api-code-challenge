# Deployment security architecture

Docker Compose is a local integration layout, not a public-internet deployment
topology. In production, the gateway service is deployed behind managed edge
controls and the backend is reachable only from the gateway workload.

```text
Internet
  -> CDN / DDoS protection / WAF
  -> API gateway, load balancer, or ingress (public TLS and rate limiting)
  -> Secure Entry gateway (JWT validation and backend timeout)
  -> private network with mTLS -> User API
```

## Public-edge controls

The public entry point must terminate TLS with managed certificates and publish
only the gateway route. It must apply WAF rules, DDoS protections, request and
connection limits, and distributed rate limits. These controls belong at the
edge because they protect every gateway instance consistently and can use a
shared rate-limit store or managed service.

The backend must have no public listener. Network policies, security groups,
or equivalent workload controls must restrict it to the gateway. Where the
threat model requires it, mTLS authenticates the gateway workload to the
backend in addition to network isolation.

If the gateway receives client IP forwarding headers from the edge, configure
Express to trust only the known ingress proxy addresses or hop count after the
gateway is no longer directly reachable. Do not enable unrestricted proxy trust.

## Gateway safeguards

`BACKEND_TIMEOUT_MS` bounds a single gateway-to-backend request. It defaults to
10 seconds and accepts an integer from 100 through 300000 milliseconds. This
limits how long a slow or stalled upstream can retain gateway resources; it does
not replace edge connection, request-body, or client-response timeouts.

Choose the timeout from the service latency objective and retry policy. Avoid
blind automatic retries for non-idempotent user writes, because a timed-out
response does not prove that the backend did not complete the operation.
