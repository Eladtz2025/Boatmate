import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attendanceWindow, segmentsLabel, type Segment } from "./attendance";
import {
  deleteGoogleEvent,
  googleEventId,
  isGoogleCalendarConfigured,
  upsertGoogleEvent,
} from "./google-calendar";
import { zonedDateKey, zonedHour } from "./tz";

/**
 * The Google leg, exercised against a stubbed transport.
 *
 * There is no shared calendar to test against from here, so what these cover
 * is the half that is ours: that an edit updates the *same* event rather than
 * creating a second one, that a cancellation deletes it, that an event Google
 * has never seen gets created with the id we chose, and that every failure
 * comes back as a value instead of a throw — because the caller writes the
 * attendance row first and must not be able to lose it to a calendar outage.
 */

/**
 * A real key pair, so the JWT is genuinely signed and the signing path is the
 * one under test — only the transport is stubbed. Nothing here ever reaches
 * Google, and the key exists for the length of the run.
 */
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const CREDS = {
  GOOGLE_CALENDAR_ID: "boat@group.calendar.google.com",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "boatmate@example.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: privateKey,
};

type Call = { url: string; method: string; body: unknown };

let calls: Call[];
/** Status to answer each non-token request with, in order. */
let responses: number[];

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function stubFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);

    if (url === TOKEN_URL) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200 },
      );
    }

    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });

    const status = responses.shift() ?? 200;
    return new Response(status === 204 ? null : "{}", { status });
  });
}

beforeEach(() => {
  calls = [];
  responses = [];
  for (const [key, value] of Object.entries(CREDS)) vi.stubEnv(key, value);
  vi.stubGlobal("fetch", stubFetch());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("googleEventId", () => {
  it("stays inside the character set Google accepts", () => {
    const id = googleEventId("a8c29212-281a-49ff-b2e1-46ee976f5e8d");
    // base32hex: lowercase a-v and 0-9 only, at least 5 characters.
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(id).toBe("bma8c29212281a49ffb2e146ee976f5e8d");
  });

  it("is stable, so an edit addresses the event it already created", () => {
    const uuid = "67570791-459f-4ed0-a61f-dd9aed152a50";
    expect(googleEventId(uuid)).toBe(googleEventId(uuid));
  });

  it("gives different Boatmate events different Google events", () => {
    expect(googleEventId("a8c29212-281a-49ff-b2e1-46ee976f5e8d")).not.toBe(
      googleEventId("67570791-459f-4ed0-a61f-dd9aed152a50"),
    );
  });
});

const event = {
  eventId: "a8c29212-281a-49ff-b2e1-46ee976f5e8d",
  summary: "אלעד — לינה",
  startsAt: "2026-09-05T05:00:00.000Z",
  endsAt: "2026-09-06T07:00:00.000Z",
};

describe("upsertGoogleEvent", () => {
  it("updates in place, so an edit cannot leave two entries behind", async () => {
    responses = [200];
    const result = await upsertGoogleEvent(event);

    expect(result.status).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain(`/events/${googleEventId(event.eventId)}`);
  });

  it("creates it with our own id when Google has never seen it", async () => {
    responses = [404, 200];
    const result = await upsertGoogleEvent(event);

    expect(result.status).toBe("ok");
    expect(calls.map((call) => call.method)).toEqual(["PUT", "POST"]);
    expect((calls[1].body as { id: string }).id).toBe(googleEventId(event.eventId));
  });

  it("revives an event Google is holding as cancelled", async () => {
    responses = [410, 200];
    const result = await upsertGoogleEvent(event);

    expect(result.status).toBe("ok");
    expect(calls.map((call) => call.method)).toEqual(["PUT", "POST"]);
  });

  it("always states the event is confirmed", async () => {
    // Without this an update to a previously cancelled id succeeds and leaves
    // the event invisible — a green tick over nothing.
    responses = [200];
    await upsertGoogleEvent(event);
    expect((calls[0].body as { status: string }).status).toBe("confirmed");
  });

  it("sends the times as instants with the zone named", async () => {
    responses = [200];
    await upsertGoogleEvent(event);

    const body = calls[0].body as {
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
    };
    expect(body.start.dateTime).toBe(event.startsAt);
    expect(body.end.dateTime).toBe(event.endsAt);
    expect(body.start.timeZone).toBe("Asia/Jerusalem");
  });

  it("reports a permission problem instead of throwing", async () => {
    responses = [403];
    const result = await upsertGoogleEvent(event);

    expect(result.status).toBe("failed");
    expect(result.message).toContain("הרשאה");
  });

  it("reports a transport failure instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const result = await upsertGoogleEvent(event);
    expect(result.status).toBe("failed");
  });
});

describe("deleteGoogleEvent", () => {
  it("deletes the event the same id addresses", async () => {
    responses = [204];
    const result = await deleteGoogleEvent(event.eventId);

    expect(result.status).toBe("ok");
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain(`/events/${googleEventId(event.eventId)}`);
  });

  it("treats an event that is already gone as done", async () => {
    for (const status of [404, 410]) {
      calls = [];
      responses = [status];
      expect((await deleteGoogleEvent(event.eventId)).status).toBe("ok");
    }
  });

  it("reports a real failure rather than swallowing it", async () => {
    responses = [500];
    expect((await deleteGoogleEvent(event.eventId)).status).toBe("failed");
  });
});

describe("without credentials", () => {
  it("is off, and says so rather than claiming success", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("GOOGLE_CALENDAR_ID", "");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "");
    vi.stubEnv("GOOGLE_PRIVATE_KEY", "");

    expect(isGoogleCalendarConfigured()).toBe(false);
    expect((await upsertGoogleEvent(event)).status).toBe("off");
    expect((await deleteGoogleEvent(event.eventId)).status).toBe("off");
    expect(calls).toHaveLength(0);
  });
});

