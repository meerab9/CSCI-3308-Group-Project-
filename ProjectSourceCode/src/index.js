// Starts the server. All routes/middleware live in app.js so tests can
// import the Express app directly without this file's app.listen() ever
// running (and without binding to port 3000).

const app = require('./app');

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
