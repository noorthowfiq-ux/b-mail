
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL
]
  .filter(Boolean)
  .map((origin) => origin.replace(/\/+$/, ""));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn("CORS rejected origin:", origin);
      return callback(new Error("Origin not allowed by CORS."));
    }
  })
);

app.use(express.json({ limit: "1mb" }));

// Admin authentication
function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token || !process.env.JWT_SECRET) {
    return res.status(401).json({
      success: false,
      message: "Admin login required."
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required."
      });
    }

    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Session expired. Please log in again."
    });
  }
}

// Gmail API client. Google refreshes access tokens automatically.
const oauthConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GMAIL_REFRESH_TOKEN &&
  process.env.SMTP_USER
);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

if (oauthConfigured) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
  });
}

const gmail = google.gmail({
  version: "v1",
  auth: oauth2Client
});

// Admin login
app.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD ||
    !process.env.JWT_SECRET
  ) {
    return res.status(500).json({
      success: false,
      message: "Admin authentication is not configured."
    });
  }

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      success: false,
      message: "Incorrect username or password."
    });
  }

  const token = jwt.sign(
    { role: "admin", username },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  return res.json({ success: true, token, username });
});

// Campaign history model
const campaignSchema = new mongoose.Schema({
  message: { type: String, required: true },
  recipients: [String],
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const Campaign = mongoose.model("Campaign", campaignSchema);

// Health checks
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "BulkMail backend is running!"
  });
});

app.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Backend connection works!"
  });
});

// Protected campaign history
app.get("/campaigns", requireAdmin, async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json(campaigns);
  } catch (error) {
    console.error("History error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not load campaign history."
    });
  }
});

// Build a plain-text RFC 2822 message and encode it for Gmail API.
function createRawMessage(from, to, text) {
  const safeText = text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");

  const message = [
    `From: ${from}`,
    `To: ${to}`,
    "Subject: Message from BulkMail",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(safeText, "utf8").toString("base64")
  ].join("\r\n");

  return Buffer.from(message, "utf8").toString("base64url");
}

// Protected email sending using Gmail API over HTTPS
app.post("/sendemail", requireAdmin, async (req, res) => {
  try {
    const { message, recipients } = req.body || {};

    if (
      typeof message !== "string" ||
      !message.trim() ||
      !Array.isArray(recipients) ||
      recipients.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a message and at least one recipient."
      });
    }

    if (recipients.length > 20) {
      return res.status(400).json({
        success: false,
        message: "Maximum 20 recipients per request."
      });
    }

    const validRecipients = [
      ...new Set(
        recipients
          .filter((email) => typeof email === "string")
          .map((email) => email.trim())
          .filter((email) =>
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          )
      )
    ];

    if (validRecipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid email addresses were found."
      });
    }

    if (!oauthConfigured) {
      return res.status(500).json({
        success: false,
        message: "Gmail API credentials are not configured."
      });
    }

    let sentCount = 0;
    const failed = [];

    for (const recipient of validRecipients) {
      try {
        const raw = createRawMessage(
          process.env.SMTP_USER,
          recipient,
          message.trim()
        );

        await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw }
        });

        sentCount++;
      } catch (error) {
        console.error(
          "Gmail API send failed:",
          error.code || error.response?.status || "UNKNOWN",
          error.message
        );

        failed.push(recipient);
      }
    }

    if (mongoose.connection.readyState === 1) {
      await Campaign.create({
        message: message.trim(),
        recipients: validRecipients,
        sentCount,
        failedCount: failed.length
      });
    }

    const allSent = failed.length === 0;

    return res.status(allSent ? 200 : 502).json({
      success: allSent,
      message: allSent
        ? "All emails were sent successfully."
        : "Email sending completed with failures. Check backend logs.",
      sentCount,
      failedCount: failed.length,
      failed
    });
  } catch (error) {
    console.error("Send email error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Email sending failed. Check backend logs."
    });
  }
});

// MongoDB connection
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connected."))
    .catch((error) => {
      console.error("MongoDB connection failed:", error.message);
    });
} else {
  console.log("MONGODB_URI missing; campaign history needs MongoDB.");
}

// Start server
app.listen(PORT, () => {
  console.log(`BulkMail backend running on port ${PORT}`);
});
