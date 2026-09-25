import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShell, type Shell } from "../shell/shell";
import { ShellProvider } from "../shell/shell-context";
import type { UpdateStatus } from "./native";
import { ALERT_ID, UpdateNotice } from "./UpdateNotice";

const { native } = vi.hoisted(() => ({
  native: {
    status: null as UpdateStatus | null,
    handler: undefined as ((version: string) => void) | undefined,
    dismissed: [] as string[],
    opened: 0,
  },
}));

vi.mock("./native", () => ({
  updateStatus: () => Promise.resolve(native.status),
  dismissUpdate: (version: string) => {
    native.dismissed.push(version);
    return Promise.resolve();
  },
  openChangelog: () => {
    native.opened += 1;
    return Promise.resolve();
  },
  onUpdateAvailable: (handler: (version: string) => void) => {
    native.handler = handler;
    return () => (native.handler = undefined);
  },
}));

/** Renders the notice and the alert the pill would show, so the buttons can be pressed. */
function setup(shell: Shell) {
  function Pill() {
    const alert = shell.getSnapshot().alert;
    return alert ? <alert.Content /> : null;
  }
  const view = render(
    <ShellProvider shell={shell}>
      <UpdateNotice />
    </ShellProvider>,
  );
  const pill = () =>
    view.rerender(
      <ShellProvider shell={shell}>
        <UpdateNotice />
        <Pill />
      </ShellProvider>,
    );
  return { pill };
}

describe("UpdateNotice", () => {
  beforeEach(() => {
    native.status = null;
    native.handler = undefined;
    native.dismissed = [];
    native.opened = 0;
  });

  it("brings back a version nobody answered yet", async () => {
    native.status = { current: "0.2.0", latest: "0.3.0", pending: "0.3.0", checkedAt: 1 };
    const shell = createShell();
    setup(shell);
    await waitFor(() => expect(shell.getSnapshot().alert?.id).toBe(ALERT_ID));
    expect(shell.getSnapshot().alert?.priority).toBeLessThan(3);
  });

  it("stays quiet when there is nothing pending", async () => {
    native.status = { current: "0.2.0", latest: "0.3.0", checkedAt: 1 };
    const shell = createShell();
    setup(shell);
    await waitFor(() => expect(native.handler).toBeDefined());
    expect(shell.getSnapshot().alert).toBeUndefined();
  });

  it("Xem opens the changelog and the version is not announced again", async () => {
    const shell = createShell();
    const { pill } = setup(shell);
    await waitFor(() => expect(native.handler).toBeDefined());
    act(() => native.handler?.("0.3.0"));
    pill();
    expect(screen.getByText("Có bản winbar 0.3.0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xem" }));
    expect(native.opened).toBe(1);
    expect(native.dismissed).toEqual(["0.3.0"]);
    expect(shell.getSnapshot().alert).toBeUndefined();
  });

  it("Để sau closes it without opening anything", async () => {
    const shell = createShell();
    const { pill } = setup(shell);
    await waitFor(() => expect(native.handler).toBeDefined());
    act(() => native.handler?.("0.3.0"));
    pill();
    fireEvent.click(screen.getByRole("button", { name: "Để sau" }));
    expect(native.opened).toBe(0);
    expect(native.dismissed).toEqual(["0.3.0"]);
    expect(shell.getSnapshot().alert).toBeUndefined();
  });
});
