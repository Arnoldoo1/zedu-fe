"use client";

import { useCallback, useEffect, useState } from "react";
import { getOfficeStatus, subscribeToOfficeStatus } from "~/lib/office/status";

/**
 * The organisation's office setting as React state.
 *
 * `null` means "not known yet", so a caller can hold the UI instead of
 * guessing. The underlying request is cached per organisation, so several
 * callers on one screen still make a single call, and everyone is told when
 * an administrator changes the setting.
 */
export function useOfficeStatus(orgKey: string): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const read = useCallback(() => {
    if (!orgKey) {
      // No organisation yet is not an answer: the setting is still unknown,
      // and treating it as "off" would hide a working office.
      setEnabled(null);
      return;
    }

    getOfficeStatus(orgKey).then((status) => {
      setEnabled(status.enabled);
    });
  }, [orgKey]);

  useEffect(() => {
    read();
  }, [read]);

  useEffect(() => subscribeToOfficeStatus(read), [read]);

  return enabled;
}
