"use client";

import { useEffect, useState } from "react";
import { getDataStore } from "@/lib/db";
import { useAuth } from "@/context/AuthContext";
import type { Profile } from "@/lib/types";

export function useProfiles(): Profile[] {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    let active = true;
    getDataStore()
      .listProfiles()
      .then((list) => {
        if (active) setProfiles(list.filter((p) => p.id !== user?.id));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user]);

  return profiles;
}
