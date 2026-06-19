# Trusted Token Broker Reference

## Purpose

This is customer-facing reference code that demonstrates how a customer's
trusted backend should interface with the GeoChannel API. It is provided so a
customer can evaluate the complete flow and adapt the `createChannelSession`
operation into their existing backend.

It is not a production-ready authentication service and customers are not
expected to deploy it unchanged. In production, the customer's backend should
replace the example `BROKER_ACCESS_TOKEN` check with its existing user
authentication and authorization rules.

This reference service keeps the GeoChannel tenant API key out of browser
bundles. It accepts a spatial channel request, creates the channel through
GeoChannel, mints a short-lived stream token, and returns only browser-safe
channel credentials.

The included `BROKER_ACCESS_TOKEN` check makes the standalone example safe for
local or server-to-server evaluation. In a customer application, mount the
same `createChannelSession` operation behind the application's existing
authenticated user session. Do not embed `BROKER_ACCESS_TOKEN` in a public
browser bundle.

## Customer Integration Model

The reference demonstrates this interface:

```text
Customer browser
  -> customer trusted backend
  -> GeoChannel POST /channels using the tenant API key
  -> GeoChannel POST /token using the tenant API key
  -> customer backend returns only channelId and short-lived stream token
  -> browser connects directly to GeoChannel GET /stream
```

When adapting the example, the customer backend should also verify that the
authenticated user may access the requested area or assets, restrict channel
size and token lifetime, rate-limit requests, and log token issuance.

## Run

```bash
cp examples/token-broker/.env.example examples/token-broker/.env
set -a
. examples/token-broker/.env
set +a
npm --prefix examples/token-broker start
```

Create a channel session:

```bash
curl -sS http://localhost:8090/channel-session \
  -H "authorization: Bearer $BROKER_ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{"tiles":["882a107289fffff"],"res":8}'
```

The response includes `channelId` and a short-lived `token`, but never the
GeoChannel tenant API key.

## Test

```bash
npm --prefix examples/token-broker test
```
