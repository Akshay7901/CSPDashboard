import { Children, isValidElement, type ReactNode } from "react";

const COLS_CLASS = {
  2: "sm:grid-cols-2 sm:divide-y-0",
  3: "md:grid-cols-3 md:divide-y-0",
  4: "md:grid-cols-4 md:divide-y-0",
} as const;

/**
 * Lays fields out in columns with a full-width line between rows, so the
 * line always runs border to border even when the last row is short. On
 * narrow screens the fields stack and each gets its own line.
 *
 * Children whose `value` prop is empty are skipped (DataField-style
 * components render nothing for those, which would leave an empty cell).
 * `className` is for bleeding out of a padded card body, e.g. "-mx-7".
 */
export function FieldRows({
  cols,
  children,
  className = "",
}: {
  cols: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  const items = Children.toArray(children).filter((child) => {
    if (!isValidElement(child)) return true;
    const props = child.props as Record<string, unknown>;
    return !("value" in props) || !!props.value;
  });
  if (items.length === 0) return null;

  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));

  return (
    <div className={`divide-y divide-stone-200 ${className}`}>
      {rows.map((row, r) => (
        <div key={r} className={`grid grid-cols-1 divide-y divide-stone-200 ${COLS_CLASS[cols]}`}>
          {row.map((item, c) => (
            <div key={c} className="min-w-0 px-7 py-5">
              {item}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full-width line between stacked items, each padded like a FieldRows cell. */
export const STACKED_ROWS =
  "divide-y divide-stone-200 [&>*]:px-7 [&>*]:py-5 [&>*]:mt-0!";
