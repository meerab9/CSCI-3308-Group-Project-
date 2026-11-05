# Reference drafts

These files were pushed directly to `main` (outside `src/`) while the
registration/API work in this branch was in review, and would have
created a second, disconnected copy of the app at the top level of
`ProjectSourceCode/` if merged as-is — `docker-compose.yaml` only ever
runs one `package.json`/entry point, which is `src/index.js`.

Nothing was deleted. Moved here as-is so the content (especially
`views/pages/login.html` and `login.hbs`, relevant to issue #2) isn't
lost, and so it's easy to pull ideas from into `src/views/pages/` when
building the real login page. Safe to delete this folder once that's
done, or once everyone's agreed `src/` is where the app lives.
