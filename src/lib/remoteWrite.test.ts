import { describe, expect, it } from "vitest";

import { tryRemoteWrite } from "./remoteWrite";

describe("tryRemoteWrite", () => {
  it("reports Firebase write failures without rejecting the local save flow", async () => {
    const messages: string[] = [];

    const synced = await tryRemoteWrite(
      async () => {
        throw new Error("Missing or insufficient permissions.");
      },
      (message) => messages.push(message),
    );

    expect(synced).toBe(false);
    expect(messages).toEqual(["Missing or insufficient permissions."]);
  });

  it("returns true when the remote write succeeds", async () => {
    const messages: string[] = [];

    const synced = await tryRemoteWrite(async () => undefined, (message) =>
      messages.push(message),
    );

    expect(synced).toBe(true);
    expect(messages).toEqual([]);
  });
});
