# Notification services compared

Research for ticket #3, part of map #1. Findings only, no recommendation. Facts checked on 2026-11-12 against vendor docs, pricing pages and the npm registry. Prices and limits change; recheck before committing.

## Cadence context

Cadence runs React Router 8.3 on Node with `better-sqlite3` and Drizzle, React 19. Cadence needs an in-app NotificationFeed (bell, unread count, read/unread), browser web push and email, for learners, instructors and admins. Every service below is a hosted HTTP API plus a client SDK, so none of them touches the SQLite database. The only app-side data they need is a stable user id and, for email, an address. None of the vendors documents React Router 8 specifically. Each documents Next.js or Remix quickstarts, and the React components are plain client components that need a server-minted token or a public key.

## Summary

| | Knock | Novu | Courier | MagicBell | SuprSend |
|---|---|---|---|---|---|
| React feed | Prebuilt `NotificationFeed` and popover, plus headless client | Prebuilt `<Inbox />` plus hooks | Prebuilt `CourierInbox` plus low-level APIs | Prebuilt `Inbox` and `FloatingInbox`, no documented hooks | Drop-in and headless in `@suprsend/react` |
| Web push | Only through FCM, documented as web or mobile | Through providers: FCM, OneSignal, Pusher Beams, Pushpad | Documented only through Pusher Beams web mode | Built in, you supply a VAPID key pair | Built in, no extra provider |
| Email | Via your provider (SES, Resend, Postmark, SendGrid and others) | Via your provider (SES, Resend, Postmark, SendGrid and others) | Via your provider (SES, SendGrid, Postmark, Resend, SMTP) | Via SES, SendGrid, Mailgun, SMTP or Ping Email | Via your provider; you pay the provider directly |
| User id | `id` string, up to 256 chars | `subscriberId` | `userId` plus server-minted JWT | `external_id` or email, server-minted JWT | `distinct_id` |
| Free tier | 10,000 messages per month | 10,000 workflow runs per month | 10,000 sends per month | 1,000 deliveries per month | 10,000 notifications per month |
| Cheapest paid | $250 per month | $30 per month | $0.005 per send, no base fee | $249 per month | $100 per month |
| Data region | US documented; EU expected by end of 2026 | US and EU on the free tier | US and EU (Ireland); EU on paid plans | Not stated | Not stated; custom region on Enterprise |

## Knock

- **Feed.** `@knocklabs/react` ships `NotificationFeed` and `NotificationFeedPopover`, built on the `@knocklabs/client` JS SDK. Feeds return unread, read and seen counts for badge UIs, can be filtered by status, and update over a managed websocket. A headless path uses the lower-level client primitives. React peer range is 17 to 19. Sources: https://docs.knock.app/in-app-ui/feeds/overview , https://docs.knock.app/in-app-ui/react/sdk/overview , https://docs.knock.app/llms.txt , https://www.npmjs.com/package/@knocklabs/react
- **Web push.** The push overview lists APNs, FCM, Expo, SNS and OneSignal and describes mobile only. The FCM page says it can send "mobile or web push" and tells you to store the web FCM token as channel data on the recipient. Knock has no browser push of its own; the browser registration and service worker are yours. Sources: https://docs.knock.app/integrations/push/overview.md , https://docs.knock.app/integrations/push/firebase.md
- **Email.** Sent through a provider channel: SES, Cloudflare Email, MailerSend, Mailgun, Mailjet, Mailtrap, Mandrill, Postmark, Resend, SendGrid, SMTP, SparkPost. Source: https://docs.knock.app/llms.txt
- **Server and users.** Node SDK `@knocklabs/node`. Users must be identified before they can be notified; `id` is the only required field (up to 256 characters, no `/` or `#`, immutable), `email` is needed for email. Inline identification is possible when triggering a workflow. The client needs a public key; production should enable enhanced security mode, which requires a signed user token. Sources: https://docs.knock.app/concepts/users , https://docs.knock.app/in-app-ui/security-and-authentication.md
- **Pricing.** Free: 10,000 messages per month, 500 guide recipients, unlimited profiles and team members; over the limit Knock does not hard-cap and contacts you. Starter: $250 per month with 50,000 messages, then $0.005 each. A message is one delivery to one user on one channel, so an in-app plus email workflow counts as two. Blocked-by-preference and failed sends are not billed. Source: https://knock.app/pricing
- **Region.** The security page says "We expect to support EU data residency by the end of 2026." Hosting location is not otherwise stated; the API base is `https://api.knock.app/v1`. Sources: https://docs.knock.app/developer-tools/security.md , https://docs.knock.app/api-reference/overview.md

