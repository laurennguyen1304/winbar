// Instant answers shown as one large block above the groups (SPEC-command-bar §5.4): calculator and unit conversion.
import { calculate, formatNumber } from "./calculator";
import { convert } from "./units";

export interface Instant {
  /** What was recognised, shown under the answer. */
  expression: string;
  /** Large text: "= 87", "3.10686 mi". */
  display: string;
  /** Copied on Enter, without thousands separators. */
  copy: string;
}

export function instantAnswer(query: string): Instant | null {
  const conversion = convert(query);
  if (conversion) {
    return {
      expression: conversion.expression,
      display: `${formatNumber(conversion.value)} ${conversion.unit}`,
      copy: String(conversion.value),
    };
  }
  const calculation = calculate(query);
  if (calculation) {
    return { expression: calculation.expression, display: `= ${formatNumber(calculation.value)}`, copy: String(calculation.value) };
  }
  return null;
}

/** "=" means "calculator only": other providers are not asked. */
export const calculatorOnly = (query: string) => query.trimStart().startsWith("=");
