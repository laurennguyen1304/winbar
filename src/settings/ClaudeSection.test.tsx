import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClaudeSection } from "./ClaudeSection";
import { DEFAULT_SETTINGS } from "../shell/settings";

const value = DEFAULT_SETTINGS.claude;

describe("ClaudeSection", () => {
  it("turns the whole layout off", () => {
    const onChange = vi.fn();
    render(<ClaudeSection value={value} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Bật layout Claude"));
    expect(onChange).toHaveBeenCalledWith({ ...value, enabled: false });
  });

  it("changes how often the status image changes, including turning it off", () => {
    const onChange = vi.fn();
    render(<ClaudeSection value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "10s" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, iconRotateSeconds: 10 });

    onChange.mockClear();
    fireEvent.click(screen.getAllByRole("radio", { name: "Tắt" })[0]);
    expect(onChange).toHaveBeenCalledWith({ ...value, iconRotateSeconds: 0 });
  });

  it("changes the warning threshold", () => {
    const onChange = vi.fn();
    render(<ClaudeSection value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "80%" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, usageWarnPercent: 80 });
  });

  it("says plainly what turning the layout off means", () => {
    render(<ClaudeSection value={value} onChange={vi.fn()} />);
    expect(
      screen.getByText("Tắt thì winbar không đọc gì về Claude: không theo dõi phiên, không gọi mạng"),
    ).toBeInTheDocument();
  });
});
