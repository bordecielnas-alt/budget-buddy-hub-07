import { useSession } from "@tanstack/react-start/server";

import { getState, hashPassword, mutate } from "./store.server";

type SessionData = { admin?: boolean };

async function sessionConfig() {
  const state = await getState();
  return {
    password: state.sessionSecret,
    name: "bt_session",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export async function getAppSession() {
  return useSession<SessionData>(await sessionConfig());
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const session = await getAppSession();
    return session.data?.admin === true;
  } catch {
    return false;
  }
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Non authentifié");
}

export async function verifyPassword(password: string): Promise<boolean> {
  const state = await getState();
  const hash = await hashPassword(password, state.admin.salt);
  return hash === state.admin.hash;
}

export async function signIn(password: string): Promise<boolean> {
  if (!(await verifyPassword(password))) return false;
  const session = await getAppSession();
  await session.update({ admin: true });
  return true;
}

export async function signOut(): Promise<void> {
  const session = await getAppSession();
  await session.clear();
}

export async function updatePassword(next: string): Promise<void> {
  await mutate(async (state) => {
    state.admin.hash = await hashPassword(next, state.admin.salt);
  });
}
