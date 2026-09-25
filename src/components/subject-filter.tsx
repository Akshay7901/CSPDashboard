import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Props = {
  subjects: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
};

// Searchable multi-select for the proposals list. Subject values are
// free-text author entries (~150, sometimes long/messy), so a plain <select>
// isn't usable. Values are passed back to the API exactly as received —
// the backend match is case-sensitive.
export function SubjectFilter({ subjects, selected, onChange, loading }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (subject: string) => {
    onChange(
      selected.includes(subject) ? selected.filter((s) => s !== subject) : [...selected, subject],
    );
  };

  const label =
    selected.length === 0
      ? "All subjects"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} subjects`;

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Filter by subject"
            className={`relative inline-flex max-w-[16rem] items-center gap-2 rounded-xl border bg-white py-2.5 pl-4 pr-9 font-sans text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300 ${
              selected.length ? "border-stone-400" : "border-stone-200"
            }`}
          >
            <span className="truncate" title={selected.join(", ") || undefined}>
              {label}
            </span>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] border-stone-200 bg-white p-0">
          <Command className="bg-white">
            <CommandInput placeholder="Search subjects..." />
            <CommandList className="max-h-72">
              <CommandEmpty>
                {loading ? "Loading subjects…" : "No matching subjects."}
              </CommandEmpty>
              <CommandGroup>
                {subjects.map((subject, i) => {
                  const isSelected = selected.includes(subject);
                  return (
                    <CommandItem
                      key={`${subject}-${i}`}
                      value={`${subject}__${i}`}
                      keywords={[subject]}
                      onSelect={() => toggle(subject)}
                      className="cursor-pointer items-start gap-2 font-sans text-sm"
                    >
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          isSelected ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <span className="break-words">{subject}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-sans text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
