import { expect, it } from "vitest";
import {
  authLoginResponse,
  passwordChangeResponse,
  accountProvisionResponse,
  importConfirmationResponse,
  accountInput,
} from "../packages/contracts/src/auth";
const id = "a0000000-0000-4000-8000-000000000001";
it("rejects provider tokens and internal cookies in successful Auth DTOs", () => {
  expect(
    authLoginResponse.safeParse({
      user: { id, role: "student" },
      csrfToken: "synthetic",
      access_token: "not-an-actual-token",
    }).success,
  ).toBe(false);
  expect(
    passwordChangeResponse.safeParse({
      data: {
        id,
        sessionsRevoked: true,
        csrfToken: "synthetic",
        _cookie: "not-an-actual-cookie",
      },
    }).success,
  ).toBe(false);
  expect(
    passwordChangeResponse.safeParse({
      data: { id, sessionsRevoked: true, csrfToken: "synthetic" },
    }).success,
  ).toBe(true);
});
it("does not permit public owner provisioning or existing-password redisplay", () => {
  expect(
    accountInput.safeParse({
      role: "owner",
      identityKey: "synthetic",
      name: "Synthetic",
    }).success,
  ).toBe(false);
  expect(
    accountProvisionResponse.safeParse({
      data: { id, state: "existing", issuedPassword: crypto.randomUUID() },
    }).success,
  ).toBe(false);
});
it("checks import continuation and counts without redisplaying reused credentials", () => {
  const data = {
    outcomes: [{ row: 2, id, state: "existing" }],
    created: 0,
    reused: 1,
    failed: 0,
    remainingRows: [],
    complete: true,
  };
  expect(importConfirmationResponse.safeParse({ data }).success).toBe(true);
  expect(
    importConfirmationResponse.safeParse({ data: { ...data, complete: false } })
      .success,
  ).toBe(false);
  expect(
    importConfirmationResponse.safeParse({ data: { ...data, created: 1 } })
      .success,
  ).toBe(false);
  expect(
    importConfirmationResponse.safeParse({
      data: {
        ...data,
        outcomes: [
          { ...data.outcomes[0], issuedPassword: crypto.randomUUID() },
        ],
      },
    }).success,
  ).toBe(false);
});
