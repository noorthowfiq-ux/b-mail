
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// Require a valid administrator token for protected routes.
function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token || !process.env.JWT_SECRET) {
    return res.status(401).json({
      message: "Admin login required."
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({
        message: "Admin access required."
      });
    }

    next();
  } catch {
    return res.status(401).json({
      message: "Session expired. Please log in again."
    });
  }
}

// Admin login
app.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD ||
    !process.env.JWT_SECRET
  ) {
    return res.status(500).json({
      message: "Admin authentication is not configured in .env."
    });
  }

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      message: "Incorrect username or password."
    });
  }

  const token = jwt.sign(
    { role: "admin", username },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token, username });
});

// Campaign database model
const campaignSchema = new mongoose.Schema({
  message: { type: String, required: true },
  recipients: [String],
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const Campaign = mongoose.model("Campaign", campaignSchema);

// Public health-check routes
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

    res.json(campaigns);
  } catch (error) {
    console.error("History error:", error.message);
    res.status(500).json({
      message: "Could not load campaign history."
    });
  }
});

// Protected email sending
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
        message: "Enter a message and at least one recipient."
      });
    }

    if (recipients.length > 20) {
      return res.status(400).json({
        message: "Maximum 20 recipients per request."
      });
    }

    const validRecipients = [
      ...new Set(
        recipients
          .filter(email => typeof email === "string")
          .map(email => email.trim())
          .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      )
    ];

    if (validRecipients.length === 0) {
      return res.status(400).json({
        message: "No valid email addresses were found."
      });
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(500).json({
        message: "Configure SMTP_USER and SMTP_PASS in backend/.env."
      });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    let sentCount = 0;
    const failed = [];

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
        console.error("Email sending failed:", error.message);
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

    res.json({
      success: true,
      message: "Email sending process completed.",
      sentCount,
      failedCount: failed.length,
      failed
    });
  } catch (error) {
    console.error("Send email error:", error.message);
    res.status(500).json({
      message: "Email sending failed. Check the backend terminal."
    });
  }
});

// Connect to MongoDB if configured
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connected."))
    .catch(error =>
      console.error("MongoDB connection failed:", error.message)
    );
} else {
  console.log("MONGODB_URI missing; campaign history needs MongoDB.");
}

app.listen(PORT, () => {
  console.log(`BulkMail backend running at http://localhost:${PORT}`);
});
