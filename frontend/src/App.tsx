
import { useEffect, useState } from "react";
import "./App.css";

type User = {
  id: string;
  externalId: string;
  planId: string;
};

type Usage = {
  plan: string;
  monthlyAllowance: number;
  consumedUnits: number;
  remainingUnits: number;
  month: string;
};

type HistoryItem = {
  id: string;
  requestId: string;
  userId: string;
  units: number;
  accepted: boolean;
  rejectionLevel: string | null;
  rejectionRule: string | null;
  createdAt: string;
};

type Plan = {
  id: string;
  name: string;
  type: string;
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
};

type ApiError = Error & {
  status?: number;
  data?: {
    accepted?: boolean;
    rejectionLevel?: string | null;
    rejectionRule?: string | null;
    error?: string;
  };
};

type Section = "overview" | "users" | "consume" | "history";

const navigation: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users & Plans" },
  { id: "consume", label: "Consume Simulator" },
  { id: "history", label: "Request History" },
];

const pageDescriptions: Record<Section, string> = {
  overview: "Monitor your monthly quota and usage.",
  users: "View registered users and available plans.",
  consume: "Test usage requests and quota limits.",
  history: "Review accepted and rejected requests.",
};

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  const [usage, setUsage] = useState<Usage | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [selectedUser, setSelectedUser] = useState("");
  const [units, setUnits] = useState("10");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("overview");

  useEffect(() => {
    document.title = "Usage Metering Dashboard";
  }, []);

  async function api(path: string, options: RequestInit = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const err = new Error(data.error || "Request failed") as ApiError;
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  async function refresh() {
    const [usageData, usersData, plansData, historyData] =
      await Promise.all([
        api("/usage/account"),
        api("/users"),
        api("/plans"),
        api("/usage/history?limit=20"),
      ]);

    const fetchedUsers: User[] = usersData.users ?? [];

    setUsage(usageData);
    setUsers(fetchedUsers);

    setPlans(
      Array.isArray(plansData)
        ? plansData
        : plansData.plans ?? []
    );

    setHistory(historyData.requests ?? []);

    setSelectedUser((current) =>
      fetchedUsers.some((user) => user.id === current)
        ? current
        : fetchedUsers[0]?.id ?? ""
    );
  }

  async function connect() {
    if (!apiKey.trim()) return;

    setBusy(true);
    setError("");

    try {
      await refresh();
      setConnected(true);
      setActiveSection("overview");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Connection failed"
      );
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    setConnected(false);
    setApiKey("");
    setUsage(null);
    setUsers([]);
    setPlans([]);
    setHistory([]);
    setSelectedUser("");
    setResult("");
    setError("");
    setActiveSection("overview");
  }

  async function handleRefresh() {
    setBusy(true);
    setError("");

    try {
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Refresh failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function consume() {
    const amount = Number(units);

    if (
      !selectedUser ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 2147483647
    ) {
      setResult("Please select a user and enter valid units.");
      return;
    }

    setBusy(true);
    setResult("");
    setError("");

    try {
      const data = await api("/consume", {
        method: "POST",
        body: JSON.stringify({
          userId: selectedUser,
          units: amount,
          requestId: crypto.randomUUID(),
        }),
      });

      setResult(
        data.accepted
          ? "Accepted — usage recorded successfully."
          : `Rejected — ${data.rejectionLevel}: ${data.rejectionRule}`
      );
    } catch (err) {
      const apiError = err as ApiError;

      if (apiError.data?.accepted === false) {
        setResult(
          `Rejected — ${apiError.data.rejectionLevel}: ${apiError.data.rejectionRule}`
        );
      } else {
        setResult(apiError.message || "Something went wrong.");
      }
    } finally {
      try {
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? `Could not refresh dashboard: ${err.message}`
            : "Could not refresh dashboard."
        );
      }

      setBusy(false);
    }
  }

  function navigateTo(section: Section) {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const percentage =
    usage && usage.monthlyAllowance > 0
      ? Math.min(
          100,
          Math.round(
            (usage.consumedUnits / usage.monthlyAllowance) * 100
          )
        )
      : 0;

  const currentPage = navigation.find(
    (item) => item.id === activeSection
  )!;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">◈ Metering</div>

        <nav aria-label="Dashboard navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav ${
                activeSection === item.id ? "active" : ""
              }`}
              onClick={() => navigateTo(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebarFooter">
          Usage Metering Service
        </div>
      </aside>

      <main className="main">
        <header>
          <div>
            <p className="eyebrow">ACCOUNT DASHBOARD</p>

            <h1>
              {connected
                ? currentPage.label === "Overview"
                  ? "Usage Overview"
                  : currentPage.label
                : "Usage Overview"}
            </h1>

            <p className="muted">
              {connected
                ? pageDescriptions[activeSection]
                : "Monitor quotas, test requests, and review usage."}
            </p>
          </div>

          <div className="headerActions">
            {connected && (
              <>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={busy}
                  onClick={handleRefresh}
                >
                  Refresh
                </button>

                <button
                  type="button"
                  className="secondaryButton"
                  disabled={busy}
                  onClick={disconnect}
                >
                  Disconnect
                </button>
              </>
            )}

            <span className="status">
              <span className="dot" />
              {connected ? "Connected" : "Not connected"}
            </span>
          </div>
        </header>

        {error && connected && (
          <p className="error">{error}</p>
        )}

        {!connected ? (
          <section className="panel login">
            <h2>Connect your account</h2>

            <p className="muted">
              Enter an account API key to access the dashboard.
            </p>

            <input
              type="password"
              placeholder="Account API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) {
                  void connect();
                }
              }}
            />

            <button
              type="button"
              disabled={busy || !apiKey.trim()}
              onClick={connect}
            >
              {busy ? "Connecting..." : "Connect"}
            </button>

            {error && <p className="error">{error}</p>}
          </section>
        ) : (
          <>
            {/* OVERVIEW PAGE */}
            {activeSection === "overview" && (
              <>
                <div className="metrics">
                  <div className="panel metric">
                    <span>Total Allowance</span>
                    <strong>
                      {usage?.monthlyAllowance.toLocaleString() ?? "—"}
                    </strong>
                    <small>Monthly account quota</small>
                  </div>

                  <div className="panel metric">
                    <span>Units Consumed</span>
                    <strong>
                      {usage?.consumedUnits.toLocaleString() ?? "—"}
                    </strong>
                    <small>{usage?.month}</small>
                  </div>

                  <div className="panel metric">
                    <span>Remaining Units</span>
                    <strong>
                      {usage?.remainingUnits.toLocaleString() ?? "—"}
                    </strong>
                    <small>Available this month</small>
                  </div>

                  <div className="panel metric">
                    <span>Active Users</span>
                    <strong>{users.length}</strong>
                    <small>Registered users</small>
                  </div>
                </div>

                <section className="panel">
                  <div className="sectionHead">
                    <h2>Monthly Usage</h2>
                    <span className="tag">
                      {usage?.plan} Plan
                    </span>
                  </div>

                  <div className="percentage">
                    {percentage}%
                  </div>

                  <div className="progress">
                    <div
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  <p className="muted">
                    {usage?.consumedUnits.toLocaleString()} of{" "}
                    {usage?.monthlyAllowance.toLocaleString()} units used
                  </p>
                </section>
              </>
            )}

            {/* USERS AND PLANS PAGE */}
            {activeSection === "users" && (
              <div className="twoColumns">
                <section className="panel">
                  <h2>Users</h2>

                  <div className="tableWrap">
                    <table>
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Plan</th>
                        </tr>
                      </thead>

                      <tbody>
                        {users.map((user) => (
                          <tr key={user.id}>
                            <td>{user.externalId}</td>
                            <td>
                              {plans.find(
                                (plan) => plan.id === user.planId
                              )?.name ?? "—"}
                            </td>
                          </tr>
                        ))}

                        {users.length === 0 && (
                          <tr>
                            <td colSpan={2}>No users found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="panel">
                  <h2>Available Plans</h2>

                  <div className="tableWrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Plan</th>
                          <th>Type</th>
                          <th>Monthly</th>
                          <th>Max / Request</th>
                        </tr>
                      </thead>

                      <tbody>
                        {plans.map((plan) => (
                          <tr key={plan.id}>
                            <td>{plan.name}</td>
                            <td>{plan.type}</td>
                            <td>
                              {plan.monthlyAllowance.toLocaleString()}
                            </td>
                            <td>
                              {plan.maxUnitsPerRequest.toLocaleString()}
                            </td>
                          </tr>
                        ))}

                        {plans.length === 0 && (
                          <tr>
                            <td colSpan={4}>No plans found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {/* CONSUME SIMULATOR PAGE */}
            {activeSection === "consume" && (
              <div className="twoColumns">
                <section className="panel">
                  <h2>Consume Simulator</h2>

                  <p className="muted">
                    Send a real usage request to the API.
                  </p>

                  <label htmlFor="user-select">User</label>

                  <select
                    id="user-select"
                    value={selectedUser}
                    onChange={(e) =>
                      setSelectedUser(e.target.value)
                    }
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.externalId}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="units-input">Units</label>

                  <input
                    id="units-input"
                    type="number"
                    min="1"
                    step="1"
                    value={units}
                    onChange={(e) =>
                      setUnits(e.target.value)
                    }
                  />

                  <button
                    type="button"
                    disabled={busy || !selectedUser}
                    onClick={consume}
                  >
                    {busy
                      ? "Processing..."
                      : "Consume Units →"}
                  </button>

                  {result && (
                    <p className="feedback">{result}</p>
                  )}
                </section>

                <section className="panel">
                  <div className="sectionHead">
                    <h2>Account Quota</h2>
                    <span className="tag">
                      {usage?.plan} Plan
                    </span>
                  </div>

                  <div className="percentage">
                    {percentage}%
                  </div>

                  <div className="progress">
                    <div
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  <p className="muted">
                    {usage?.remainingUnits.toLocaleString()} units remaining
                  </p>
                </section>
              </div>
            )}

            {/* REQUEST HISTORY PAGE */}
            {activeSection === "history" && (
              <section className="panel">
                <div className="sectionHead">
                  <h2>Recent Requests</h2>
                  <span className="muted">Latest 20</span>
                </div>

                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Request ID</th>
                        <th>Units</th>
                        <th>Status</th>
                        <th>Reason</th>
                      </tr>
                    </thead>

                    <tbody>
                      {history.map((item) => (
                        <tr key={item.id}>
                          <td
                            className="mono"
                            title={item.requestId}
                          >
                            {item.requestId.slice(0, 14)}…
                          </td>

                          <td>{item.units}</td>

                          <td>
                            <span
                              className={
                                item.accepted
                                  ? "accepted"
                                  : "rejected"
                              }
                            >
                              {item.accepted
                                ? "Accepted"
                                : "Rejected"}
                            </span>
                          </td>

                          <td>
                            {item.rejectionRule
                              ? `${item.rejectionLevel}: ${item.rejectionRule}`
                              : "—"}
                          </td>
                        </tr>
                      ))}

                      {history.length === 0 && (
                        <tr>
                          <td colSpan={4}>
                            No requests yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
