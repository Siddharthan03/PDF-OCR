import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

// Example data
const userGrowthData = [
  { month: "Jan", users: 40 },
  { month: "Feb", users: 80 },
  { month: "Mar", users: 65 },
  { month: "Apr", users: 120 },
  { month: "May", users: 150 },
];

const activityData = [
  { name: "Uploads", value: 120 },
  { name: "Downloads", value: 95 },
  { name: "Logins", value: 200 },
  { name: "Errors", value: 15 },
];

// Reusable Glass Card
const GlassCard = ({ title, children }) => (
  <div className="unique-glass-card small-card">
    <h2>{title}</h2>
    {children}
  </div>
);

export default function Overview() {
  return (
    <div>
      <h1 className="dashboard-title" style={{ color: 'white'}}>Overview</h1>

      {/* Stats cards */}
      <div className="stats-grid">
        <GlassCard title="Total Users">
          <p className="stat-value">120</p>
        </GlassCard>
        <GlassCard title="Activity Logs">
          <p className="stat-value">523</p>
        </GlassCard>
        <GlassCard title="Total Uploads">
          <p className="stat-value">78</p>
        </GlassCard>
        <GlassCard title="Active Sessions">
          <p className="stat-value">45</p>
        </GlassCard>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <GlassCard title="User Growth">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={userGrowthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.2)" />
              <XAxis dataKey="month" stroke="#fff" />
              <YAxis stroke="#fff" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.8)",
                  borderRadius: "8px",
                  border: "none",
                  color: "#fff",
                }}
              />
              <Line type="monotone" dataKey="users" stroke="#00ff88" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard title="Activity Breakdown">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.2)" />
              <XAxis dataKey="name" stroke="#fff" />
              <YAxis stroke="#fff" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.8)",
                  borderRadius: "8px",
                  border: "none",
                  color: "#fff",
                }}
              />
              <Bar dataKey="value" fill="#8884d8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>
    </div>
  );
}
