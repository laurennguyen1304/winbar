import { useEffect, useState } from "react";
import { getUsageHistory, type ClaudeWindow, type UsageSample } from "./native";
import { forecastAccount, refreshUsage, useClaude } from "./store";
import { windowNow } from "./usage";
import { REFRESH_MS } from "./UsageCard";
import { SAMPLE_MINUTES, clockAt, forecast, paceDelta, span, ticks, type Forecast, type WindowKind } from "./forecast";
import styles from "./Claude.module.css";

/** Chart box in SVG units; the SVG scales to the column width, text included. */
const W = 520;
const H = 150;
const PAD = { left: 38, right: 14, top: 18, bottom: 22 };

function Chart({ kind, f }: { kind: WindowKind; f: Forecast }) {
  const x = (t: number) => PAD.left + ((t - f.start) / (f.reset - f.start)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - Math.min(Math.max(v, 0), 100) / 100) * (H - PAD.top - PAD.bottom);
  const line = f.points.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const first = f.points[0];
  const area = `${x(first[0]).toFixed(1)},${y(0)} ${line} ${x(f.now).toFixed(1)},${y(0)}`;
  const hit = f.hitAt !== undefined;
  const end = hit ? { x: x(f.hitAt as number), y: y(100) } : { x: x(f.reset), y: y(f.projected) };

  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Biểu đồ hạn mức theo thời gian">
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            className={v === 100 ? styles.chartLimit : styles.chartGrid}
          />
          <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" className={styles.chartText}>
            {v}%
          </text>
        </g>
      ))}
      {ticks(kind, f.start, f.reset).map((tick) => (
        <text key={tick.t} x={x(tick.t)} y={H - 6} textAnchor="middle" className={styles.chartText}>
          {tick.label}
        </text>
      ))}
      <line x1={x(f.start)} y1={y(0)} x2={x(f.reset)} y2={y(100)} className={styles.chartEven} />
      <line x1={x(f.now)} x2={x(f.now)} y1={y(100) - 4} y2={y(0)} className={styles.chartNow} />
      <text x={x(f.now)} y={11} textAnchor="middle" className={styles.chartText}>
        bây giờ
      </text>
      <polygon points={area} className={styles.chartArea} />
      <polyline points={line} className={styles.chartUsed} />
      <line
        x1={x(f.now)}
        y1={y(f.current)}
        x2={end.x}
        y2={end.y}
        className={hit ? `${styles.chartForecast} ${styles.chartHit}` : styles.chartForecast}
      />
      <circle cx={x(f.now)} cy={y(f.current)} r={3.5} className={styles.chartDot} />
      {hit ? (
        <circle cx={end.x} cy={end.y} r={3.5} className={styles.chartHitDot} />
      ) : (
        <text x={end.x} y={end.y - 7} textAnchor="end" className={styles.chartProjected}>
          ~{Math.round(f.projected)}%
        </text>
      )}
    </svg>
  );
}

function Section({
  kind,
  title,
  window,
  history,
  fetchedAt,
  now,
}: {
  kind: WindowKind;
  title: string;
  window: ClaudeWindow | undefined;
  history: UsageSample[];
  fetchedAt: number;
  now: number;
}) {
  const f = forecast(kind, window, history, fetchedAt, now);
  if (!f) return null;
  const hit = f.hitAt !== undefined;
  const delta = Math.round(paceDelta(f));
  const pace =
    delta === 0 ? "đúng nhịp đều" : delta > 0 ? `nhanh hơn nhịp đều ${delta} điểm` : `chậm hơn nhịp đều ${-delta} điểm`;

  return (
    <section className={styles.forecastSection} aria-label={title}>
      <div className={styles.forecastHead}>
        <span className={styles.meterLabel}>{title}</span>
        <span className={styles.reset}>
          reset {clockAt(f.reset, now)} · còn {span(f.reset - now)}
        </span>
      </div>
      <div className={styles.forecastValue} data-hit={hit || undefined}>
        {f.current}
        <small>%</small>
      </div>
      <p className={styles.forecastSummary}>
        {f.current >= 100 ? (
          <span className={styles.forecastWarn}>đã chạm hạn mức</span>
        ) : hit ? (
          <span className={styles.forecastWarn}>
            giữ nhịp này sẽ <b>chạm 100% lúc {clockAt(f.hitAt as number, now)}</b>, sớm hơn reset{" "}
            {span(f.reset - (f.hitAt as number), false)}
          </span>
        ) : (
          <>
            giữ nhịp này thì <b>~{Math.round(f.projected)}%</b> lúc reset
          </>
        )}
        {" · "}
        {pace}
      </p>
      <Chart kind={kind} f={f} />
    </section>
  );
}

/**
 * The two windows of one account, with its own samples. `account` is the id `claude_accounts` gave; without it,
 * the active account.
 */
