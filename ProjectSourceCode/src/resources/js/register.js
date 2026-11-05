(function () {
  const form = document.getElementById('register-form');
  if (!form) return;

  const steps = Array.from(form.querySelectorAll('[data-step]'));
  const indicators = Array.from(document.querySelectorAll('[data-step-indicator]'));
  const password = document.getElementById('password');
  const confirm = document.getElementById('confirm_password');
  let current = 1;

  // ---------- Step navigation ----------
  function showStep(n) {
    current = n;
    steps.forEach(s => s.classList.toggle('d-none', Number(s.dataset.step) !== n));
    indicators.forEach(li => {
      const i = Number(li.dataset.stepIndicator);
      li.classList.toggle('active', i === n);
      li.classList.toggle('done', i < n);
    });
    const firstField = steps[n - 1].querySelector('input:not([type=hidden]):not(.d-none):not(.btn-check), select, textarea');
    if (firstField && document.activeElement !== firstField) firstField.focus({ preventScroll: true });
  }

  function checkMatch() {
    if (confirm) confirm.setCustomValidity(confirm.value === password.value ? '' : 'Passwords must match');
  }

  // Validate only the fields in the given step.
  function stepIsValid(n) {
    checkMatch();
    const step = steps[n - 1];
    const fields = Array.from(step.querySelectorAll('input, select, textarea'));
    const valid = fields.every(f => f.checkValidity());
    step.classList.add('was-validated');
    return valid;
  }

  form.querySelectorAll('[data-next]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (stepIsValid(current)) showStep(current + 1);
    })
  );
  form.querySelectorAll('[data-back]').forEach(btn =>
    btn.addEventListener('click', () => showStep(current - 1))
  );

  // Enter moves to the next step instead of submitting early.
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && current < steps.length) {
      e.preventDefault();
      if (stepIsValid(current)) showStep(current + 1);
    }
  });

  form.addEventListener('submit', e => {
    for (let n = 1; n <= steps.length; n++) {
      if (!stepIsValid(n)) {
        e.preventDefault();
        showStep(n);
        return;
      }
    }
  });

  if (confirm) {
    confirm.addEventListener('input', checkMatch);
    password.addEventListener('input', checkMatch);
  }

  // If the server sent back an error, open the step it's about.
  const serverMessage = document.getElementById('server-message');
  if (serverMessage) {
    const text = serverMessage.textContent.toLowerCase();
    showStep(/github|picture/.test(text) ? 2 : 1);
  }

  // ---------- Profile picture preview ----------
  const fileInput = document.getElementById('profile_picture');
  const preview = document.getElementById('avatar-preview');
  const placeholder = document.getElementById('avatar-placeholder');
  const MAX_BYTES = 2 * 1024 * 1024;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      alert('Profile picture must be 2 MB or smaller.');
      fileInput.value = '';
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('d-none');
    placeholder.classList.add('d-none');
  });

  // ---------- Prompts ----------
  const slots = Array.from(document.querySelectorAll('[data-prompt-slot]'));
  const addPrompt = document.getElementById('add-prompt');

  function updateAddButton() {
    addPrompt.classList.toggle('d-none', slots.every(s => !s.classList.contains('d-none')));
  }
  addPrompt.addEventListener('click', () => {
    const next = slots.find(s => s.classList.contains('d-none'));
    if (next) {
      next.classList.remove('d-none');
      next.querySelector('select').focus();
    }
    updateAddButton();
  });
  updateAddButton();

  // Don't let the same prompt be picked twice.
  const selects = Array.from(document.querySelectorAll('.prompt-select'));
  function syncPrompts() {
    const taken = selects.map(s => s.value).filter(Boolean);
    selects.forEach(select => {
      Array.from(select.options).forEach(opt => {
        opt.disabled = opt.value !== '' && opt.value !== select.value && taken.includes(opt.value);
      });
    });
  }
  selects.forEach(s => s.addEventListener('change', syncPrompts));
  syncPrompts();
})();
