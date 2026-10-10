# BulkMail

BulkMail is a web application for sending email messages to multiple
recipients from an admin interface. It includes an admin login, a
backend API, and campaign history.

## Live Demo

-   **Frontend:** https://b-mail-4ekq10mj5-noorthowfiq-ux1.vercel.app/
-   **Backend:** https://bulkmail-backend1-t4ah.onrender.com

## Why Gmail API Instead of SMTP?

Initially, the project used SMTP-based email sending through Nodemailer.
The application worked locally, but email delivery encountered problems
after deploying the backend to Render.

Some cloud hosting environments restrict or limit outbound SMTP
connections, depending on the provider and plan. SMTP was therefore a
possible deployment-related cause to investigate.

To address the issue, the project was updated to use the **Gmail API
with Google OAuth 2.0**.

The Gmail API sends requests over HTTPS, so the backend does not need to
establish a direct SMTP connection. OAuth 2.0 is used to authorize the
application, and a refresh token allows the Google authentication
library to obtain new access tokens when needed.

### Benefits

-   Avoids relying on a direct SMTP connection from the Render server.
-   Uses Google's OAuth 2.0 authorization flow.
-   Supports automatic access-token renewal through the Google
    authentication library.
-   Worked in testing after deployment to Render.

> Note: The Gmail API is not unlimited. Gmail sending quotas, Google API
> policies, OAuth consent-screen settings, and account restrictions
> still apply. For large-scale or production bulk email, use an email
> service designed for bulk sending and comply with consent,
> unsubscribe, and anti-spam requirements.

## Features

-   Admin login with JWT-based authentication.
-   Send a message to multiple email recipients.
-   Basic email-address validation and duplicate-recipient removal.
-   Gmail API email delivery.
-   Campaign history stored in MongoDB when the database is configured.
-   Backend health-check endpoints.
-   Frontend deployment on Vercel and backend deployment on Render.

## Tech Stack

### Frontend

-   React
-   Vite

### Backend

-   Node.js
-   Express
-   Google APIs Node.js client (`googleapis`)
-   Google OAuth 2.0
-   JSON Web Tokens (`jsonwebtoken`)
-   MongoDB and Mongoose
-   CORS and dotenv

## Project Structure

``` text
BulkMail-Submission/
├── frontend/       # React + Vite application
└── backend/        # Express API and Gmail API integration
```

The exact files may vary depending on your local repository version.

## Prerequisites

Install the following before running the project locally:

-   Node.js (a current LTS version is recommended)
-   npm
-   A MongoDB database, if you want campaign history
-   A Google Cloud project with the Gmail API enabled
-   OAuth 2.0 credentials authorized to send email from the intended
    Gmail account

## Local Setup

### 1. Clone the repository

``` bash
git clone https://github.com/errormakesclever/BulkMail-Submission.git
cd BulkMail-Submission
```

### 2. Install frontend dependencies

``` bash
cd frontend
npm install
```

Create a frontend environment file if your frontend expects one. Use the
variable name already referenced by your frontend code for the backend
API URL. For a Vite app, client-side variables typically use the `VITE_`
prefix.

Start the frontend:

``` bash
npm run dev
```

### 3. Install backend dependencies

Open another terminal:

``` bash
cd backend
npm install
```

Create `backend/.env` with the required environment variables. Do not
commit this file.

``` dotenv
PORT=5000
FRONTEND_URL=http://localhost:5173

ADMIN_USERNAME=replace_with_your_admin_username
ADMIN_PASSWORD=replace_with_a_strong_admin_password
JWT_SECRET=replace_with_a_long_random_secret

MONGODB_URI=your_mongodb_connection_string

# Gmail API / Google OAuth 2.0
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GMAIL_REFRESH_TOKEN=your_gmail_refresh_token

# Gmail account authorized to send messages
SMTP_USER=your_authorized_gmail_address
```

`SMTP_USER` is retained as the sender-address environment variable in
the current backend implementation; it does not mean email delivery
still uses SMTP. `SMTP_PASS` is not needed by the Gmail API sending
implementation described here.

Run the backend using the script defined in `backend/package.json`,
commonly:

``` bash
npm start
```

If the project does not define a start script, check `package.json` for
the correct entry point.

## Google Gmail API Configuration

1.  Open the Google Cloud Console and select or create a project.
2.  Enable the **Gmail API**.
3.  Configure the OAuth consent screen and add test users if the
    application is in testing mode.
4.  Create an OAuth 2.0 client ID with the appropriate application type
    and redirect URI.
5.  Authorize the Gmail account that will send messages, requesting the
    Gmail send scope: `https://www.googleapis.com/auth/gmail.send`
6.  Store the client ID, client secret, and refresh token in your local
    environment file and deployment environment variables.
7.  Ensure the Gmail account used for authorization matches the sender
    account configured for the backend.

Google may require additional OAuth verification or consent-screen
configuration depending on how the application is used. Never publish
the client secret or refresh token.

## Deployment

### Frontend --- Vercel

1.  Import the frontend repository or project into Vercel.
2.  Configure the frontend's backend API URL environment variable to
    point to the deployed backend.
3.  Deploy the frontend.
4.  Set the backend's `FRONTEND_URL` to the exact deployed frontend
    origin, without an unnecessary trailing slash.

### Backend --- Render

1.  Create a Web Service from the backend repository.
2.  Set the build and start commands according to the backend's
    `package.json` (for example, `npm install` and `npm start`).
3.  Add the backend environment variables in Render's Environment
    settings.
4.  Ensure `FRONTEND_URL` matches the deployed frontend origin.
5.  Deploy and review the logs for startup or authentication errors.

The backend health check can be tested at:

-   `https://bulkmail-backend1-t4ah.onrender.com/`
-   `https://bulkmail-backend1-t4ah.onrender.com/test`

The `/test` endpoint should return a success response when the backend
is running. This confirms backend availability, not that Gmail sending
is configured correctly.

## Security Notes

-   Never commit `.env` files, OAuth secrets, refresh tokens, database
    credentials, or admin passwords.
-   Use strong, unique admin credentials and a long random JWT secret.
-   Rotate any credentials that may have been exposed.
-   Restrict access to the admin interface and protect all sending and
    campaign-history endpoints.
-   Keep dependencies updated and review logs without exposing tokens or
    personal data.
-   Follow Gmail policies and applicable privacy, consent, and anti-spam
    requirements. Only send messages to recipients who are appropriate
    to contact.

## Troubleshooting

### Backend is running, but email sending fails

-   Check Render logs for the Gmail API error.
-   Confirm the Gmail API is enabled in Google Cloud.
-   Verify the OAuth client ID, client secret, and refresh token are set
    correctly in Render.
-   Confirm the refresh token belongs to the Gmail account used as the
    sender.
-   Check the OAuth consent-screen status and Gmail sending limits.
-   After changing environment variables, redeploy or restart the Render
    service.

### Frontend reports a CORS error

-   Verify that `FRONTEND_URL` matches the exact frontend origin.
-   Check the browser console and Render logs.

### Campaign history is empty

-   Confirm `MONGODB_URI` is configured and the database is reachable.
-   Review Render logs for MongoDB connection errors.

## Current Limitations

-   Gmail sending quotas and Google policies apply.
-   OAuth consent-screen testing settings can affect which users can
    authorize the app.
-   The backend currently limits each send request to 20 recipients.
-   Delivery success from the Gmail API does not guarantee inbox
    placement; messages can be filtered into Spam.

## License

this is a open sourced project from Noor-Cloud ©
