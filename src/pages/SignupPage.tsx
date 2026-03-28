import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(email, password, displayName);
      void navigate("/worlds/middle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-900 mb-4">
            <span className="text-white text-sm font-bold">RP</span>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Create an account</h1>
          <p className="text-sm text-zinc-500 mt-1">Get started with Rice Padi</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">Display Name</label>
            <input
              type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              required autoFocus minLength={2}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm text-zinc-900 bg-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-shadow"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm text-zinc-900 bg-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-shadow"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required minLength={8}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-sm text-zinc-900 bg-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-shadow"
            />
            <p className="text-xs text-zinc-400">At least 8 characters</p>
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors mt-2"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
          <p className="text-center text-sm text-zinc-500">
            Have an account?{" "}
            <Link to="/login" className="text-zinc-900 font-medium hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