function AccountForecast({
  account,
  label,
  note,
  fiveHour,
  sevenDay,
  fetchedAt,
  now,
}: {
  account?: string;
  label?: string;
  note?: string;
  fiveHour: ClaudeWindow | undefined;
  sevenDay: ClaudeWindow | undefined;
  fetchedAt: number;
  now: number;
}) {
  const [history, setHistory] = useState<UsageSample[]>([]);
  // Re-read the samples whenever a new read of this account lands.
  useEffect(() => {
    getUsageHistory(account)
      .then(setHistory)
      .catch((err: unknown) => console.error("claude_usage_history failed", err));
  }, [account, fetchedAt]);

  const nothing =
    !forecast("fiveHour", fiveHour, [], fetchedAt, now) && !forecast("sevenDay", sevenDay, [], fetchedAt, now);
  return (
    <div className={styles.forecastAccount} aria-label={label}>
      {/* The name is on the account row above; only how old the numbers are is worth repeating here. */}
      {note && <p className={styles.note}>Số của tài khoản này {note}.</p>}
      {nothing ? (
        <p className={styles.note}>Chưa có số hạn mức để dự báo.</p>
      ) : (
        <>
          <Section kind="fiveHour" title="5 giờ" window={fiveHour} history={history} fetchedAt={fetchedAt} now={now} />
          <Section
            kind="sevenDay"
            title="7 ngày, mọi model"
            window={sevenDay}
            history={history}
            fetchedAt={fetchedAt}
            now={now}
          />
        </>
      )}
    </div>
  );
}

/** The usage forecast, opened from the limits card in place of the whole panel (SPEC-claude §5.5b). */
export function UsageForecast() {
  const { usage } = useClaude();
  const [now, setNow] = useState(() => Date.now());

  // The card is not on screen while this is, so this asks for usage the way the card would.
  useEffect(() => {
    const ask = () => {
      refreshUsage().catch((err: unknown) => console.error("claude_usage failed", err));
    };
    ask();
    const id = setInterval(ask, REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Like the card: names only once there is a second account (SPEC-claude §5.5).
  const accounts = usage.accounts && usage.accounts.length > 1 ? usage.accounts : [];
  const others = accounts.filter((a) => !a.active);
  // One account at a time, so the view fits the panel; hovering a name on the row switches to it.
  const [picked, setPicked] = useState(forecastAccount);
  const shown = others.find((a) => a.id === picked);

  return (
    <div className={styles.forecast}>
      <div className={styles.forecastTitle}>Dự báo hạn mức</div>
      {accounts.length > 0 && (
        <div className={styles.forecastAccounts} role="group" aria-label="Tài khoản">
          {accounts.map((a) => {
            const id = a.active ? undefined : a.id;
            const pick = () => setPicked(id);
            return (
              <button
                key={a.id}
                type="button"
                className={styles.forecastChip}
                aria-pressed={id === shown?.id}
                onMouseEnter={pick}
                onFocus={pick}
                onClick={pick}
              >
                <span className={styles.accountName} data-active={a.active ? "" : undefined}>
                  {a.label}
                </span>
                <span className={styles.forecastChipNumbers}>
                  {a.active ? (usage.fiveHour?.percent ?? "—") : (windowNow(a.fiveHour, now)?.percent ?? "—")}% ·{" "}
                  {a.active ? (usage.sevenDay?.percent ?? "—") : (windowNow(a.sevenDay, now)?.percent ?? "—")}%
                </span>
              </button>
            );
          })}
        </div>
      )}
      {shown ? (
        <AccountForecast
          key={shown.id}
          account={shown.id}
          label={shown.label}
          note={shown.needsLogin ? "cần đăng nhập lại" : `cập nhật lúc ${clockAt(shown.fetchedAt, now)}`}
          fiveHour={shown.needsLogin ? undefined : windowNow(shown.fiveHour, now)}
          sevenDay={shown.needsLogin ? undefined : windowNow(shown.sevenDay, now)}
          fetchedAt={shown.fetchedAt}
          now={now}
        />
      ) : (
        <AccountForecast
          label={accounts.find((a) => a.active)?.label}
          fiveHour={usage.fiveHour}
          sevenDay={usage.sevenDay}
          fetchedAt={usage.fetchedAt}
          now={now}
        />
      )}
      <div className={styles.forecastLegend}>
        <span>
          <i className={styles.legendUsed} /> Đã dùng
        </span>
        <span>
          <i className={styles.legendEven} /> Nhịp đều (0% → 100% lúc reset)
        </span>
        <span>
          <i className={styles.legendForecast} /> Dự báo theo tốc độ gần đây
        </span>
      </div>
      <p className={styles.forecastNote}>
        Lấy mẫu mỗi {SAMPLE_MINUTES} phút
        {usage.fetchedAt ? `, lần cuối lúc ${clockAt(usage.fetchedAt, now)}` : ""}.
        {others.length > 0 && " Tài khoản khác lấy số theo lần CLI đổi tài khoản tự hỏi, nên đường thưa hơn."} Dự báo
        theo tốc độ 1 giờ gần nhất (cửa sổ 5 giờ) hoặc 1 ngày gần nhất (7 ngày); chưa đủ lịch sử thì dùng tốc độ trung
        bình từ đầu cửa sổ.
      </p>
    </div>
  );
}
