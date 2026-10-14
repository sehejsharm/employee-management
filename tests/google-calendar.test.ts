import { describe, expect, it } from "vitest";
import { clashes, eventBody, eventTimes, meetLinkOf, subscribeUrl, eventPatch, mergeAttendees } from "@/lib/google/events";
import { openToken, sealToken } from "@/lib/google/crypto";

describe("Google Calendar payloads", () => {
  it("builds an event with a Meet request and de-duplicated invitees", () => {
    const body = eventBody({
      title: "Campaign review",
      description: "Agenda",
      startAt: new Date("2026-10-13T09:00:00Z"),
      endAt: new Date("2026-10-13T09:30:00Z"),
      timeZone: "Asia/Kolkata",
      // Shared mailboxes and case differences collapse to one invite each.
      attendeeEmails: ["Interns@focusrealm.com", "interns@focusrealm.com", "sharmasehej2104@gmail.com", " "],
      meet: true,
      requestId: "m1",
    });
    expect(body.attendees).toEqual([{ email: "interns@focusrealm.com" }, { email: "sharmasehej2104@gmail.com" }]);
    expect(body.start).toEqual({ dateTime: "2026-10-13T09:00:00.000Z", timeZone: "Asia/Kolkata" });
    expect(body.conferenceData?.createRequest).toEqual({ requestId: "m1", conferenceSolutionKey: { type: "hangoutsMeet" } });
    expect(eventBody({ ...{ title: "x", startAt: new Date(), endAt: new Date(), timeZone: "UTC", attendeeEmails: [], requestId: "r" }, meet: false })).not.toHaveProperty("conferenceData");
  });

  it("finds the Meet link and the times wherever Google puts them", () => {
    expect(meetLinkOf({ id: "1", hangoutLink: "https://meet.google.com/abc-defg-hij" })).toBe("https://meet.google.com/abc-defg-hij");
    expect(meetLinkOf({ id: "2", conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:1" }, { entryPointType: "video", uri: "https://meet.google.com/x" }] } })).toBe("https://meet.google.com/x");
    expect(meetLinkOf({ id: "3" })).toBeNull();
    expect(eventTimes({ id: "4", start: { date: "2026-10-14" }, end: { date: "2026-10-15" } }).allDay).toBe(true);
  });

  it("spots clashes with busy blocks", () => {
    const busy = [{ start: "2026-10-13T10:00:00Z", end: "2026-10-13T11:00:00Z" }];
    expect(clashes(busy, new Date("2026-10-13T10:30:00Z"), new Date("2026-10-13T11:30:00Z"))).toHaveLength(1);
    expect(clashes(busy, new Date("2026-10-13T11:00:00Z"), new Date("2026-10-13T11:30:00Z"))).toHaveLength(0);
    expect(subscribeUrl("abc@group.calendar.google.com")).toContain("cid=abc%40group.calendar.google.com");
  });

  it("encrypts tokens at rest and rejects tampering", () => {
    process.env.GOOGLE_TOKEN_KEY = "test-key-for-unit-tests";
    const sealed = sealToken("1//refresh-token");
    expect(sealed).not.toContain("refresh-token");
    expect(openToken(sealed)).toBe("1//refresh-token");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => openToken(parts.join("."))).toThrow();
  });
});

describe("founder free slots", () => {
  it("offers working-hour slots that avoid busy blocks and the past", async () => {
    const { freeSlots } = await import("@/lib/google/events");
    const day = new Date("2026-10-14T00:00:00Z");
    const busy = [{ start: "2026-10-14T10:00:00Z", end: "2026-10-14T11:00:00Z" }];
    const slots = freeSlots(busy, day, 60, new Date("2026-10-14T08:45:00Z"), [9, 13]);
    expect(slots.map((s) => s.slice(11, 16))).toEqual(["09:00", "11:00", "11:30", "12:00"]);
  });
});

describe("editing an event", () => {
  it("keeps guests' replies and drops people taken off", () => {
    const merged = mergeAttendees(
      [
        { email: "aarav@focusrealm.com", responseStatus: "accepted" },
        { email: "Rohan@FocusRealm.com", responseStatus: "declined" },
      ],
      ["aarav@focusrealm.com", "tara@focusrealm.com", "AARAV@focusrealm.com"],
    );
    expect(merged).toEqual([{ email: "aarav@focusrealm.com", responseStatus: "accepted" }, { email: "tara@focusrealm.com" }]);
  });

  it("only sends what changes", () => {
    const start = new Date("2026-10-20T10:00:00Z");
    const patch = eventPatch({ startAt: start, endAt: new Date("2026-10-20T10:30:00Z"), timeZone: "Asia/Kolkata" });
    expect(patch).toEqual({
      start: { dateTime: "2026-10-20T10:00:00.000Z", timeZone: "Asia/Kolkata" },
      end: { dateTime: "2026-10-20T10:30:00.000Z", timeZone: "Asia/Kolkata" },
    });
    // Leaving these out keeps the Meet link, privacy and guest list as they are.
    expect(patch).not.toHaveProperty("conferenceData");
    expect(patch).not.toHaveProperty("visibility");
    expect(patch).not.toHaveProperty("attendees");
  });

  it("can add a Meet link and clear the agenda", () => {
    const patch = eventPatch({ timeZone: "UTC", description: "", addMeet: { requestId: "m1-meet" } });
    expect(patch.description).toBe("");
    expect(patch.conferenceData?.createRequest.requestId).toBe("m1-meet");
  });
});
