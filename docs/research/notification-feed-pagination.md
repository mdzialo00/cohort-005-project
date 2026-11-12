# Notification feed pagination

Research for ticket #8, part of map #1. Facts checked on 2026-11-12 against vendor docs, vendor source code on GitHub, the npm package for MagicBell, and a few database and API references. Only first-party sources are cited. Vendor docs and SDKs change; recheck before committing.

## Question

The chosen feed is a bell popover, about 28rem tall and scrolling, which becomes a full-width panel on mobile. What are the pagination options when a person has 100 or more Notifications in the NotificationFeed? Compare load more, infinite scroll, a cursor API against an offset API, and a "see all" page behind the popover. Cover what the candidate services' React feeds already do (Knock, Novu, Courier, MagicBell, SuprSend), whether old Notifications expire, and how the unread count and mark all read behave when only part of the list is loaded.

## Short answer

- All five services paginate the popover list with scroll-triggered loading, not a "see all" page. Knock, Novu, Courier and SuprSend load the next page as the reader nears the bottom. MagicBell does the same through a virtual list. Each fetches a page of 10 to 50 items, so 100+ Notifications are never loaded at once.
- All five use a cursor in the code that drives the prebuilt feed. Knock and Courier send `after`, MagicBell `starting_after`, SuprSend a `search_after` pair of pinned flag and creation time, and Novu `after` with a notification id. Novu's API also accepts `offset`. Offset is the weaker choice for a list that gains rows at the top, and Postgres documents that skipped rows still cost work.
- The unread count is a separate server number in Courier (`count` query), MagicBell (a count endpoint) and Novu (`count`). Knock and SuprSend return counts in the feed response, but their docs do not say clearly that those cover unloaded items. MagicBell's bell dot is the exception, because the source shows it reads only loaded Notifications.
- Mark all read is optimistic on the loaded items and then calls a server endpoint that has no id list, so it covers unloaded Notifications too. This holds for Knock, Novu, MagicBell and SuprSend in the source or docs read. For Courier only the docs line "marks all messages as read" was checked.
- Expiry differs a lot. Knock keeps in-app feed items indefinitely. Novu deletes inbox messages after 30 days on Free and 90 days on Pro and Team. Courier and SuprSend let the sender set an expiry per message. MagicBell documents no expiry or retention window.
- For Cadence, use the vendor feed's own scroll pagination in the popover, keep the first page small, and add a "see all" page later only if people ask for search or history.

## UI patterns

These are design choices, not specified behaviors. The sources only show what the five feeds do.

- **Infinite scroll.** The next page loads when the reader nears the bottom of the scroll area. It fits a 28rem popover because the scroll area is its own container. The W3C ARIA Authoring Practices feed pattern describes this model ("a section of a page that automatically loads new sections of content as the user scrolls"). It sets `aria-busy` while articles are added, uses `aria-setsize` of -1 when the total is unknown, and gives keyboard users Page Down, Page Up and Control+End to move through and past the feed. Source: https://www.w3.org/WAI/ARIA/apg/patterns/feed/
- **Load more button.** The reader asks for the next page. Novu's React hook documents both a "Load More" button example and an infinite scroll example, driven by `hasMore` and `fetchMore`. Source: https://docs.novu.co/platform/sdks/react/hooks/use-notifications.md
- **What the prebuilt feeds pick.** Knock, Novu, Courier, SuprSend and MagicBell all load on scroll in their drop-in components (per-service sections below). None of them ships a load more button in the drop-in feed. SuprSend lets you turn pagination off with `pagination={false}`. Source: https://docs.suprsend.com/docs/react-in-app-feed.md
- **Mobile.** None of the pages read cover a full-width mobile panel specifically. The scroll container is the panel, so the same pagination applies. Not verified for any service.

## Cursor against offset

