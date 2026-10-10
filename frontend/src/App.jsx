
import { useEffect, useState } from "react";
import "./App.css";

// Use the deployed backend URL in production.
// For local development, the fallback remains localhost.
const API_URL = (
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000"
).replace(/\/+$/, "");

const TOKEN_KEY = "bulkmail_admin_token";

// Authenticated API requests
async function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

// Admin login screen
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      onLogin();
    } catch (err) {
      setError(
        err.message || "Unable to connect to the backend."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={handleLogin}>
        <div className="login-brand">
          <span className="brand-icon">B</span>
          <span>BulkMail</span>
        </div>

        <p className="login-eyebrow">ADMIN WORKSPACE</p>
        <h1>Welcome back</h1>

        <p className="login-description">
          Sign in to manage email campaigns and history.
        </p>

        <label htmlFor="admin-username">Username</label>
        <input
          id="admin-username"
          type="text"
          autoComplete="username"
          placeholder="Enter admin username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />

        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter admin password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error && (
          <div className="status-message error" role="alert">
            {error}
          </div>
        )}

        <button
          className="login-submit"
          type="submit"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="login-footnote">
          Authorized administrators only
        </p>
      </form>
    </main>
  );
}

// Main dashboard
function Dashboard({ onLogout }) {
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const recipients = [
    ...new Set(
      emails
        .split(/[\n,;]+/)
        .map((email) => email.trim())
        .filter(Boolean)
    ),
  ];

  async function loadCampaigns() {
    try {
      const response = await authFetch(`${API_URL}/campaigns`);

      if (response.status === 401 || response.status === 403) {
        onLogout();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not load campaigns.");
      }

      const data = await response.json();
      setCampaigns(data);
    } catch (error) {
      console.error("Campaign history error:", error);
      setStatus({
        type: "error",
        text:
          "Could not load campaign history. Check your backend connection.",
      });
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadCampaigns();
    // Load campaign history when the dashboard first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend(event) {
    event.preventDefault();
    setStatus(null);

    if (!message.trim()) {
      setStatus({
        type: "error",
        text: "Please enter your email message.",
      });
      return;
    }

    if (recipients.length === 0) {
      setStatus({
        type: "error",
        text: "Add at least one recipient.",
      });
      return;
    }

    if (recipients.length > 20) {
      setStatus({
        type: "error",
        text: "Maximum 20 recipients per campaign.",
      });
      return;
    }

    setSending(true);

    try {
      const response = await authFetch(`${API_URL}/sendemail`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message.trim(),
          recipients,
        }),
      });

      const result = await response.json();

      if (response.status === 401 || response.status === 403) {
        onLogout();
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || "Unable to send emails.");
      }

      setStatus({
        type: result.failedCount > 0 ? "error" : "success",
        text: `Completed: ${result.sentCount} sent, ${result.failedCount} failed.`,
      });

      await loadCampaigns();

      if (result.sentCount > 0) {
        setMessage("");
      }
    } catch (error) {
      setStatus({
        type: "error",
        text: error.message || "Cannot connect to the backend.",
      });
    } finally {
      setSending(false);
    }
  }

  function formatDate(date) {
    return new Date(date).toLocaleString();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home">
          <span className="brand-icon">B</span>
          <span>BulkMail</span>
        </a>

        <div className="side-label">WORKSPACE</div>

        <a className="nav-link active" href="#campaign">
          <span>✉</span> Email campaign
        </a>

        <a className="nav-link" href="#history">
          <span>▤</span> Campaign history
        </a>

        <div className="sidebar-bottom">
          <span className="connection-dot" />
          Online workspace
          <p>BulkMail · Email management</p>
        </div>
      </aside>

      <main className="main-content" id="home">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Workspace / Email</div>
            <h1>Email campaigns</h1>
          </div>

          <button
            className="logout-button"
            type="button"
            onClick={onLogout}
          >
            Log out
          </button>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">EMAIL WORKSPACE</p>
            <h2>Reach your audience.</h2>
            <p className="welcome-text">
              Create an email campaign and manage your sending history.
            </p>
          </div>

          <div className="welcome-mark">✉</div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Campaigns recorded</span>
            <strong>{campaigns.length}</strong>
            <span className="stat-note">Stored campaign records</span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Emails sent</span>
            <strong>
              {campaigns.reduce(
                (sum, item) => sum + (item.sentCount || 0),
                0
              )}
            </strong>
            <span className="stat-note">
              Successful sends in history
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Emails failed</span>
            <strong>
              {campaigns.reduce(
                (sum, item) => sum + (item.failedCount || 0),
                0
              )}
            </strong>
            <span className="stat-note">
              Recorded sending failures
            </span>
          </div>
        </section>

        <section className="content-grid">
          <div className="panel compose-panel" id="campaign">
            <div className="panel-heading">
              <div>
                <h3>Compose campaign</h3>
                <p>Prepare your message and recipients.</p>
              </div>
              <span className="panel-icon">✎</span>
            </div>

            <form onSubmit={handleSend}>
              <label htmlFor="recipients">Recipients</label>

              <textarea
                id="recipients"
                className="field recipient-field"
                placeholder={"person@example.com\nanother@example.com"}
                value={emails}
                onChange={(event) => setEmails(event.target.value)}
                rows={4}
              />

              <div className="field-help">
                Separate email addresses with commas or new lines.
                <span>{recipients.length} / 20</span>
              </div>

              <label htmlFor="message">Email message</label>

              <textarea
                id="message"
                className="field message-field"
                placeholder="Write your email message here..."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={7}
              />

              {status && (
                <div
                  className={`status-message ${status.type}`}
                  role="status"
                >
                  {status.text}
                </div>
              )}

              <div className="form-footer">
                <span className="secure-note">
                  Gmail SMTP · Maximum 20
                </span>

                <button type="submit" disabled={sending}>
                  {sending ? "Sending..." : "Send campaign"}
                  {!sending && <span> →</span>}
                </button>
              </div>
            </form>
          </div>

          <div className="panel guide-panel">
            <h3>Before you send</h3>
            <p className="guide-intro">
              A few quick checks for a successful campaign.
            </p>

            <div className="guide-item">
              <span className="guide-number">01</span>
              <div>
                <strong>Check recipients</strong>
                <p>Make sure every email address is correct.</p>
              </div>
            </div>

            <div className="guide-item">
              <span className="guide-number">02</span>
              <div>
                <strong>Review your message</strong>
                <p>Keep the content clear and relevant.</p>
              </div>
            </div>

            <div className="guide-item">
              <span className="guide-number">03</span>
              <div>
                <strong>Check your connection</strong>
                <p>Keep the backend available during sending.</p>
              </div>
            </div>

            <div className="notice">
              <strong>Sending limit</strong>
              <p>
                This project supports up to 20 unique recipients per
                campaign. Send only to people who have agreed to receive
                your emails.
              </p>
            </div>
          </div>
        </section>

        <section className="panel history-panel" id="history">
          <div className="panel-heading history-heading">
            <div>
              <h3>Recent campaigns</h3>
              <p>Your latest recorded email activity.</p>
            </div>

            <button
              className="refresh-button"
              type="button"
              onClick={loadCampaigns}
            >
              ↻ Refresh
            </button>
          </div>

          {loadingHistory ? (
            <div className="empty-state">
              Loading campaign history...
            </div>
          ) : campaigns.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">▤</span>
              <strong>No campaigns yet</strong>
              <p>Your recorded campaigns will appear here.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Message</th>
                    <th>Recipients</th>
                    <th>Sent</th>
                    <th>Failed</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign._id}>
                      <td className="message-cell">
                        {(campaign.message || "").slice(0, 55)}
                        {(campaign.message || "").length > 55
                          ? "..."
                          : ""}
                      </td>

                      <td>{campaign.recipients?.length || 0}</td>

                      <td>
                        <span className="count-success">
                          {campaign.sentCount ?? 0}
                        </span>
                      </td>

                      <td>
                        <span className="count-failed">
                          {campaign.failedCount ?? 0}
                        </span>
                      </td>

                      <td>{formatDate(campaign.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="page-footer">
          BulkMail <span>·</span> Email campaign management
        </footer>
      </main>
    </div>
  );
}

// Application entry point
function App() {
  const [authenticated, setAuthenticated] = useState(
    () => Boolean(localStorage.getItem(TOKEN_KEY))
  );

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setAuthenticated(false);
  }

  if (!authenticated) {
    return (
      <LoginPage
        onLogin={() => setAuthenticated(true)}
      />
    );
  }

  return <Dashboard onLogout={logout} />;
}

export default App;
