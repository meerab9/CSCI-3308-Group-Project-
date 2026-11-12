// *****************************************************
// <!-- Section 4 : Routes -->
// *****************************************************

// app.get('/welcome', ...)
// app.use('/api', ...)
// app.get('/', ...)
// app.get('/register', ...)
// app.post('/register', ...)

//Jessica's routes for profile pages
//GET REQUEST FOR PROFILE PAGE
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

//GET REQUEST for profile EDIT page

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

// POST REQUEST for profile EDIT page

app.post(
  '/profile/edit',

  requireAuth,

  withProfileUpload,

  async (req, res) => {

    const username =
      req.session.user.username;


    try {

      if (req.profileUploadError) {

        return res
          .status(400)
          .send(req.profileUploadError);

      }


      const form =
        req.body;


      const github =
        normalizeGithub(form.github);


      if (github === null) {

        if (req.file) {
          fs.unlink(
            req.file.path,
            () => {}
          );
        }

        return res
          .status(400)
          .send(
            'GitHub must be a username or a github.com profile link.'
          );

      }


      const lookingFor =
        LOOKING_FOR_OPTIONS.includes(
          form.looking_for
        )
          ? form.looking_for
          : 'both';


      const promptNames =
        [].concat(
          form.prompt || []
        );


      const promptAnswers =
        [].concat(
          form.prompt_answer || []
        );


      const prompts =
        promptNames

          .map((prompt, i) => ({

            prompt,

            answer:
              (
                promptAnswers[i] || ''
              ).trim()

          }))

          .filter(
            p =>
              PROFILE_PROMPTS.includes(
                p.prompt
              ) &&
              p.answer
          )

          .slice(
            0,
            MAX_PROMPTS
          );


      const currentUser =
        await db.one(
          `
          SELECT profile_picture

          FROM users

          WHERE username = $1;
          `,
          [username]
        );


      const newPicture =
        req.file
          ? '/uploads/' +
            req.file.filename
          : currentUser.profile_picture;


      await db.tx(
        async transaction => {


          await transaction.none(
            `
            UPDATE users

            SET
              profile_picture = $1,
              github = $2,
              school = $3,
              cs_interests = $4,
              other_interests = $5,
              looking_for = $6

            WHERE username = $7;
            `,
            [
              newPicture,

              github || null,

              trimOrNull(
                form.school
              ),

              trimOrNull(
                form.cs_interests
              ),

              trimOrNull(
                form.other_interests
              ),

              lookingFor,

              username
            ]
          );


          // Replace the user's old prompts

          await transaction.none(
            `
            DELETE FROM user_prompts
            WHERE username = $1;
            `,
            [username]
          );


          for (const prompt of prompts) {

            await transaction.none(
              `
              INSERT INTO user_prompts
                (
                  username,
                  prompt,
                  answer
                )

              VALUES(
                $1,
                $2,
                $3
              );
              `,
              [
                username,
                prompt.prompt,
                prompt.answer
              ]
            );

          }

        }
      );


      // If they uploaded a new local image,
      // remove their old local image.

      if (
        req.file &&
        currentUser.profile_picture &&
        currentUser.profile_picture.startsWith(
          '/uploads/'
        )
      ) {

        const oldFile =
          path.join(
            UPLOAD_DIR,
            path.basename(
              currentUser.profile_picture
            )
          );


        fs.unlink(
          oldFile,
          () => {}
        );

      }


      res.redirect('/profile');


    } catch (error) {

      console.log(error);


      // If database update failed,
      // don't leave the newly uploaded
      // file sitting around.

      if (req.file) {

        fs.unlink(
          req.file.path,
          () => {}
        );

      }


      res.status(500).send(
        'Unable to update profile.'
      );

    }

  }
);




// app.get('/logout', ...)