# `@geochannel/client`

Fetch-based JavaScript helpers for creating GeoChannel spatial channels,
minting stream tokens, and consuming authenticated Server-Sent Events.

```js
import { subscribeChannelStream } from "@geochannel/client";

const stream = subscribeChannelStream(
  (path) => new URL(path, "https://api.example.com").toString(),
  {
    channelId,
    offset: "$",
    headers: { authorization: `Bearer ${token}` },
    onMessage(frame) {
      console.log(frame);
    }
  }
);

stream.close();
```

See the
[integration quickstart](https://github.com/zamo24/geochannel/blob/main/docs/CUSTOMER_INTEGRATION_QUICKSTART.md)
for the trusted token-broker flow.

Licensed under Apache-2.0.
