# gmail-unsub

A Claude skill that cleans out Gmail marketing mail with you, sender by sender. Nothing is unsubscribed, blocked or deleted until you approve it.

1. **Audit (read-only):** uses the Gmail connector to rank bulk and marketing senders by volume, opens and replies, and suggests Unsub or Keep for each one. Receipts, banks, security codes and work mail are left out.
2. **Unsubscribe:** uses Claude in Chrome to work through Gmail's **Manage subscriptions** page for the senders you approve. If a sender isn't listed there, it uses Gmail's Unsubscribe button inside one of that sender's emails. Senders that only offer a "go to website" unsubscribe are listed for you to handle yourself.
3. **Block (only if you ask):** blocks senders that can't be unsubscribed and checks that they appear in Gmail's blocked list.
4. **Clean up:** moves the junk those senders already sent to Trash or Archive, your choice. Starred mail and anything that looks like an order, receipt, ticket, statement or security email is kept.

## What you need

- Claude Code (or another Claude client that supports skills)
- The **Gmail** connector
- **Claude in Chrome**, signed in to the Gmail account you want to clean

## Install

Copy the skill folder into your personal skills directory:

```bash
git clone https://github.com/TheCodedKid/gmail-unsub.git
cp -R gmail-unsub/gmail-unsubscribe-sweep ~/.claude/skills/
```

Then ask Claude something like "help me unsubscribe from all the junk in my Gmail".

## Files

- `gmail-unsubscribe-sweep/SKILL.md`: the workflow Claude follows.
- `gmail-unsubscribe-sweep/scripts/gmail_helpers.js`: page helpers Claude pastes into the Gmail tab. Before each click, they check that the dialog or email on screen matches the sender being handled. They never click "Block instead" or "Go to website" on their own.

## Notes

- Gmail's page layout changes from time to time, so the helpers may need adjusting when it does.
- Trash is recoverable for 30 days. The skill never permanently deletes mail.
