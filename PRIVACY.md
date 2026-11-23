# Privacy Policy

**Nanahoshi** — Android and iOS app (`app.nanahoshi.mobile`) and self-hosted server
Effective date: November 23, 2026

Nanahoshi is a self-hosted library app. The mobile app connects only to a Nanahoshi
server that you, or someone you trust, runs. The developer of Nanahoshi does not run
a service behind the app and does not receive, collect, sell or share your data.

## What the app stores on your device

- **Server address and session.** The address of the server you connect to and your
  sign-in session token. The token is kept in the system's secure storage.
- **Downloaded books and audiobooks**, so you can read and listen offline, together
  with your reading position, audio bookmarks and a cache of covers and library data.
- **Preferences**: language, appearance, download settings, recent searches and the
  last Kindle address you used.

This data stays in the app's private storage. Uninstalling the app deletes all of it;
signing out of all servers also deletes your downloads.

## What the app sends to your server

The app sends only what it needs to work, and only to the server you chose:

- Your email and password when you sign in or create an account.
- Your library activity: reading and listening progress, reading sessions, collections,
  and the books you open or download.
- A profile picture, only if you pick one. The app opens the system photo picker; it
  cannot see your other photos.
- Your presence and what you are reading, which other members of the same server can
  see. You can stop sharing what you read in Settings.
- Your Kindle address, if you use Send to Kindle: the server emails the book to that
  address through its own mail service, so Amazon receives the book and the address.

Whoever operates that server controls this data: how long it is kept, who can see it,
and when it is deleted. If you run the server yourself, that is you. You can delete
your account in the app under Settings → Account; for anything else, such as an
export, ask the server's administrator.

## Other network requests

- **Finding servers on your network.** When you ask the app to look for servers, it
  checks the devices on your phone's local Wi-Fi network for a Nanahoshi server on
  ports 7331 and 7333. Nothing found this way leaves your device.
- **Welcome screen.** Before you connect to a server, the welcome screen shows book
  covers loaded from Open Library (`covers.openlibrary.org`) and Amazon's image service
  (`m.media-amazon.com`). Like any web request, those services see your IP address.
- **Links you open.** Store pages and Amazon's Kindle settings open in your browser and are
  governed by those sites' own policies.

## What Nanahoshi does not do

- No analytics, advertising, tracking or crash reporting.
- No access to your contacts, location, camera or microphone.
- No selling or sharing of data with anyone.

## Permissions

- **Internet and network state**: to connect to your server and know when you are offline.
- **Notifications**: to show download progress and audio playback controls.
- **Foreground services**: to keep audio playing and downloads running when the app is
  in the background.
- **Biometrics**: may be used by the secure storage that protects your session.

## Children

Nanahoshi is not directed at children under 13.

## The server

The Nanahoshi server stores your account, libraries and reading activity in its own
database. To enrich book details it may query metadata services such as Amazon, Google
Books, Open Library, Goodreads, Hardcover, ComicVine, Audible and RanobeDB using book
titles and identifiers, never your personal data. The server's operator chooses
which of these are enabled.

## Changes

If this policy changes, the new version will be published at this address with a new
effective date.

## Contact

Questions or requests: <https://github.com/Natsume-197/Nanahoshi/issues>
