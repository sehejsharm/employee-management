"use client";

import { useActionState, useState } from "react";
import { MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { completeProfile, logout, type AuthFormState } from "../actions";

export function ProfileForm(props: { firstName: string; phone: string; location: string }) {
  const { firstName } = props;
  // Controlled, so a rejected submit doesn't wipe what was typed.
  const [phone, setPhone] = useState(props.phone);
  const [location, setLocation] = useState(props.location);
  const [state, action, pending] = useActionState<AuthFormState, FormData>(completeProfile, {});

  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
      <div className="w-full max-w-[420px]">
        <h2 className="text-[28px] font-semibold tracking-[-0.025em]">One last step, {firstName}.</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">
          Add your phone number and where you work from, so the team can reach you. You can change them later in Settings.
        </p>

        <form action={action} className="mt-8 space-y-5">
          <div>
            <Label htmlFor="phone">Phone number</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="h-12 rounded-xl pl-10 text-[15px]"
                aria-invalid={state.field === "phone"}
                autoFocus
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                id="location"
                name="location"
                autoComplete="address-level2"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, e.g. Mumbai"
                className="h-12 rounded-xl pl-10 text-[15px]"
                aria-invalid={state.field === "location"}
                required
              />
            </div>
          </div>

          {state.error && (
            <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
              {state.error}
            </div>
          )}

          <Button type="submit" size="lg" loading={pending} className="h-12 w-full rounded-xl text-[15px]">
            Save and continue
          </Button>
        </form>

        <form action={logout} className="mt-4 text-center">
          <button className="text-[13px] text-fg-subtle underline-offset-4 hover:text-fg hover:underline">Sign out</button>
        </form>
      </div>
    </div>
  );
}
