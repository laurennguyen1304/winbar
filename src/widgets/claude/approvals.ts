// Permission requests waiting on the notch, and the steps each session has taken (SPEC-claude-approvals §6).
// Rust owns both lists; this file asks for them when Rust says they changed, and carries the answers back.
import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ClaudeApproval {
  /** winbar's own id for the request; what an answer must name. */
  id: string;
  sessionId: string;
  /** Worktree or folder name, as on the sessions card. */
  title: string;
  project?: string;
  tool: string;
  /** One line: the tool and what it wants to touch. Already made safe to draw. */
  summary: string;
  /**
   * `summary` is the entire request: one field, one line, nothing else in the input that changes what happens.
   * Only then may the pill offer "Cho phép" — and only if the line also fits on it.
   */
  complete: boolean;
  /** Everything the tool was given. Already made safe to draw. */
  detail: string;
  /** Something was cut on the way here: the card must not claim to show everything. */
  truncated: boolean;
  /** Epoch ms. */
  receivedAt: number;
}

/** `release` gives no answer: the terminal keeps the question. */
export type Decision = "allow" | "deny" | "release";

async function listApprovals(): Promise<ClaudeApproval[]> {
  if (!isTauri()) return [];
  return invoke<ClaudeApproval[]>("claude_approvals");
}

async function listSteps(): Promise<Record<string, string[]>> {
  if (!isTauri()) return {};
  return invoke<Record<string, string[]>>("claude_steps");
}

/** Tells Rust the request is on screen. Without this it is handed back to the terminal after two seconds. */
export async function approvalShown(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("claude_approval_shown", { id });
}

async function sendDecision(id: string, decision: Decision): Promise<void> {
  if (!isTauri()) return;
  await invoke("claude_approval_decide", { id, decision });
}

function on(event: string, handler: () => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | undefined;
  let disposed = false;
  listen(event, () => handler())
    .then((fn) => (disposed ? fn() : (unlisten = fn)))
    .catch((err: unknown) => console.error(`listen ${event} failed`, err));
  return () => {
    disposed = true;
    unlisten?.();
  };
}

const NO_APPROVALS: ClaudeApproval[] = [];
const NO_STEPS: Record<string, string[]> = {};

let approvals: ClaudeApproval[] = NO_APPROVALS;
let steps: Record<string, string[]> = NO_STEPS;
const listeners = new Set<() => void>();
let started = false;

const emit = () => listeners.forEach((l) => l());

function refreshApprovals(): void {
  listApprovals()
    .then((next) => {
      approvals = next;
      emit();
    })
    .catch((err: unknown) => console.error("claude_approvals failed", err));
}

function refreshSteps(): void {
  listSteps()
    .then((next) => {
      steps = next;
      emit();
    })
    .catch((err: unknown) => console.error("claude_steps failed", err));
}

function start() {
  if (started) return;
  started = true;
  on("claude-approvals-changed", refreshApprovals);
  on("claude-steps-changed", refreshSteps);
  refreshApprovals();
  refreshSteps();
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The requests waiting for an answer, oldest first. */
export function useApprovals(): ClaudeApproval[] {
  return useSyncExternalStore(subscribe, () => approvals);
}

/** The last few steps of each session, by session id, oldest first. */
export function useSteps(): Record<string, string[]> {
  return useSyncExternalStore(subscribe, () => steps);
}

/**
 * Answers a request. It leaves the list at once rather than when Rust confirms: a second click on a button that
 * is still on screen for a moment must not be able to answer anything.
 */
export function decide(id: string, decision: Decision): void {
  if (!approvals.some((a) => a.id === id)) return;
  approvals = approvals.filter((a) => a.id !== id);
  emit();
  sendDecision(id, decision).catch((err: unknown) => console.error("claude_approval_decide failed", err));
}

/** Tests only: puts the store in a known state without Rust. */
export function setForTests(next: { approvals?: ClaudeApproval[]; steps?: Record<string, string[]> }): void {
  approvals = next.approvals ?? NO_APPROVALS;
  steps = next.steps ?? NO_STEPS;
  started = true;
  emit();
}

/** Tests only: forgets everything so each case starts clean. */
export function resetForTests(): void {
  approvals = NO_APPROVALS;
  steps = NO_STEPS;
  started = false;
  listeners.clear();
}
