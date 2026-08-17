# Web-Based Tailoring Showcase and Client-Linkage System

Final year project system for NSUK EDC. Implements the modules described
in Chapter 3–4 of the project document: registration, login, tailor
profile management, design upload/showcase, client browsing, and
client–tailor interaction (messaging).

## Requirements

- Node.js **v22 or later** (uses the built-in `node:sqlite` module — no
  database server or `npm install` required at all).

## Running it

```bash
node server/server.js
```

Then open **http://localhost:3000** in your browser.

The first run creates `data/tailoring.db` automatically with all tables
(users, tailor_profiles, designs, messages, sessions) as described in the
ER diagram (Chapter 3.9).

## Project structure

```
tailoring-system/
├── server/
│   ├── server.js       # HTTP server + all routes (application layer)
│   ├── db.js            # SQLite connection + schema (database layer)
│   ├── auth.js           # Password hashing + sessions
│   └── parseBody.js       # Request body / file upload parsing
├── public/               # Presentation layer (HTML/CSS/JS)
│   ├── index.html         # Landing page / showcase
│   ├── register.html       # Registration (tailor or client)
│   ├── login.html
│   ├── tailors.html         # Browse tailors
│   ├── tailor-profile.html   # Public tailor profile + portfolio + contact
│   ├── tailor-dashboard.html  # Tailor: manage profile, upload/remove designs
│   ├── client-dashboard.html   # Client: browse latest designs
│   ├── messages.html            # Client–tailor conversation threads
│   ├── css/style.css
│   └── js/common.js
└── data/tailoring.db      # Created automatically on first run
```

## Test accounts

None are pre-seeded — register a tailor account and a client account from
the homepage to try the full flow: upload a design as the tailor, then
browse and message as the client. Take your screenshots for Chapter 4
once you've populated some sample data this way.

## Notes for your defense

- Built with zero external npm dependencies — everything runs on Node's
  standard library (`http`, `node:sqlite`, `node:crypto`), so it will run
  anywhere Node 22+ is installed with no `npm install` step.
- Passwords are hashed with scrypt (industry-standard, built into Node);
  never stored in plain text.
- Sessions use HttpOnly cookies with a server-side session token table.
- Image uploads are validated and stored under `public/uploads/` with
  randomized filenames.
