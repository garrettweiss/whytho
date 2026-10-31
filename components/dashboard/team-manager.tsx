"use client";

import { useId, useState, useEffect, useTransition } from "react";

import styles from "./dashboard.module.css";

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
  const fieldId = useId();
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

  return <section className={styles.panel}>
    <button type="button" onClick={() => setIsOpen(o => !o)} aria-expanded={isOpen} aria-controls={`${fieldId}-panel`} className={styles.panelToggle}>
      <span>Manage your team</span><span aria-hidden="true">{isOpen ? "−" : "+"}</span>
    </button>
    {isOpen && <div id={`${fieldId}-panel`} className={styles.panelBody}>
      {loading ? <p role="status" className={styles.meta}>Loading team…</p> : members.length === 0 ? <p className={styles.meta}>No team members yet.</p> : <ul aria-label="Team members">
        {members.map(m => <li key={m.id} className={styles.teamMember}>
          <p><strong>{m.display_name ?? m.email}</strong>{m.is_self && <span className={styles.meta}> (you)</span>}</p>
          {m.display_name && <p className={styles.meta}>{m.email}</p>}
          <div className={styles.memberActions}>
            <span className={styles.badge}>{ROLE_LABELS[m.role]?.label ?? m.role}</span>
            {isAdmin && !m.is_self && <button type="button" onClick={() => handleRemove(m.id)} disabled={removing === m.id} className={styles.textButton} aria-label={`Remove ${m.display_name ?? m.email} from the team`}>{removing === m.id ? "Removing…" : "Remove"}</button>}
          </div>
        </li>)}
      </ul>}
      {removeError && <p role="alert" className={`${styles.meta} ${styles.error}`}>{removeError}</p>}
      <div className={styles.legend}>{Object.entries(ROLE_LABELS).map(([key, { label, description }]) => <p key={key}><strong>{label}:</strong> {description}</p>)}</div>
      {isAdmin && <section aria-label="Add a team member">
        <p className={styles.eyebrow}>Add a team member</p>
        <p className={styles.meta}>They must already have a WhyTho account.</p>
        <div className={styles.field}>
          <label htmlFor={`${fieldId}-email`}>Account email</label>
          <input id={`${fieldId}-email`} type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="staff@example.gov" disabled={isInviting} onKeyDown={e => { if (e.key === "Enter") handleInvite(); }} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${fieldId}-role`}>Team role</label>
          <select id={`${fieldId}-role`} value={inviteRole} onChange={e => setInviteRole(e.target.value)} disabled={isInviting}>
            <option value="responder">Responder</option><option value="editor">Editor</option><option value="admin">Admin</option>
          </select>
        </div>
        <button type="button" onClick={handleInvite} disabled={isInviting || !inviteEmail} className={styles.button}>{isInviting ? "Adding…" : "Add member"}</button>
        {inviteError && <p role="alert" className={`${styles.meta} ${styles.error}`}>{inviteError}</p>}
        {inviteSuccess && <p role="status" className={`${styles.meta} ${styles.success}`}>{inviteSuccess}</p>}
      </section>}
    </div>}
  </section>;
}
