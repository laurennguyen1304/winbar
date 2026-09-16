import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notch } from "./Notch";
import { PILL_SIZES } from "./notch-sizes";

const { requestNotchLayout } = vi.hoisted(() => ({ requestNotchLayout: vi.fn(() => Promise.resolve()) }));
vi.mock("./native", () => ({ requestNotchLayout }));

describe("Notch", () => {
  beforeEach(() => requestNotchLayout.mockClear());

  it("renders the pill with fully rounded ends", () => {
    render(<Notch />);
    const notch = screen.getByTestId("notch");
    expect(notch).toHaveAttribute("data-state", "pill");
    expect(notch).toHaveStyle({ borderRadius: "20px" });
  });

  it("asks the native side for the default 340x40 pill, 8px from the top", () => {
    render(<Notch />);
    expect(requestNotchLayout).toHaveBeenCalledWith({ width: 340, height: 40 }, 8);
  });

  it("uses the requested size and gap", () => {
    render(<Notch size={PILL_SIZES.l} topGap={40} />);
    expect(requestNotchLayout).toHaveBeenCalledWith({ width: 400, height: 46 }, 40);
    expect(screen.getByTestId("notch")).toHaveStyle({ borderRadius: "23px" });
  });
});
