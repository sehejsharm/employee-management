import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A leaked HR secret must never yield a founder account: the webhook may not
 * create, link to, rename or re-key one. The database is faked — these tests
 * only check which writes the handler attempts.
 */
const founder = { id: "u_founder", role: "FOUNDER", email: "aarav@focusrealm.com", employeeCode: "FR-0001", externalId: null as string | null };

const fake = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  integrationEvent: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: fake }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const { handleHrEvent } = await import("@/lib/hr/provision");

function event(type: string, data: Record<string, unknown>) {
  return { id: `evt_${type}_${Math.random().toString(36).slice(2, 10)}`, type, data };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.HR_ALLOW_FOUNDER_PROVISIONING;
  fake.integrationEvent.findUnique.mockResolvedValue(null);
  fake.integrationEvent.create.mockResolvedValue({ id: "rec_1" });
  fake.integrationEvent.update.mockResolvedValue({});
});

describe("HR webhook founder guard", () => {
  it("refuses to link an unknown HR record to an existing founder by employee ID", async () => {
    fake.user.findUnique.mockImplementation(({ where }: { where: { externalId?: string; employeeCode?: string } }) =>
      Promise.resolve(where.employeeCode === founder.employeeCode ? { ...founder } : null),
    );
    const res = await handleHrEvent(
      event("employee.updated", { externalId: "hr_attacker", employeeCode: "fr-0001", email: "x@evil.test", fullName: "Aarav Mehta", credentials: { password: "attacker-pass-123" } }),
    );
    expect(res.status).toBe(403);
    expect(fake.user.update).not.toHaveBeenCalled();
  });

  it("never links by email: a founder's shared email gets a separate account and the founder is untouched", async () => {
    fake.user.findUnique.mockResolvedValue(null);
    fake.user.findMany.mockResolvedValue([]);
    fake.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "u_new", employeeCode: data.employeeCode, email: data.email, firstName: data.firstName, lastName: data.lastName }),
    );
    const res = await handleHrEvent(
      event("employee.created", { externalId: "hr_assistant", email: founder.email, fullName: "Shared Inbox", credentials: { password: "assistant-pass-123" } }),
    );
    expect(res.status).toBe(201);
    expect(fake.user.create).toHaveBeenCalledTimes(1);
    expect(fake.user.create.mock.calls[0][0].data).toMatchObject({ email: founder.email, role: "INTERN", externalId: "hr_assistant" });
    expect(fake.user.update).not.toHaveBeenCalled();
  });

  it("refuses to change a founder already linked to an HR record, even without a role", async () => {
    fake.user.findUnique.mockImplementation(({ where }: { where: { externalId?: string } }) =>
      Promise.resolve(where.externalId === "hr_aarav" ? { ...founder, externalId: "hr_aarav" } : null),
    );
    const res = await handleHrEvent(
      event("employee.updated", { externalId: "hr_aarav", email: "someone-else@evil.test", credentials: { password: "attacker-pass-123" } }),
    );
    expect(res.status).toBe(403);
    expect(fake.user.update).not.toHaveBeenCalled();
  });

  it("refuses to create a founder", async () => {
    fake.user.findUnique.mockResolvedValue(null);
    const res = await handleHrEvent(event("employee.created", { externalId: "hr_new", email: "new@focusrealm.com", fullName: "New Founder", role: "FOUNDER" }));
    expect(res.status).toBe(403);
    expect(fake.user.create).not.toHaveBeenCalled();
  });
});