- **Offset.** The page is "skip N rows, take M". PostgreSQL says "The rows skipped by an `OFFSET` clause still have to be computed inside the server; therefore a large `OFFSET` might be inefficient," and that LIMIT/OFFSET "will give inconsistent results unless you enforce a predictable result ordering with `ORDER BY`." Source: https://www.postgresql.org/docs/current/queries-limit.html . I did not find the equivalent SQLite text, because the SQLite SELECT page was truncated when fetched. Cadence uses SQLite, so the cost point is unverified for it.
- **Cursor.** The client sends the last item it has and asks for items after it. Stripe's list API is the clearest first-party description. `starting_after` is "an object ID that defines your place in the list," and the response carries `has_more`. Source: https://docs.stripe.com/api/pagination
- **Consequence for a feed.** New Notifications arrive at the top while the reader scrolls. With an offset, every arrival shifts the rows, so the next page repeats an item. With a cursor, the next page starts after the last item seen. That follows from how the two are defined above. No source I read tests this on a notification feed.
- **What the services do.** Knock, Courier, MagicBell and SuprSend are cursor-based in the prebuilt feed code. Novu's API accepts both. Details below.

## "See all" page behind the popover

- No candidate documents a "see all" page pattern. All five ship the popover list as a complete, paginated view.
- Knock and MagicBell publish the popover and the inline panel as separate components. Knock has `NotificationFeed` and `NotificationFeedPopover`. MagicBell has `Inbox` and `FloatingInbox`. Novu documents composable `Bell`, `Notifications` and `InboxContent` pieces. So a full page can reuse the same list component outside the popover. Sources: https://docs.knock.app/in-app-ui/react/sdk/overview , https://www.magicbell.com/docs/libraries/magicbell-react , https://docs.novu.co/platform/inbox/overview.md
- Cost of adding it to Cadence is a new route, a link in the popover footer, and a second list view with filters. If the feed is a vendor component, the page can mount the same component.
- What it buys over scrolling in the popover is room for search, filters, and a place to read old Notifications. Whether Cadence people want that is not something the sources can tell us.

## Knock

- **Feed pagination.** The prebuilt `NotificationFeed` does infinite scroll. It calls `feedClient.fetchNextPage()` when the reader is within 70px of the bottom, no request is in flight, and `pageInfo.after` has a value. There is no load more button. Source: https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx
- **API.** The feed list endpoint takes `after`, `before` and `page_size`, which "defaults to 50". No maximum is documented. Source: https://docs.knock.app/api-reference/users/feeds/list_items
- **Retention.** Message log data is kept 30 days on all plans except Enterprise (90 days), but "in-app feed notifications" are "available indefinitely" and can still be fetched and updated. Source: https://docs.knock.app/manage-your-account/data-retention.md . The pages read do not describe a per-message expiry. Archiving is how a sender retires a stale message. Source: https://docs.knock.app/in-app-ui/feeds/overview
- **Unread count.** The feed response has `meta` with `total_count`, `unread_count` and `unseen_count`, described as "aggregate values for unread counts, read counts, and seen counts, for use in feed badge UIs." The docs do not say whether these cover only the loaded page. The default badge counts seen items, not unread ones. `badgeCountType="unread"` on `NotificationIconButton` switches it. Sources: https://docs.knock.app/api-reference/users/feeds/list_items , https://docs.knock.app/in-app-ui/feeds/overview , https://docs.knock.app/in-app-ui/react/feed.md
- **Mark all read.** `feedClient.markAllAsRead()` updates the loaded items at once, and sends a request to mark "all items on the feed in the current scope" as read. The docs add that the server work "is deferred and may take some time". Source: https://docs.knock.app/in-app-ui/javascript/sdk/feed-client.md . By default the popover marks items seen on open, not read. Source: https://docs.knock.app/in-app-ui/react/feed.md . What the prebuilt "Mark all as read" button does by default is not documented. The component page only defines the `onMarkAllAsReadClick` prop. Source: https://docs.knock.app/in-app-ui/react/sdk/components/notification-feed.md

## Novu

