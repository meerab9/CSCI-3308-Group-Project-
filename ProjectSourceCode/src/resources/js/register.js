(function () {
  const fileInput = document.getElementById('profile_picture');
  const preview = document.getElementById('avatar-preview');
  const placeholder = document.getElementById('avatar-placeholder');
  const form = document.getElementById('register-form');
  const password = document.getElementById('password');
  const confirm = document.getElementById('confirm_password');
  const MAX_BYTES = 2 * 1024 * 1024;

  // Show a preview of the chosen profile picture.
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

  // Bootstrap-style client-side validation.
  // Password fields aren't shown when finishing a Google/GitHub sign-up.
  const checkMatch = () => {
    if (confirm) confirm.setCustomValidity(confirm.value === password.value ? '' : 'Passwords must match');
  };

  form.addEventListener('submit', event => {
    checkMatch();
    if (!form.checkValidity()) {
      event.preventDefault();
      event.stopPropagation();
    }
    form.classList.add('was-validated');
  });
  if (confirm) confirm.addEventListener('input', checkMatch);
})();
