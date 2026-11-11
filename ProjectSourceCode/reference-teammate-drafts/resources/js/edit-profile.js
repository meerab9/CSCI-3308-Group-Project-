(function () {

  const fileInput =
    document.getElementById('profile_picture');

  const preview =
    document.getElementById('avatar-preview');

  const placeholder =
    document.getElementById('avatar-placeholder');

  const MAX_BYTES =
    2 * 1024 * 1024;


  if (fileInput) {

    fileInput.addEventListener('change', () => {

      const file =
        fileInput.files[0];


      if (!file) return;


      if (file.size > MAX_BYTES) {

        alert(
          'Profile picture must be 2 MB or smaller.'
        );

        fileInput.value = '';

        return;

      }


      preview.src =
        URL.createObjectURL(file);

      preview.classList.remove('d-none');

      placeholder.classList.add('d-none');

    });

  }


  // Prevent duplicate profile prompts

  const selects =
    Array.from(
      document.querySelectorAll(
        '.prompt-select'
      )
    );


  function syncPrompts() {

    const chosen =
      selects
        .map(select => select.value)
        .filter(Boolean);


    selects.forEach(select => {

      Array.from(
        select.options
      ).forEach(option => {

        option.disabled =
          option.value !== '' &&
          option.value !== select.value &&
          chosen.includes(option.value);

      });

    });

  }


  selects.forEach(select => {

    select.addEventListener(
      'change',
      syncPrompts
    );

  });


  syncPrompts();

})();


/*GET request */

app.get('/profile', requireAuth, async (req, res) => {

  try {

    const username = req.session.user.username;


    const user = await db.oneOrNone(
      `
      SELECT
        username,
        profile_picture,
        github,
        school,
        cs_interests,
        other_interests,
        looking_for,
        created_at

      FROM users

      WHERE username = $1;
      `,
      [username]
    );


    if (!user) {
      return res.status(404).send('User not found.');
    }


    const prompts = await db.any(
      `
      SELECT
        prompt_id,
        prompt,
        answer

      FROM user_prompts

      WHERE username = $1

      ORDER BY prompt_id;
      `,
      [username]
    );


    res.render('pages/profile', {
      user,
      prompts
    });


  } catch (error) {

    console.log(error);

    res.status(500).send(
      'Unable to load profile.'
    );

  }

});

/*GET /profile/edit request, route gets same
current database info but sends into editable form fields */

app.get('/profile/edit', requireAuth, async (req, res) => {

  try {

    const username =
      req.session.user.username;


    const user = await db.one(
      `
      SELECT
        username,
        profile_picture,
        github,
        school,
        cs_interests,
        other_interests,
        looking_for

      FROM users

      WHERE username = $1;
      `,
      [username]
    );


    const prompts = await db.any(
      `
      SELECT
        prompt,
        answer

      FROM user_prompts

      WHERE username = $1

      ORDER BY prompt_id;
      `,
      [username]
    );


    const promptSlots = [];


    for (let i = 0; i < MAX_PROMPTS; i++) {

      promptSlots.push({

        index: i + 1,

        selected:
          prompts[i]?.prompt || '',

        answer:
          prompts[i]?.answer || '',

        options:
          PROFILE_PROMPTS

      });

    }


    res.render('pages/edit-profile', {
      user,
      promptSlots
    });


  } catch (error) {

    console.log(error);

    res.status(500).send(
      'Unable to load profile.'
    );

  }

});