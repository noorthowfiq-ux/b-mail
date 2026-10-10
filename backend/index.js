const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS: local development and configured frontend domains.
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL
]
  .filter(Boolean)
  .map(origin => origin.replace(/\/+$/, ""));

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

app.use(express.json());

// Require a valid administrator token for protected routes.
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

// Admin login.
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

// Campaign database model.
const campaignSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true
  },
  recipients: [String],
  sentCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Campaign = mongoose.model("Campaign", campaignSchema);

// Public health-check routes.
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

// Protected campaign history.
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

// Protected email sending.
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

    // Validate, trim, and remove duplicate addresses.
    const validRecipients = [
      ...new Set(
        recipients
          .filter(email => typeof email === "string")
          .map(email => email.trim())
          .filter(email =>
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

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(500).json({
        success: false,
        message: "Email sending is not configured."
      });
    }

    // Gmail SMTP using port 587 and STARTTLS.
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 30000
    });

    let sentCount = 0;
    const failed = [];

    // Send only to recipients who have consented to receive the email.
    for (const recipient of validRecipients) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: recipient,
          subject: "Message from BulkMail",
          text: message.trim()
        });

        sentCount++;
      } catch (error) {
        console.error(
          "Email sending failed:",
          error.code || "UNKNOWN",
          error.message
        );

        failed.push(recipient);
      }
    }

    // Save campaign history when MongoDB is connected.
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
      message: "Email sending failed. Check the backend logs."
    });
  }
});

// Connect to MongoDB if configured.
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log("MongoDB connected.");
    })
    .catch(error => {
      console.error("MongoDB connection failed:", error.message);
    });
} else {
  console.log(
    "MONGODB_URI missing; campaign history needs MongoDB."
  );
}

// Start the server using Render's assigned port.
app.listen(PORT, () => {
  console.log(`BulkMail backend running on port ${PORT}`);
});
