# Session Cleaner

Session Cleaner is a small Chrome extension for clearing selected local session data from your current browser profile.

It can clear cookies for common Google and Microsoft account domains, the site currently open in your active tab, and additional domains you enter yourself. Custom entries can include exact domains, subdomains, full URLs, or wildcard subdomains such as `*.example.com`. You can also choose to clear site storage such as LocalStorage, IndexedDB, Cache Storage, service workers and file systems.

## Install

1. Download or clone this project.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder, the one that contains `manifest.json`.
6. Pin or open the extension from the Chrome toolbar.

## Use

1. Open the site you want to clean.
2. Click the Session Cleaner extension.
3. Choose Google, Microsoft and/or the current site.
4. Add any extra domains or subdomains, one per line or comma-separated.
5. Choose whether to also clear site storage.
6. Click **Review cleanup**.
7. Check the listed data, then click **Clear selected data**.

## Notes

- Cleanup only affects the current Chrome profile.
- Provider cleanup may sign you out of matching Google or Microsoft accounts in this profile.
- Cookie cleanup can affect sibling subdomains on the same main domain.
- Wildcard entries such as `*.example.com` clear matching cookies. Chrome only allows site-storage deletion for exact origins the extension can name directly.
- This does not clear browsing history, downloads, saved passwords or extension storage.
- This does not revoke server-side sessions or sign you out of other devices.
