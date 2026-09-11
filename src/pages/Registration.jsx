import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Atom, CheckCircle2, UserRound } from "lucide-react";
import { api } from "../services/api";
import { saveCurrentUser } from "../services/user";
import "./Registration.css";

function toUserId(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function Registration() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: "", userId: "", password: "", level: "beginner", goals: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  async function register(event) {
    event.preventDefault();
    const userId = toUserId(form.userId || form.displayName);
    if (!form.displayName.trim() || !userId) {
      setError("Add a display name and a short learner ID.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const session = await api.register({
        user_id: userId,
        password: form.password,
        display_name: form.displayName.trim(),
        preferences: {
          experience_level: form.level,
          learning_goals: form.goals.trim(),
        },
      });
      saveCurrentUser({ userId, displayName: form.displayName.trim(), accessToken: session.access_token });
      setStatus("Your learning profile is ready.");
      window.setTimeout(() => navigate("/"), 450);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="registration-page">
      <div className="registration-intro">
        <div className="registration-mark"><Atom size={28} /></div>
        <p className="page-label">LEARNER PROFILE</p>
        <h1>Make the lab yours.</h1>
        <p>Save your preferences so the tutor and exercises can meet you at the right level.</p>
        <div className="registration-note">
          <CheckCircle2 size={17} />
          <span>Your account protects your profile, attempts, tutor history, and notebook exports.</span>
        </div>
        <Link className="text-link" to="/">Back to dashboard <ArrowRight size={15} /></Link>
      </div>

      <form className="registration-form" onSubmit={register}>
        <div className="form-heading">
          <UserRound size={18} />
          <div>
            <h2>Register your workspace</h2>
            <p>Use at least 12 characters for your password.</p>
          </div>
        </div>

        <label htmlFor="displayName">Display name</label>
        <input id="displayName" name="displayName" value={form.displayName} onChange={updateField} placeholder="e.g. Alex Chen" autoComplete="name" />

        <label htmlFor="userId">Learner ID</label>
        <input id="userId" name="userId" value={form.userId} onChange={updateField} placeholder="e.g. alex-chen" autoComplete="username" />
        <span className="field-hint">Used only to address your backend learning profile.</span>

        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" value={form.password} onChange={updateField} minLength={12} autoComplete="new-password" />

        <label htmlFor="level">Experience level</label>
        <select id="level" name="level" value={form.level} onChange={updateField}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>

        <label htmlFor="goals">Learning goals <span>(optional)</span></label>
        <textarea id="goals" name="goals" value={form.goals} onChange={updateField} rows={4} placeholder="What would you like to build or understand?" />

        {error && <p className="form-message error" role="alert">{error}</p>}
        {status && <p className="form-message success" role="status">{status}</p>}
        <button className="primary-button registration-submit" type="submit" disabled={saving}>
          {saving ? "Saving profile..." : "Create learning profile"}
          {!saving && <ArrowRight size={17} />}
        </button>
      </form>
    </div>
  );
}

export default Registration;
