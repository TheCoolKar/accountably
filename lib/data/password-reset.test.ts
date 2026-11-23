import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { auth, createClient } = vi.hoisted(() => {
  const auth = {
    resetPasswordForEmail: vi.fn(),
    initialize: vi.fn(),
    getSession: vi.fn(),
    updateUser: vi.fn(),
  };
  return { auth, createClient: vi.fn(() => ({ auth })) };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

async function store() {
  return (await import("./supabase-store")).supabaseStore;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  vi.stubGlobal("window", { location: { origin: "https://accountably.example.test" } });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.initialize.mockResolvedValue({ error: null });
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: "friend" } } }, error: null });
  auth.updateUser.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("requesting a password reset", () => {
  it("sends the trimmed email with a fixed callback on the current app origin", async () => {
    await (await store()).requestPasswordReset("  friend@example.test  ");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("friend@example.test", {
      redirectTo: "https://accountably.example.test/auth/reset-password",
    });
  });

  it("does not need an account or session lookup, preserving the generic response", async () => {
    await expect((await store()).requestPasswordReset("unknown@example.test")).resolves.toBeUndefined();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("reports email rate limits", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", message: "Too many emails" },
    });
    await expect((await store()).requestPasswordReset("friend@example.test"))
      .rejects.toMatchObject({ code: "rate_limited" });
  });

  it("reports offline failures", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: "Failed to fetch" } });
    await expect((await store()).requestPasswordReset("friend@example.test"))
      .rejects.toMatchObject({ code: "network" });
  });

  it("uses a reset-specific message for other failures", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "unexpected", message: "Internal error" } });
    await expect((await store()).requestPasswordReset("friend@example.test"))
      .rejects.toThrow("Couldn't send a reset link. Try again.");
  });

  it("fails clearly when accounts are not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await expect((await store()).requestPasswordReset("friend@example.test"))
      .rejects.toMatchObject({ code: "not_configured" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("checking the recovery session", () => {
  it("waits for the callback to finish before reading the session", async () => {
    let finish!: (value: { error: null }) => void;
    auth.initialize.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const checking = (await store()).checkPasswordResetSession();
    expect(auth.getSession).not.toHaveBeenCalled();
    finish({ error: null });
    await expect(checking).resolves.toBeUndefined();
    expect(auth.getSession).toHaveBeenCalledOnce();
  });

  it("rejects a failed link even if another account already has a session", async () => {
    auth.initialize.mockResolvedValue({ error: { message: "Email link is invalid or has expired" } });
    await expect((await store()).checkPasswordResetSession())
      .rejects.toMatchObject({ code: "invalid_reset_link" });
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("rejects a missing session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect((await store()).checkPasswordResetSession())
      .rejects.toMatchObject({ code: "invalid_reset_link" });
  });

  it("distinguishes connection problems from expired links", async () => {
    auth.initialize.mockResolvedValue({ error: { message: "Failed to fetch" } });
    await expect((await store()).checkPasswordResetSession())
      .rejects.toMatchObject({ code: "network" });
  });
});

describe("saving the new password", () => {
  it("rejects passwords shorter than signup allows without making a request", async () => {
    await expect((await store()).updatePassword("short"))
      .rejects.toMatchObject({ code: "weak_password" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("passes the exact password to Supabase without trimming it", async () => {
    await (await store()).updatePassword(" new password ");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: " new password " });
  });

  it.each([
    { name: "AuthSessionMissingError", message: "Auth session missing!" },
    { code: "session_not_found", message: "Session has been revoked" },
    { code: "session_expired", message: "Session has expired" },
    { code: "bad_jwt", message: "JWT has expired" },
    { code: "refresh_token_not_found", message: "Invalid refresh token" },
  ])("offers a new link when the session expires: $message", async (error) => {
    auth.updateUser.mockResolvedValue({ error });
    await expect((await store()).updatePassword("new-password"))
      .rejects.toMatchObject({ code: "invalid_reset_link" });
  });

  it("explains when the new password matches the old password", async () => {
    auth.updateUser.mockResolvedValue({ error: { code: "same_password", message: "Same password" } });
    await expect((await store()).updatePassword("new-password"))
      .rejects.toThrow("Choose a different password from your current one.");
  });

  it("keeps a failed save from looking successful", async () => {
    auth.updateUser.mockResolvedValue({ error: { code: "unexpected", message: "Internal error" } });
    await expect((await store()).updatePassword("new-password"))
      .rejects.toThrow("Couldn't update your password. Try again.");
  });
});