/**
 * What the crew's shared calendar ends up showing.
 *
 * The two instants handed to Google are the same two written to the events
 * row — `setAttendance` computes them once — so pinning them here pins what
 * lands in the calendar. Each selection must arrive as **one** interval with
 * the right ends; a run that leaked out as two events, or with the night
 * stopping at midnight, would be wrong in the calendar even though Boatmate
 * looked right.
 */
describe("attendance windows as Google sees them", () => {
  const DAY = "2026-09-05";
  const NEXT = "2026-09-06";

  async function sent(segments: Segment[]) {
    calls = [];
    responses = [200];
    const { startsAt, endsAt } = attendanceWindow(DAY, segments);

    const result = await upsertGoogleEvent({
      eventId: "a8c29212-281a-49ff-b2e1-46ee976f5e8d",
      summary: `אלעד — ${segmentsLabel(segments)}`,
      startsAt,
      endsAt,
    });
    expect(result.status).toBe("ok");

    const body = calls[0].body as {
      summary: string;
      start: { dateTime: string };
      end: { dateTime: string };
    };
    return {
      calls: calls.length,
      summary: body.summary,
      from: `${zonedDateKey(body.start.dateTime)} ${zonedHour(body.start.dateTime)}`,
      to: `${zonedDateKey(body.end.dateTime)} ${zonedHour(body.end.dateTime)}`,
    };
  }

  it("sends בוקר as 08:00-12:00 on the day", async () => {
    const event = await sent(["morning"]);
    expect(event).toMatchObject({ calls: 1, from: `${DAY} 8`, to: `${DAY} 12` });
    expect(event.summary).toContain("בוקר");
  });

  it("sends צהריים as 12:00-20:00 on the day", async () => {
    expect(await sent(["noon"])).toMatchObject({
      calls: 1,
      from: `${DAY} 12`,
      to: `${DAY} 20`,
    });
  });

  it("sends לינה as 20:00 through to 08:00 the next morning", async () => {
    // Not "to midnight" — a night on the boat ends when you get off it.
    expect(await sent(["night"])).toMatchObject({
      calls: 1,
      from: `${DAY} 20`,
      to: `${NEXT} 8`,
    });
  });

  it("sends בוקר + צהריים as one 08:00-20:00 event", async () => {
    expect(await sent(["morning", "noon"])).toMatchObject({
      calls: 1,
      from: `${DAY} 8`,
      to: `${DAY} 20`,
    });
  });

  it("sends צהריים + לינה as one event running past midnight", async () => {
    expect(await sent(["noon", "night"])).toMatchObject({
      calls: 1,
      from: `${DAY} 12`,
      to: `${NEXT} 8`,
    });
  });

  it("sends all three as one full 24 hours", async () => {
    const event = await sent(["morning", "noon", "night"]);
    expect(event).toMatchObject({ calls: 1, from: `${DAY} 8`, to: `${NEXT} 8` });
    expect(event.summary).toBe("אלעד — בוקר · צהריים · לינה");
  });

  it("changing the selection updates that same event, never adds one", async () => {
    calls = [];
    responses = [200, 200];

    for (const segments of [["morning"], ["noon", "night"]] as Segment[][]) {
      const { startsAt, endsAt } = attendanceWindow(DAY, segments);
      await upsertGoogleEvent({
        eventId: "a8c29212-281a-49ff-b2e1-46ee976f5e8d",
        summary: `אלעד — ${segmentsLabel(segments)}`,
        startsAt,
        endsAt,
      });
    }

    expect(calls.map((call) => call.method)).toEqual(["PUT", "PUT"]);
    expect(new Set(calls.map((call) => call.url)).size).toBe(1);

    const latest = calls[1].body as { end: { dateTime: string } };
    expect(zonedDateKey(latest.end.dateTime)).toBe(NEXT);
  });
});