- **Feed pagination.** The Inbox list uses infinite scroll in the JS UI source. It calls `notifications.list({ after })`, paginating on the notification `id`. Source: https://github.com/novuhq/novu/blob/next/packages/js/src/ui/api/hooks/useNotifications.ts . The React hook `useNotifications` returns `hasMore` and `fetchMore`, and the docs show both a button and an IntersectionObserver example. Source: https://docs.novu.co/platform/sdks/react/hooks/use-notifications.md
- **API.** `list()` defaults to `limit = 10`. The inbox service accepts both `after` and `offset`. The `@novu/js` docs example uses `limit` and `offset`, and the response has `hasMore`. Sources: https://github.com/novuhq/novu/blob/next/packages/js/src/notifications/notifications.ts , https://github.com/novuhq/novu/blob/next/packages/js/src/api/inbox-service.ts , https://docs.novu.co/platform/sdks/javascript.md
- **Retention.** Inbox feed retention is 30 days on Free and 90 days on Pro and Team, custom on Enterprise. The separate activity feed (the operator-facing log) is 1, 7 and 90 days. Sources: https://docs.novu.co/platform/developer/limits , https://docs.novu.co/platform/additional-resources/security . No per-message expiry was found in the pages read. Snooze exists, which hides a notification until later. Source: https://docs.novu.co/platform/inbox/features/snooze.md
- **Unread count.** The bell count is "automatically" managed by the Inbox. Source: https://docs.novu.co/platform/inbox/overview.md . The `count` method and the `useCounts` hook call a separate API with filters (read, seen, archived and others), so the number is a server query, not the length of the loaded list. The docs do not state this in so many words. The source shows `count` calling `_inboxService.count`. Sources: https://docs.novu.co/platform/sdks/react/hooks/use-counts.md , https://github.com/novuhq/novu/blob/next/packages/js/src/notifications/notifications.ts
- **Mark all read.** `readAll()` "marks all notifications as read" and can be narrowed by `tags` and `data`. In the source, it marks the cached notifications as read optimistically, then calls the API with only the tags and data, no id list. Sources: https://docs.novu.co/platform/sdks/javascript.md , https://github.com/novuhq/novu/blob/next/packages/js/src/notifications/helpers.ts

## Courier

- **Feed pagination.** The docs say "The inbox loads the next page when the reader scrolls to the bottom." A custom UI calls `inbox.fetchNextPageOfMessages` and sets the size with `inbox.setPaginationLimit(50)`. Source: https://www.courier.com/docs/in-app/build-a-custom-inbox.md
- **API.** `getMessages` takes `paginationLimit` (default 24) and `startCursor`, and sends GraphQL `limit` and `after`. The response includes `totalCount`, `unreadCount` and a `canPaginate` flag. Source: https://github.com/trycourier/courier-web/blob/main/@trycourier/courier-js/src/client/inbox-client.ts
- **Retention and expiry.** "A message stays in the feed until it is archived or expires." A message sent with `expiresAt` "drops from the feed when that time passes." Source: https://www.courier.com/docs/in-app/how-the-inbox-behaves.md . No plan-level retention window was found in the pages read.
- **Unread count.** `getUnreadMessageCount()` returns "the total unread inbox messages for the authenticated user," scoped to a tenant if one is set. Source: https://www.courier.com/docs/sdk-libraries/courier-js-web.md . The datastore's `totalUnreadCount` is "total unread across every feed", not the selected tab's. Tabs carry their own counts. Sources: https://www.courier.com/docs/in-app/build-a-custom-inbox.md , https://www.courier.com/docs/in-app/tabs-and-feeds.md . The count comes from a server `count` query in the same request as the first page. Source: the `inbox-client.ts` link above.
- **Mark all read.** `inbox.readAll()` marks all messages as read, and `readAllMessages()` does it from the datastore. Sources: https://www.courier.com/docs/sdk-libraries/courier-js-web.md , https://www.courier.com/docs/in-app/build-a-custom-inbox.md . I did not read the datastore code for `readAll`, so how it treats unloaded items locally is unchecked.

## MagicBell

