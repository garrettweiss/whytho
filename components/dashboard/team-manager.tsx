"use client";

import { useState, useEffect, useTransition } from "react";

type TeamMember = {
  id: string;
  user_id: string;
  role: string;
  email: string;
  display_name: string | null;
  is_self: boolean;
  created_at: string;
};

const ROLE_LABELS: Record<string, { label: string; description: string }> = {
  admin:     { label: "Admin",     description: "Full access: can answer, edit, and manage team" },
  editor:    { label: "Editor",    description: "Can publish answers directly" },
  responder: { label: "Responder", description: "Can draft answers (requires editor approval)" },
};

interface Props {
  politicianId: string;
  callerRole: string;
}

export function TeamManager({ politicianId, callerRole }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("responder");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isInviting, startInvite] = useTransition();

  // Remove
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const isAdmin = callerRole === "admin";

  useEffect(() => {
    if (!isOpen) return;
    fetchMembers();
  }, [isOpen, politicianId]);

  async function fetchMembers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/team?politician_id=${politicianId}`);
      const data = await res.json() as { members?: TeamMember[] };
      setMembers(data.members ?? []);
    } catch {
      // silently fail - team section is non-critical
    } finally {
      setLoading(false);
    }
  }

  function handleInvite() {
    setInviteError(null);
    setInviteSuccess(null);
    if (!inviteEmail.includes("@")) {
      setInviteError("Enter a valid email address");
      return;
    }
    startInvite(async () => {
      try {
        const res = await fetch("/api/dashboard/team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ politician_id: politicianId, email: inviteEmail, role: inviteRole }),
        });
        const data = await res.json() as { error?: string; email?: string };
        if (!res.ok) {
          setInviteError(data.error ?? "Failed to add member");
          return;
        }
        setInviteSuccess(`${data.email} added as ${inviteRole}`);
        setInviteEmail("");
        await fetchMembers();
      } catch {
        setInviteError("Network error. Please try again.");
      }
    });
  }

  async function handleRemove(memberId: string) {
    setRemoving(memberId);
    setRemoveError(null);
    try {
      const res = await fetch("/api/dashboard/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_member_id: memberId, politician_id: politicianId }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setRemoveError(data.error ?? "Failed to remove member");
        return;
      }
      await fetchMembers();
    } catch {
      setRemoveError("Network error. Please try again.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="border-t pt-4 mt-2">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{isOpen ? "▾" : "▸"}</span>
        <span className="font-medium">Team Management</span>
        {members.length > 0 && isOpen && (
          <span className="text-xs bg-muted rounded-full px-2 py-0.5">{members.length} member{members.length !== 1 ? "s" : ""}</span>
        )}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {/* Member list */}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading team…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members yet. Add staff below.</p>
          ) : (
            <div className="space-y-1">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.display_name ?? m.email}
                      {m.is_self && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                    </p>
                    {m.display_name && (
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.role === "admin" ? "bg-primary/10 text-primary" :
                      m.role === "editor" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {ROLE_LABELS[m.role]?.label ?? m.role}
                    </span>
                    {isAdmin && !m.is_self && (
                      <button
                        type="button"
                        onClick={() => handleRemove(m.id)}
                        disabled={removing === m.id}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                        title="Remove from team"
                      >
                        {removing === m.id ? "…" : "✕"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {removeError && <p className="text-xs text-destructive">{removeError}</p>}
            </div>
          )}

          {/* Role legend */}
          <div className="space-y-1 pt-1">
            {Object.entries(ROLE_LABELS).map(([key, { label, description }]) => (
              <p key={key} className="text-xs text-muted-foreground">
                <span className="font-medium">{label}:</span> {description}
              </p>
            ))}
          </div>

          {/* Invite form - admin only */}
          {isAdmin && (
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add Team Member</p>
              <p className="text-xs text-muted-foreground">
                They must already have a WhyTho account. Their email address is needed.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="staff@example.gov"
                  disabled={isInviting}
                  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                  onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  disabled={isInviting}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                >
                  <option value="responder">Responder</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleInvite}
                disabled={isInviting || !inviteEmail}
                className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isInviting ? "Adding…" : "Add Member"}
              </button>
              {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
              {inviteSuccess && <p className="text-xs text-green-600 dark:text-green-400">✓ {inviteSuccess}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
