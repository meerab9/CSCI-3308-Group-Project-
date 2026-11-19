/* Messaging page logic (views/pages/messages.hbs).
 *
 * Talks to the JSON routes in src/routes/messages.js:
 *   GET  /api/connections            -> people you can message
 *   GET  /api/conversations          -> sidebar list
 *   GET  /api/messages/:user?after=  -> a thread (or only messages newer than an id)
 *   POST /api/messages/:user         -> send { body }
 *
 * ...and the connection-request routes in src/routes/connections.js:
 *   GET  /api/connections/requests   -> requests waiting on you
 *   GET  /api/connections/sent       -> requests you've sent
 *   POST /api/connections/:user      -> send a request { message }
 *   POST /api/connections/:user/accept | /decline
 *
 * "Live" updates are done by polling: while a chat is open, the page asks for
 * messages newer than the last one it has every few seconds, and refreshes
 * the sidebar and requests a little less often. Open with
 * /messages?with=<username> to jump straight into a chat.
 */
(function () {
  'use strict';

  const THREAD_POLL_MS = 4000;
  const LIST_POLL_EVERY = 3; // refresh the sidebar every 3rd thread poll

  const $ = (id) => document.getElementById(id);
  const me = $('shell').dataset.me;

  let connections = [];   // [{ username, profile_picture, github, school }]
  let conversations = []; // [{ username, ..., last_body, last_sender, last_sent_at, last_message_id }]
  let requests = [];      // incoming: [{ username, ..., message, created_at }]
  let sentRequests = [];  // outgoing, still waiting
  let activeUsername = null;
  let thread = [];        // messages in the open chat, oldest first
  let lastMessageId = 0;
  let pollTicks = 0;
  let polling = false;
  let sending = false;

  const sentToast = new bootstrap.Toast($('sentToast'), { delay: 2500 });
  const newChatModal = bootstrap.Modal.getOrCreateInstance($('newChatModal'));

  /* ---------------- helpers ---------------- */

  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Same username always gets the same avatar color.
  function colorFor(username) {
    // Muted tones that sit well on the sage theme; all keep white initials readable.
    const palette = ['#5F7F63', '#6E6494', '#9A6B4F', '#4F6F8C', '#8E5D58', '#6F7A43', '#4E7F78', '#8A5D7A'];
    let hash = 0;
    for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
  }

  function avatarInner(person) {
    if (person.profile_picture) {
      return `<img src="${escapeHTML(person.profile_picture)}" alt="">`;
    }
    // "demo_ava" -> "DA", "priya.ml" -> "PM", "wayne" -> "WA"
    const parts = person.username.split(/[._-]+/).filter(Boolean);
    const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : person.username.slice(0, 2);
    return escapeHTML(initials.toUpperCase());
  }

  function showToast(text) {
    $('toastText').textContent = text;
    sentToast.show();
  }

  function setAvatar(el, person) {
    el.innerHTML = avatarInner(person);
    el.style.background = person.profile_picture ? 'transparent' : colorFor(person.username);
  }

  // "3:42 PM" today, "Mon" this week, "Nov 3" otherwise.
  function shortTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    if (now - d < 6 * 24 * 60 * 60 * 1000) {
      return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function fullTime(iso) {
    return new Date(iso).toLocaleString([], {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function showError(el, msg) {
    el.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${escapeHTML(msg)}`;
    el.classList.add('show');
  }
  function hideError(el) { el.classList.remove('show'); }

  // fetch + JSON, with one place to handle an expired session.
  async function api(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Signed out');
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Try again.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const findConnection = (username) =>
    connections.find((c) => c.username.toLowerCase() === username.toLowerCase());

  const personFor = (username) =>
    findConnection(username) || conversations.find((c) => c.username === username) || { username };

  /* ---------------- sidebar ---------------- */

  async function loadConversations() {
    const data = await api('/api/conversations');
    conversations = data.conversations;
    renderConvoList();
  }

  function renderConvoList() {
    const list = $('convoList');
    const filter = $('searchInput').value.trim().toLowerCase();

    // An open chat with no messages yet still gets a row at the top.
    const rows = conversations.slice();
    if (activeUsername && !rows.some((c) => c.username === activeUsername)) {
      rows.unshift({ ...personFor(activeUsername), last_body: null });
    }

    const visible = rows.filter((c) => !filter || c.username.toLowerCase().includes(filter));

    if (visible.length === 0) {
      list.innerHTML = filter
        ? `<div class="gm-empty-list">No conversations match "${escapeHTML(filter)}".</div>`
        : `<div class="gm-empty-list"><i class="bi bi-inbox fs-2 d-block mb-2"></i>No conversations yet.<br>Hit <b>New Chat</b> to start one!</div>`;
      return;
    }

    list.innerHTML = visible.map((c) => {
      const preview = c.last_body === null
        ? '<i>New conversation</i>'
        : (c.last_sender === me ? 'You: ' : '') + escapeHTML(c.last_body);
      return `
        <button type="button" class="gm-convo ${c.username === activeUsername ? 'active' : ''}" data-username="${escapeHTML(c.username)}">
          <div class="gm-avatar" style="background:${c.profile_picture ? 'transparent' : colorFor(c.username)}">${avatarInner(c)}</div>
          <div class="flex-grow-1 overflow-hidden">
            <div class="d-flex justify-content-between">
              <span class="gm-convo-name">@${escapeHTML(c.username)}</span>
              <span class="gm-convo-time">${c.last_sent_at ? shortTime(c.last_sent_at) : ''}</span>
            </div>
            <div class="gm-convo-preview">${preview}</div>
          </div>
        </button>`;
    }).join('');

    list.querySelectorAll('.gm-convo').forEach((el) =>
      el.addEventListener('click', () => openConversation(el.dataset.username))
    );
  }

  /* ---------------- open chat ---------------- */

  async function openConversation(username) {
    activeUsername = username;
    thread = [];
    lastMessageId = 0;

    const person = personFor(username);
    $('chatPlaceholder').classList.add('d-none');
    $('chatActive').classList.remove('d-none');
    $('shell').classList.add('chat-open');

    setAvatar($('chatAvatar'), person);
    $('chatName').textContent = '@' + person.username;
    $('chatHandle').textContent = person.school || '';
    const tag = $('chatTag');
    if (person.github) {
      tag.innerHTML = `<i class="bi bi-github"></i> ${escapeHTML(person.github)}`;
      tag.classList.remove('d-none');
    } else {
      tag.classList.add('d-none');
    }

    $('messages').innerHTML = '<div class="gm-thread-empty"><span class="spinner-border spinner-border-sm"></span></div>';
    hideError($('messageError'));
    $('messageInput').classList.remove('is-invalid');
    renderConvoList();

    try {
      const data = await api(`/api/messages/${encodeURIComponent(username)}`);
      if (activeUsername !== username) return; // user clicked away while loading
      appendMessages(data.messages);
      $('messageInput').focus();
    } catch (err) {
      if (activeUsername !== username) return;
      $('messages').innerHTML = '';
      showError($('messageError'), err.message);
    }
  }

  function appendMessages(newOnes) {
    const fresh = newOnes.filter((m) => m.message_id > lastMessageId);
    if (fresh.length === 0 && thread.length > 0) return;

    thread.push(...fresh);
    if (thread.length) lastMessageId = thread[thread.length - 1].message_id;

    const box = $('messages');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

    if (thread.length === 0) {
      box.innerHTML = `<div class="gm-thread-empty">No messages yet. Say hi to @${escapeHTML(activeUsername)}! 👋</div>`;
      return;
    }

    box.innerHTML = thread.map((m) => `
      <div class="gm-msg ${m.sender === me ? 'me' : 'them'}">${escapeHTML(m.body)}<div class="gm-msg-time">${fullTime(m.sent_at)}</div></div>`
    ).join('');

    // Don't yank the user down if they scrolled up to read older messages.
    if (nearBottom || fresh.some((m) => m.sender === me) || fresh.length === thread.length) {
      box.scrollTop = box.scrollHeight;
    }
  }

  function closeConversation() {
    activeUsername = null;
    $('shell').classList.remove('chat-open');
    $('chatActive').classList.add('d-none');
    $('chatPlaceholder').classList.remove('d-none');
    renderConvoList();
  }

  /* ---------------- sending ---------------- */

  async function sendMessage(username, body) {
    const data = await api(`/api/messages/${encodeURIComponent(username)}`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    return data.message;
  }

  $('messageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending || !activeUsername) return;

    const input = $('messageInput');
    const body = input.value.trim();
    if (!body) {
      input.classList.add('is-invalid');
      showError($('messageError'), 'Type a message first.');
      return;
    }

    sending = true;
    $('sendBtn').disabled = true;
    const target = activeUsername;
    try {
      const message = await sendMessage(target, body);
      input.value = '';
      input.classList.remove('is-invalid');
      hideError($('messageError'));
      if (activeUsername === target) appendMessages([message]);
      await loadConversations();
    } catch (err) {
      showError($('messageError'), err.message);
    } finally {
      sending = false;
      $('sendBtn').disabled = false;
      input.focus();
    }
  });

  // Enter sends, Shift+Enter makes a new line.
  $('messageInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('messageForm').requestSubmit();
    }
  });
  $('messageInput').addEventListener('input', () => {
    if ($('messageInput').value.trim()) {
      $('messageInput').classList.remove('is-invalid');
      hideError($('messageError'));
    }
  });

  /* ---------------- connection requests ---------------- */

  async function loadRequests() {
    const [incoming, outgoing] = await Promise.all([
      api('/api/connections/requests'),
      api('/api/connections/sent'),
    ]);
    requests = incoming.requests;
    sentRequests = outgoing.sent;
    renderRequests();
  }

  async function loadConnections() {
    const data = await api('/api/connections');
    connections = data.connections;
  }

  function renderRequests() {
    $('requestsSection').hidden = requests.length === 0;
    $('requestsCount').textContent = requests.length;
    updateNavBadge(requests.length);

    $('requestsList').innerHTML = requests.map((r) => `
      <div class="gm-request" data-username="${escapeHTML(r.username)}">
        <div class="gm-request-top">
          <div class="gm-avatar" style="background:${r.profile_picture ? 'transparent' : colorFor(r.username)}">${avatarInner(r)}</div>
          <div class="flex-grow-1 overflow-hidden">
            <div class="gm-convo-name text-truncate">@${escapeHTML(r.username)}</div>
            <div class="small gm-muted text-truncate">${escapeHTML(r.school || 'Wants to connect')}</div>
          </div>
          <span class="gm-convo-time">${shortTime(r.created_at)}</span>
        </div>
        ${r.message ? `<p class="gm-request-note">${escapeHTML(r.message)}</p>` : ''}
        <div class="gm-request-actions">
          <button type="button" class="btn btn-gm btn-sm" data-action="accept">Accept</button>
          <button type="button" class="btn btn-gm-ghost btn-sm" data-action="decline">Decline</button>
        </div>
        <div class="gm-error" role="alert"></div>
      </div>`).join('');

    $('requestsList').querySelectorAll('.gm-request button').forEach((btn) =>
      btn.addEventListener('click', () => respondToRequest(btn.closest('.gm-request'), btn.dataset.action))
    );
  }

  async function respondToRequest(card, action) {
    const username = card.dataset.username;
    card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await api(`/api/connections/${encodeURIComponent(username)}/${action}`, { method: 'POST' });
      requests = requests.filter((r) => r.username !== username);
      renderRequests();
      if (action === 'accept') {
        await Promise.all([loadConnections(), loadConversations()]);
        await openConversation(username);
        showToast(`You're connected with @${username}!`);
      }
    } catch (err) {
      card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      showError(card.querySelector('.gm-error'), err.message);
    }
  }

  // Keep the red number on the navbar's Messages button in sync.
  function updateNavBadge(count) {
    const link = document.querySelector('nav a[href="/messages"]');
    if (!link) return;
    let badge = $('navRequestBadge');
    if (count === 0) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'navRequestBadge';
      badge.className = 'position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger';
      link.classList.add('position-relative');
      link.appendChild(badge);
    }
    badge.innerHTML = `${count}<span class="visually-hidden"> connection requests waiting</span>`;
  }

  /* ---------------- New Chat modal ---------------- */

  function renderFriendPills() {
    const box = $('friendPills');
    if (connections.length === 0) {
      box.innerHTML = '<span class="gm-muted small">No connections yet. Type someone\'s username above and send them a connection request.</span>';
      return;
    }
    box.innerHTML = connections.map((c) => `
      <button type="button" class="gm-friend-pill" data-username="${escapeHTML(c.username)}">
        <span class="gm-avatar" style="background:${c.profile_picture ? 'transparent' : colorFor(c.username)}">${avatarInner(c)}</span>
        @${escapeHTML(c.username)}
      </button>`).join('');
    box.querySelectorAll('.gm-friend-pill').forEach((p) =>
      p.addEventListener('click', () => {
        $('recipientInput').value = p.dataset.username;
        $('recipientInput').classList.remove('is-invalid');
        hideError($('recipientError'));
        $('firstMessageInput').focus();
      })
    );
  }

  $('newChatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const recipientEl = $('recipientInput');
    const messageEl = $('firstMessageInput');
    const recipient = recipientEl.value.trim().replace(/^@/, '');
    const body = messageEl.value.trim();

    [recipientEl, messageEl].forEach((el) => el.classList.remove('is-invalid'));
    hideError($('recipientError'));
    hideError($('firstMessageError'));

    let valid = true;
    if (!recipient) {
      recipientEl.classList.add('is-invalid');
      showError($('recipientError'), 'Enter a username.');
      valid = false;
    }
    if (!body) {
      messageEl.classList.add('is-invalid');
      showError($('firstMessageError'), 'Write a message.');
      valid = false;
    }
    if (!valid) return;

    // Not connected yet: offer to send a connection request with this message
    // as the intro note instead. (The server enforces all of this too.)
    const connection = findConnection(recipient);
    if (!connection) {
      offerRequest(recipient);
      return;
    }

    $('newChatSendBtn').disabled = true;
    try {
      await sendMessage(connection.username, body);
      newChatModal.hide();
      await loadConversations();
      await openConversation(connection.username);
      showToast('Message sent!');
    } catch (err) {
      showError($('firstMessageError'), err.message);
    } finally {
      $('newChatSendBtn').disabled = false;
    }
  });

  function offerRequest(recipient) {
    const alreadySent = sentRequests.some((s) => s.username.toLowerCase() === recipient.toLowerCase());
    $('requestOffer').hidden = false;
    $('sendRequestBtn').hidden = alreadySent;
    $('requestOfferText').textContent = alreadySent
      ? `You already sent @${recipient} a connection request. You can message them once they accept.`
      : `You're not connected with @${recipient} yet. Send them a connection request, and your message will go with it as a short intro (300 characters max).`;
  }

  function hideRequestOffer() {
    $('requestOffer').hidden = true;
  }

  $('sendRequestBtn').addEventListener('click', async () => {
    const recipient = $('recipientInput').value.trim().replace(/^@/, '');
    const note = $('firstMessageInput').value.trim();
    hideError($('firstMessageError'));
    if (!note) {
      $('firstMessageInput').classList.add('is-invalid');
      showError($('firstMessageError'), 'Write a short intro to go with your request.');
      return;
    }

    $('sendRequestBtn').disabled = true;
    try {
      const data = await api(`/api/connections/${encodeURIComponent(recipient)}`, {
        method: 'POST',
        body: JSON.stringify({ message: note }),
      });
      newChatModal.hide();
      if (data.status === 'accepted') {
        // They had already asked to connect with you, so you're matched now.
        await Promise.all([loadConnections(), loadConversations(), loadRequests()]);
        await openConversation(recipient);
        showToast(`You're connected with @${recipient}!`);
      } else {
        await loadRequests();
        showToast(`Request sent to @${recipient}`);
      }
    } catch (err) {
      showError(err.status === 404 ? $('recipientError') : $('firstMessageError'), err.message);
    } finally {
      $('sendRequestBtn').disabled = false;
    }
  });

  // Typing a different username hides the request offer again.
  $('recipientInput').addEventListener('input', hideRequestOffer);

  $('newChatModal').addEventListener('show.bs.modal', renderFriendPills);
  $('newChatModal').addEventListener('hidden.bs.modal', () => {
    $('newChatForm').reset();
    ['recipientInput', 'firstMessageInput'].forEach((id) => $(id).classList.remove('is-invalid'));
    hideError($('recipientError'));
    hideError($('firstMessageError'));
    hideRequestOffer();
  });

  /* ---------------- polling ---------------- */

  async function poll() {
    if (polling || document.hidden) return;
    polling = true;
    try {
      if (activeUsername) {
        const username = activeUsername;
        const data = await api(`/api/messages/${encodeURIComponent(username)}?after=${lastMessageId}`);
        if (activeUsername === username) appendMessages(data.messages);
      }
      pollTicks += 1;
      if (pollTicks % LIST_POLL_EVERY === 0) {
        await Promise.all([loadConversations(), loadRequests()]);
      }
    } catch (err) {
      // Network blips are fine; the next poll will catch up.
    } finally {
      polling = false;
    }
  }

  /* ---------------- misc + startup ---------------- */

  $('searchInput').addEventListener('input', renderConvoList);
  $('backBtn').addEventListener('click', closeConversation);

  async function init() {
    try {
      await Promise.all([loadConnections(), loadConversations(), loadRequests()]);
    } catch (err) {
      $('convoList').innerHTML = `<div class="gm-empty-list">${escapeHTML(err.message)}</div>`;
      return;
    }

    const wanted = new URLSearchParams(window.location.search).get('with');
    if (wanted) openConversation(wanted.replace(/^@/, ''));

    setInterval(poll, THREAD_POLL_MS);
  }

  init();
})();
