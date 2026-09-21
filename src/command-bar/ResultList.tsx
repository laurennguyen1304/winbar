import { useEffect, useRef } from "react";
import { Icon, isIconName } from "../shell/Icon";
import { SHELL_ICON, useShellIcon } from "./icons";
import type { SearchResult } from "../shell/widget-contract";
import type { Instant } from "./instant";
import type { Group } from "./search";
import styles from "./CommandBar.module.css";

export interface Row {
  key: string;
  result: SearchResult;
}

/** Key of the calculator / conversion block, which sits above the groups. */
export const INSTANT_KEY = "instant";

/** Group ids are kebab-case, so "::" cannot appear inside one. */
const rowKey = (groupId: string, resultId: string) => `${groupId}::${resultId}`;

/** Rows in display order; keys stay stable across searches so the selection can follow a row. */
export const flattenRows = (groups: readonly Group[]): Row[] =>
  groups.flatMap((g) => g.results.map((result) => ({ key: rowKey(g.id, result.id), result })));

const IMAGE_ICON = /^(data:|https?:|asset:|\/)/;

/** Real icon from Windows; the first letter (apps) or a generic file/folder icon until it arrives or if there is none. */
function ShellTile({ spec, title }: { spec: string; title: string }) {
  const url = useShellIcon(spec);
  if (url) return <img className={styles.tile} src={url} alt="" />;
  const generic = spec.startsWith("shell:folder:") ? "folder" : spec.startsWith("shell:file:") ? "file" : undefined;
  return (
    <span className={styles.tile} aria-hidden>
      {generic ? <Icon name={generic} size={16} /> : title.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Tile({ result }: { result: SearchResult }) {
  const { icon } = result;
  if (icon?.startsWith(SHELL_ICON)) return <ShellTile spec={icon} title={result.title} />;
  if (icon && IMAGE_ICON.test(icon)) return <img className={styles.tile} src={icon} alt="" />;
  return (
    <span className={styles.tile} aria-hidden>
      {icon && isIconName(icon) ? <Icon name={icon} size={16} /> : result.title.trim().charAt(0).toUpperCase()}
    </span>
  );
}

interface Props {
  groups: readonly Group[];
  selectedKey: string | undefined;
  onSelect(key: string): void;
  /** `alt`: Ctrl was held (runs `runAlt`). */
  onRun(result: SearchResult, alt: boolean): void;
}

/** Large answer block (mockup `.calc`); Enter copies the value. */
export function InstantBlock({
  instant,
  selected,
  onSelect,
  onCopy,
}: {
  instant: Instant;
  selected: boolean;
  onSelect(): void;
  onCopy(): void;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      aria-label={`${instant.display}, ${instant.expression}`}
      className={styles.instant}
      data-selected={selected}
      onMouseMove={() => !selected && onSelect()}
      onClick={onCopy}
    >
      <span className={`${styles.tile} ${styles.tileLarge}`} aria-hidden>
        <Icon name="calculator" size={20} />
      </span>
      <div className={styles.text}>
        <span className={styles.instantValue}>{instant.display}</span>
        <span className={styles.instantExpression}>{instant.expression}</span>
      </div>
      <span className={styles.verb}>
        Copy <kbd className={styles.kbd}>↵</kbd>
      </span>
    </div>
  );
}

/** Grouped results (mockup `.results`). The selected row shows its verb; M12 v1 changes the background at once. */
export function ResultList({ groups, selectedKey, onSelect, onRun }: Props) {
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  return (
    <div className={styles.results}>
      {groups.map((group) => (
        <div key={group.id} role="group" aria-label={group.title}>
          <div className={styles.group} aria-hidden>
            {group.title}
          </div>
          {group.results.map((result) => {
            const key = rowKey(group.id, result.id);
            const selected = key === selectedKey;
            return (
              <div
                key={key}
                ref={selected ? selectedRef : undefined}
                role="option"
                aria-selected={selected}
                className={styles.row}
                data-selected={selected}
                // Only real mouse movement selects, so rows scrolling under a still cursor keep the selection.
                onMouseMove={() => !selected && onSelect(key)}
                onClick={(e) => onRun(result, e.ctrlKey)}
              >
                <Tile result={result} />
                <div className={styles.text}>
                  <span className={styles.title}>{result.title}</span>
                  {result.subtitle && <span className={styles.subtitle}>{result.subtitle}</span>}
                </div>
                {selected && result.verb && (
                  <span className={styles.verb}>
                    {result.verb} <kbd className={styles.kbd}>↵</kbd>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