- **Feed pagination.** The drop-in `Inbox` renders a virtual list and calls `notifications.fetchMore()` on `onEndReached`. `fetchMore` follows the `links.next` cursor. Source: the published package `@magicbell/react@1.14.0` (`src/inbox.tsx`, `src/internal/stores/notification-store.ts`), https://registry.npmjs.org/@magicbell/react/-/react-1.14.0.tgz . The docs page only says it "Supports pagination". Source: https://www.magicbell.com/docs/libraries/magicbell-react
- **API.** Cursor-based. `ListNotificationsParams` has `limit` (default 50), `startingAfter`, `endingBefore`, plus `status`, `category` and `topic` filters. Source: https://github.com/magicbell/magicbell-js/blob/main/packages/magicbell-js/src/user-client/services/notifications/notifications-service.ts and `request-params.ts` in the same folder
- **Retention and expiry.** None found. The user-client `Notification` model has `archivedAt` and no expiry field. The notification primitive page says notifications keep "a full history of user interactions" and recommends archiving, with no retention period. The pricing page states no retention. Sources: https://github.com/magicbell/magicbell-js/blob/main/packages/magicbell-js/src/user-client/services/notifications/models/notification.ts , https://www.magicbell.com/docs/primitive/notification , https://www.magicbell.com/pricing
- **Unread count.** A count endpoint exists, "Returns the count of unread notifications for a user," filterable by category and topic. The bell in `FloatingInbox` shows a dot, not a number. The dot is `InlineNotification variant="dot"`, which watches the local store for a Notification with `readAt: null`. So the dot reflects only loaded Notifications, refreshed by a socket event and a 60-second poll of page one. Sources: `notifications-service.ts` above, `@magicbell/react@1.14.0` `src/internal/components/inbox--button.tsx`, `src/inline-notification.tsx`, `notification-store.ts`. I found no numeric badge in the package source.
- **Mark all read.** The header button calls `markAllRead()`, which sets `readAt` on the unread items in the local store, then calls `markAllNotificationsRead()`. The API method "Marks all notifications as read" and takes only `category` and `topic`, so it covers unloaded items. On failure the store reverts the local items. Sources: the package source above, `notifications-service.ts`.

## SuprSend

- **Feed pagination.** The drop-in `NotificationFeed` wraps an `InfiniteScroll` component that calls `feedClient.fetchNextPage()`. A `pagination` prop of `false` disables it. Default `pageSize` is 20 and the maximum is 100. Sources: https://github.com/suprsend/suprsend-react-sdk/blob/main/src/Feed/NotificationFeed/NotificationFeed.tsx , https://docs.suprsend.com/docs/react-in-app-feed.md
- **API.** The web SDK sends `page_size` and a `search_after` pair of the last item's `is_pinned` and `created_on`, which is a keyset cursor. The response `meta` carries `total_count` and `has_more`. Pinned items sort first. Source: https://github.com/suprsend/suprsend-web-sdk/blob/main/src/feed.ts
- **Retention and expiry.** Each in-app template can set an expiry as an absolute time, a relative duration or a dynamic value. "It deletes the notification and does not archive it." The docs recommend 15 days or more for ordinary messages and an expiry for pinned ones. They state no default retention. Source: https://docs.suprsend.com/docs/in-app-inbox-template . The SDK also starts a client expiry timer after each fetch. Source: `feed.ts` above.
- **Unread count.** The bell badge is a separate `meta.badge` value. The docs say it is "latest notifications that user received from the last he opened inbox popup," and `resetBadgeCount()` zeroes it. Source: https://docs.suprsend.com/docs/js-inapp-feed.md . This is a count of new arrivals since the popover was last opened, not of all unread Notifications. `pageInfo.total` comes from `meta.total_count`, whose meaning (all, or unread) the docs do not define.
- **Mark all read.** `markAllAsRead()` is documented as "bulk mark all notifications as read." In the source it zeroes the badge and sets `read_on` on the loaded notifications, then sends a `mark_all_read` request with no id list. There is no mark-all-seen. Seen needs ids through `markBulkAsSeen`. Sources: https://docs.suprsend.com/docs/js-inapp-feed.md , `feed.ts` above.

