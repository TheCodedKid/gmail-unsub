---
name: gmail-unsubscribe-sweep
description: Run a full Gmail unsubscribe sweep and inbox junk cleanup. Audits bulk and marketing senders with the Gmail connector (volume, opens, replies), proposes Unsub/Keep for each sender while protecting transactional mail, unsubscribes or blocks the senders the user approves through Gmail's Manage subscriptions page in Claude in Chrome, then moves the leftover junk from those senders to Trash. Use this whenever the user wants to unsubscribe from newsletters or promotions, cut down marketing email, do an inbox or email cleanup, deal with "too many emails", mass-unsubscribe, block spammy senders, or clear out promo junk from Gmail, even if they don't say "sweep" or name a specific step.
---

# Gmail unsubscribe sweep

Use this skill to work through a person's marketing mail with them. Show them who sends the most, let them decide sender by sender, take the actions they approve in Gmail, then clear the junk those senders already left. The person's trust depends on two things:
- You never unsubscribe, block or delete before they approve.
- Their receipts, bank alerts and security codes are never caught in the sweep.

Each phase ends with a stop for approval. Don't merge phases.

## Tools

- **Gmail connector** (`search_threads`, `get_thread`, `trash_thread`): for reading, counting and the final trash of individual threads.
- **Claude in Chrome**: for anything the connector can't do, which is unsubscribing, blocking and bulk-selecting in the Gmail UI. Load the core tools in one ToolSearch, together with `javascript_tool` and `find`.
- **`scripts/gmail_helpers.js`**: page helpers you paste into the Gmail tab with `javascript_tool`. Read it before Phase 2. Gmail sometimes reloads the page, which wipes the helpers, so paste them again whenever a call reports "is not a function".

## Phase 1: Build the sender list (read-only)

1. **Check how far the mailbox goes back.** Search a few older date windows. Some accounts only hold a few months of mail, and the person should know the real time span behind "last 12 months".
2. **Find candidate senders.** Use `category:promotions newer_than:1y` and `unsubscribe newer_than:1y -category:promotions`, plus METADATA_ONLY samples from a few different months, so you catch senders who only mailed earlier. Snippets are expensive, so prefer `THREAD_VIEW_METADATA_ONLY` or `IDS_ONLY`.
3. **Count each sender.** For each sender or domain, page through `from:X newer_than:1y` with `THREAD_VIEW_IDS_ONLY`, `pageSize: 50`. The count is exact only when the response has no `nextPageToken`. A `resultCountEstimate` of `"201"` means "unknown", not 201.
   - **Opened:** count `from:X newer_than:1y is:read` the same way.
   - **Replied:** run `in:sent newer_than:1y` once and summarize the recipients with jq on the saved file. Usually nobody has replied to bulk senders. Say so instead of showing a column of zeros.
   - **Last date:** the hex thread ID shifted right by 20 bits is the millisecond timestamp, so you can date threads without fetching them.
