import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./app";

describe("App", () => {
  it("renders the placeholder homepage with every task status", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Real-time tasks, without the refresh button.",
    );

    for (const label of ["Backlog", "To do", "In progress", "Done", "Canceled"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
