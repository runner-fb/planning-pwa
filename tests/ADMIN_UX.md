# Admin UX verification — 13 October 2026

Scope: runner application administrator. Existing GET JSON / mutation transport preserved.

Run `JSDOM_PATH=/absolute/path/to/jsdom node tests/admin-ux.test.cjs`.
The preview `tests/admin-ux-preview.html` uses fictional people and an in-memory storage/transport; it cannot send mail or alter live data.

Verified: ordered planning columns (including consultation), check → validate → review publication, question and mail preview, recipient filtering, simulation move and undo, dirty form navigation guard, CSV parser and group/import dialogs.

The form email preview reproduces `editionMail_` / `notifyOpen_` from the Code.gs document saved on Drive on 2026-10-13. It does not claim a verified read of the active deployment. The source sends a greeting, closing date in Paris time, existing-code reminder, install instructions and application URL. No mail template editor is exposed because that backend action ignores a supplied template.

The saved backend source does not distinguish draft or targeted publication. The UI offers an explicit final publication review, discloses that the entire team may be notified, and shows assignment changes and recipients. No targeted-delivery guarantee is made. Active deployment behavior must be checked with a signed-in admin session before promising targeted notifications.

No live planning, volunteer record or email was changed as part of testing.
