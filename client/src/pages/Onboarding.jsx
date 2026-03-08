import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ghost, Sparkles, ArrowRight, Plus, Briefcase, Mail, User as UserIcon } from 'lucide-react';
import { joinSession } from '../lib/api';
import { useUser } from '../context/UserContext';
import GlassCard from '../components/GlassCard';
import KeywordBadge from '../components/KeywordBadge';

export default function Onboarding() {
  const { user, login } = useUser();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    displayName: '',
    email: '',
    role: 'candidate',
    jobTitle: '',
  });
  const [keywords, setKeywords] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  useEffect(() => {
    if (user) {
      navigate('/discover', { replace: true });
    }
  }, [user, navigate]);

  if (user) return null;

  const addKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (kw && !keywords.includes(kw) && keywords.length < 10) {
      setKeywords([...keywords, kw]);
      setKeywordInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword();
    }
  };

  const removeKeyword = (kw) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userData = await joinSession({
        ...form,
        keywords,
      });
      login(userData);
      navigate('/discover');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-accent-violet/10 blur-[120px] animate-float" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-accent-fuchsia/10 blur-[120px] animate-float" style={{ animationDelay: '3s' }} />
      <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-accent-pink/5 blur-[100px] animate-float" style={{ animationDelay: '1.5s' }} />

      {/* Header */}
      <div className="text-center mb-8 animate-fade-in relative z-10">
        <div className="w-16 h-16 mx-auto rounded-2xl gradient-bg flex items-center justify-center mb-4 shadow-lg shadow-accent-violet/30 animate-float">
          <Ghost className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-extrabold gradient-text mb-2">ConnectTalent</h1>
        <p className="text-zinc-400 text-sm max-w-xs mx-auto">
          Ephemeral professional networking. Match, chat, and connect — before time runs out.
        </p>
      </div>

      {/* Form */}
      <GlassCard className="w-full max-w-md animate-slide-up relative z-10">
        <form onSubmit={handleSubmit} className="space-y-5">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-accent-fuchsia" />
            Join Session
          </h2>
          <p className="text-zinc-500 text-xs mb-4">Your session lasts 24 hours. Make it count.</p>

          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl px-4 py-2.5">
              {error}
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5" /> Display Name
            </label>
            <input
              id="display-name-input"
              type="text"
              required
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Your name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-accent-violet/50 focus:ring-1 focus:ring-accent-violet/30 transition-all"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Email
            </label>
            <input
              id="email-input"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-accent-violet/50 focus:ring-1 focus:ring-accent-violet/30 transition-all"
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">I am a...</label>
            <div className="grid grid-cols-2 gap-3">
              {['candidate', 'hr'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm({ ...form, role: r })}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-all duration-200
                    ${form.role === r
                      ? 'gradient-bg text-white border-transparent shadow-lg shadow-accent-violet/20'
                      : 'bg-white/5 text-zinc-400 border-white/10 hover:border-white/20'
                    }
                  `}
                >
                  {r === 'candidate' ? '👤 Candidate' : '🏢 Hiring (HR)'}
                </button>
              ))}
            </div>
          </div>

          {/* Job Title */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" /> Job Title
            </label>
            <input
              id="job-title-input"
              type="text"
              value={form.jobTitle}
              onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              placeholder="e.g. Frontend Developer"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-accent-violet/50 focus:ring-1 focus:ring-accent-violet/30 transition-all"
            />
          </div>

          {/* Keywords */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">
              Skills / Keywords <span className="text-zinc-600">({keywords.length}/10)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="keyword-input"
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a skill..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-accent-violet/50 focus:ring-1 focus:ring-accent-violet/30 transition-all"
              />
              <button
                type="button"
                onClick={addKeyword}
                disabled={keywords.length >= 10}
                className="px-3 rounded-xl gradient-bg text-white hover:opacity-90 transition-opacity disabled:opacity-30"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {keywords.map((kw) => (
                  <KeywordBadge key={kw} keyword={kw} onRemove={removeKeyword} />
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            id="join-session-btn"
            type="submit"
            disabled={loading}
            className="w-full gradient-bg text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-accent-violet/20"
          >
            {loading ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <>
                Join Session
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </GlassCard>

      <p className="text-zinc-600 text-xs mt-6 text-center relative z-10">
        ⏱ Your session auto-expires after 24 hours
      </p>
    </div>
  );
}