## Novu

- **Feed.** `@novu/react` provides `<Inbox />` with bell, notification list and preferences panel, plus composable `Bell`, `Notifications`, `InboxContent` and `Preferences`, and headless hooks. `@novu/js` is the framework-agnostic client. The bell unread count updates in real time. React 18 or 19. Sources: https://docs.novu.co/platform/inbox/overview.md , https://www.npmjs.com/package/@novu/react
- **Web push.** Push is a provider channel. FCM (with one integration per Android and web app), OneSignal ("mobile and web"), Pusher Beams (iOS, Android, web) and Pushpad (web push) are listed. Novu stores subscriber device tokens and removes stale ones for FCM and Expo. Sources: https://docs.novu.co/platform/integrations/push.md , https://docs.novu.co/platform/integrations/push/pushpad.md
- **Email.** Provider channel: SendGrid, SES, Resend, Postmark, Brevo, Mailgun, Mailjet, SparkPost, Mandrill, custom SMTP and others. Source: https://docs.novu.co/platform/integrations/email.md
- **Server and users.** Server SDK `@novu/api`; a Remix quickstart exists. The Inbox takes `applicationIdentifier` (public) and `subscriberId`; new subscribers are created on first session. For production, enable HMAC: the server signs each `subscriberId` into a `subscriberHash`, otherwise anyone who guesses an id can read that user's feed. Sources: https://docs.novu.co/platform/quickstart/remix.md , https://docs.novu.co/platform/inbox/prepare-for-production.md
- **Pricing.** Free: 10,000 workflow runs per month, 5 workflows, 2 environments, 3 team members, all channels, 24-hour activity-feed retention. Pro from $30 per month (30,000 runs, then $1.20 per 1,000, 7-day retention). Team from $250 per month. Self-hosting is listed under Enterprise only. The pricing page does not define a workflow run. Source: https://novu.co/pricing
- **Region.** US and EU data residency on the free tier. The EU needs `apiUrl` `https://eu.api.novu.co` and `socketUrl` `wss://eu.socket.novu.co` on the Inbox. Enterprise adds more regions. Sources: https://novu.co/pricing , https://docs.novu.co/platform/inbox/prepare-for-production.md

## Courier

- **Feed.** `@trycourier/courier-react` v9 (React 18 and up) provides `CourierInbox`, toasts and a preference center. `@trycourier/courier-ui-inbox` covers other frameworks. You can theme it, supply your own views while the SDK manages messages, or build on low-level APIs. Sources: https://www.courier.com/docs/in-app/overview.md , https://www.npmjs.com/package/@trycourier/courier-react
- **Web push.** The docs list FCM, APNs, Expo, OneSignal, SNS, Pusher Beams and others. The only page that names a web mode is Pusher Beams (`web`, `apns`, `fcm`). No first-party browser push is documented. Sources: https://www.courier.com/docs/integrations/push/overview.md , https://www.courier.com/docs/integrations/push/pusher-beams.md
- **Email.** Courier is not an email provider; it sends through SES, SendGrid, Postmark, Resend, SMTP and others you connect. Source: https://www.courier.com/docs/integrations/email/overview.md
- **Server and users.** Node SDK `@trycourier/courier` v7 and later, `client.send.message`. Recipients are profiles keyed by `user_id`, created through the API, a CSV import or inline. Client SDKs sign in with `signIn({ userId, jwt })`; the backend mints a short-lived scoped JWT through `POST /auth/issue-token`. Sources: https://www.courier.com/docs/in-app/authenticate-users.md , https://www.courier.com/docs/guides/import-your-users.md
- **Pricing.** Developer: free, 10,000 sends per month. Business: $0.005 per send, no base fee, and every send is billed including the first 10,000. One send is one template to one recipient, regardless of channel count. Enterprise: custom. Source: https://www.courier.com/pricing
- **Region.** Separate US and EU (Ireland) datacenters with no shared data (own templates, users, logs, keys). EU is on paid plans (Business and Enterprise) and needs the EU console, API (`api.eu.courier.com`) and inbox endpoints. Source: https://www.courier.com/docs/workspaces/datacenters.md