## Comparison

| | Knock | Novu | Courier | MagicBell | SuprSend |
|---|---|---|---|---|---|
| Drop-in list loading | Infinite scroll, 70px before bottom | Infinite scroll (hook offers button or scroll) | Loads next page on scroll to bottom | Virtual list, `onEndReached` | `InfiniteScroll`, can disable |
| API paging | Cursor `after`/`before` | `after` (id) and `offset` both accepted | Cursor `after` | Cursor `starting_after` | Keyset `search_after` |
| Default page size | 50 on API (React feed default not read) | 10 in JS client | 24 | 50 on API | 20, max 100 |
| Unread count | `meta.unread_count` and `unseen_count`, scope not stated; default badge is seen | Separate `count` call, filterable | Server `count`; also total across tabs | Count endpoint; bell is a dot from loaded items only | Badge is new arrivals since last open; `total_count` undefined |
| Mark all read | Local items plus server, all in scope, deferred | Cached items plus server, no id list | `readAll()`, docs say all messages | Loaded items plus server, all | Loaded items plus server, all |
| Old Notifications | Feed items kept indefinitely; message logs 30 or 90 days | Inbox deleted after 30 days (Free) or 90 days (Pro, Team) | Per-message `expiresAt`, otherwise until archived | No expiry or retention documented | Per-template expiry deletes; no default stated |

## Recommendation for Cadence

This is my judgment from the findings above, not a sourced fact.

1. **Use scroll-triggered loading in the popover, backed by a cursor.** It is what all five drop-in feeds do, it suits a self-scrolling 28rem container, and a cursor avoids repeats when a new Notification arrives mid-scroll. If Cadence builds its own list on SQLite, page on a unique ordered key such as `(created_at, id)` and keep the Postgres warning about unordered `LIMIT` in mind.
2. **Keep the first page small.** Ten to twenty items fill the popover. A 100+ list never loads in full.
3. **Take the unread count from a server count, not the loaded list.** Courier, MagicBell and Novu show how. Pick a service whose badge says what we mean by "unread". SuprSend's badge counts new arrivals since last open, and Knock's default counts "seen".
4. **Mark all read must hit the server with no id list.** Update the loaded items at once, then send one request. Four services do this, and the loaded-only case is a bug a self-built feed could easily have.
5. **Skip the "see all" page at first.** Add it only if people need history, search or filters. It would reuse the same list component on its own route.
6. **Decide expiry on purpose.** For refund and other money events, a 30-day inbox window like Novu's Free plan would delete Notifications while a learner may still care. Knock's indefinite in-app retention and per-message expiry in Courier and SuprSend are easier to match to Cadence's rules. Whether Notifications should expire at all is a product decision for the map owner.

## Open questions and gaps

- Mobile full-width panel behavior is not documented by any service. Not verified.
- Knock: whether `unread_count` covers all items or the loaded page, the default React feed page size, and the default action of the prebuilt "Mark all as read" button. All unstated in the pages read.
- Novu: whether the `count` result is a pure server total. The code path suggests it, but no page says so. Per-message expiry was not found.
- Courier: plan-level retention, and how the local datastore handles `readAll` for unloaded items. The cursor source read is the web client only.
- MagicBell: any retention or expiry. Nothing in docs, source or pricing. The React package source is read from npm version 1.14.0, which may differ from the version the docs describe. Asking MagicBell support is the only way to confirm retention.
- SuprSend: what `total_count` counts, and the default retention. A SuprSend blog claims 30 days by default, but that is not a primary doc and was ignored.
- Behavior with 100+ Notifications at scale (latency, rate limits, page size caps for Knock) is untested. No load test was run.
- SQLite offset cost is not confirmed from SQLite's own docs. The Postgres docs were used instead.
- No source says which pattern, button or scroll, people prefer. That is a usability question, not something docs settle.
