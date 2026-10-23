"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { Switch } from "~/components/ui/switch";
import { RequirePermission } from "~/components/rbac/RequirePermission";
import { showError, showSuccess } from "~/components/toast/sonner";
import { GetRequest, PutRequest } from "~/utils/new-request";
import { clearOfficeStatusCache } from "~/lib/office/status";

type OfficeSettings = {
  enabled: boolean;
};

function failed(response: any): boolean {
  const status = response?.status ?? response?.response?.status;
  return typeof status !== "number" || status >= 400;
}

/**
 * The office switch. Owners and administrators turn the office on or off for
 * the whole organisation.
 */
export default function OfficeSetting() {
  const [settings, setSettings] = useState<OfficeSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    GetRequest("/office/settings").then((response: any) => {
      if (cancelled) return;

      if (failed(response)) {
        showError("The office setting could not be loaded.");
        return;
      }

      const data = response?.data?.data as OfficeSettings | undefined;
      setSettings(data ?? { enabled: false });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    setSaving(true);

    const response = await PutRequest("/office/settings", { enabled: next });
    setSaving(false);

    if (failed(response)) {
      showError("The office setting could not be saved.");
      return;
    }

    setSettings((previous) => ({ ...previous, enabled: next }));
    // The rail item reads the same setting, so it has to hear about the change.
    clearOfficeStatusCache();
    showSuccess(
      next
        ? "The office is on for your organisation."
        : "The office is off for your organisation."
    );
  }

  const enabled = settings?.enabled ?? false;

  return (
    <div className="border rounded-xl p-4 w-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F2F4F7]">
            <Building2 className="h-5 w-5 text-[#344054]" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[#101828]">The Office</h3>
            <p className="mt-1 text-sm text-[#667085]">
              Give your organisation a 3D office: a room for every channel, a
              private office for every member, and live presence. Turning it off
              takes the office away for everybody in the organisation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {settings === null && (
            <Loader2 className="h-4 w-4 animate-spin text-[#98A2B3]" />
          )}
          <RequirePermission permission="manage:organization">
            <Switch
              checked={enabled}
              onCheckedChange={toggle}
              disabled={saving || settings === null}
              aria-label="The Office"
            />
          </RequirePermission>
        </div>
      </div>
    </div>
  );
}