4. **Leave out transactional senders:** receipts, orders and shipping, tickets and bookings, banks, cards and billing, utilities, health and insurance, security and 2FA, work and payroll, church or personal groups, and paid memberships such as Patreon. If a company sends promos from the same address as account notices (Robinhood's `noreply@` is an example), keep it and say why.
5. **Present a table sorted by volume:** Sender | Address | Emails | Opened | Last | Suggest.
   - **Unsub:** never or rarely opened.
   - **Keep:** opened often, or the person relies on it.
   - **Your call:** when it's genuinely unclear.
   - Then list what you left out and why, and stop.

Expect the person to edit the list ("keep X, rest is good"). In this workflow, "rest is good" has meant two different things: leave the "Your call" rows alone, or unsubscribe them too. Don't guess. Do the clear rows, then ask about the "Your call" rows in one line.

## Phase 2: Unsubscribe in Chrome (after approval)

1. **Open Manage subscriptions.** Get a tab with `tabs_context_mcp {createIfEmpty: true}`, go to `https://mail.google.com/mail/u/0/#sub`, wait about 5 seconds, and check the title shows the right account. Paste the helpers.
2. **Unsubscribe in batches.** Run `__unsub(email)` over the approved addresses, about 10 to 20 per call, and stop the loop after about 38 seconds. Calls time out at 45 seconds, and a timeout can leave work half-finished and the status unknown. The helper confirms only when the dialog names that exact address and says "stop getting messages".
3. **Handle "go to their website" dialogs.** Some senders only offer "Go to website" or "Block instead", with no Cancel button. The helper leaves that dialog open and returns `needs_manual_dialog_open`. Close it with a real keypress (`computer` → `key: Escape`). A script-sent Escape doesn't work. Then carry on. If dialogs stack up, reload the page and paste the helpers again.
   - Never click "Block instead" or "Go to website" unless the person asked for blocking. Those senders go on the "needs manual action" list.
4. **Senders not on the page.** Use `__doMsg(threadId, email)`. It opens a thread, waits until that sender's address is showing, which guards against clicking a stale page, and then uses Gmail's own Unsubscribe link in the header. "You unsubscribed from" on the page means it's already done.
5. **Check for newly loaded senders.** Each reload of `#sub`, Gmail loads more, older senders. Reload, diff the page against everything already reviewed, and handle the new ones like this:
   - **Extra addresses of senders the person already approved:** unsubscribe them under that approval.
   - **Genuinely new senders:** bring them back as a new table for approval.
   - Repeat until a reload shows nothing new.
6. **Report three lists:** unsubscribed, needs manual action (website-only, or no Gmail button), and skipped. Give exact addresses.

## Blocking (only when the person asks)

- **From Manage subscriptions:** open the sender's dialog and click "Block instead" (`__blockFromSubs`). A toast says "Email address blocked."
- **From an open email:** use More message options (⋮) → `Block "<name>"`, then confirm Block.
- **Verify:** check `#settings/filters` after a full `location.reload()`. Without the reload the list is often out of date.
- **Mention the side effect:** blocking only covers that exact address, and its future mail goes to Spam. Point out any address that might also send login codes, such as `noreply@x.com`.

## Phase 3: Clear the junk they already sent (after approval)

1. **Build `in:inbox from:(…)` queries** from every unsubscribed or blocked address, in chunks of about 40 so each stays under roughly 1,400 characters. Use the exact address wherever a domain also sends things the person kept, such as `google.com`, `apple.com`, `github.com` or `patreon.com`. Add the safety exclusions:

   ```
   -is:starred -category:purchases -category:reservations -subject:(order OR receipt OR shipped OR shipping OR shipment OR invoice OR confirmation OR confirmed OR delivered OR delivery OR tracking OR ticket OR tickets OR booking OR reservation OR password OR security OR verify OR verification OR code OR statement OR payment OR refund OR return)
   ```

2. **Ask Archive or Trash**, with an approximate count. Trash is recoverable for 30 days. Never permanently delete.
3. **Move the matches.** Open each query at `#search/<urlencoded>` and run `__trashLoop(35000)`. It selects a page, clicks Delete and repeats until the search is empty. For Archive, use the archive variant described in the helper file.
4. **Review what the exclusions held back.** Run the same queries without the exclusions, using `THREAD_VIEW_SUMMARY`. The word filter is deliberately broad, so it also catches junk like "code to canvas", "save on shipping" and review-request reminders.
   - Trash the obvious junk with `trash_thread`.
   - Keep real orders, receipts, account and security notices, and anything starred.
5. **Report:** how many threads moved, and what stayed and why, grouped by orders, account and security, and other.

## Things that went wrong before

- **Wrong page:** a thread opened by hash navigation may not have loaded yet, so a click can land on the previous email. Always wait for the expected sender's address to appear before clicking.
- **Lost tab:** a session fork or restart changes the tab group. Call `tabs_context_mcp` again instead of reusing an old tab ID.
- **Large results:** connector results over about 50 metadata threads get saved to a file. Summarize them with jq instead of reading them into context.
