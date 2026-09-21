// Claude rows in the command bar (SPEC-claude §5.7). Runs in the command bar window, so it reads through Rust.
//
// Sessions are not remembered in "Gần đây": a session is a passing thing, and a remembered row would offer to open
// a project for a session that ended hours ago.
import { openNotch, openTerminal } from "../../command-bar/native";
import { fold } from "../../command-bar/rank";
import type { SearchProvider, SearchResult } from "../../shell/widget-contract";
import { getUsage, listSessions, openDesktop, type ClaudeSession } from "./native";
import { phaseLook } from "./phase";

/** Shortest query that gets Claude rows without the prefix. */
const MIN_QUERY = 2;

/** Everything a row answers to: the project, the worktree, and the tool it is running. */
function haystack(session: ClaudeSession): string {
  return fold([session.project, session.title, session.tool].filter(Boolean).join(" "));
}

function sessionRow(session: ClaudeSession, rank: number): SearchResult {
  const look = phaseLook(session);
  const desktop = session.source !== "cli";
  const name = session.project ? `${session.project} · ${session.title}` : session.title;
  return {
    id: `claude-${session.id}`,
    title: name,
    subtitle: `${look.label} · Claude`,
    icon: "sparks",
    verb: desktop ? "Claude" : "Terminal",
    score: 1000 - rank * 10,
    remember: false,
    // Where the session actually lives: a Desktop session opens the Desktop app, a CLI one opens a terminal in
    // its worktree (the owner, 20/09 — this machine does its work at a prompt, so Explorer helped nobody).
    run: () => {
      if (desktop) return openDesktop();
      return session.cwd ? openTerminal(session.cwd) : openNotch("claude");
    },
  };
}

export function createClaudeProvider(
  readSessions: () => Promise<ClaudeSession[]> = listSessions,
  readUsage: () => Promise<Awaited<ReturnType<typeof getUsage>>> = () => getUsage(),
): SearchProvider {
  return {
    id: "claude",
    title: "Claude",
    prefix: "cl",
    async search(query, signal) {
      const trimmed = query.trim();
      const browsing = trimmed.length === 0;
      if (!browsing && trimmed.length < MIN_QUERY) return [];

      const [sessions, usage] = await Promise.all([readSessions(), readUsage()]);
      if (signal.aborted) return [];

      const needle = fold(trimmed);
      const rows = sessions
        .filter((s) => s.source !== "history" && (browsing || haystack(s).includes(needle)))
        .map(sessionRow);

      // One row for the limits, whenever there is a number and the query is not clearly about a session.
      const limit = usage.fiveHour;
      const wantsUsage = browsing || "han muc claude usage limit".includes(needle);
      if (limit && wantsUsage) {
        rows.push({
          id: "claude-usage",
          title: `Hạn mức Claude · 5h ${limit.percent}%${usage.sevenDay ? ` · 7d ${usage.sevenDay.percent}%` : ""}`,
          subtitle: "Claude",
          icon: "activity",
          verb: "Mở",
          score: 1,
          remember: false,
          run: () => openNotch("claude"),
        });
      }
      return rows;
    },
  };
}