## MagicBell

- **Feed.** `@magicbell/react` has `Inbox`, `FloatingInbox` (bell trigger plus panel), `InlineNotification`, `WebPushButton`, `ToastContainer`, `UserPreferences`, wrapped in `ContextProvider` with a `token`. Read and unread states are shown. The React docs do not mention hooks or a headless API, or an unread-count prop. Also available: `magicbell-js` (Node and browser clients), Preact, Svelte and Web Components. Sources: https://www.magicbell.com/docs/libraries/magicbell-react , https://www.magicbell.com/docs
- **Web push.** Built in. The browser creates a PushSubscription; the app stores the endpoint, `p256dh` and `auth` as a token through `PUT /v2/channels/web_push/tokens`. You configure a VAPID key pair in the dashboard or via `PUT /v2/integrations/web_push`. Source: https://www.magicbell.com/docs/channels/web_push
- **Email.** Delivered through SES, SendGrid, Mailgun, SMTP or Ping Email. Source: https://www.magicbell.com/docs/channels/email
- **Server and users.** Server client `magicbell-js/project-client` with a project access token; `createBroadcast` generates notifications for recipients. A user is identified by `external_id` (permanent, immutable, preferred for production) or email; external id wins if both are given. The browser authenticates with a User JWT signed server-side with HS256, with claims `user_external_id` and/or `user_email` plus `api_key`; the docs' examples use one-year expiry. Sources: https://www.magicbell.com/docs/primitive/user , https://www.magicbell.com/docs/api/authentication/user , https://www.magicbell.com/docs/libraries/magicbell-js
- **Pricing.** Builder: free, 1,000 deliveries per month, 1 project. Startup: $249 per month for 50,000 deliveries, then $0.0025 each, $99 per extra project. Deliveries add up every channel a user receives. Source: https://www.magicbell.com/pricing
- **Region.** The pricing page and docs state none. The Trust Centre mentions encryption and GDPR but no region. Source: https://www.magicbell.com/security

## SuprSend (extra)

- **Feed.** `@suprsend/react` has drop-in and headless inbox options with JWT user auth; web components cover other frameworks. React peer range is 16.8 and up. Sources: https://docs.suprsend.com/docs/react-inbox-integration.md , https://www.npmjs.com/package/@suprsend/react
- **Web push.** Built in; a Web Push template and workflow node exist, and the pricing page says web push needs no intermediary provider. Sources: https://docs.suprsend.com/docs/web-push-template.md , https://www.suprsend.com/pricing
- **Email.** Needs your own provider account (for example SendGrid or SES) that you pay directly. Source: https://www.suprsend.com/pricing
- **Server and users.** Node SDK `@suprsend/node-sdk`. Users are upserted by `distinct_id`. Sources: https://docs.suprsend.com/reference/create-update-users.md , https://docs.suprsend.com/docs/integrate-node-sdk.md
- **Pricing.** Free: 10,000 notifications per month, in-app feed carries SuprSend branding. Essentials: $100 per month for 50,000 then $2 per 1,000, removes branding. Business: $250 per month for 50,000 then $5 per 1,000, adds digest and preferences. Each channel delivery counts separately. Source: https://www.suprsend.com/pricing
- **Region.** The pricing page does not name a default region. Enterprise lists a custom data center region, multi-region, self-hosted and bring-your-own-cloud (beta). Source: https://www.suprsend.com/pricing

## Other services seen, not researched

NotificationAPI added a Frankfurt EU region (reported on its own blog: https://www.notificationapi.com/blog/introducing-notificationapi-s-european-data-center ). Engagespot and OneSignal were not checked.

## Gaps and cautions

- No vendor page mentions React Router 8. Compatibility is inferred from React peer ranges on npm and from the services being plain HTTP plus client components.
- Knock EU residency is a stated plan, not a shipped feature. MagicBell and SuprSend (below Enterprise) publish no region.
- Metering units differ (Knock per message, Novu per workflow run, Courier per send, MagicBell per delivery, SuprSend per channel delivery), so free tiers are not like for like.
- A competitor blog's claims about Knock regions were ignored; only Knock's own docs are cited.
- Pricing pages were read through a page-summarizing tool; Novu's definition of a workflow run was not visible.
