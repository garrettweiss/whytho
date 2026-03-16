"use client";

import { useState } from "react";

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "DC", name: "Washington D.C." },
];

const AFFILIATIONS = [
  "Democrat",
  "Republican",
  "Independent",
  "Green",
  "Libertarian",
  "Other",
];

interface Props {
  initialCity: string | null;
  initialCounty: string | null;
  initialStateCode: string | null;
  initialAffiliation: string | null;
}

export function AccountProfileForm({
  initialCity,
  initialCounty,
  initialStateCode,
  initialAffiliation,
}: Props) {
  const [city, setCity] = useState(initialCity ?? "");
  const [county, setCounty] = useState(initialCounty ?? "");
  const [stateCode, setStateCode] = useState(initialStateCode ?? "");
  const [affiliation, setAffiliation] = useState(initialAffiliation ?? "");

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");

    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: city.trim() || null,
          county: county.trim() || null,
          state_code: stateCode || null,
          political_affiliation: affiliation || null,
        }),
      });

      if (!res.ok) {
        setStatus("error");
      } else {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold">Location</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Help us show you the most relevant politicians for your area.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* City */}
        <div className="space-y-1.5">
          <label htmlFor="profile-city" className="text-sm font-medium">
            City
          </label>
          <input
            id="profile-city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Denver"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* County */}
        <div className="space-y-1.5">
          <label htmlFor="profile-county" className="text-sm font-medium">
            County
          </label>
          <input
            id="profile-county"
            type="text"
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            placeholder="e.g. Denver County"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* State */}
        <div className="space-y-1.5">
          <label htmlFor="profile-state" className="text-sm font-medium">
            State
          </label>
          <select
            id="profile-state"
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Select state —</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Political Affiliation */}
        <div className="space-y-1.5">
          <label htmlFor="profile-affiliation" className="text-sm font-medium">
            Political Affiliation
          </label>
          <select
            id="profile-affiliation"
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Prefer not to say —</option>
            {AFFILIATIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>

        {status === "saved" && (
          <span className="text-sm text-green-600 font-medium">✓ Saved</span>
        )}
        {status === "error" && (
          <span className="text-sm text-destructive">Something went wrong. Try again.</span>
        )}
      </div>
    </form>
  );
}
