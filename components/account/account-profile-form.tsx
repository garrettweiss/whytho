"use client";

import { useState, useRef, useEffect, useCallback } from "react";

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

const US_CITIES = [
  "Akron", "Albuquerque", "Alexandria", "Anaheim", "Anchorage",
  "Arlington", "Atlanta", "Aurora", "Austin", "Bakersfield",
  "Baltimore", "Baton Rouge", "Bellevue", "Birmingham", "Boise",
  "Boston", "Bridgeport", "Buffalo", "Cape Coral", "Cary",
  "Chandler", "Charlotte", "Chattanooga", "Chesapeake", "Chicago",
  "Chula Vista", "Cincinnati", "Clarksville", "Cleveland", "Colorado Springs",
  "Columbia", "Columbus", "Corpus Christi", "Dallas", "Denver",
  "Des Moines", "Detroit", "Durham", "El Paso", "Elk Grove",
  "Eugene", "Fayetteville", "Fontana", "Fort Collins", "Fort Lauderdale",
  "Fort Wayne", "Fort Worth", "Fremont", "Fresno", "Garland",
  "Gilbert", "Glendale", "Grand Prairie", "Grand Rapids", "Greensboro",
  "Hampton", "Henderson", "Hialeah", "Hollywood", "Honolulu",
  "Houston", "Huntington Beach", "Huntsville", "Indianapolis", "Irvine",
  "Irving", "Jacksonville", "Jersey City", "Kansas City", "Killeen",
  "Knoxville", "Laredo", "Las Vegas", "Lexington", "Lincoln",
  "Little Rock", "Long Beach", "Los Angeles", "Louisville", "Lubbock",
  "Macon", "Madison", "McAllen", "Memphis", "Mesa",
  "Miami", "Milwaukee", "Minneapolis", "Mobile", "Modesto",
  "Moreno Valley", "Murfreesboro", "Nashville", "New Orleans", "New York",
  "Newark", "Norfolk", "North Las Vegas", "Oakland", "Oceanside",
  "Oklahoma City", "Omaha", "Orange", "Orlando", "Palmdale",
  "Pasadena", "Paterson", "Peoria", "Philadelphia", "Phoenix",
  "Pittsburgh", "Plano", "Portland", "Providence", "Pueblo",
  "Raleigh", "Rancho Cucamonga", "Reno", "Richmond", "Riverside",
  "Rochester", "Rockford", "Sacramento", "Saint Paul", "Salem",
  "Salinas", "Salt Lake City", "San Antonio", "San Bernardino", "San Diego",
  "San Francisco", "San Jose", "Santa Ana", "Santa Clarita", "Savannah",
  "Scottsdale", "Seattle", "Shreveport", "Spokane", "Springfield",
  "St. Louis", "St. Petersburg", "Stockton", "Surprise", "Syracuse",
  "Tacoma", "Tallahassee", "Tampa", "Tempe", "Toledo",
  "Topeka", "Torrance", "Tucson", "Tulsa", "Virginia Beach",
  "Washington", "Warren", "West Valley City", "Wichita", "Winston-Salem",
  "Worcester", "Yonkers",
];

const AFFILIATIONS = [
  "Democrat", "Republican", "Independent", "Green", "Libertarian", "Other",
];

// ── Generic combobox ──────────────────────────────────────────────────────────

interface ComboboxOption {
  value: string;
  label: string;
}

function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  minChars = 1,
  freeform = false,
}: {
  id: string;
  value: string;
  onChange: (val: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  minChars?: number;
  freeform?: boolean;
}) {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  // Sync external value changes (e.g. initial load)
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (value !== prevValueRef.current) {
      setInputValue(value);
      prevValueRef.current = value;
    }
  }, [value]);

  const filtered =
    inputValue.length >= minChars
      ? options
          .filter((o) =>
            o.label.toLowerCase().startsWith(inputValue.toLowerCase())
          )
          .slice(0, 8)
      : [];

  function select(opt: ComboboxOption) {
    setInputValue(opt.label);
    onChange(opt.value);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) {
      if (e.key === "ArrowDown") {
        setOpen(true);
        setHighlighted(0);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Tab" || e.key === "Enter") {
      if (filtered[highlighted]) {
        e.preventDefault();
        select(filtered[highlighted]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleBlur() {
    // Delay to let onMouseDown on list item fire first
    setTimeout(() => {
      setOpen(false);
      if (!freeform) {
        // Snap back to last valid value if input doesn't exactly match an option
        const exact = options.find(
          (o) => o.label.toLowerCase() === inputValue.toLowerCase()
        );
        if (exact) {
          setInputValue(exact.label);
          onChange(exact.value);
        } else if (!inputValue.trim()) {
          onChange("");
        } else {
          // Partial / invalid - reset to whatever was committed
          setInputValue(value);
        }
      } else {
        onChange(inputValue);
      }
    }, 150);
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setOpen(true);
          setHighlighted(0);
          if (freeform) onChange(e.target.value);
          else if (!e.target.value) onChange("");
        }}
        onFocus={() => {
          setOpen(true);
          setHighlighted(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {filtered.map((opt, i) => (
            <li
              key={opt.value}
              onMouseDown={() => select(opt)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                i === highlighted ? "bg-muted" : "hover:bg-muted/60"
              }`}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

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

  // The displayed state label (for the combobox value prop)
  const stateLabel = US_STATES.find((s) => s.code === stateCode)?.name ?? "";

  const stateOptions: ComboboxOption[] = US_STATES.map((s) => ({
    value: s.code,
    label: s.name,
  }));

  const cityOptions: ComboboxOption[] = US_CITIES.map((c) => ({
    value: c,
    label: c,
  }));

  const handleStateChange = useCallback((label: string) => {
    // The combobox returns the option value (state code), but for state
    // we pass value=stateCode and options with value=code/label=name.
    // When onChange fires it gives us the code directly.
    setStateCode(label);
  }, []);

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
          <Combobox
            id="profile-city"
            value={city}
            onChange={setCity}
            options={cityOptions}
            placeholder="e.g. Denver"
            minChars={2}
            freeform
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
            autoComplete="off"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* State */}
        <div className="space-y-1.5">
          <label htmlFor="profile-state" className="text-sm font-medium">
            State
          </label>
          <Combobox
            id="profile-state"
            value={stateLabel}
            onChange={handleStateChange}
            options={stateOptions}
            placeholder="Type a state…"
            minChars={1}
          />
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
            <option value="">Prefer not to say</option>
            {AFFILIATIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
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
