# CSCI-3308-Group-Project-
**Brief Application description:**
Our application is called “git match” with the aim to connect and create community among computer science students. Users will be able to make their own profile and attach their Github while also adding their own interests (outside and within a computer science lens). Our program will automatically look at their Github projects/profile and determine their strengths software wise to display on their profile. Users will have prompts to answer such as “Favorite programming language”, “How many languages do you know”, “What areas of computer science are you interested in?”, etc. Users will also be able to add basic identifiable information such as pronouns, if they are looking for friends or studying, etc (A large amount of this content can already be retrieved from their github accounts). We will refrain from things like profile pictures or contact information until they end up connecting and if they choose to share it.
Once a profile is created users will be able to see a list of other users and click to see if they think they will want to connect with this user. Users will be able to talk to other users one on one if they end up matching with each other (although we would want to connect more people together we find that this may be an issue within the limited scope of our project and may encourage more meaningful friendships and networks.) If so they will be able to send a preface messaging saying they want to connect and the other user will receive a notification and can either accept or reject (the original user who sent the message will not be able to know if they said yes or not). From there if users connect they can message each other and share ideas or study! 
**Contributors - In this case, it will be the team Members**
Team Name: Git Matchers
Meera Bipin 
Wayne Chan 
Mailie Voraphankit 
Jessica Chhour 
Stryder Lafone Demarois 
Gaurav Joshi 
**Technology Stack used for the project:**
Front End:
HTML
CSS
JavaScript
Backend:
Node.js
Database & Storage:
PostgreSQL
Infrastructure & Hosting:
Docker
**Prerequisites to run the application - Any software that needs to be installed to run the application:** Docker
**Instructions on how to run the application locally:**
Git Clone to your own repository
Open Terminal, navigate to ProjectSourceCode with cd
Copy the example env file: cp .env.example .env (skip if you already have a .env)
Start it: docker compose up
Open http://localhost:3000
Stop it with Ctrl+C, or docker compose down from another terminal

**How to run the tests:**
Navigate to ProjectSourceCode, then:
npm install
npx mocha test/validation.spec.js
No Docker needed for this one, it's a pure function test. For the full suite, including the API tests that need the test database, see ProjectSourceCode/test/README.md
**Link to the deployed application:** Later Labs

